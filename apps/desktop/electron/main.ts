import { app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, nativeImage } from "electron";
import path from "node:path";
import url from "node:url";

// Enable hot reload in development
if (process.env.NODE_ENV === "development") {
  try {
    // electron-reloader doesn't work well with ESM, so we'll skip it for now
    // The watch mode in esbuild + electron restart will handle reloading
    console.log("[DEV] Running in development mode");
  } catch (err) {
    console.log("[DEV] Development mode setup failed");
  }
}

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let isRecording = false;

// Simulate recording and transcription (placeholder for actual implementation)
let recordingInterval: NodeJS.Timeout | null = null;

async function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 720,
    webPreferences: {
      preload: path.join(process.cwd(), "dist-electron", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devUrl = process.env.RENDERER_URL;
  const prodUrl = url.pathToFileURL(path.join(process.cwd(), "dist-renderer", "index.html")).toString();
  await win.loadURL(devUrl || prodUrl);

  if (!app.isPackaged) {
    win.webContents.openDevTools({ mode: "undocked" });
  }
}

function createTray() {
  // Create a simple tray icon (using a native image for now)
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  
  tray.setToolTip("PersonaForge - Voice Agent");
  
  const contextMenu = Menu.buildFromTemplate([
    { label: "Show App", click: () => { win?.show(); } },
    { label: "Toggle Recording", click: toggleRecording },
    { type: "separator" },
    { label: "Quit", click: () => { app.quit(); } }
  ]);
  
  tray.setContextMenu(contextMenu);
  tray.on("click", () => { win?.show(); });
  
  updateTrayStatus("idle");
}

function updateTrayStatus(status: "idle" | "recording" | "processing") {
  if (!tray) return;
  
  const statusText = {
    idle: "PersonaForge - Idle",
    recording: "PersonaForge - Recording 🔴",
    processing: "PersonaForge - Processing 🟡"
  };
  
  tray.setToolTip(statusText[status]);
}

function sendToRenderer(channel: string, data: any) {
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, data);
  }
}

function toggleRecording() {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
}

function startRecording() {
  if (isRecording) return;
  
  isRecording = true;
  updateTrayStatus("recording");
  sendToRenderer("app:status", "recording");
  
  console.log("[MAIN] Recording started");
  
  // Simulate partial transcription updates
  let counter = 0;
  recordingInterval = setInterval(() => {
    counter++;
    const partialText = ` word${counter}`;
    sendToRenderer("stt:partial", partialText);
  }, 1500);
}

function stopRecording() {
  if (!isRecording) return;
  
  isRecording = false;
  
  if (recordingInterval) {
    clearInterval(recordingInterval);
    recordingInterval = null;
  }
  
  // Send final transcript
  const finalTranscript = "This is a simulated final transcript from the speech recognition system.";
  sendToRenderer("stt:final", finalTranscript);
  
  updateTrayStatus("idle");
  sendToRenderer("app:status", "idle");
  
  console.log("[MAIN] Recording stopped");
}

// IPC Handlers
ipcMain.handle("recording:start", async () => {
  startRecording();
  return { success: true };
});

ipcMain.handle("recording:stop", async () => {
  stopRecording();
  return { success: true };
});

ipcMain.handle("nlp:ask", async (_event, text: string) => {
  console.log("[MAIN] NLP request received:", text);
  
  updateTrayStatus("processing");
  sendToRenderer("app:status", "processing");
  
  // Simulate API call delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Mock response based on input
  let response = "";
  
  if (text.toLowerCase().includes("brightness")) {
    response = "I'll adjust the brightness to your desired level. Setting brightness to 50%.";
  } else if (text.toLowerCase().includes("settings")) {
    response = "Opening Windows Settings and navigating to the requested section.";
  } else if (text.toLowerCase().includes("slack")) {
    response = "I'll send that message via Slack for you. Message sent successfully.";
  } else {
    response = `I understand you said: "${text}". This is a simulated response from the LLM planner. In production, this would generate a task plan and execute it.`;
  }
  
  updateTrayStatus("idle");
  sendToRenderer("app:status", "idle");
  
  console.log("[MAIN] NLP response:", response);
  return response;
});

ipcMain.handle("tts:speak", async (_event, text: string) => {
  console.log("[MAIN] TTS request received:", text);
  
  // Simulate TTS playback delay
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log("[MAIN] TTS playback completed");
  return { success: true };
});

ipcMain.handle("hotkey:trigger", async (_event, action: string) => {
  console.log("[MAIN] Hotkey trigger:", action);
  
  if (action === "toggle-ptt") {
    toggleRecording();
  }
  
  return { success: true };
});

// Register global hotkeys
function registerHotkeys() {
  // Ctrl+Space for push-to-talk toggle
  const registered = globalShortcut.register("CommandOrControl+Space", () => {
    console.log("[MAIN] Ctrl+Space hotkey pressed");
    toggleRecording();
  });
  
  if (registered) {
    console.log("[MAIN] Hotkey Ctrl+Space registered successfully");
  } else {
    console.error("[MAIN] Failed to register Ctrl+Space hotkey");
  }
}

// App lifecycle
app.whenReady().then(() => {
  createWindow();
  createTray();
  registerHotkeys();
});

app.on("window-all-closed", () => { 
  if (process.platform !== "darwin") {
    app.quit(); 
  }
});

app.on("activate", () => { 
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow(); 
  }
});

app.on("will-quit", () => {
  // Unregister all hotkeys
  globalShortcut.unregisterAll();
});
