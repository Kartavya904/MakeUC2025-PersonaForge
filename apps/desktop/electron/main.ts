// apps/desktop/electron/main.ts
// ESM main process: dotenv, settings store, voices list, TTS preview, robust tray handling.

import * as dotenv from "dotenv";
import {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  screen,
  globalShortcut,
  type NativeImage,
} from "electron";
import Store from "electron-store";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

// ----- __dirname in ESM + .env -----
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

// ----- Types (type-only) -----
type AppSettings = import("../renderer/types/settings").AppSettings;

// ----- Security Service -----
import { getSecurityService } from "./services/security.js";
import { SecurityConsentService } from "./services/security-consent.js";
import { SecureTaskExecutor } from "./services/task-executor.js";
import { GeminiPlannerService } from "./services/nlp-gemini.js";

let securityService = getSecurityService();
let consentService = new SecurityConsentService(securityService);
let taskExecutor = new SecureTaskExecutor(securityService, consentService);
let geminiService: GeminiPlannerService | null = null;

// Initialize Gemini service if API key is available
const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
if (geminiApiKey) {
  geminiService = new GeminiPlannerService(geminiApiKey);
  console.log("[GEMINI] Service initialized");
} else {
  console.warn("[GEMINI] No API key found - NLP features will be limited");
}

// ----- Persistent settings -----
const store = new Store<AppSettings>({
  name: "settings",
  defaults: {
    version: 1,
    voice: {
      tone: "professional",
      voiceId: "",
      params: {
        stability: 0.5,
        similarityBoost: 0.75,
        style: 0.4,
        speakingRate: 1.0, // 0.5..2
        pitch: 0, // -12..+12
        useSpeakerBoost: true,
      },
    },
    behavior: {
      runAssistant: true,
      startListeningOnLaunch: false,
    },
    general: {
      autoStartOnLogin: false,
      runMinimized: false,
    },
  },
});

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let overlayWin: BrowserWindow | null = null;

function applyLoginItem(settings: AppSettings["general"]) {
  app.setLoginItemSettings({
    openAtLogin: settings.autoStartOnLogin,
    openAsHidden: settings.runMinimized,
  });
}

function resolveTrayIcon(): NativeImage | null {
  // Try dist-electron/icon.ico (Windows) or iconTemplate.png (macOS), fallback to null.
  const candidates =
    process.platform === "win32"
      ? [path.join(__dirname, "icon.ico")]
      : [
          path.join(__dirname, "iconTemplate.png"),
          path.join(__dirname, "icon.png"),
        ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const img = nativeImage.createFromPath(p);
      if (!img.isEmpty()) return img;
    }
  }
  return null;
}

function setupTray() {
  if (tray) {
    updateTrayMenu();
    return;
  }
  try {
    const iconImg = resolveTrayIcon();
    if (!iconImg) {
      console.warn(
        "[tray] icon not found in dist-electron, skipping tray setup."
      );
      return;
    }
    tray = new Tray(iconImg);
    updateTrayMenu();
    tray.setToolTip("PersonaForge — Voice Assistant");
    tray.on("double-click", () => win?.show());
  } catch (err) {
    console.error("[tray] failed to create tray:", err);
  }
}

async function stopAssistantFromTray() {
  if (!assistantRunning) return;
  assistantRunning = false;

  // Close overlay window
  if (overlayWin) {
    overlayWin.close();
    overlayWin = null;
  }

  // Show main window
  if (win && !win.isDestroyed()) {
    win.show();
    win.restore();
  } else {
    // Window was closed or doesn't exist, recreate it
    const newWin = createWindow();
    if (newWin && !newWin.isDestroyed()) {
      newWin.show();
      newWin.restore();
    }
  }

  updateTrayMenu();
  console.log("[assistant] stopped from tray");
}

async function startAssistantFromTray() {
  if (assistantRunning) return;
  const { behavior } = store.store;
  if (!behavior.runAssistant) {
    console.warn("[assistant] cannot start: disabled in settings");
    return;
  }

  assistantRunning = true;

  // Minimize main window to tray
  if (win && !win.isDestroyed()) {
    win.minimize();
    win.hide();
  }

  // Create overlay window
  createOverlayWindow();
  updateTrayMenu();

  console.log("[assistant] started from tray");
}

