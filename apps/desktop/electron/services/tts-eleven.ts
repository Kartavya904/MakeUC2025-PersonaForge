// electron/services/tts-eleven.ts
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

let cachedKey: string | null = null;
let client: ElevenLabsClient | null = null;

function getClient(): ElevenLabsClient {
  const key = (process.env.ELEVENLABS_API_KEY || "").trim();
  if (!key) throw new Error("Missing ELEVENLABS_API_KEY");
  if (client && cachedKey === key) return client;
  client = new ElevenLabsClient({ apiKey: key });
  cachedKey = key;
  return client;
}

export async function ttsStream(text: string) {
  const c = getClient(); // reads key at call time
  const voiceId = (process.env.ELEVENLABS_TTS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb").trim();
  const modelId = (process.env.ELEVENLABS_TTS_MODEL || "eleven_multilingual_v2").trim();

  // You can also set outputFormat if needed (e.g., PCM). Default is MP3 stream.
  const stream = await c.textToSpeech.stream(voiceId, { text, modelId });
  return stream;
}
