import { contextBridge } from "electron";

// placeholder bridge; we’ll add APIs later
contextBridge.exposeInMainWorld("personaForge", {
  ping: () => "pong"
});
