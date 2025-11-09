import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import './overlay.css';

type OverlayApi = {
  sttStart: () => Promise<{ ok: boolean; reason?: string }>;
  sttPush: (chunk: ArrayBuffer) => Promise<{ ok: boolean }>;
  sttStop: () => Promise<{ ok: boolean; text?: string; reason?: string }>;
  ttsSpeak: (text: string) => Promise<{ ok: boolean; audioBase64?: string; mime?: string; reason?: string }>;
  expand: () => Promise<{ ok: boolean }>;
  collapse: () => Promise<{ ok: boolean }>;
  generatePlan: (userInput: string) => Promise<{ ok: boolean; plan?: any; reason?: string }>;
};

type SecurityApi = {
  validatePlan: (plan: any, userInput: string) => Promise<{ ok: boolean; allowed?: boolean; reason?: string; requiresApproval?: boolean; requiresPin?: boolean }>;
  requestConsent: (plan: any, userInput: string) => Promise<{ ok: boolean; approved?: boolean; pinVerified?: boolean }>;
  logAction: (userInput: string, plan: any, approved: boolean, executed: boolean, error?: string) => Promise<{ ok: boolean }>;
  killSwitchStatus: () => Promise<{ ok: boolean; active?: boolean }>;
  executeTask: (plan: any, userInput: string) => Promise<{ ok: boolean; success?: boolean; error?: string; executedSteps?: number }>;
};

function useOverlay(): OverlayApi | null {
  return (window as any).overlay ?? null;
}

function useSecurity(): SecurityApi | null {
  return (window as any).security ?? null;
}

type Message = {
  id: string;
  type: 'user' | 'assistant';
  text: string;
  timestamp: number;
};

