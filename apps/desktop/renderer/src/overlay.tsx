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
  const [wakeWordActive, setWakeWordActive] = useState(false);
  const [killSwitchActive, setKillSwitchActive] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const wakeWordIntervalRef = useRef<number | null>(null);
  const recordingTimeoutRef = useRef<number | null>(null);

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

  // Start wake word detection when overlay is created (collapsed state)
  useEffect(() => {
    if (!expanded && overlay && !wakeWordActive) {
      startWakeWordDetection();
    }
    return () => {
      stopWakeWordDetection();
    };
  }, [expanded, overlay]);

  const handleClick = async () => {
    // Only allow click to collapse when expanded
    if (expanded && !listening && !processing) {
      await handleCollapse();
    }
  };

  const startWakeWordDetection = async () => {
    if (!overlay || wakeWordActive || expanded) return;

    try {
      setWakeWordActive(true);
      
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      // Create audio context for wake word detection
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      // Simple audio processing (no VAD needed for wake word)
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      
      processor.onaudioprocess = (e) => {
        if (expanded) return; // Don't process if expanded
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

      // Start STT for wake word detection
      await overlay.sttStart();

      // Check for wake word every 1 second
      wakeWordIntervalRef.current = window.setInterval(async () => {
        if (expanded) return; // Don't check if already expanded

        try {
          const result = await overlay.sttStop();
          
          if (result.ok && result.text) {
            const text = result.text.toLowerCase().trim();
            console.log('[wake-word] Checking:', text);
            
            if (text.includes('chad')) {
              console.log('[wake-word] Detected! Expanding and starting recording...');
              stopWakeWordDetection();
              // Expand overlay and start recording
              await overlay.expand();
              setExpanded(true);
              // Small delay then start recording
              setTimeout(() => {
                startRecording();
              }, 300);
              return;
            }
          }

          // Restart listening
          await overlay.sttStart();
        } catch (err: any) {
          console.error('[wake-word] Error:', err);
          try {
            await overlay.sttStart();
          } catch (e) {
            stopWakeWordDetection();
          }
        }
      }, 1000);

    } catch (err: any) {
      console.error('[overlay] Failed to start wake word detection:', err);
      setWakeWordActive(false);
    }
  };

  const stopWakeWordDetection = async () => {
    if (wakeWordIntervalRef.current !== null) {
      clearInterval(wakeWordIntervalRef.current);
      wakeWordIntervalRef.current = null;
    }

    if (mediaStreamRef.current && !expanded) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current && !expanded) {
      await audioContextRef.current.close();
      audioContextRef.current = null;
    }
    workletNodeRef.current = null;

    try {
      await overlay?.sttStop();
    } catch (e) {
      // Ignore errors
    }

    setWakeWordActive(false);
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

      // Auto-stop after 6 seconds
      recordingTimeoutRef.current = window.setTimeout(async () => {
        if (listening) {
          console.log('[recording] Auto-stopping after 6 seconds');
          await stopRecording();
        }
      }, 6000);

    } catch (err: any) {
      console.error('[overlay] Failed to start recording:', err);
      setListening(false);
    }
  };

  const stopRecording = async () => {
    if (!overlay || !listening) return;

    // Clear timeout
    if (recordingTimeoutRef.current !== null) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }

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

        // Generate task plan using Gemini (if available) or use dummy response
        let response = '';
        let plan: any = null;

        try {
          // Try to get plan from Gemini via IPC (would need to be added to main process)
          // For now, we'll use a simple plan generator
          plan = generateSimplePlan(userInput);
          
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
                  response = 'Action was denied.';
                }
              }

              if (approved) {
                // Execute task
                const execResult = await security.executeTask(plan, userInput);
                if (execResult.ok && execResult.success) {
                  response = `Task completed successfully. ${plan.task}`;
                } else {
                  response = `Task execution failed: ${execResult.error || 'Unknown error'}`;
                }
              }
            }
          } else {
            // Fallback to dummy response if security not available
            response = generateDummyResponse(userInput);
          }
        } catch (err: any) {
          console.error('[overlay] Error processing task:', err);
          response = `I encountered an error: ${err?.message || 'Unknown error'}`;
        }

        if (!response) {
          response = generateDummyResponse(userInput);
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

      // Collapse back to small icon and restart wake word detection
      setTimeout(async () => {
        await overlay.collapse();
        setExpanded(false);
        setTimeout(() => {
          startWakeWordDetection();
        }, 500);
      }, 2000);

    } catch (err: any) {
      console.error('[overlay] Failed to stop recording:', err);
    } finally {
      setProcessing(false);
    }
  };


  const generateDummyResponse = (input: string): string => {
    // Simple dummy responses for now
    const lower = input.toLowerCase();
    if (lower.includes('hello') || lower.includes('hi')) {
      return 'Hello! How can I help you today?';
    }
    if (lower.includes('time')) {
      return `The current time is ${new Date().toLocaleTimeString()}.`;
    }
    if (lower.includes('weather')) {
      return 'I don\'t have access to weather data yet, but I\'m working on it!';
    }
    return `I heard you say: "${input}". This is a dummy response for now.`;
  };

  const generateSimplePlan = (input: string): any => {
    // Simple plan generator - in production, this would call Gemini
    const lower = input.toLowerCase();
    
    if (lower.includes('brightness')) {
      const match = input.match(/(\d+)\s*%?/);
      const value = match ? match[1] : '50';
      return {
        task: `Set brightness to ${value}%`,
        risk: 'low' as const,
        steps: [
          { op: 'SystemSetting', target: 'display.brightness', value }
        ]
      };
    }
    
    if (lower.includes('open') && lower.includes('settings')) {
      return {
        task: 'Open Windows Settings',
        risk: 'low' as const,
        steps: [
          { op: 'OpenApp', app: 'ms-settings:' }
        ]
      };
    }
    
    // Default: just confirm
    return {
      task: input,
      risk: 'low' as const,
      steps: [
        { op: 'Confirm', text: `I heard: "${input}"` }
      ]
    };
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
    setTimeout(() => {
      startWakeWordDetection();
    }, 500);
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
      <div className="overlay-root overlay-collapsed" onClick={handleClick}>
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
            <p>Say "Chad" to activate</p>
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
        {listening && (
          <div className="overlay-listening-status">
            <div className="overlay-listening-indicator"></div>
            <span>Recording... (auto-stops in 6 seconds)</span>
            <button 
              className="overlay-stop-btn" 
              onClick={async () => {
                console.log('[user] Stop recording clicked');
                await stopRecording();
              }}
            >
              Stop Recording
            </button>
          </div>
        )}
        {processing && (
          <div className="overlay-processing">Processing your request...</div>
        )}
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<OverlayApp />);

