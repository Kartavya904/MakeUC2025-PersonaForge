// Settings with Preview button, no Behavior tab, clickable logo to go back,
// header "Start Voice Assistant" button, and no white outer padding.

import { useEffect, useMemo, useState } from "react";
import type { AppSettings, ToneKey } from "../../types/settings";

type PersonaApi = {
  getSettings(): Promise<AppSettings>;
  updateSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
  listVoices(): Promise<Array<{ id: string; name: string; tone: string }>>;
  startAssistant(): Promise<{ ok: boolean; reason?: string }>;
  stopAssistant(): Promise<{ ok: boolean }>;
  ttsPreview?: (text?: string) => Promise<{
    ok: boolean;
    audioBase64?: string;
    mime?: string;
    reason?: string;
  }>;
};

function usePersona(): PersonaApi | null {
  return (window as any).persona ?? null;
}

const TONES: { key: ToneKey; label: string; desc: string }[] = [
  {
    key: "professional",
    label: "Professional",
    desc: "Clear, confident, neutral",
  },
  { key: "friendly", label: "Friendly", desc: "Warm, approachable, casual" },
  { key: "storyteller", label: "Storyteller", desc: "Calm, rich, paced" },
  { key: "energetic", label: "Energetic", desc: "Upbeat, fast, lively" },
  { key: "calm", label: "Calm", desc: "Soft, slower, soothing" },
];

