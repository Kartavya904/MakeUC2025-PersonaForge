export type ToneKey = 'friendly' | 'professional' | 'storyteller' | 'energetic' | 'calm';

export type VoiceTTSParams = {
  stability: number;          // 0..1
  similarityBoost: number;    // 0..1
  style: number;              // 0..1
  speakingRate: number;       // 0.5..2.0
  pitch: number;              // -12..+12 semitones
  useSpeakerBoost: boolean;
};

export type VoiceSettings = {
  tone: ToneKey;
  voiceId: string;            // ElevenLabs voice id
  params: VoiceTTSParams;
};

export type BehaviorSettings = {
  runAssistant: boolean;
  startListeningOnLaunch: boolean;
};

export type GeneralSettings = {
  autoStartOnLogin: boolean;
  runMinimized: boolean;
};

export type AppSettings = {
  version: number;
  voice: VoiceSettings;
  behavior: BehaviorSettings;
  general: GeneralSettings;
};
