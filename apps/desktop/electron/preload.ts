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

// Security API
contextBridge.exposeInMainWorld('security', {
  validatePlan: (plan: any, userInput: string) => ipcRenderer.invoke('security:validate-plan', plan, userInput),
  requestConsent: (plan: any, userInput: string) => ipcRenderer.invoke('security:request-consent', plan, userInput),
  logAction: (userInput: string, plan: any, approved: boolean, executed: boolean, error?: string) => 
    ipcRenderer.invoke('security:log-action', userInput, plan, approved, executed, error),
  killSwitchActivate: () => ipcRenderer.invoke('security:kill-switch:activate'),
  killSwitchDeactivate: () => ipcRenderer.invoke('security:kill-switch:deactivate'),
  killSwitchStatus: () => ipcRenderer.invoke('security:kill-switch:status'),
  getConfig: () => ipcRenderer.invoke('security:get-config'),
  updateConfig: (config: any) => ipcRenderer.invoke('security:update-config', config),
  getAuditLogs: (limit?: number) => ipcRenderer.invoke('security:get-audit-logs', limit),
  executeTask: (plan: any, userInput: string) => ipcRenderer.invoke('task:execute', plan, userInput)
});

console.log('[preload] persona API exposed');
console.log('[preload] overlay API exposed');