export default function SettingsPanel({ onBack }: { onBack?: () => void }) {
  const persona = usePersona();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [voices, setVoices] = useState<
    Array<{ id: string; name: string; tone: string }>
  >([]);
  const [tab, setTab] = useState<"voice" | "general">("voice");
  const [previewing, setPreviewing] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!persona) return;
    (async () => {
      const [s, v] = await Promise.all([
        persona.getSettings(),
        persona.listVoices(),
      ]);
      setSettings(s);
      setVoices(v);
      // ensure a valid voice is selected
      const needsDefault =
        (!s.voice.voiceId && v.length) ||
        (s.voice.voiceId &&
          v.length &&
          !v.some((x) => x.id === s.voice.voiceId));
      if (needsDefault) {
        const match = v.find((x) => x.tone === s.voice.tone) ?? v[0];
        const ns = await persona.updateSettings({
          voice: { voiceId: match.id } as any,
        });
        setSettings(ns);
      }
    })().catch(console.error);
  }, [persona]);

  const toneVoices = useMemo(() => {
    if (!settings) return [];
    return voices.filter((v) => v.tone === settings.voice.tone);
  }, [voices, settings?.voice.tone]);

  if (!persona) {
    return (
      <div className="sp-root">
        <style>{STYLES}</style>
        <div className="sp-container">
          <div className="sp-card">
            <div>Bridge not ready. Check preload path.</div>
          </div>
        </div>
      </div>
    );
  }
  if (!settings) {
    return (
      <div className="sp-root">
        <style>{STYLES}</style>
        <div className="sp-container">
          <div className="sp-card">
            <div>Loading settings…</div>
          </div>
        </div>
      </div>
    );
  }

  const update = async (patch: Partial<AppSettings>) => {
    const ns = await persona.updateSettings(patch);
    setSettings(ns);
  };

  const doPreview = async () => {
    if (!persona.ttsPreview)
      return alert("Preview unavailable (preload missing tts).");
    try {
      setPreviewing(true);
      const res = await persona.ttsPreview(
        "This is your PersonaForge preview."
      );
      if (!res.ok || !res.audioBase64)
        return alert(`Preview failed: ${res.reason ?? "Unknown error"}`);
      // base64 -> blob -> object URL (CSP-friendly)
      const bin = atob(res.audioBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: res.mime || "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      await audio.play();
      audio.onended = () => URL.revokeObjectURL(url);
    } finally {
      setPreviewing(false);
    }
  };

  const startAssistant = async () => {
    try {
      setStarting(true);
      // Stop assistant first if it's running (acts as refresh/restart)
      await persona.stopAssistant();
      // Brief delay to ensure cleanup completes
      await new Promise((resolve) => setTimeout(resolve, 100));
      // Now start it again
      const r = await persona.startAssistant();
      if (!r.ok) {
        const message =
          r.reason === "Disabled in settings"
            ? "Voice assistant is disabled. Please enable it in the General settings tab."
            : r.reason ?? "Could not start assistant";
        alert(message);
      }
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="sp-root">
      <style>{STYLES}</style>

      <div className="sp-container">
        <header className="sp-header">
          <button className="sp-brand" onClick={onBack}>
            <div className="sp-title">PersonaForge</div>
          </button>

          <nav className="sp-tabs">
            <button
              className={`sp-tab ${tab === "voice" ? "is-active" : ""}`}
              onClick={() => setTab("voice")}
            >
              Voice
            </button>
            <button
              className={`sp-tab ${tab === "general" ? "is-active" : ""}`}
              onClick={() => setTab("general")}
            >
              General
            </button>
          </nav>

          <div className="sp-actions">
            <button
              className="sp-btn"
              onClick={doPreview}
              disabled={previewing}
            >
              {previewing ? "Previewing…" : "Preview voice"}
            </button>
            <button
              className="sp-btn sp-btn-primary"
              onClick={startAssistant}
              disabled={starting}
            >
              {starting ? "Starting…" : "Start Voice Assistant"}
            </button>
          </div>
        </header>

        <main className="sp-grid">
          {/* Left: main card */}
          <section className="sp-card">
            {tab === "voice" && (
              <div className="sp-section">
                <h3 className="sp-h3">Tone</h3>
                <div className="sp-tone-grid">
                  {TONES.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => update({ voice: { tone: t.key } as any })}
                      className={`sp-tone ${
                        settings.voice.tone === t.key ? "is-on" : ""
                      }`}
                    >
                      <div className="sp-tone-title">{t.label}</div>
                      <div className="sp-tone-desc">{t.desc}</div>
                    </button>
                  ))}
                </div>

                <div className="sp-row">
                  <label className="sp-label">Voice</label>
                  <select
                    value={settings.voice.voiceId}
                    onChange={(e) =>
                      update({ voice: { voiceId: e.target.value } as any })
                    }
                    className="sp-select"
                  >
                    {toneVoices.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                    {toneVoices.length === 0 &&
                      voices.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="sp-slider-grid">
                  <Slider
                    label="Stability"
                    min={0}
                    max={1}
                    step={0.01}
                    value={settings.voice.params.stability}
                    onChange={(v) =>
                      update({ voice: { params: { stability: v } } as any })
                    }
                  />
                  <Slider
                    label="Similarity Boost"
                    min={0}
                    max={1}
                    step={0.01}
                    value={settings.voice.params.similarityBoost}
                    onChange={(v) =>
                      update({
                        voice: { params: { similarityBoost: v } } as any,
                      })
                    }
                  />
                  <Slider
                    label="Style"
                    min={0}
                    max={1}
                    step={0.01}
                    value={settings.voice.params.style}
                    onChange={(v) =>
                      update({ voice: { params: { style: v } } as any })
                    }
                  />
                  <Slider
                    label="Speaking Rate"
                    min={0.5}
                    max={2}
                    step={0.05}
                    value={settings.voice.params.speakingRate}
                    onChange={(v) =>
                      update({ voice: { params: { speakingRate: v } } as any })
                    }
                  />
                  <Slider
                    label="Pitch (semitones)"
                    min={-12}
                    max={12}
                    step={1}
                    value={settings.voice.params.pitch}
                    onChange={(v) =>
                      update({ voice: { params: { pitch: v } } as any })
                    }
                  />
                  <Toggle
                    label="Use Speaker Boost"
                    checked={settings.voice.params.useSpeakerBoost}
                    onChange={(checked) =>
                      update({
                        voice: { params: { useSpeakerBoost: checked } } as any,
                      })
                    }
                  />
                </div>
              </div>
            )}

            {tab === "general" && (
              <div className="sp-section">
                <h3 className="sp-h3">General</h3>
                <Toggle
                  label="Enable voice assistant"
                  checked={settings.behavior.runAssistant}
                  onChange={(checked) =>
                    update({ behavior: { runAssistant: checked } as any })
                  }
                />
                <Toggle
                  label="Start assistant on launch"
                  checked={settings.behavior.startListeningOnLaunch}
                  onChange={(checked) =>
                    update({
                      behavior: { startListeningOnLaunch: checked } as any,
                    })
                  }
                />
                <Toggle
                  label="Auto-run on startup"
                  checked={settings.general.autoStartOnLogin}
                  onChange={(checked) =>
                    update({ general: { autoStartOnLogin: checked } as any })
                  }
                />
                <Toggle
                  label="Run minimized"
                  checked={settings.general.runMinimized}
                  onChange={(checked) =>
                    update({ general: { runMinimized: checked } as any })
                  }
                />
              </div>
            )}
          </section>

          {/* Right: live summary */}
          <aside className="sp-card sp-aside">
            <h4 className="sp-h4">Current voice</h4>
            <div className="sp-kv">
              <span>Tone</span>
              <b>{settings.voice.tone}</b>
            </div>
            <div className="sp-kv">
              <span>Voice ID</span>
              <b className="sp-code">{settings.voice.voiceId || "(none)"}</b>
            </div>
            <div className="sp-hr" />
            <h4 className="sp-h4">Parameters</h4>
            <div className="sp-grid-2">
              <KV k="Stability" v={settings.voice.params.stability} />
              <KV k="Similarity" v={settings.voice.params.similarityBoost} />
              <KV k="Style" v={settings.voice.params.style} />
              <KV k="Rate" v={settings.voice.params.speakingRate} />
              <KV k="Pitch" v={settings.voice.params.pitch} />
              <KV
                k="Speaker boost"
                v={settings.voice.params.useSpeakerBoost ? "On" : "Off"}
              />
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
}

function Slider(props: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="sp-row">
      <label className="sp-label">{props.label}</label>
      <div className="sp-slider-wrap">
        <input
          type="range"
          min={props.min}
          max={props.max}
          step={props.step}
          value={props.value}
          onChange={(e) => props.onChange(parseFloat(e.target.value))}
          className="sp-slider"
        />
        <span className="sp-val">{props.value}</span>
      </div>
    </div>
  );
}

