import { contextBridge, ipcRenderer } from "electron";

// Expose IPC API to renderer process
contextBridge.exposeInMainWorld("api", {
  // Recording methods
  startRecording: () => ipcRenderer.invoke("recording:start"),
  stopRecording: () => ipcRenderer.invoke("recording:stop"),
  
  // NLP/LLM methods
  nlpAsk: (text: string) => ipcRenderer.invoke("nlp:ask", text),
  
  // TTS methods
  ttsSpeak: (text: string) => ipcRenderer.invoke("tts:speak", text),
  
  // Event listeners (for receiving messages from main process)
  on: (channel: string, callback: (data: any) => void) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on(channel, subscription);
    
    // Return unsubscribe function
    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  },
  
  // Hotkey methods
  hotkey: (action: string) => ipcRenderer.invoke("hotkey:trigger", action),
});
