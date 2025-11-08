import { app, BrowserWindow } from "electron";
import path from "node:path";
import url from "node:url";

let win: BrowserWindow | null = null;

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

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
