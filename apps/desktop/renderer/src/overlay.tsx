import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import "./overlay.css";

// Type declaration for Web Speech API
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition;
}

declare global {
  interface Window {
    SpeechRecognition: SpeechRecognitionConstructor;
    webkitSpeechRecognition: SpeechRecognitionConstructor;
  }
}

type OverlayApi = {
  sttStart: () => Promise<{ ok: boolean; reason?: string }>;
  sttPush: (chunk: ArrayBuffer) => Promise<{ ok: boolean }>;
  sttStop: () => Promise<{ ok: boolean; text?: string; reason?: string }>;
  ttsSpeak: (
    text: string
  ) => Promise<{
    ok: boolean;
    audioBase64?: string;
    mime?: string;
    reason?: string;
  }>;
  expand: () => Promise<{ ok: boolean }>;
  collapse: () => Promise<{ ok: boolean }>;
  generatePlan: (
    userInput: string
  ) => Promise<{ ok: boolean; plan?: any; reason?: string }>;
  moveWindow: (deltaX: number, deltaY: number) => Promise<{ ok: boolean }>;
};

type SecurityApi = {
  validatePlan: (
    plan: any,
    userInput: string
  ) => Promise<{
    ok: boolean;
    allowed?: boolean;
    reason?: string;
    requiresApproval?: boolean;
    requiresPin?: boolean;
  }>;
  requestConsent: (
    plan: any,
    userInput: string
  ) => Promise<{ ok: boolean; approved?: boolean; pinVerified?: boolean }>;
  logAction: (
    userInput: string,
    plan: any,
    approved: boolean,
    executed: boolean,
    error?: string
  ) => Promise<{ ok: boolean }>;
  killSwitchStatus: () => Promise<{ ok: boolean; active?: boolean }>;
  executeTask: (
    plan: any,
    userInput: string
  ) => Promise<{
    ok: boolean;
    success?: boolean;
    error?: string;
    executedSteps?: number;
  }>;
};

function useOverlay(): OverlayApi | null {
  return (window as any).overlay ?? null;
}

function useSecurity(): SecurityApi | null {
  return (window as any).security ?? null;
}

