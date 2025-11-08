import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage } from "electron";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { sttStart, sttPush, sttStopAndTranscribe } from "./services/stt-eleven";
import { ttsStream } from "./services/tts-eleven";
import { createGeminiService, GeminiPlannerService } from "./services/nlp-gemini";
import { executePlan } from "./services/executors/executor-main";

function loadEnv() {
  // candidates: when running from dist-electron/main.cjs
  //   - process.cwd(): apps/desktop (npm start)
  //   - __dirname:     apps/desktop/dist-electron  -> ../.env is correct
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(__dirname, "../.env"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      dotenv.config({ path: p });
      break;
    }
  }
}
loadEnv();

const isDev = !!process.env.RENDERER_URL;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let geminiService: GeminiPlannerService | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    backgroundColor: "#0b0f14",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devUrl = process.env.RENDERER_URL!;
  const prodUrl = `file://${path.join(__dirname, "../renderer-dist/index.html")}`;
  const target = isDev ? devUrl : prodUrl;

  mainWindow.loadURL(target);

  mainWindow.webContents.on("did-finish-load", () => {
    console.log("[main] did-finish-load:", target);
    mainWindow?.show();
  });

  mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error("[main] did-fail-load:", { code, desc, url });
  });

  mainWindow.webContents.on("console-message", (_e, level, message) => {
    console.log("[renderer]", level, message);
  });

  mainWindow.on("closed", () => (mainWindow = null));

  // Minimal tray
  try {
    const icon = nativeImage.createEmpty();
    tray = new Tray(icon);
    tray.setToolTip("PersonaForge");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Show", click: () => mainWindow?.show() },
        { type: "separator" },
        { role: "quit" }
      ])
    );
  } catch {}
}

app.whenReady().then(() => {
  // Initialize Gemini service
  geminiService = createGeminiService();
  if (geminiService) {
    console.log("[main] Gemini AI planner initialized");
  } else {
    console.warn("[main] Gemini disabled - add GEMINI_API_KEY to .env");
  }
  
  createWindow();
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

/* ================= STT IPC ================= */

let chunkCount = 0;

ipcMain.handle("stt:start", async (_e, sampleRate?: number) => {
  sttStart(typeof sampleRate === "number" ? sampleRate : undefined);
  chunkCount = 0;
  mainWindow?.webContents.send("app:status", "recording");
});

ipcMain.on("stt:audio-chunk", (_e, chunk: Buffer) => {
  chunkCount++;
  // Uncomment for debugging:
  // if ((chunkCount % 50) === 1) console.log("[main] mic chunk bytes:", chunk.byteLength, "count:", chunkCount);
  sttPush(chunk);
});

ipcMain.handle("stt:stop", async () => {
  console.log("[main] stop; total chunks:", chunkCount);
  mainWindow?.webContents.send("app:status", "processing");
  try {
    const text = await sttStopAndTranscribe();
    mainWindow?.webContents.send("stt:final", text || "(no speech detected)");
  } catch (err) {
    mainWindow?.webContents.send("error", `STT error: ${String(err)}`);
  } finally {
    mainWindow?.webContents.send("app:status", "idle");
    chunkCount = 0;
  }
});

/* ================= TTS IPC ================= */

ipcMain.handle("tts:speak", async (_e, text: string) => {
  try {
    const s = await ttsStream(text);
    for await (const chunk of s) {
      const b64 = Buffer.from(chunk).toString("base64");
      mainWindow?.webContents.send("tts:chunk", b64);
    }
    mainWindow?.webContents.send("tts:done");
  } catch (err) {
    mainWindow?.webContents.send("error", `TTS error: ${String(err)}`);
  }
});

/* ============== NLP with Gemini ============== */

ipcMain.handle("nlp:ask", async (_e, prompt: string) => {
  console.log("[main] nlp:ask:", prompt);
  mainWindow?.webContents.send("app:status", "processing");
  
  try {
    if (!geminiService) {
      console.warn("[main] Gemini not available, using mock");
      mainWindow?.webContents.send("app:status", "idle");
      
      // Return JSON even for mock
      const mockPlan = {
        task: prompt,
        risk: "low",
        steps: [{
          op: "Confirm",
          text: "Add GEMINI_API_KEY to .env for AI planning"
        }]
      };
      return JSON.stringify(mockPlan, null, 2);
    }

    // Generate task plan with Gemini
    const plan = await geminiService.generateTaskPlan(prompt);
    
    mainWindow?.webContents.send("app:status", "idle");
    console.log("[main] Generated action plan:", plan);
    
    // Send the actual plan object to renderer
    mainWindow?.webContents.send("plan:ready", plan);
    
    // Return formatted JSON string for display in Reply panel
    return JSON.stringify(plan, null, 2);
  } catch (err) {
    mainWindow?.webContents.send("app:status", "idle");
    console.error("[main] Gemini error:", err);
    
    // Return error as JSON
    const errorPlan = {
      task: prompt,
      risk: "low",
      error: String(err),
      steps: []
    };
    return JSON.stringify(errorPlan, null, 2);
  }
});

/* ============== Plan Execution ============== */

ipcMain.handle("plan:execute", async (_e, plan: any) => {
  console.log("[main] Executing plan:", plan.task);
  mainWindow?.webContents.send("app:status", "executing");
  
  try {
    const result = await executePlan(plan);
    
    mainWindow?.webContents.send("app:status", "idle");
    mainWindow?.webContents.send("execution:complete", result);
    
    console.log("[main] Execution complete:", result);
    return result;
  } catch (err) {
    mainWindow?.webContents.send("app:status", "idle");
    console.error("[main] Execution error:", err);
    throw err;
  }
});
