import './landing.css';
import { useState } from 'react';
import SettingsPanel from './SettingsPanel';

declare global {
  interface Window {
    persona?: {
      ttsPreview: (text?: string) => Promise<{ ok: boolean; audioBase64?: string; mime?: string; reason?: string }>;
    }
  }
}

export default function LandingPage() {
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  if (showSettings) {
    return <SettingsPanel onBack={() => setShowSettings(false)} />;
    // Clicking logo in Settings will call onBack → returns here.
  }

  async function onPreview() {
    try {
      if (!window.persona?.ttsPreview) {
        alert('Bridge not ready (preload).');
        return;
      }
      setLoading(true);
      const res = await window.persona.ttsPreview('This is your PersonaForge preview.');
      if (!res.ok || !res.audioBase64) {
        alert(`Preview failed: ${res.reason ?? 'Unknown error'}`);
        return;
      }
      const bin = atob(res.audioBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: res.mime || 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      await audio.play();
      audio.onended = () => URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  }

  const goSettings = () => setShowSettings(true);

  return (
    <div className="lp-root">
      <div className="lp-backdrop" aria-hidden="true" />
      <div className="lp-noise" aria-hidden="true" />

      <header className="lp-nav">
        <div className="lp-nav-left">
          <div className="lp-logo">
            <span className="lp-mark">PersonaForge</span>
          </div>
          <nav className="lp-links">
          </nav>
        </div>
        <div className="lp-nav-right">
          <button className="lp-btn lp-btn-primary" onClick={goSettings}>Open App</button>
        </div>
      </header>

      <main className="lp-hero">
        <div className="lp-hero-copy">
          <h1 className="lp-title">
            Where <span className="lp-focus">voice</span> meets AI.
          </h1>
          <p className="lp-subtitle">
            Build a persona that speaks your style. Choose a tone, tune the voice, and
            let your assistant work across calls, notes, and daily flow—hands-free.
          </p>
          <div className="lp-cta">
            <button className="lp-btn lp-btn-primary" onClick={goSettings}>Get started</button>
          </div>

          <div className="lp-badges">
            <div className="lp-badge"><span className="lp-badge-dot" /> Real-time STT/TTS</div>
            <div className="lp-badge"><span className="lp-badge-dot" /> Tone presets & sliders</div>
            <div className="lp-badge"><span className="lp-badge-dot" /> Local-first control</div>
          </div>
        </div>

        <div className="lp-hero-card" role="img" aria-label="Voice settings preview">
          <div className="lp-card-top">
            <span className="lp-card-title">Voice · Professional</span>
            <span className="lp-card-dot" />
          </div>

          <div className="lp-card-sliders">
            {[
              ['Stability', 62],
              ['Similarity', 78],
              ['Style', 45],
              ['Rate', 110],
              ['Pitch', 0]
            ].map(([label, val]) => (
              <div className="lp-slider" key={label as string}>
                <div className="lp-slider-head">
                  <span>{label as string}</span>
                  <span className="lp-slider-val">{val as number}</span>
                </div>
                <div className="lp-slider-track">
                  <div className="lp-slider-fill" style={{ width: `${val}%` }} />
                </div>
              </div>
            ))}
            <div className="lp-toggle">
              <input id="boost" type="checkbox" defaultChecked />
              <label htmlFor="boost">Speaker boost</label>
            </div>
          </div>

          <div className="lp-card-actions">
            <button
              className="lp-btn lp-btn-primary lp-btn-block"
              onClick={onPreview}
              disabled={loading}
              aria-busy={loading}
            >
              {loading ? 'Rendering…' : 'Preview voice'}
            </button>
          </div>
        </div>
      </main>

      <section className="lp-features">
        {[
          ['Tone first', 'Pick Friendly, Calm, Energetic, or craft your own blend with granular controls.'],
          ['Local control', 'Settings persist locally; you decide what runs at boot and what stays muted.'],
          ['One-tap speak', 'Preview voices instantly and lock in your favorite persona for every workflow.'],
          ['Smart defaults', 'Great out of the box. Fine-tune stability, similarity, rate, and pitch as you grow.'],
        ].map(([title, body]) => (
          <article className="lp-feature" key={title}>
            <div className="lp-feature-glyph">✦</div>
            <h3 className="lp-feature-title">{title}</h3>
            <p className="lp-feature-body">{body}</p>
          </article>
        ))}
      </section>

      <footer className="lp-footer">
        <div>© {new Date().getFullYear()} PersonaForge</div>
        <div className="lp-footer-links">
          <a className="lp-link" onClick={goSettings}>Settings</a>
          <a className="lp-link" onClick={onPreview}>Preview</a>
          <a className="lp-link" onClick={() => window.close()}>Quit</a>
        </div>
      </footer>
    </div>
  );
}