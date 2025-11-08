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

function useOverlay(): OverlayApi | null {
  return (window as any).overlay ?? null;
}

type Message = {
  id: string;
  type: 'user' | 'assistant';
  text: string;
  timestamp: number;
};

function OverlayApp() {
  const overlay = useOverlay();
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleClick = async () => {
    if (!overlay) return;
    
    if (!expanded) {
      // Expand the overlay
      await overlay.expand();
      setExpanded(true);
    } else if (!listening && !processing) {
      // Start listening
      await startListening();
    }
  };

  const startListening = async () => {
    if (!overlay || listening || processing) return;

    try {
      setListening(true);
      
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      // Create audio context
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      // Load audio worklet for processing
      try {
        // Try to load worklet from public directory
        const workletUrl = new URL('/audio-processor.js', window.location.origin).href;
        await audioContext.audioWorklet.addModule(workletUrl);
        const source = audioContext.createMediaStreamSource(stream);
        const workletNode = new AudioWorkletNode(audioContext, 'audio-processor');
        
        workletNode.port.onmessage = (e) => {
          if (e.data) {
            overlay.sttPush(e.data);
          }
        };
        
        source.connect(workletNode);
        workletNodeRef.current = workletNode;
      } catch (err) {
        console.error('[overlay] Failed to load worklet, using fallback:', err);
        // Fallback: use ScriptProcessorNode (deprecated but works)
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
      }

      // Start STT
      await overlay.sttStart();
    } catch (err: any) {
      console.error('[overlay] Failed to start listening:', err);
      alert(`Failed to start listening: ${err.message}`);
      setListening(false);
    }
  };

  const stopListening = async () => {
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
      const result = await overlay.sttStop();
      
      if (result.ok && result.text) {
        const userMessage: Message = {
          id: Date.now().toString(),
          type: 'user',
          text: result.text,
          timestamp: Date.now()
        };
        setMessages(prev => [...prev, userMessage]);

        // Generate dummy response for now
        const response = generateDummyResponse(result.text);
        
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          type: 'assistant',
          text: response,
          timestamp: Date.now()
        };
        setMessages(prev => [...prev, assistantMessage]);

        // Speak the response
        await speakText(response);
      } else {
        alert(`Failed to transcribe: ${result.reason || 'Unknown error'}`);
      }
    } catch (err: any) {
      console.error('[overlay] Failed to stop listening:', err);
      alert(`Error: ${err.message}`);
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
    if (listening) await stopListening();
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
        {messages.length === 0 && (
          <div className="overlay-empty">
            <p>Click the microphone to start a conversation</p>
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
          <button className="overlay-mic-btn" onClick={startListening}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="18" x2="12" y2="22"/>
              <line x1="8" y1="22" x2="16" y2="22"/>
            </svg>
            Start Listening
          </button>
        )}
        {listening && (
          <button className="overlay-mic-btn overlay-mic-btn-active" onClick={stopListening}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2"/>
            </svg>
            Stop Listening
          </button>
        )}
        {processing && (
          <div className="overlay-processing">Processing...</div>
        )}
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<OverlayApp />);