function updateTrayMenu() {
  if (!tray) return;
  const ctx = Menu.buildFromTemplate([
    { label: "Open PersonaForge", click: () => win?.show() },
    { type: "separator" },
    {
      label: assistantRunning ? "Stop Assistant" : "Start Assistant",
      click: async () => {
        if (assistantRunning) {
          await stopAssistantFromTray();
        } else {
          await startAssistantFromTray();
        }
      },
    },
    { type: "separator" },
    { label: "Exit", click: () => app.quit() },
  ]);
  tray.setContextMenu(ctx);
}

function createWindow() {
  // Don't create if already exists and not destroyed
  if (win && !win.isDestroyed()) {
    return win;
  }

  const general = store.get("general");
  const show = !general.runMinimized;

  const iconPath =
    process.platform === "win32"
      ? path.join(__dirname, "icon.ico") // we copy this to dist-electron/
      : process.platform === "darwin"
      ? path.join(__dirname, "icon.icns") // optional, for mac dev
      : path.join(__dirname, "icon.png"); // optional, for linux dev

  // Get primary display info for DPI scaling
  const primaryDisplay = screen.getPrimaryDisplay();
  const scaleFactor = primaryDisplay.scaleFactor;

  // Base resolution: 1920x1080 (1080p)
  const baseWidth = 1920;
  const baseHeight = 1080;

  win = new BrowserWindow({
    width: baseWidth,
    height: baseHeight,
    icon: iconPath,
    show,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"), // built as CJS
      contextIsolation: true,
      nodeIntegration: false,
      zoomFactor: 1.0 / scaleFactor, // Adjust zoom to compensate for DPI scaling
    },
  });

  console.log("[preload path]", path.join(__dirname, "preload.cjs"));

  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error("[did-fail-load]", code, desc, url);
  });
  win.webContents.on("render-process-gone", (_e, details) => {
    console.error("[render-process-gone]", details);
  });
  win.webContents.on("console-message", (_e, level, message) => {
    console.log("[renderer]", { level, message });
  });

  if (process.env.RENDERER_URL) {
    win.loadURL(process.env.RENDERER_URL);
  } else {
    win.loadFile(path.join(__dirname, "../renderer-dist/index.html"));
  }

  // Handle window close - set win to null when closed
  win.on("closed", () => {
    win = null;
  });

  if (!show) setupTray();

  return win;
}

// ----- Settings IPC -----
ipcMain.handle("settings:get", () => store.store);

ipcMain.handle("settings:update", (_e, patch: Partial<AppSettings>) => {
  const curr = store.store;
  const next: AppSettings = {
    ...curr,
    ...patch,
    voice: {
      ...curr.voice,
      ...(patch.voice ?? {}),
      params: {
        ...curr.voice.params,
        ...(patch.voice?.params ?? {}),
      },
    },
    behavior: { ...curr.behavior, ...(patch.behavior ?? {}) },
    general: { ...curr.general, ...(patch.general ?? {}) },
  };
  store.store = next;
  applyLoginItem(next.general);
  return store.store;
});

