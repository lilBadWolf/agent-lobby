export interface ActiveMedia {
  label: string;
  url?: string;
  mediaType?: 'audio' | 'video';
  currentTime?: number;
}

export interface UserPresence {
  username: string;
  dmAvailable: boolean;
  isTyping?: boolean;
  isAway?: boolean;
  isBot?: boolean;
  mediaSharing?: boolean;
  activeMedia?: ActiveMedia | null;
  avatarUrl?: string;
  tagline?: string;
}

export interface ChatMessage {
  user: string;
  message: string;
  isSystem?: boolean;
  effect?: string;
  duration?: number;
  messageId?: string;
}

export interface SlashCommandAlias {
  command: string;
  text: string;
}

export interface AudioConfig {
  audioEnabled: boolean;
  volume: number;
  autoAwayMinutes?: number;
  autoUpdatePulseMinutes?: number;
  autoScanMediaLibraryMinutes?: number;
  spectrumBarCount?: number;
  spectrumFftSize?: number;
  spectrumSensitivity?: number;
  spectrumGradientBars?: boolean;
  spectrumThresholdLow?: number;
  spectrumThresholdMedium?: number;
  spectrumThresholdHigh?: number;
  dmEnabled: boolean;
  mediaSharing: boolean;
  enableAvatars?: boolean;
  avatarUrl?: string;
  tagline?: string;
  agentAmpEnabled: boolean;
  agentAmpDetached?: boolean;
  scanlines?: boolean;
  soundpack: string;
  theme: string;
  showJoinPartMessages?: boolean;
  audioInputDeviceId: string;
  audioOutputDeviceId: string;
  videoInputDeviceId: string;
  customSlashCommands?: SlashCommandAlias[];
  dmChatEffect: 'none' | 'codex' | 'glitch' | 'flames' | 'rust' | 'pacman' | 'mspacman' | 'starmap' | 'bubbles' | 'smoke' | 'inferno';
}

export interface NetworkConfig {
  mqttServer: string;
  defaultLobby: string;
}
