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

console.log('[preload] persona API exposed');