// ----- ElevenLabs voices -----
type VoiceItem = {
  id: string;
  name: string;
  tone: string;
  labels?: Record<string, string>;
};

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
  if (!apiKey) throw new Error("Missing ELEVEN* API key");

  const resp = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": apiKey, Accept: "application/json" },
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Voices HTTP ${resp.status}: ${txt.slice(0, 200)}`);
  }
  const json: any = await resp.json();
  return (json.voices || []).map((v: any) => {
    const tone =
      (v?.labels && (v.labels.tone || v.labels.Tone || v.labels.TONE)) ||
      "professional";
    return { id: v.voice_id, name: v.name, tone, labels: v.labels };
  });
}

let cachedVoices: VoiceItem[] | null = null;
let cachedAt = 0;

ipcMain.handle("voices:list", async () => {
  const now = Date.now();
  if (!cachedVoices || now - cachedAt > 60_000) {
    cachedVoices = await fetchElevenVoices();
    cachedAt = now;
  }
  return cachedVoices;
});

ipcMain.handle("voices:refresh", async () => {
  cachedVoices = await fetchElevenVoices();
  cachedAt = Date.now();
  return cachedVoices;
});

// ----- Assistant lifecycle -----
let assistantRunning = false;

function createOverlayWindow() {
  if (overlayWin) return overlayWin;

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  overlayWin = new BrowserWindow({
    width: 80,
    height: 80,
    x: width - 100, // Position in top-right corner
    y: 20,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Load overlay HTML
  if (process.env.RENDERER_URL) {
    overlayWin.loadURL(`${process.env.RENDERER_URL}/overlay.html`);
  } else {
    overlayWin.loadFile(path.join(__dirname, "../renderer-dist/overlay.html"));
  }

  // Make window draggable
  overlayWin.setIgnoreMouseEvents(false);

  // Handle resize events - enforce size when collapsed, allow resizing when expanded
  overlayWin.on("resize", () => {
    if (!overlayWin) return;
    const [w, h] = overlayWin.getSize();
    // If window is collapsed (approximately 80x80), strictly enforce 80x80
    const isCollapsed = Math.abs(w - 80) < 10 && Math.abs(h - 80) < 10;
    if (isCollapsed && (w !== 80 || h !== 80)) {
      // Immediately enforce size - no debounce to prevent overflow
      overlayWin.setResizable(false);
      overlayWin.setMinimumSize(80, 80);
      overlayWin.setMaximumSize(80, 80);
      overlayWin.setSize(80, 80);
    } else if (!isCollapsed) {
      // When expanded, ensure minimum and maximum sizes are set
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width, height } = primaryDisplay.workAreaSize;
      overlayWin.setMinimumSize(300, 400);
      overlayWin.setMaximumSize(
        Math.floor(width * 0.9),
        Math.floor(height * 0.9)
      );
    }
  });

  // Also enforce size periodically when collapsed (as a safety measure)
  const sizeCheckInterval = setInterval(() => {
    if (!overlayWin) {
      clearInterval(sizeCheckInterval);
      return;
    }
    const [w, h] = overlayWin.getSize();
    const isCollapsed = Math.abs(w - 80) < 10 && Math.abs(h - 80) < 10;
    if (isCollapsed && (w !== 80 || h !== 80)) {
      overlayWin.setResizable(false);
      overlayWin.setMinimumSize(80, 80);
      overlayWin.setMaximumSize(80, 80);
      overlayWin.setSize(80, 80);
    }
  }, 100); // Check every 100ms

  overlayWin.on("closed", () => {
    overlayWin = null;
  });

  return overlayWin;
}

ipcMain.handle("assistant:start", async () => {
  const { behavior } = store.store;
  if (!behavior.runAssistant)
    return { ok: false, reason: "Disabled in settings" };

  if (assistantRunning) {
    return { ok: true }; // Already running
  }

  assistantRunning = true;

  // Minimize main window to tray
  if (win && !win.isDestroyed()) {
    win.minimize();
    win.hide();
  }

  // Ensure tray is set up
  setupTray();
  updateTrayMenu();

  // Create overlay window
  createOverlayWindow();

  console.log("[assistant] started - minimized to tray, overlay created");
  return { ok: true };
});

ipcMain.handle("assistant:stop", async () => {
  if (!assistantRunning) {
    return { ok: true };
  }

  assistantRunning = false;

  // Close overlay window
  if (overlayWin) {
    overlayWin.close();
    overlayWin = null;
  }

  // Show main window
  if (win && !win.isDestroyed()) {
    win.show();
    win.restore();
  } else {
    // Window was closed or doesn't exist, recreate it
    const newWin = createWindow();
    if (newWin && !newWin.isDestroyed()) {
      newWin.show();
      newWin.restore();
    }
  }

  // Update tray menu
  updateTrayMenu();

  console.log("[assistant] stopped");
  return { ok: true };
});

// IPC handlers for overlay window
ipcMain.handle("overlay:stt:start", async () => {
  if (!assistantRunning) return { ok: false, reason: "Assistant not running" };
  // Import and use STT service
  const { sttStart } = await import("./services/stt-eleven.js");
  sttStart();
  return { ok: true };
});

ipcMain.handle("overlay:stt:push", async (_e, chunk: ArrayBuffer) => {
  if (!assistantRunning) return { ok: false };
  const { sttPush } = await import("./services/stt-eleven.js");
  sttPush(Buffer.from(chunk));
  return { ok: true };
});

ipcMain.handle("overlay:stt:stop", async () => {
  if (!assistantRunning) return { ok: false, reason: "Assistant not running" };
  const { sttStopAndTranscribe } = await import("./services/stt-eleven.js");
  try {
    const text = await sttStopAndTranscribe();
    return { ok: true, text };
  } catch (err: any) {
    return { ok: false, reason: err?.message || String(err) };
  }
});

// ----- Security IPC Handlers -----
ipcMain.handle(
  "security:validate-plan",
  async (_e, plan: any, userInput: string) => {
    try {
      const result = securityService.validateTaskPlan(plan, userInput);
      return { ok: true, ...result };
    } catch (err: any) {
      return { ok: false, reason: err?.message || String(err) };
    }
  }
);

ipcMain.handle(
  "security:request-consent",
  async (_e, plan: any, userInput: string) => {
    try {
      const window = BrowserWindow.getFocusedWindow() || win || overlayWin;
      const result = await consentService.requestConsent(
        plan,
        userInput,
        window || undefined
      );
      return { ok: true, ...result };
    } catch (err: any) {
      return { ok: false, reason: err?.message || String(err) };
    }
  }
);

ipcMain.handle(
  "security:log-action",
  async (
    _e,
    userInput: string,
    plan: any,
    approved: boolean,
    executed: boolean,
    error?: string
  ) => {
    try {
      await securityService.logAction(
        userInput,
        plan,
        approved,
        executed,
        error
      );
      return { ok: true };
    } catch (err: any) {
      return { ok: false, reason: err?.message || String(err) };
    }
  }
);

ipcMain.handle("security:kill-switch:activate", async () => {
  securityService.activateKillSwitch();
  return { ok: true };
});

ipcMain.handle("security:kill-switch:deactivate", async () => {
  securityService.deactivateKillSwitch();
  return { ok: true };
});

ipcMain.handle("security:kill-switch:status", async () => {
  return { ok: true, active: securityService.isKillSwitchActive() };
});

ipcMain.handle("security:get-config", async () => {
  return { ok: true, config: securityService.getConfig() };
});

ipcMain.handle("security:update-config", async (_e, config: Partial<any>) => {
  securityService.updateConfig(config);
  return { ok: true, config: securityService.getConfig() };
});

ipcMain.handle("security:get-audit-logs", async (_e, limit?: number) => {
  const logs = securityService.getAuditLogs(limit);
  return { ok: true, logs };
});

// ----- NLP/Gemini Handler -----
ipcMain.handle("nlp:generate-plan", async (_e, userInput: string) => {
  try {
    if (!geminiService) {
      // Fallback to simple plan if Gemini is not available
      const fallbackPlan = generateFallbackPlan(userInput);
      return {
        ok: true,
        plan: fallbackPlan,
        rawResponse: JSON.stringify(fallbackPlan, null, 2),
      };
    }

    const result = await geminiService.generateTaskPlan(userInput);
    return { ok: true, plan: result.plan, rawResponse: result.rawResponse };
  } catch (err: any) {
    console.error("[NLP] Error generating plan:", err);
    // Return fallback plan on error
    const fallbackPlan = generateFallbackPlan(userInput);
    return {
      ok: true,
      plan: fallbackPlan,
      rawResponse: JSON.stringify(fallbackPlan, null, 2),
    };
  }
});

ipcMain.handle("nlp:classify-query", async (_e, userInput: string) => {
  try {
    if (!geminiService) {
      // Fallback classification based on keywords
      const executorKeywords = ["open", "set", "change", "launch", "start", "close", "type", "send", "mute", "volume", "brightness", "increase", "decrease"];
      const lowerInput = userInput.toLowerCase();
      const hasExecutorKeyword = executorKeywords.some(keyword => lowerInput.includes(keyword));
      return { ok: true, classification: hasExecutorKeyword ? "executor" : "conversational" };
    }

    const classification = await geminiService.classifyQuery(userInput);
    return { ok: true, classification };
  } catch (err: any) {
    console.error("[NLP] Error classifying query:", err);
    // Fallback classification
    const executorKeywords = ["open", "set", "change", "launch", "start", "close", "type", "send", "mute", "volume", "brightness", "increase", "decrease"];
    const lowerInput = userInput.toLowerCase();
    const hasExecutorKeyword = executorKeywords.some(keyword => lowerInput.includes(keyword));
    return { ok: true, classification: hasExecutorKeyword ? "executor" : "conversational" };
  }
});

ipcMain.handle("nlp:conversational-response", async (_e, userInput: string) => {
  try {
    if (!geminiService) {
      const fallbackResponse = "I'm here to help! How can I assist you today?";
      const fallbackRaw = JSON.stringify({
        error: "Gemini service not available",
        fallback: true,
        response: fallbackResponse,
      }, null, 2);
      return {
        ok: false,
        reason: "Gemini service not available",
        response: fallbackResponse,
        rawResponse: fallbackRaw,
      };
    }

    const result = await geminiService.generateConversationalResponse(userInput);
    return { ok: true, response: result.text, rawResponse: result.rawResponse };
  } catch (err: any) {
    console.error("[NLP] Error generating conversational response:", err);
    const fallbackResponse = "I'm here to help! How can I assist you today?";
    const fallbackRaw = JSON.stringify({
      error: err?.message || "Unknown error",
      fallback: true,
      response: fallbackResponse,
    }, null, 2);
    return {
      ok: false,
      reason: err?.message || "Unknown error",
      response: fallbackResponse,
      rawResponse: fallbackRaw,
    };
  }
});

ipcMain.handle("nlp:is-plan-executable", async (_e, plan: any) => {
  try {
    if (!geminiService) {
      // If no service, assume plan is executable if it has steps
      return { ok: true, executable: plan?.steps?.length > 0 };
    }

    const executable = geminiService.isPlanExecutable(plan);
    return { ok: true, executable };
  } catch (err: any) {
    console.error("[NLP] Error checking plan executability:", err);
    return { ok: false, executable: false };
  }
});

// Simple fallback plan generator
function generateFallbackPlan(input: string): any {
  const lower = input.toLowerCase();

  if (lower.includes("brightness")) {
    const match = input.match(/(\d+)\s*%?/);
    const value = match ? match[1] : "50";
    return {
      task: `Set brightness to ${value}%`,
      risk: "low" as const,
      steps: [{ op: "SystemSetting", target: "display.brightness", value }],
    };
  }

  if (
    lower.includes("open") &&
    (lower.includes("settings") || lower.includes("setting"))
  ) {
    return {
      task: "Open Windows Settings",
      risk: "low" as const,
      steps: [{ op: "OpenApp", app: "ms-settings:" }],
    };
  }

  if (lower.includes("open")) {
    // Extract app name after "open"
    const match = input.match(/open\s+(\w+)/i);
    const app = match ? match[1] : "notepad";
    return {
      task: `Open ${app}`,
      risk: "low" as const,
      steps: [{ op: "OpenApp", app }],
    };
  }

  // Default: confirmation
  return {
    task: input,
    risk: "low" as const,
    steps: [{ op: "Confirm", text: `Processing: "${input}"` }],
  };
}

ipcMain.handle("task:execute", async (_e, plan: any, userInput: string) => {
  try {
    const window = BrowserWindow.getFocusedWindow() || win || overlayWin;
    const result = await taskExecutor.executePlan(
      plan,
      userInput,
      window || undefined
    );
    return { ok: true, ...result };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
});

ipcMain.handle("overlay:tts:speak", async (_e, text: string) => {
  if (!assistantRunning) return { ok: false, reason: "Assistant not running" };
  try {
    const s = store.store;
    const apiKey = getElevenKey();
    if (!apiKey) return { ok: false, reason: "Missing ELEVEN* API key" };
    if (!s.voice.voiceId) return { ok: false, reason: "No voice selected" };

    const ratePct = Math.round((s.voice.params.speakingRate || 1.0) * 100);
    const pitchSt = Math.round(s.voice.params.pitch || 0);
    const ssml = `<speak><prosody rate="${ratePct}%" pitch="${pitchSt}st">${text}</prosody></speak>`;

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${s.voice.voiceId}`;
    const body = {
      text: ssml,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: s.voice.params.stability,
        similarity_boost: s.voice.params.similarityBoost,
        style: s.voice.params.style,
        use_speaker_boost: s.voice.params.useSpeakerBoost,
      },
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return {
        ok: false,
        reason: `TTS HTTP ${resp.status}`,
        detail: txt.slice(0, 500),
      };
    }
    const ab = await resp.arrayBuffer();
    const b64 = Buffer.from(ab).toString("base64");
    return { ok: true, mime: "audio/mpeg", audioBase64: b64 };
  } catch (err: any) {
    return { ok: false, reason: err?.message || String(err) };
  }
});

