export interface UserPresence {
  username: string;
  dmAvailable: boolean;
  isTyping?: boolean;
  isAway?: boolean;
  isBot?: boolean;
}

export interface ChatMessage {
  user: string;
  message: string;
  isSystem?: boolean;
  effect?: string;
  duration?: number;
  messageId?: string;
}

export interface AudioConfig {
  audioEnabled: boolean;
  volume: number;
  dmEnabled: boolean;
  soundpack: string;
  theme: string;
  dmChatEffect: 'none' | 'matrix' | 'glitch' | 'flames';
  audioInputDeviceId: string;
  audioOutputDeviceId: string;
  videoInputDeviceId: string;
}

export interface NetworkConfig {
  mqttServer: string;
  defaultLobby: string;
}
