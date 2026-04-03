import type { ChatMessage } from './chat';
import type {
  DMRequest,
  AudioCallRequest,
  VideoCallRequest,
  DMNotice,
  FileTransferDirection,
} from './directMessage';

export type DMTransferStatus =
  | 'pending'
  | 'awaiting-accept'
  | 'in-progress'
  | 'completed'
  | 'rejected'
  | 'failed';

export interface SerializedFileChunk {
  index: number;
  data: number[];
}

export interface SerializedFileTransfer {
  id: string;
  filename: string;
  mimeType: string;
  totalSize: number;
  receivedSize: number;
  totalChunks: number;
  progress: number;
  direction: FileTransferDirection;
  status: DMTransferStatus;
  savedToDisk: boolean;
  chunks?: SerializedFileChunk[];
}

export interface SerializedDMChat {
  user: string;
  messages: ChatMessage[];
  isConnected: boolean;
  pendingDisplayMessages: Array<{ id: string; text: string }>;
  isTyping: boolean;
  audioEnabled: boolean;
  videoEnabled: boolean;
  callStartTime: number | null;
  callDuration: number;
  videoCallActive: boolean;
  fileTransfers: SerializedFileTransfer[];
}

export interface DMWindowStatePayload {
  activeChats: SerializedDMChat[];
  pendingRequests: DMRequest[];
  pendingAudioCalls: AudioCallRequest[];
  pendingVideoCalls: VideoCallRequest[];
  outgoingRequests: string[];
  notices: DMNotice[];
  username: string;
  dmChatEffect: 'none' | 'matrix' | 'glitch' | 'flames';
  focusedDMUser: string | null;
}

export type DMWindowAction =
  | { type: 'windowReady' }
  | { type: 'focusUser'; user: string }
  | { type: 'requestDm'; user: string }
  | { type: 'acceptDm'; user: string }
  | { type: 'rejectDm'; user: string }
  | { type: 'acceptAudio'; user: string }
  | { type: 'rejectAudio'; user: string }
  | { type: 'acceptVideo'; user: string }
  | { type: 'rejectVideo'; user: string }
  | { type: 'cancelRequest'; user: string }
  | { type: 'sendMessage'; user: string; message: string; effect: 'none' | 'matrix' | 'glitch' | 'flames' }
  | { type: 'typing'; user: string }
  | { type: 'stopTyping'; user: string }
  | { type: 'closeDm'; user: string }
  | { type: 'cancelPendingMessages'; user: string }
  | { type: 'requestAudio'; user: string }
  | { type: 'toggleAudio'; user: string; enabled: boolean }
  | { type: 'requestVideo'; user: string }
  | { type: 'toggleVideo'; user: string; enabled: boolean }
  | { type: 'sendFile'; user: string; file: File }
  | { type: 'acceptFile'; user: string; fileId: string }
  | { type: 'rejectFile'; user: string; fileId: string }
  | { type: 'fileSaved'; user: string; fileId: string }
  | { type: 'removeFile'; user: string; fileId: string }
  | { type: 'windowClosed' };