ipcMain.handle("overlay:expand", async () => {
  if (!overlayWin) return { ok: false };
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  const [x, y] = overlayWin.getPosition();
  const [w, h] = overlayWin.getSize();

  // Center the expanded window, but keep it near the original position
  const newWidth = 400;
  const newHeight = 600;
  const newX = Math.max(0, Math.min(x - (newWidth - w) / 2, width - newWidth));
  const newY = Math.max(
    0,
    Math.min(y - (newHeight - h) / 2, height - newHeight)
  );

  overlayWin.setSize(newWidth, newHeight);
  overlayWin.setPosition(Math.round(newX), Math.round(newY));
  overlayWin.setResizable(true);
  // Set minimum and maximum sizes to allow resizing while maintaining usability
  overlayWin.setMinimumSize(300, 400);
  overlayWin.setMaximumSize(Math.floor(width * 0.9), Math.floor(height * 0.9));
  return { ok: true };
});

ipcMain.handle("overlay:show-main-window", async () => {
  try {
    // Helper function to safely show window
    const showWindow = (window: BrowserWindow | null) => {
      if (!window || window.isDestroyed()) {
        return false;
      }
      try {
        window.show();
        window.focus();
        window.restore();
        return true;
      } catch (err) {
        console.error("[overlay] Error showing window:", err);
        return false;
      }
    };

    // Try to show existing window
    if (win && !win.isDestroyed()) {
      if (showWindow(win)) {
        return { ok: true };
      }
      // If show failed, window might be destroyed, set to null
      win = null;
    }

    // Window doesn't exist or was destroyed, create it
    const newWin = createWindow();
    if (newWin && !newWin.isDestroyed()) {
      showWindow(newWin);
      return { ok: true };
    }

    return { ok: false, reason: "Failed to create or show window" };
  } catch (err: any) {
    console.error("[overlay] Error in show-main-window handler:", err);
    // Last resort: try to create window
    try {
      const newWin = createWindow();
      if (newWin && !newWin.isDestroyed()) {
        newWin.show();
        newWin.focus();
        return { ok: true };
      }
    } catch (recreateErr) {
      console.error("[overlay] Failed to recreate window:", recreateErr);
    }
    return { ok: false, reason: err?.message || "Unknown error" };
  }
});

