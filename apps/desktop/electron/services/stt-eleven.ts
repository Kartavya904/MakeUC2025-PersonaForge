import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

let buffers: Buffer[] = [];
let inputSampleRate = 16000; // renderer will override this

export function sttStart(rate?: number) {
  buffers = [];
  if (typeof rate === "number" && rate > 0) inputSampleRate = Math.floor(rate);
}

export function sttPush(chunk: Buffer) {
  buffers.push(chunk);
}

function pcmToWav(int16: Int16Array, sampleRate: number) {
  const numChannels = 1;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;

  const data = Buffer.from(int16.buffer);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

export async function sttStopAndTranscribe(): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("Missing ELEVENLABS_API_KEY");

  const raw = Buffer.concat(buffers);
  if (raw.length === 0) {
    throw new Error("No microphone audio received — check mic permission / worklet path.");
  }

  // Build WAV with the actual input sample rate
  const wav = pcmToWav(new Int16Array(raw.buffer), inputSampleRate);

  // Optional: write a temp file for quick manual validation
  const tmpFile = path.join(app.getPath("temp"), `mic_${Date.now()}.wav`);
  try { fs.writeFileSync(tmpFile, wav); } catch {}

  const form = new FormData();
  form.append("file", new Blob([wav], { type: "audio/wav" }), "audio.wav");
  form.append("model_id", process.env.ELEVENLABS_STT_MODEL || "scribe_v1");

  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`STT HTTP ${res.status}: ${t}`);
  }

  const json: any = await res.json();
  return json?.text ?? "";
}
