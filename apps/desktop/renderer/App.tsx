import React, { useState, useEffect } from "react";

interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  message: string;
}

export default function App() {
  // State management
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [selectedPersona, setSelectedPersona] = useState("Default");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [appStatus, setAppStatus] = useState<"idle" | "recording" | "processing">("idle");

  // Add log helper
  const addLog = (level: LogEntry["level"], message: string) => {
    const entry: LogEntry = {
      timestamp: new Date().toLocaleTimeString(),
      level,
      message,
    };
    setLogs((prev) => [...prev, entry]);
  };

  // Setup IPC listeners on mount
  useEffect(() => {
    const api = window.api;
    if (!api) {
      addLog("error", "window.api not available - check preload script");
      return;
    }

    // Listen for partial transcripts
    const unsubPartial = api.on("stt:partial", (text: string) => {
      setTranscript((prev) => prev + text);
      addLog("info", `Partial: ${text}`);
    });

    // Listen for final transcript
    const unsubFinal = api.on("stt:final", (text: string) => {
      setTranscript(text);
      addLog("info", `Final transcript: ${text}`);
    });

    // Listen for app status changes
    const unsubStatus = api.on("app:status", (status: string) => {
      setAppStatus(status as any);
      addLog("info", `Status: ${status}`);
    });

    addLog("info", "IPC listeners registered");

    // Cleanup listeners on unmount
    return () => {
      unsubPartial?.();
      unsubFinal?.();
      unsubStatus?.();
    };
  }, []);

  // Button handlers
  const handleRecord = async () => {
    try {
      if (!window.api) {
        addLog("error", "window.api not available");
        return;
      }
      await window.api.startRecording();
      setIsRecording(true);
      setTranscript("");
      addLog("info", "Recording started");
    } catch (err: any) {
      addLog("error", `Start recording failed: ${err.message}`);
    }
  };

  const handleStop = async () => {
    try {
      if (!window.api) return;
      await window.api.stopRecording();
      setIsRecording(false);
      addLog("info", "Recording stopped");
    } catch (err: any) {
      addLog("error", `Stop recording failed: ${err.message}`);
    }
  };

  const handleSend = async () => {
    try {
      if (!window.api) return;
      if (!transcript.trim()) {
        addLog("warn", "No transcript to send");
        return;
      }
      addLog("info", `Sending to NLP: "${transcript}"`);
      const response = await window.api.nlpAsk(transcript);
      setReply(response);
      addLog("info", `Reply received: ${response}`);
    } catch (err: any) {
      addLog("error", `NLP request failed: ${err.message}`);
    }
  };

  const handleSpeak = async () => {
    try {
      if (!window.api) return;
      if (!reply.trim()) {
        addLog("warn", "No reply to speak");
        return;
      }
      addLog("info", "Playing TTS...");
      await window.api.ttsSpeak(reply);
      addLog("info", "TTS playback completed");
    } catch (err: any) {
      addLog("error", `TTS failed: ${err.message}`);
    }
  };

  const handleSettings = () => {
    addLog("info", "Settings clicked (not yet implemented)");
  };

  return (
    <div
      style={{
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: 20,
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "#1a1a1a",
        color: "#e0e0e0",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>PersonaForge — Voice Agent</h1>
        <button
          onClick={handleSettings}
          style={{
            padding: "8px 16px",
            background: "#333",
            border: "1px solid #555",
            borderRadius: 4,
            color: "#e0e0e0",
            cursor: "pointer",
          }}
        >
          ⚙️ Settings
        </button>
      </div>

      {/* Persona Selector */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", marginBottom: 8, fontWeight: 500 }}>Persona</label>
        <select
          value={selectedPersona}
          onChange={(e) => setSelectedPersona(e.target.value)}
          style={{
            width: "100%",
            padding: 10,
            background: "#2a2a2a",
            border: "1px solid #444",
            borderRadius: 4,
            color: "#e0e0e0",
            fontSize: 14,
          }}
        >
          <option value="Default">Default</option>
          <option value="Professional">Professional (Coming soon)</option>
          <option value="Casual">Casual (Coming soon)</option>
        </select>
      </div>

      {/* Control Buttons */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <button
          onClick={handleRecord}
          disabled={isRecording}
          style={{
            padding: "12px 24px",
            background: isRecording ? "#555" : "#d32f2f",
            border: "none",
            borderRadius: 6,
            color: "white",
            cursor: isRecording ? "not-allowed" : "pointer",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          🎤 Record
        </button>
        <button
          onClick={handleStop}
          disabled={!isRecording}
          style={{
            padding: "12px 24px",
            background: !isRecording ? "#555" : "#f57c00",
            border: "none",
            borderRadius: 6,
            color: "white",
            cursor: !isRecording ? "not-allowed" : "pointer",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          ⏹️ Stop
        </button>
        <button
          onClick={handleSend}
          disabled={!transcript}
          style={{
            padding: "12px 24px",
            background: !transcript ? "#555" : "#1976d2",
            border: "none",
            borderRadius: 6,
            color: "white",
            cursor: !transcript ? "not-allowed" : "pointer",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          📤 Send
        </button>
        <button
          onClick={handleSpeak}
          disabled={!reply}
          style={{
            padding: "12px 24px",
            background: !reply ? "#555" : "#388e3c",
            border: "none",
            borderRadius: 6,
            color: "white",
            cursor: !reply ? "not-allowed" : "pointer",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          🔊 Speak
        </button>
      </div>

      {/* Status Indicator */}
      <div
        style={{
          padding: 10,
          background: "#2a2a2a",
          borderRadius: 6,
          marginBottom: 20,
          border: "1px solid #444",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span style={{ fontSize: 18 }}>
          {appStatus === "recording" ? "🔴" : appStatus === "processing" ? "🟡" : "🟢"}
        </span>
        <span style={{ fontWeight: 500, textTransform: "capitalize" }}>{appStatus}</span>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "#888" }}>
          Hotkey: Ctrl+Space to toggle recording
        </span>
      </div>

      {/* Main Panels */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, flex: 1, minHeight: 0 }}>
        {/* Transcript Panel */}
        <div
          style={{
            background: "#2a2a2a",
            border: "1px solid #444",
            borderRadius: 8,
            padding: 16,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <h3 style={{ margin: "0 0 12px 0", fontSize: 16 }}>📝 Transcript</h3>
          <div
            style={{
              flex: 1,
              padding: 12,
              background: "#1a1a1a",
              borderRadius: 6,
              overflowY: "auto",
              fontFamily: "monospace",
              fontSize: 13,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {transcript || <span style={{ color: "#666" }}>No transcript yet. Press Record to start.</span>}
          </div>
        </div>

        {/* Reply Panel */}
        <div
          style={{
            background: "#2a2a2a",
            border: "1px solid #444",
            borderRadius: 8,
            padding: 16,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <h3 style={{ margin: "0 0 12px 0", fontSize: 16 }}>💬 LLM Reply</h3>
          <div
            style={{
              flex: 1,
              padding: 12,
              background: "#1a1a1a",
              borderRadius: 6,
              overflowY: "auto",
              fontFamily: "monospace",
              fontSize: 13,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {reply || <span style={{ color: "#666" }}>Reply will appear here after sending.</span>}
          </div>
        </div>
      </div>

      {/* Logs Panel */}
      <div
        style={{
          marginTop: 16,
          background: "#2a2a2a",
          border: "1px solid #444",
          borderRadius: 8,
          padding: 16,
          maxHeight: 150,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <h3 style={{ margin: "0 0 12px 0", fontSize: 16 }}>📋 Logs</h3>
        <div
          style={{
            flex: 1,
            padding: 10,
            background: "#1a1a1a",
            borderRadius: 6,
            overflowY: "auto",
            fontFamily: "monospace",
            fontSize: 12,
          }}
        >
          {logs.length === 0 ? (
            <div style={{ color: "#666" }}>No logs yet.</div>
          ) : (
            logs.map((log, idx) => (
              <div
                key={idx}
                style={{
                  marginBottom: 4,
                  color:
                    log.level === "error" ? "#f44336" : log.level === "warn" ? "#ff9800" : "#4caf50",
                }}
              >
                <span style={{ color: "#888" }}>[{log.timestamp}]</span>{" "}
                <span style={{ fontWeight: 600 }}>{log.level.toUpperCase()}</span>: {log.message}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
