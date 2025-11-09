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
  ttsSpeak: (text: string) => Promise<{
    ok: boolean;
    audioBase64?: string;
    mime?: string;
    reason?: string;
  }>;
  expand: () => Promise<{ ok: boolean }>;
  collapse: () => Promise<{ ok: boolean }>;
  generatePlan: (
    userInput: string
  ) => Promise<{ ok: boolean; plan?: any; rawResponse?: string; reason?: string }>;
  isPlanExecutable: (
    plan: any
  ) => Promise<{ ok: boolean; executable?: boolean }>;
  getConversationalResponse: (
    userInput: string
  ) => Promise<{ ok: boolean; response?: string; reason?: string }>;
  moveWindow: (deltaX: number, deltaY: number) => Promise<{ ok: boolean }>;
  showMainWindow: () => Promise<{ ok: boolean }>;
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
  rawResponse?: string;
};

function OverlayApp() {
  const overlay = useOverlay();
  const security = useSecurity();
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [killSwitchActive, setKillSwitchActive] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [showRawResponse, setShowRawResponse] = useState(false);
  const [rawResponseData, setRawResponseData] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

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

  // Process command (extracted from stopRecording logic)
  const processCommand = async (userInput: string) => {
    if (!overlay) return;

    setProcessing(true);

    try {
      let response = "";
      let plan: any = null;
      let rawResponse: string | undefined = undefined;

      // Generate task plan using Gemini NLP service
      if (overlay.generatePlan) {
        const planResult = await overlay.generatePlan(userInput);
        if (planResult.ok && planResult.plan) {
          plan = planResult.plan;
          rawResponse = planResult.rawResponse;
          console.log("[overlay] Generated plan:", plan);
        } else {
          throw new Error(planResult.reason || "Failed to generate plan");
        }
      } else {
        throw new Error("Plan generation not available");
      }

      // Check if the plan is executable (has real actions beyond just Confirm)
      let isExecutable = false;
      if (overlay.isPlanExecutable && plan) {
        const executableResult = await overlay.isPlanExecutable(plan);
        isExecutable = executableResult.ok && (executableResult.executable || false);
        console.log("[overlay] Plan is executable:", isExecutable);
      }

      // If plan is not executable (e.g., simple questions, greetings), use conversational response
      if (!isExecutable && overlay.getConversationalResponse) {
        console.log("[overlay] Using conversational response for non-executable query");
        const convResult = await overlay.getConversationalResponse(userInput);
        if (convResult.ok && convResult.response) {
          response = convResult.response;
        } else {
          response = convResult.response || "I'm here to help! How can I assist you today?";
        }
      } else if (security && plan) {
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

      console.log("[overlay] Response:", response);

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: "assistant",
        text: response,
        timestamp: Date.now(),
        rawResponse: rawResponse,
      };
      setMessages((prev) => [...prev, assistantMessage]);

      // Speak the response
      await speakText(response);
    } catch (err: any) {
      console.error("[overlay] Error processing command:", err);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: "assistant",
        text: `✗ Error: ${err?.message || "Unknown error"}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setProcessing(false);
    }
  };

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
    // Use screen coordinates for smoother tracking
    dragStateRef.current.startX = e.screenX;
    dragStateRef.current.startY = e.screenY;

    let animationFrameId: number | null = null;
    let pendingMove = false;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!overlay) return;

      const deltaX = moveEvent.screenX - dragStateRef.current.startX;
      const deltaY = moveEvent.screenY - dragStateRef.current.startY;

      // Start dragging if mouse moved more than 3 pixels
      if (
        !dragStateRef.current.isDragging &&
        (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3)
      ) {
        dragStateRef.current.isDragging = true;
      }

      if (dragStateRef.current.isDragging) {
        // Use requestAnimationFrame for smooth updates
        if (!pendingMove) {
          pendingMove = true;
          animationFrameId = requestAnimationFrame(async () => {
            pendingMove = false;
            if (overlay && dragStateRef.current.isDragging) {
              await overlay.moveWindow(deltaX, deltaY);
              dragStateRef.current.startX = moveEvent.screenX;
              dragStateRef.current.startY = moveEvent.screenY;
            }
          });
        }
      }
    };

    const handleMouseUp = async () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);

      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }

      // Notify main process that dragging has ended
      if (dragStateRef.current.isDragging && overlay) {
        // Reset drag state in main process
        // This will allow size corrections if needed
        try {
          await (overlay as any).endDrag?.();
        } catch (e) {
          // Ignore if method doesn't exist
        }
      }

      // Small delay to distinguish between drag and click
      setTimeout(() => {
        dragStateRef.current.isDragging = false;
      }, 100);
    };

    document.addEventListener("mousemove", handleMouseMove, { passive: true });
    document.addEventListener("mouseup", handleMouseUp);
  };

  const startRecording = async () => {
    if (!overlay || listening || processing) return;

    try {
      setListening(true);

      // Request microphone access with noise suppression and echo cancellation
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
          channelCount: 1,
        },
      });
      mediaStreamRef.current = stream;

      // Create audio context
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      // Create audio processing chain with filters
      const source = audioContext.createMediaStreamSource(stream);

      // High-pass filter to reduce low-frequency noise (below 80Hz)
      const highPassFilter = audioContext.createBiquadFilter();
      highPassFilter.type = "highpass";
      highPassFilter.frequency.value = 80;
      highPassFilter.Q.value = 1;

      // Low-pass filter to reduce high-frequency noise (above 8000Hz)
      const lowPassFilter = audioContext.createBiquadFilter();
      lowPassFilter.type = "lowpass";
      lowPassFilter.frequency.value = 8000;
      lowPassFilter.Q.value = 1;

      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const int16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          int16[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
        }
        overlay.sttPush(int16.buffer);
      };

      // Connect audio processing chain: source -> highpass -> lowpass -> processor -> destination
      source.connect(highPassFilter);
      highPassFilter.connect(lowPassFilter);
      lowPassFilter.connect(processor);
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
        let rawResponse: string | undefined = undefined;

        try {
          // Get plan from Gemini via IPC
          if (overlay.generatePlan) {
            const planResult = await overlay.generatePlan(userInput);
            if (planResult.ok && planResult.plan) {
              plan = planResult.plan;
              rawResponse = planResult.rawResponse;
              console.log("[overlay] Generated plan:", plan);
            } else {
              throw new Error(planResult.reason || "Failed to generate plan");
            }
          } else {
            throw new Error("Plan generation not available");
          }

          // Check if the plan is executable (has real actions beyond just Confirm)
          let isExecutable = false;
          if (overlay.isPlanExecutable && plan) {
            const executableResult = await overlay.isPlanExecutable(plan);
            isExecutable = executableResult.ok && (executableResult.executable || false);
            console.log("[overlay] Plan is executable:", isExecutable);
          }

          // If plan is not executable (e.g., simple questions, greetings), use conversational response
          if (!isExecutable && overlay.getConversationalResponse) {
            console.log("[overlay] Using conversational response for non-executable query");
            const convResult = await overlay.getConversationalResponse(userInput);
            if (convResult.ok && convResult.response) {
              response = convResult.response;
            } else {
              response = convResult.response || "I'm here to help! How can I assist you today?";
            }
          } else if (security && plan) {
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
          rawResponse: rawResponse,
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
        currentAudioRef.current = audio;
        setSpeaking(true);
        await audio.play();
        audio.onended = () => {
          URL.revokeObjectURL(url);
          currentAudioRef.current = null;
          setSpeaking(false);
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          currentAudioRef.current = null;
          setSpeaking(false);
        };
      }
    } catch (err: any) {
      console.error("[overlay] Failed to speak:", err);
      setSpeaking(false);
    }
  };

  const stopSpeaking = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
      setSpeaking(false);
    }
  };

  const handleOpenSettings = async () => {
    if (overlay) {
      await overlay.showMainWindow();
    }
  };

  const handleShowRawResponse = () => {
    // Find the most recent assistant message with a raw response
    const lastMessageWithRaw = [...messages]
      .reverse()
      .find((msg) => msg.type === "assistant" && msg.rawResponse);
    
    if (lastMessageWithRaw?.rawResponse) {
      setRawResponseData(lastMessageWithRaw.rawResponse);
      setShowRawResponse(true);
    } else {
      // Try to format the last plan as JSON if available
      setRawResponseData("No raw response available");
      setShowRawResponse(true);
    }
  };

  const handleCollapse = async () => {
    if (!overlay) return;
    if (listening) await stopRecording();
    stopSpeaking(); // Stop speaking when closing
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
        <div className="overlay-header-actions">
          <button
            className="overlay-raw-response"
            onClick={handleShowRawResponse}
            title="Show raw JSON response"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
          </button>
          <button
            className="overlay-settings"
            onClick={handleOpenSettings}
            title="Settings"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
          <button className="overlay-close" onClick={handleCollapse}>
            ×
          </button>
        </div>
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
        {speaking && (
          <div className="overlay-speaking-controls">
            <div className="overlay-speaking-indicator"></div>
            <span className="overlay-speaking-text">Speaking...</span>
            <button className="overlay-stop-speak-btn" onClick={stopSpeaking}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <rect x="4" y="4" width="16" height="16" rx="2" />
              </svg>
              Stop
            </button>
          </div>
        )}
      </div>

      {showRawResponse && (
        <div className="overlay-modal-backdrop" onClick={() => setShowRawResponse(false)}>
          <div className="overlay-modal" onClick={(e) => e.stopPropagation()}>
            <div className="overlay-modal-header">
              <h3>Raw Gemini API Response</h3>
              <button className="overlay-modal-close" onClick={() => setShowRawResponse(false)}>
                ×
              </button>
            </div>
            <div className="overlay-modal-content">
              <pre className="overlay-json-viewer">{rawResponseData}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<OverlayApp />);
