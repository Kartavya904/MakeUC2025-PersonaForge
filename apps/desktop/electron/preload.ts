import { contextBridge, ipcRenderer } from 'electron';

console.log('[preload] loaded');

contextBridge.exposeInMainWorld('persona', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch: any) => ipcRenderer.invoke('settings:update', patch),
  listVoices: () => ipcRenderer.invoke('voices:list'),
  startAssistant: () => ipcRenderer.invoke('assistant:start'),
  stopAssistant: () => ipcRenderer.invoke('assistant:stop'),
  ttsPreview: (text?: string) => ipcRenderer.invoke('tts:preview', { text })
});

// Overlay window API
contextBridge.exposeInMainWorld('overlay', {
  sttStart: () => ipcRenderer.invoke('overlay:stt:start'),
  sttPush: (chunk: ArrayBuffer) => ipcRenderer.invoke('overlay:stt:push', chunk),
  sttStop: () => ipcRenderer.invoke('overlay:stt:stop'),
  ttsSpeak: (text: string) => ipcRenderer.invoke('overlay:tts:speak', text),
  expand: () => ipcRenderer.invoke('overlay:expand'),
  collapse: () => ipcRenderer.invoke('overlay:collapse')
});

console.log('[preload] persona API exposed');
console.log('[preload] overlay API exposed');
