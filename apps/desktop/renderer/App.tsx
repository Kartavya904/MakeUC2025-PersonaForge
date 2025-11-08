import React, { useEffect, useRef, useState } from "react";
import "./app.css";

declare global {
  interface Window {
    api: {
      startRecording: (rate?: number) => Promise<void>;
      stopRecording: () => Promise<void>;
      audioChunk: (ab: ArrayBuffer) => void;
      nlpAsk: (text: string) => Promise<string>;
      ttsSpeak: (text: string) => Promise<void>;
      executePlan: (plan: any) => Promise<any>;
      on: (channel: string, cb: (...args: any[]) => void) => () => void;
    };
  }
}

export default function App() {
  const [appStatus, setAppStatus] = useState<"idle" | "recording" | "processing" | "executing">("idle");
  const [transcript, setTranscript] = useState("");
  const [partial, setPartial] = useState("");
  const [reply, setReply] = useState("");
  const [currentPlan, setCurrentPlan] = useState<any>(null);
  const [executionResults, setExecutionResults] = useState<string[]>([]);

  const audioChunksRef = useRef<Uint8Array[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);

  useEffect(() => {
    const offStatus = window.api.on("app:status", (status: any) => {
      const value = typeof status === "string" ? status : status?.state;
      if (value === "recording" || value === "processing" || value === "idle" || value === "executing") {
        setAppStatus(value);
      }
    });
    const offPartial = window.api.on("stt:partial", (txt: string) => setPartial(txt));
    const offFinal = window.api.on("stt:final", (txt: string) => { setPartial(""); setTranscript(txt); });
    const offErr = window.api.on("error", (msg: string) => console.error(msg));
    const offTtsChunk = window.api.on("tts:chunk", (b64: string) => {
      audioChunksRef.current.push(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
    });
    const offTtsDone = window.api.on("tts:done", () => {
      // Convert each Uint8Array to an ArrayBuffer copy so BlobParts are ArrayBuffer (not SharedArrayBuffer)
      const parts = audioChunksRef.current.map(u => new Uint8Array(u).buffer);
      const blob = new Blob(parts, { type: "audio/mpeg" });
      audioChunksRef.current = [];
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.play().finally(() => URL.revokeObjectURL(url));
    });
    const offPlanReady = window.api.on("plan:ready", (plan: any) => {
      console.log("[App] Received plan:", plan);
      setCurrentPlan(plan);
    });
    const offExecComplete = window.api.on("execution:complete", (result: any) => {
      console.log("[App] Execution complete:", result);
      setExecutionResults(result.results || []);
    });
    return () => { 
      offStatus?.(); offPartial?.(); offFinal?.(); offErr?.(); 
      offTtsChunk?.(); offTtsDone?.(); offPlanReady?.(); offExecComplete?.(); 
    };
  }, []);

  async function startMic() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } });
    mediaStreamRef.current = stream;

    const ctx = new AudioContext(); // may be 48000; we’ll pass it
    audioCtxRef.current = ctx;

    await ctx.audioWorklet.addModule(new URL("./pcm-worklet.js", window.location.href));
    console.log("[renderer] worklet loaded, sampleRate =", ctx.sampleRate);

    await window.api.startRecording(ctx.sampleRate);

    const src = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, "pcm16-writer");
    workletRef.current = node;

    node.port.onmessage = (e) => {
      if (e.data?.type === "pcm-chunk" && e.data.buffer) {
        const ab = e.data.buffer as ArrayBuffer;
        // console.log("[renderer] pcm chunk bytes:", ab.byteLength);
        window.api.audioChunk(ab);
      }
    };

    src.connect(node);
  }

  function stopMic() {
    try { workletRef.current?.disconnect(); } catch {}
    workletRef.current = null;
    try { audioCtxRef.current?.close(); } catch {}
    audioCtxRef.current = null;
    mediaStreamRef.current?.getTracks().forEach(t => t.stop());
    mediaStreamRef.current = null;
  }

  const onRecord = async () => { await startMic(); };
  const onStop = async () => { await window.api.stopRecording(); stopMic(); };
  const onSend = async () => { 
    setExecutionResults([]);
    setCurrentPlan(null);
    const r = await window.api.nlpAsk(transcript || partial || "(empty)"); 
    setReply(r); 
  };
  const onSpeak = async () => { if (reply) await window.api.ttsSpeak(reply); };
  const onExecute = async () => {
    if (!currentPlan) return;
    setExecutionResults([]);
    try {
      await window.api.executePlan(currentPlan);
    } catch (err: any) {
      setExecutionResults([`Error: ${err.message}`]);
    }
  };

  const disabled = appStatus !== "idle";

  return (
    <div style={{ color: "#e5e7eb", background: "#0b0f14", height: "100vh", display: "grid", gridTemplateRows: "auto 1fr" }}>
      <header style={{ padding: "12px 16px", borderBottom: "1px solid #1f2937", display: "flex", gap: 8, alignItems: "center" }}>
        <strong>PersonaForge</strong>
        <span style={{ marginLeft: 12, fontSize: 12, opacity: 0.8 }}>
          Status:{" "}
          <b style={{ color: appStatus === "recording" ? "#ef4444" : appStatus === "processing" ? "#f59e0b" : "#10b981" }}>
            {appStatus}
          </b>
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={onRecord} disabled={appStatus !== "idle"}>Record</button>
          <button onClick={onStop} disabled={appStatus === "idle"}>Stop</button>
          <button onClick={onSend} disabled={disabled}>Send</button>
          <button onClick={onExecute} disabled={!currentPlan || appStatus === "executing"}>
            {appStatus === "executing" ? "Executing..." : "Execute"}
          </button>
          <button onClick={onSpeak} disabled={!reply}>Speak</button>
        </div>
      </header>
      <main style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, padding: 12, overflow: "hidden" }}>
        <section style={{ border: "1px solid #1f2937", borderRadius: 8, padding: 12, overflow: "auto" }}>
          <h3>Transcript</h3>
          <div style={{ whiteSpace: "pre-wrap", opacity: 0.95 }}>{transcript}</div>
          <div style={{ whiteSpace: "pre-wrap", color: "#9ca3af", marginTop: 8 }}>{partial}</div>
        </section>
        <section style={{ border: "1px solid #1f2937", borderRadius: 8, padding: 12, overflow: "auto" }}>
          <h3>Action Plan (JSON)</h3>
          <div style={{ whiteSpace: "pre-wrap", fontSize: 12, fontFamily: "monospace" }}>{reply}</div>
        </section>
        <section style={{ border: "1px solid #1f2937", borderRadius: 8, padding: 12, overflow: "auto" }}>
          <h3>Execution Results</h3>
          {executionResults.length > 0 ? (
            <div style={{ fontSize: 13, fontFamily: "monospace" }}>
              {executionResults.map((res, i) => (
                <div key={i} style={{ marginBottom: 8, color: res.startsWith("✓") ? "#10b981" : "#ef4444" }}>
                  {res}
                </div>
              ))}
            </div>
          ) : (
            <p style={{ opacity: 0.6, fontSize: 13 }}>
              Click <strong>Execute</strong> after receiving a plan to run the tasks.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