ipcMain.handle("overlay:collapse", async () => {
  if (!overlayWin) return { ok: false };
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width } = primaryDisplay.workAreaSize;
  const [x, y] = overlayWin.getPosition();
  const [w] = overlayWin.getSize();

  // Keep position near top-right when collapsing
  const newWidth = 80;
  const newHeight = 80;
  const newX = Math.min(x + (w - newWidth) / 2, width - newWidth - 20);
  const newY = Math.max(20, y);

  // Strictly enforce 80x80 size
  overlayWin.setResizable(false);
  overlayWin.setMinimumSize(80, 80);
  overlayWin.setMaximumSize(80, 80);
  overlayWin.setSize(newWidth, newHeight);
  overlayWin.setPosition(Math.round(newX), Math.round(newY));

  return { ok: true };
});

// Track if we're currently dragging to prevent size changes
let isDraggingOverlay = false;
let dragStartSize: [number, number] | null = null;

ipcMain.handle(
  "overlay:move-window",
  async (_e, deltaX: number, deltaY: number) => {
    if (!overlayWin) return { ok: false };

    const [x, y] = overlayWin.getPosition();
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    const [w, h] = overlayWin.getSize();

    // Check if window is collapsed (approximately 80x80)
    const isCollapsed = Math.abs(w - 80) < 10 && Math.abs(h - 80) < 10;

    // On first drag move, lock the size to prevent overflow
    if (!isDraggingOverlay && isCollapsed) {
      isDraggingOverlay = true;
      dragStartSize = [w, h];
      // Strictly lock size to 80x80
      overlayWin.setMinimumSize(80, 80);
      overlayWin.setMaximumSize(80, 80);
      overlayWin.setResizable(false);
      overlayWin.setSize(80, 80);
    }

    // During drag, strictly enforce 80x80 if collapsed
    if (isDraggingOverlay && isCollapsed) {
      if (w !== 80 || h !== 80) {
        overlayWin.setSize(80, 80);
      }
    }

    const targetSize = isCollapsed ? 80 : w;

    // Only move the position for smooth dragging
    const newX = Math.max(0, Math.min(x + deltaX, width - targetSize));
    const newY = Math.max(0, Math.min(y + deltaY, height - targetSize));

    // Use setPosition without rounding for smoother movement
    overlayWin.setPosition(newX, newY);

    return { ok: true };
  }
);

