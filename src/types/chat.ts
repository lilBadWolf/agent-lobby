export interface ActiveMedia {
  label: string;
  url?: string;
  mediaType?: 'audio' | 'video';
}

export interface UserPresence {
  username: string;
  dmAvailable: boolean;
  isTyping?: boolean;
  isAway?: boolean;
  isBot?: boolean;
  mediaSharing?: boolean;
  activeMedia?: ActiveMedia | null;
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
  spectrumBarCount?: number;
  spectrumFftSize?: number;
  dmEnabled: boolean;
  mediaSharing: boolean;
  agentAmpEnabled: boolean;
  agentAmpDetached?: boolean;
  scanlines?: boolean;
  soundpack: string;
  theme: string;
  dmChatEffect: 'none' | 'matrix' | 'glitch' | 'flames' | 'rust';
  audioInputDeviceId: string;
  audioOutputDeviceId: string;
  videoInputDeviceId: string;
  customSlashCommands?: SlashCommandAlias[];
}

export interface NetworkConfig {
  mqttServer: string;
  defaultLobby: string;
}