function OverlayApp() {
  const overlay = useOverlay();
  const security = useSecurity();
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [killSwitchActive, setKillSwitchActive] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);

  // Check kill switch status on mount and periodically
  useEffect(() => {
    if (!security) return;
    
    const checkKillSwitch = async () => {
      const status = await security.killSwitchStatus();
      if (status.ok) {
        setKillSwitchActive(status.active || false);
      }
    };
    
    checkKillSwitch();
    const interval = setInterval(checkKillSwitch, 2000);
    return () => clearInterval(interval);
  }, [security]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleIconClick = async () => {
    // Click icon to expand
    if (!expanded && overlay) {
      await overlay.expand();
      setExpanded(true);
    }
  };

  const startRecording = async () => {
    if (!overlay || listening || processing) return;

    try {
      setListening(true);
      
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      // Create audio context
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      // Simple audio processing
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const int16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          int16[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
        }
        overlay.sttPush(int16.buffer);
      };
      
      source.connect(processor);
      processor.connect(audioContext.destination);
      workletNodeRef.current = processor as any;

      // Start STT
      await overlay.sttStart();

    } catch (err: any) {
      console.error('[overlay] Failed to start recording:', err);
      setListening(false);
    }
  };

  const stopRecording = async () => {
    if (!overlay || !listening) return;

    try {
      setListening(false);
      setProcessing(true);

      // Stop media stream
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
      }

      // Close audio context
      if (audioContextRef.current) {
        await audioContextRef.current.close();
        audioContextRef.current = null;
      }
      workletNodeRef.current = null;

      // Stop STT and get transcription
      console.log('[recording] Stopping and transcribing...');
      const result = await overlay.sttStop();
      
      if (result.ok && result.text) {
        console.log('[recording] Transcribed:', result.text);
        const userInput = result.text;
        const userMessage: Message = {
          id: Date.now().toString(),
          type: 'user',
          text: userInput,
          timestamp: Date.now()
        };
        setMessages(prev => [...prev, userMessage]);

        // Check kill switch
        if (killSwitchActive) {
          const errorMsg = 'Kill switch is active. All actions are blocked.';
          const errorMessage: Message = {
            id: (Date.now() + 1).toString(),
            type: 'assistant',
            text: errorMsg,
            timestamp: Date.now()
          };
          setMessages(prev => [...prev, errorMessage]);
          await speakText(errorMsg);
          return;
        }

        // Generate task plan using Gemini NLP service
        let response = '';
        let plan: any = null;

        try {
          // Get plan from Gemini via IPC
          if (overlay.generatePlan) {
            const planResult = await overlay.generatePlan(userInput);
            if (planResult.ok && planResult.plan) {
              plan = planResult.plan;
              console.log('[overlay] Generated plan:', plan);
            } else {
              throw new Error(planResult.reason || 'Failed to generate plan');
            }
          } else {
            throw new Error('Plan generation not available');
          }
          
          if (security && plan) {
            // Validate plan with security
            const validation = await security.validatePlan(plan, userInput);
            
            if (!validation.allowed) {
              response = `I cannot execute that: ${validation.reason || 'Security validation failed'}`;
            } else {
              // Request consent if needed
              let approved = true;
              if (validation.requiresApproval || validation.requiresPin) {
                const consent = await security.requestConsent(plan, userInput);
                approved = consent.ok && (consent.approved || false);
                
                if (!approved) {
                  response = 'Action was denied or cancelled.';
                }
              }

              if (approved) {
                // Execute task
                const execResult = await security.executeTask(plan, userInput);
                if (execResult.ok && execResult.success) {
                  const stepsInfo = execResult.executedSteps ? ` (${execResult.executedSteps} steps completed)` : '';
                  response = `✓ Task completed successfully${stepsInfo}: ${plan.task}`;
                } else {
                  response = `✗ Task execution failed: ${execResult.error || 'Unknown error'}`;
                }
              }
            }
          } else {
            response = 'Security service not available';
          }
        } catch (err: any) {
          console.error('[overlay] Error processing task:', err);
          response = `✗ Error: ${err?.message || 'Unknown error'}`;
        }

        console.log('[recording] Response:', response);
        
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          type: 'assistant',
          text: response,
          timestamp: Date.now()
        };
        setMessages(prev => [...prev, assistantMessage]);

        // Speak the response
        await speakText(response);
      }

      // No auto-collapse - keep the UI expanded for user interaction

    } catch (err: any) {
      console.error('[overlay] Failed to stop recording:', err);
    } finally {
      setProcessing(false);
    }
  };


  const speakText = async (text: string) => {
    if (!overlay) return;

    try {
      const result = await overlay.ttsSpeak(text);
      if (result.ok && result.audioBase64) {
        // Convert base64 to audio and play
        const bin = atob(result.audioBase64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const blob = new Blob([bytes], { type: result.mime || 'audio/mpeg' });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        await audio.play();
        audio.onended = () => URL.revokeObjectURL(url);
      }
    } catch (err: any) {
      console.error('[overlay] Failed to speak:', err);
    }
  };

  const handleCollapse = async () => {
    if (!overlay) return;
    if (listening) await stopRecording();
    await overlay.collapse();
    setExpanded(false);
  };

  if (!overlay) {
    return (
      <div className="overlay-root">
        <div className="overlay-error">Overlay API not available</div>
      </div>
    );
  }

  if (!expanded) {
    return (
      <div className="overlay-root overlay-collapsed" onClick={handleIconClick}>
        <div className="overlay-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="18" x2="12" y2="22"/>
            <line x1="8" y1="22" x2="16" y2="22"/>
          </svg>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay-root overlay-expanded">
      <div className="overlay-header">
        <h3>PersonaForge Assistant</h3>
        <button className="overlay-close" onClick={handleCollapse}>×</button>
      </div>
      
      <div className="overlay-messages">
        {killSwitchActive && (
          <div className="overlay-kill-switch-warning" style={{ 
            background: '#ff4444', 
            color: 'white', 
            padding: '8px', 
            textAlign: 'center',
            fontSize: '12px',
            fontWeight: 'bold'
          }}>
            ⚠️ KILL SWITCH ACTIVE - All actions blocked
          </div>
        )}
        {messages.length === 0 && !listening && !processing && (
          <div className="overlay-empty">
            <p>Click "Start Recording" to begin</p>
            {killSwitchActive && <p style={{ color: '#ff4444', fontSize: '11px' }}>Kill switch is active</p>}
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`overlay-message overlay-message-${msg.type}`}>
            <div className="overlay-message-content">{msg.text}</div>
            <div className="overlay-message-time">
              {new Date(msg.timestamp).toLocaleTimeString()}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="overlay-controls">
        {!listening && !processing && (
          <button 
            className="overlay-record-btn" 
            onClick={startRecording}
            disabled={killSwitchActive}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="18" x2="12" y2="22"/>
              <line x1="8" y1="22" x2="16" y2="22"/>
            </svg>
            Start Recording
          </button>
        )}
        {listening && (
          <div className="overlay-listening-controls">
            <div className="overlay-listening-indicator"></div>
            <span className="overlay-listening-text">Recording...</span>
            <button 
              className="overlay-stop-btn" 
              onClick={stopRecording}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <rect x="4" y="4" width="16" height="16" rx="2"/>
              </svg>
              Stop Recording
            </button>
          </div>
        )}
        {processing && (
          <div className="overlay-processing">
            <div className="overlay-processing-spinner"></div>
            <span>Processing your request...</span>
          </div>
        )}
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<OverlayApp />);

