import { contextBridge, ipcRenderer } from "electron";

type Unsub = () => void;

contextBridge.exposeInMainWorld("api", {
  startRecording: (rate?: number): Promise<void> => ipcRenderer.invoke("stt:start", rate),
  stopRecording: (): Promise<void> => ipcRenderer.invoke("stt:stop"),
  audioChunk: (ab: ArrayBuffer): void => ipcRenderer.send("stt:audio-chunk", Buffer.from(ab)),
  nlpAsk: (text: string): Promise<string> => ipcRenderer.invoke("nlp:ask", text),
  ttsSpeak: (text: string): Promise<void> => ipcRenderer.invoke("tts:speak", text),
  executePlan: (plan: any): Promise<any> => ipcRenderer.invoke("plan:execute", plan),
  on: (channel: string, cb: (...args: any[]) => void): Unsub => {
    const wrapped = (_e: any, ...args: any[]) => cb(...args);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  }
});
