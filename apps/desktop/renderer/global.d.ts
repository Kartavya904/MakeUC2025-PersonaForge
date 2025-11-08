export {};
declare global {
  interface Window {
    personaForge?: {
      pushToTalk: (audio?: ArrayBuffer) => Promise<any>;
      kill: () => Promise<{ ok: boolean }>;
    };
  }
}
