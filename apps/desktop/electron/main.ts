// ESM main process, safe with electron-store (ESM) and fetch.
// Loads .env, exposes Settings IPC, fetches real ElevenLabs voices, and provides tts:preview.

import * as dotenv from 'dotenv';
import { app, BrowserWindow, ipcMain, Tray, Menu } from 'electron';
import Store from 'electron-store';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// --- __dirname in ESM + .env load
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

// --- Types (type-only; erased)
type AppSettings = import('../renderer/types/settings').AppSettings;

// --- Persistent settings
const store = new Store<AppSettings>({
  name: 'settings',
  defaults: {
    version: 1,
    voice: {
      tone: 'professional',
      voiceId: '',
      params: {
        stability: 0.5,
        similarityBoost: 0.75,
        style: 0.4,
        speakingRate: 1.0, // 0.5..2
        pitch: 0,          // -12..+12
        useSpeakerBoost: true
      }
    },
    behavior: {
      runAssistant: true,
      startListeningOnLaunch: false
    },
    general: {
      autoStartOnLogin: false,
      runMinimized: false
    }
  }
});

let win: BrowserWindow | null = null;
let tray: Tray | null = null;

function applyLoginItem(settings: AppSettings['general']) {
  app.setLoginItemSettings({
    openAtLogin: settings.autoStartOnLogin,
    openAsHidden: settings.runMinimized
  });
}

function setupTray() {
  if (tray) return;
  const icon = process.platform === 'win32'
    ? path.join(__dirname, 'icon.ico')
    : path.join(__dirname, 'iconTemplate.png');
  tray = new Tray(icon);
  const ctx = Menu.buildFromTemplate([
    { label: 'Open PersonaForge', click: () => win?.show() },
    { type: 'separator' },
    { label: 'Exit', click: () => app.quit() }
  ]);
  tray.setToolTip('PersonaForge — Voice Assistant');
  tray.setContextMenu(ctx);
  tray.on('double-click', () => win?.show());
}

function createWindow() {
  const general = store.get('general');
  const show = !general.runMinimized;

  win = new BrowserWindow({
    width: 1140,
    height: 760,
    show,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  console.log('[preload path]', path.join(__dirname, 'preload.cjs'));

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[did-fail-load]', code, desc, url);
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[render-process-gone]', details);
  });
  win.webContents.on('console-message', (_e, level, message) => {
    console.log('[renderer]', { level, message });
  });

  if (process.env.RENDERER_URL) {
    win.loadURL(process.env.RENDERER_URL);
  } else {
    win.loadFile(path.join(__dirname, '../renderer-dist/index.html'));
  }

  if (!show) setupTray();
}

// ---------- Settings IPC ----------
ipcMain.handle('settings:get', () => store.store);

ipcMain.handle('settings:update', (_e, patch: Partial<AppSettings>) => {
  const curr = store.store;
  const next: AppSettings = {
    ...curr,
    ...patch,
    voice: {
      ...curr.voice,
      ...(patch.voice ?? {}),
      params: {
        ...curr.voice.params,
        ...(patch.voice?.params ?? {})
      }
    },
    behavior: { ...curr.behavior, ...(patch.behavior ?? {}) },
    general:  { ...curr.general,  ...(patch.general  ?? {}) }
  };
  store.store = next;
  applyLoginItem(next.general);
  return store.store;
});

// ---------- ElevenLabs: list voices ----------
type VoiceItem = { id: string; name: string; tone: string; labels?: Record<string,string> };

function getElevenKey(): string | null {
  return (
    process.env.ELEVEN_API_KEY ||
    process.env.ELEVENLABS_API_KEY ||
    process.env.ELEVENLABS_APIKEY ||
    process.env.ELEVENLABS_KEY ||
    null
  );
}

async function fetchElevenVoices(): Promise<VoiceItem[]> {
  const apiKey = getElevenKey();
  if (!apiKey) throw new Error('Missing ELEVEN* API key');

  const resp = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': apiKey, 'Accept': 'application/json' }
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Voices HTTP ${resp.status}: ${txt.slice(0,200)}`);
  }
  const json: any = await resp.json();
  return (json.voices || []).map((v: any) => {
    const tone =
      (v?.labels && (v.labels.tone || v.labels.Tone || v.labels.TONE)) ||
      'professional';
    return { id: v.voice_id, name: v.name, tone, labels: v.labels };
  });
}

let cachedVoices: VoiceItem[] | null = null;
let cachedAt = 0;

ipcMain.handle('voices:list', async () => {
  const now = Date.now();
  if (!cachedVoices || now - cachedAt > 60_000) {
    cachedVoices = await fetchElevenVoices();
    cachedAt = now;
  }
  return cachedVoices;
});

ipcMain.handle('voices:refresh', async () => {
  cachedVoices = await fetchElevenVoices();
  cachedAt = Date.now();
  return cachedVoices;
});

// ---------- Assistant lifecycle (stubs) ----------
let assistantRunning = false;
ipcMain.handle('assistant:start', async () => {
  const { behavior } = store.store;
  if (!behavior.runAssistant) return { ok: false, reason: 'Disabled in settings' };
  assistantRunning = true;
  console.log('[assistant] started');
  return { ok: true };
});
ipcMain.handle('assistant:stop', async () => {
  assistantRunning = false;
  console.log('[assistant] stopped');
  return { ok: true };
});

// ---------- TTS Preview ----------
ipcMain.handle('tts:preview', async (_e, opts?: { text?: string }) => {
  try {
    const s = store.store;
    const apiKey = getElevenKey();
    if (!apiKey) return { ok: false, reason: 'Missing ELEVEN* API key in .env' };
    if (!s.voice.voiceId) return { ok: false, reason: 'No voice selected' };

    const ratePct = Math.round((s.voice.params.speakingRate || 1.0) * 100);
    const pitchSt = Math.round(s.voice.params.pitch || 0);
    const sample = opts?.text || 'This is a quick voice preview from PersonaForge.';
    const ssml = `<speak><prosody rate="${ratePct}%" pitch="${pitchSt}st">${sample}</prosody></speak>`;

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${s.voice.voiceId}`;
    const body = {
      text: ssml,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: s.voice.params.stability,
        similarity_boost: s.voice.params.similarityBoost,
        style: s.voice.params.style,
        use_speaker_boost: s.voice.params.useSpeakerBoost
      }
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return { ok: false, reason: `TTS HTTP ${resp.status}`, detail: txt.slice(0,500) };
    }
    const ab = await resp.arrayBuffer();
    const b64 = Buffer.from(ab).toString('base64');
    return { ok: true, mime: 'audio/mpeg', audioBase64: b64 };
  } catch (err: any) {
    return { ok: false, reason: err?.message || String(err) };
  }
});

app.whenReady().then(() => {
  applyLoginItem(store.get('general'));
  createWindow();

  const { behavior } = store.store;
  if (behavior.runAssistant && behavior.startListeningOnLaunch) {
    console.log('[boot] start listening requested');
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (!store.get('general').runMinimized) app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
