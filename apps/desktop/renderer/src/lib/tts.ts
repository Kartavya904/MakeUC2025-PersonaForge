// apps/desktop/renderer/src/lib/tts.ts
import type { AppSettings } from '../../types/settings';

export async function speak(text: string) {
  const s: AppSettings = await window.persona.getSettings();

  const payload = {
    text,
    voice_id: s.voice.voiceId,
    model_id: 'eleven_multilingual_v2', // or your preferred
    // Map sliders → provider params. Adjust names to the SDK you use.
    // Example using the REST "voice_settings" object:
    voice_settings: {
      stability: s.voice.params.stability,
      similarity_boost: s.voice.params.similarityBoost,
      style: s.voice.params.style,
      use_speaker_boost: s.voice.params.useSpeakerBoost,
    },
    // If your pipeline supports SSML prosody or rate/pitch, apply:
    // e.g., wrap `text` with SSML using s.voice.params.speakingRate / pitch.
  };

  // Call your existing bridge — example:
  await fetch('/api/tts/speak', {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify(payload),
  });
}