function Toggle(props: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="sp-toggle">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      <span className="sp-switch" />
      <span className="sp-toggle-label">{props.label}</span>
    </label>
  );
}

function KV({ k, v }: { k: string; v: any }) {
  return (
    <div className="sp-kv">
      <span>{k}</span>
      <b>{String(v)}</b>
    </div>
  );
}

// --- CSS (scoped) ---
const STYLES = `
:root{
  --sp-bg:#0b0d10; --sp-bg2:#12151b; --sp-fg:#e7ecf2; --sp-muted:#a6b0bb;
  --sp-card:rgba(255,255,255,.06); --sp-border:rgba(255,255,255,.12);
  --sp-glass:rgba(255,255,255,.08); --sp-bright:rgba(255,255,255,.14);
  --sp-primary:#7c9dff; --sp-accent:#39d0ff;
}
@media (prefers-color-scheme: light){
  :root{
    --sp-bg:#f6f7fb; --sp-bg2:#fff; --sp-fg:#0c1016; --sp-muted:#49515a;
    --sp-card:rgba(0,0,0,.04); --sp-border:rgba(0,0,0,.12);
    --sp-glass:rgba(0,0,0,.06); --sp-bright:rgba(0,0,0,.10);
    --sp-primary:#3b66ff; --sp-accent:#1fa7ff;
  }
}

/* Full-bleed background - absolutely no white borders or padding */
.sp-root{
  position:fixed; top:0; left:0; right:0; bottom:0;
  width:100vw; height:100vh; 
  margin:0; padding:0; 
  color:var(--sp-fg);
  background: radial-gradient(60% 60% at 10% 10%, rgba(124,157,255, .12), transparent 60%),
              radial-gradient(60% 60% at 90% 20%, rgba(57,208,255, .12), transparent 60%),
              linear-gradient(120deg, var(--sp-bg) 10%, var(--sp-bg2) 40%, var(--sp-bg) 90%);
  overflow-y:auto;
}

/* Internal container handles spacing */
.sp-container{ max-width:1160px; margin:0 auto; padding:22px; }

.sp-header{
  display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px;
}
.sp-brand{
  display:flex; align-items:center; gap:10px; border:none; background:transparent; color:inherit; cursor:pointer;
}
.sp-brand:hover .sp-title{ text-decoration:underline; }
.sp-icon{ width:30px; height:30px; object-fit:contain; }
.sp-glyph{ width:30px; height:30px; border-radius:8px; display:grid; place-items:center;
  background:linear-gradient(135deg, var(--sp-primary), var(--sp-accent)); color:#0b0f1a; font-weight:900; }
.sp-title{ font-weight:800; letter-spacing:.2px; }

.sp-tabs{ display:flex; gap:8px; }
.sp-tab{
  height:34px; padding:0 12px; border-radius:10px; border:1px solid var(--sp-border);
  background:linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.02));
  color:var(--sp-fg); font-weight:600;
}
.sp-tab.is-active{ border-color:transparent; background:linear-gradient(135deg,var(--sp-primary),var(--sp-accent)); color:#0b0f1a; }

.sp-actions{ display:flex; gap:10px; }
.sp-btn{
  height:36px; padding:0 14px; border-radius:12px; border:1px solid var(--sp-border);
  background:linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.02)); color:var(--sp-fg); font-weight:700;
}
.sp-btn-primary{
  border-color:transparent;
  background:linear-gradient(135deg, var(--sp-primary), var(--sp-accent)); color:#0b0f1a;
  box-shadow:0 8px 22px rgba(124,157,255,.35);
}

.sp-grid{ display:grid; grid-template-columns: 1.1fr .9fr; gap:16px; }
@media (max-width: 980px){ .sp-grid{ grid-template-columns: 1fr; } }

.sp-card{
  background:linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.02));
  border:1px solid var(--sp-border); border-radius:18px; padding:18px; box-shadow:0 20px 80px rgba(0,0,0,.25);
}
.sp-aside .sp-kv{ display:flex; align-items:center; justify-content:space-between; padding:8px 0; }
.sp-aside .sp-code{ font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; }

.sp-section{ display:flex; flex-direction:column; gap:16px; }
.sp-h3{ font-size:18px; font-weight:800; margin-bottom:2px; }
.sp-h4{ font-size:14px; font-weight:800; margin:2px 0 8px; color:var(--sp-muted); }
.sp-hr{ height:1px; background:var(--sp-border); margin:8px 0; opacity:.7; }

.sp-tone-grid{ display:grid; gap:10px; grid-template-columns: repeat(3, 1fr); }
@media (max-width: 780px){ .sp-tone-grid{ grid-template-columns: repeat(2, 1fr); } }
.sp-tone{
  text-align:left; border-radius:14px; border:1px solid var(--sp-border); padding:12px;
  background:var(--sp-card); transition:.15s transform, .2s border-color, .2s box-shadow;
}
.sp-tone:hover{ transform: translateY(-1px); border-color:var(--sp-bright); box-shadow:0 10px 26px rgba(0,0,0,.25); }
.sp-tone.is-on{ border-color:transparent; background:linear-gradient(135deg, var(--sp-primary), var(--sp-accent)); color:#0b0f1a; }
.sp-tone-title{ font-weight:700; }
.sp-tone-desc{ font-size:12px; opacity:.8; }

.sp-row{ display:flex; align-items:center; gap:12px; }
.sp-label{ min-width:160px; font-weight:700; color:var(--sp-muted); }
.sp-select{
  flex:1; height:38px; padding:0 12px; border-radius:12px; border:1px solid var(--sp-border);
  background:var(--sp-bg2); color:var(--sp-fg);
}

.sp-slider-grid{ display:grid; gap:14px; grid-template-columns:1fr; }
.sp-slider-wrap{ display:flex; align-items:center; gap:10px; width:100%; }
.sp-slider{
  -webkit-appearance:none; appearance:none; height:10px; border-radius:999px;
  background:rgba(255,255,255,.1); border:1px solid var(--sp-border); flex:1; outline:none;
}
.sp-slider::-webkit-slider-thumb{
  -webkit-appearance:none; appearance:none; width:20px; height:20px; border-radius:999px;
  background:linear-gradient(135deg, var(--sp-primary), var(--sp-accent));
  border:0; box-shadow:0 0 0 3px rgba(124,157,255,.25);
}
.sp-val{ display:inline-block; width:68px; text-align:right; color:var(--sp-muted); }

.sp-toggle{ display:flex; align-items:center; gap:12px; padding:6px 0; }
.sp-toggle input{ display:none; }
.sp-switch{
  width:44px; height:26px; border-radius:999px; position:relative; background:rgba(255,255,255,.15);
  border:1px solid var(--sp-border); transition:background .2s;
}
.sp-switch::after{
  content:''; position:absolute; top:2px; left:2px; width:20px; height:20px; border-radius:999px;
  background:linear-gradient(135deg, var(--sp-primary), var(--sp-accent)); transition:left .2s;
}
.sp-toggle input:checked + .sp-switch{ background:linear-gradient(135deg, var(--sp-primary), var(--sp-accent)); }
.sp-toggle input:checked + .sp-switch::after{ left:22px; background:#0b0f1a; }
.sp-toggle-label{ font-weight:600; }
`;