ipcMain.handle("overlay:end-drag", async () => {
  if (!overlayWin) return { ok: false };

  isDraggingOverlay = false;
  dragStartSize = null;

  // Ensure size is correct after drag ends
  const [w, h] = overlayWin.getSize();
  const isCollapsed = Math.abs(w - 80) < 10 && Math.abs(h - 80) < 10;

  if (isCollapsed && (w !== 80 || h !== 80)) {
    overlayWin.setSize(80, 80);
    overlayWin.setResizable(false);
  }

  return { ok: true };
});

// ----- TTS Preview -----
ipcMain.handle("tts:preview", async (_e, opts?: { text?: string }) => {
  try {
    const s = store.store;
    const apiKey = getElevenKey();
    if (!apiKey)
      return { ok: false, reason: "Missing ELEVEN* API key in .env" };
    if (!s.voice.voiceId) return { ok: false, reason: "No voice selected" };

    const ratePct = Math.round((s.voice.params.speakingRate || 1.0) * 100);
    const pitchSt = Math.round(s.voice.params.pitch || 0);
    const sample =
      opts?.text || "This is a quick voice preview from PersonaForge.";
    const ssml = `<speak><prosody rate="${ratePct}%" pitch="${pitchSt}st">${sample}</prosody></speak>`;

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${s.voice.voiceId}`;
    const body = {
      text: ssml,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: s.voice.params.stability,
        similarity_boost: s.voice.params.similarityBoost,
        style: s.voice.params.style,
        use_speaker_boost: s.voice.params.useSpeakerBoost,
      },
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return {
        ok: false,
        reason: `TTS HTTP ${resp.status}`,
        detail: txt.slice(0, 500),
      };
    }
    const ab = await resp.arrayBuffer();
    const b64 = Buffer.from(ab).toString("base64");
    return { ok: true, mime: "audio/mpeg", audioBase64: b64 };
  } catch (err: any) {
    return { ok: false, reason: err?.message || String(err) };
  }
});

// ----- App lifecycle -----
app.whenReady().then(() => {
  applyLoginItem(store.get("general"));
  createWindow();

  // Register kill switch hotkey (Ctrl+Shift+F12)
  globalShortcut.register("CommandOrControl+Shift+F12", () => {
    if (securityService.isKillSwitchActive()) {
      securityService.deactivateKillSwitch();
      console.log("[SECURITY] Kill switch deactivated via hotkey");
      if (win && !win.isDestroyed()) {
        win.webContents.send("security:kill-switch-changed", { active: false });
      }
      if (overlayWin && !overlayWin.isDestroyed()) {
        overlayWin.webContents.send("security:kill-switch-changed", {
          active: false,
        });
      }
    } else {
      securityService.activateKillSwitch();
      console.log("[SECURITY] Kill switch activated via hotkey");
      if (win && !win.isDestroyed()) {
        win.webContents.send("security:kill-switch-changed", { active: true });
      }
      if (overlayWin && !overlayWin.isDestroyed()) {
        overlayWin.webContents.send("security:kill-switch-changed", {
          active: true,
        });
      }
    }
  });

  const { behavior } = store.store;
  if (behavior.runAssistant && behavior.startListeningOnLaunch) {
    console.log("[boot] starting assistant on launch");
    // Ensure tray is set up before starting
    setupTray();
    // Start the assistant (will create overlay and minimize main window)
    startAssistantFromTray();
  }

  console.log("[SECURITY] Security service initialized");
  console.log("[SECURITY] Kill switch hotkey: Ctrl+Shift+F12");
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    if (!store.get("general").runMinimized && !assistantRunning) {
      app.quit();
    }
  }
});

app.on("before-quit", () => {
  // Unregister all shortcuts
  globalShortcut.unregisterAll();

  // Clean up overlay window
  if (overlayWin) {
    overlayWin.removeAllListeners("close");
    overlayWin.close();
    overlayWin = null;
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