type Message = {
  id: string;
  type: "user" | "assistant";
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

  // Drag state
  const dragStateRef = useRef<{
    isDragging: boolean;
    startX: number;
    startY: number;
  }>({
    isDragging: false,
    startX: 0,
    startY: 0,
  });

  // Wake word detection state
  const wakeWordRecognitionRef = useRef<SpeechRecognition | null>(null);
  const wakeWordStreamRef = useRef<MediaStream | null>(null);
  const wakeWordActiveRef = useRef<boolean>(false);
  const WAKE_WORD = "jarvis";
  const LISTEN_TIMEOUT = 10000; // 10 seconds timeout for listening after wake word

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
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleWakeWordActivated = async () => {
    if (!overlay || expanded) return;

    // Stop wake word recognition
    if (wakeWordRecognitionRef.current) {
      try {
        wakeWordRecognitionRef.current.stop();
      } catch (e) {
        // Ignore errors
      }
    }

    // Expand overlay
    await overlay.expand();
    setExpanded(true);

    // Start recording automatically
    setTimeout(() => {
      startRecording();
    }, 300);

    // Reset wake word active flag after timeout
    setTimeout(() => {
      wakeWordActiveRef.current = false;
    }, LISTEN_TIMEOUT);
  };

  // Store handleWakeWordActivated in a ref to avoid dependency issues
  const handleWakeWordActivatedRef = useRef(handleWakeWordActivated);
  useEffect(() => {
    handleWakeWordActivatedRef.current = handleWakeWordActivated;
  }, [overlay, expanded]);

  // Initialize wake word detection
  useEffect(() => {
    if (!overlay || expanded) return;

    const startWakeWordDetection = async () => {
      // Check if SpeechRecognition is available
      const SpeechRecognitionClass =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognitionClass) {
        console.warn(
          "[overlay] SpeechRecognition not available, wake word detection disabled"
        );
        return;
      }

      try {
        const recognition = new SpeechRecognitionClass();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        recognition.onresult = (event: any) => {
          if (wakeWordActiveRef.current || expanded) return;

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript
              .toLowerCase()
              .trim();

            // Check if wake word is detected
            if (transcript.includes(WAKE_WORD)) {
              console.log("[wake-word] Detected:", transcript);
              wakeWordActiveRef.current = true;

              // Stop wake word recognition temporarily
              recognition.stop();

              // Expand overlay and start recording
              handleWakeWordActivatedRef.current();
              return;
            }
          }
        };

        recognition.onerror = (event: any) => {
          console.error("[wake-word] Recognition error:", event.error);
          // Restart recognition after a short delay if not a fatal error
          if (
            event.error !== "no-speech" &&
            event.error !== "aborted" &&
            !wakeWordActiveRef.current
          ) {
            setTimeout(() => {
              if (!wakeWordActiveRef.current && !expanded) {
                try {
                  recognition.start();
                } catch (e) {
                  console.error("[wake-word] Failed to restart:", e);
                }
              }
            }, 1000);
          }
        };

        recognition.onend = () => {
          // Restart recognition if we're still in collapsed state and wake word is not active
          if (!wakeWordActiveRef.current && !expanded) {
            setTimeout(() => {
              if (!wakeWordActiveRef.current && !expanded) {
                try {
                  recognition.start();
                } catch (e) {
                  // Ignore errors when restarting
                }
              }
            }, 500);
          }
        };

        wakeWordRecognitionRef.current = recognition;

        // Request microphone access for wake word detection
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });
          wakeWordStreamRef.current = stream;
          recognition.start();
          console.log("[wake-word] Wake word detection started");
        } catch (err) {
          console.error("[wake-word] Failed to get microphone access:", err);
        }
      } catch (err) {
        console.error(
          "[wake-word] Failed to initialize wake word detection:",
          err
        );
      }
    };

    startWakeWordDetection();

    return () => {
      // Cleanup wake word detection
      if (wakeWordRecognitionRef.current) {
        try {
          wakeWordRecognitionRef.current.stop();
        } catch (e) {
          // Ignore errors
        }
        wakeWordRecognitionRef.current = null;
      }
      if (wakeWordStreamRef.current) {
        wakeWordStreamRef.current.getTracks().forEach((track) => track.stop());
        wakeWordStreamRef.current = null;
      }
      wakeWordActiveRef.current = false;
    };
  }, [overlay, expanded]);

  const handleIconClick = async (e: React.MouseEvent) => {
    // Only expand on click if not dragging
    if (dragStateRef.current.isDragging) {
      return;
    }

    // Click icon to expand
    if (!expanded && overlay) {
      await overlay.expand();
      setExpanded(true);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (expanded) return; // Only allow dragging when collapsed

    dragStateRef.current.isDragging = false;
    dragStateRef.current.startX = e.clientX;
    dragStateRef.current.startY = e.clientY;

    const handleMouseMove = async (moveEvent: MouseEvent) => {
      if (!overlay) return;

      const deltaX = moveEvent.clientX - dragStateRef.current.startX;
      const deltaY = moveEvent.clientY - dragStateRef.current.startY;

      // Start dragging if mouse moved more than 5 pixels
      if (
        !dragStateRef.current.isDragging &&
        (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5)
      ) {
        dragStateRef.current.isDragging = true;
      }

      if (dragStateRef.current.isDragging) {
        await overlay.moveWindow(deltaX, deltaY);
        dragStateRef.current.startX = moveEvent.clientX;
        dragStateRef.current.startY = moveEvent.clientY;
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);

      // Small delay to distinguish between drag and click
      setTimeout(() => {
        dragStateRef.current.isDragging = false;
      }, 100);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
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
      console.error("[overlay] Failed to start recording:", err);
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
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }

      // Close audio context
      if (audioContextRef.current) {
        await audioContextRef.current.close();
        audioContextRef.current = null;
      }
      workletNodeRef.current = null;

      // Stop STT and get transcription
      console.log("[recording] Stopping and transcribing...");
      const result = await overlay.sttStop();

      if (result.ok && result.text) {
        console.log("[recording] Transcribed:", result.text);
        const userInput = result.text;
        const userMessage: Message = {
          id: Date.now().toString(),
          type: "user",
          text: userInput,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, userMessage]);

        // Check kill switch
        if (killSwitchActive) {
          const errorMsg = "Kill switch is active. All actions are blocked.";
          const errorMessage: Message = {
            id: (Date.now() + 1).toString(),
            type: "assistant",
            text: errorMsg,
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, errorMessage]);
          await speakText(errorMsg);
          return;
        }

        // Generate task plan using Gemini NLP service
        let response = "";
        let plan: any = null;

        try {
          // Get plan from Gemini via IPC
          if (overlay.generatePlan) {
            const planResult = await overlay.generatePlan(userInput);
            if (planResult.ok && planResult.plan) {
              plan = planResult.plan;
              console.log("[overlay] Generated plan:", plan);
            } else {
              throw new Error(planResult.reason || "Failed to generate plan");
            }
          } else {
            throw new Error("Plan generation not available");
          }

          if (security && plan) {
            // Validate plan with security
            const validation = await security.validatePlan(plan, userInput);

            if (!validation.allowed) {
              response = `I cannot execute that: ${
                validation.reason || "Security validation failed"
              }`;
            } else {
              // Request consent if needed
              let approved = true;
              if (validation.requiresApproval || validation.requiresPin) {
                const consent = await security.requestConsent(plan, userInput);
                approved = consent.ok && (consent.approved || false);

                if (!approved) {
                  response = "Action was denied or cancelled.";
                }
              }

              if (approved) {
                // Execute task
                const execResult = await security.executeTask(plan, userInput);
                if (execResult.ok && execResult.success) {
                  const stepsInfo = execResult.executedSteps
                    ? ` (${execResult.executedSteps} steps completed)`
                    : "";
                  response = `✓ Task completed successfully${stepsInfo}: ${plan.task}`;
                } else {
                  response = `✗ Task execution failed: ${
                    execResult.error || "Unknown error"
                  }`;
                }
              }
            }
          } else {
            response = "Security service not available";
          }
        } catch (err: any) {
          console.error("[overlay] Error processing task:", err);
          response = `✗ Error: ${err?.message || "Unknown error"}`;
        }

        console.log("[recording] Response:", response);

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          type: "assistant",
          text: response,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMessage]);

        // Speak the response
        await speakText(response);
      }

      // No auto-collapse - keep the UI expanded for user interaction
    } catch (err: any) {
      console.error("[overlay] Failed to stop recording:", err);
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
        const blob = new Blob([bytes], { type: result.mime || "audio/mpeg" });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        await audio.play();
        audio.onended = () => URL.revokeObjectURL(url);
      }
    } catch (err: any) {
      console.error("[overlay] Failed to speak:", err);
    }
  };

  const handleCollapse = async () => {
    if (!overlay) return;
    if (listening) await stopRecording();
    await overlay.collapse();
    setExpanded(false);
    // Reset wake word active flag so detection can restart
    wakeWordActiveRef.current = false;
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
      <div
        className="overlay-root overlay-collapsed"
        onClick={handleIconClick}
        onMouseDown={handleMouseDown}
      >
        <div className="overlay-icon">
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="18" x2="12" y2="22" />
            <line x1="8" y1="22" x2="16" y2="22" />
          </svg>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay-root overlay-expanded">
      <div className="overlay-header">
        <h3>PersonaForge Assistant</h3>
        <button className="overlay-close" onClick={handleCollapse}>
          ×
        </button>
      </div>

      <div className="overlay-messages">
        {killSwitchActive && (
          <div
            className="overlay-kill-switch-warning"
            style={{
              background: "#ff4444",
              color: "white",
              padding: "8px",
              textAlign: "center",
              fontSize: "12px",
              fontWeight: "bold",
            }}
          >
            ⚠️ KILL SWITCH ACTIVE - All actions blocked
          </div>
        )}
        {messages.length === 0 && !listening && !processing && (
          <div className="overlay-empty">
            <p>Click "Start Recording" to begin</p>
            {killSwitchActive && (
              <p style={{ color: "#ff4444", fontSize: "11px" }}>
                Kill switch is active
              </p>
            )}
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`overlay-message overlay-message-${msg.type}`}
          >
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
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="18" x2="12" y2="22" />
              <line x1="8" y1="22" x2="16" y2="22" />
            </svg>
            Start Recording
          </button>
        )}
        {listening && (
          <div className="overlay-listening-controls">
            <div className="overlay-listening-indicator"></div>
            <span className="overlay-listening-text">Recording...</span>
            <button className="overlay-stop-btn" onClick={stopRecording}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <rect x="4" y="4" width="16" height="16" rx="2" />
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

const root = createRoot(document.getElementById("root")!);
root.render(<OverlayApp />);
