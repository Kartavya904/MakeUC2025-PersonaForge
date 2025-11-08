export {};

type UnsubscribeFn = () => void;

declare global {
  interface Window {
    api: {
      // Recording methods
      startRecording: () => Promise<void>;
      stopRecording: () => Promise<void>;
      
      // NLP/LLM methods
      nlpAsk: (text: string) => Promise<string>;
      
      // TTS methods
      ttsSpeak: (text: string) => Promise<void>;
      
      // Event listeners
      on: (channel: string, callback: (data: any) => void) => UnsubscribeFn;
      
      // Hotkey methods
      hotkey: (action: string) => Promise<void>;
    };
  }
}
