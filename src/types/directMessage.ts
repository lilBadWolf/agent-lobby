import type { ChatMessage } from './chat';

export interface DMRequest {
  from: string;
  timestamp: number;
}

export interface AudioCallRequest {
  from: string;
  timestamp: number;
}

export interface VideoCallRequest {
  from: string;
  timestamp: number;
}

export type FileTransferDirection = 'incoming' | 'outgoing';

export interface FileTransferState {
  id: string;
  filename: string;
  mimeType: string;
  totalSize: number;
  receivedSize: number;
  totalChunks: number;
  chunks: Map<number, Uint8Array>;
  progress: number;
  direction: FileTransferDirection;
  status: 'pending' | 'awaiting-accept' | 'in-progress' | 'completed' | 'rejected' | 'failed';
  savedToDisk: boolean;
}

export interface DMChat {
  user: string;
  messages: ChatMessage[];
  dataChannel: RTCDataChannel | null;
  isConnected: boolean;
  pendingDisplayMessages: Array<{ id: string; text: string }>;
  isTyping: boolean;
  audioEnabled: boolean;
  videoEnabled: boolean;
  localMediaStream: MediaStream | null;
  remoteMediaStream: MediaStream | null;
  fileTransfers: Map<string, FileTransferState>;
  callStartTime: number | null;
  callDuration: number;
  videoCallActive: boolean;
}

export interface DMNotice {
  id: number;
  message: string;
  type?: 'audio-call' | 'video-call' | 'call-status' | 'info' | 'file-offer';
  from?: string;
  fileId?: string;
}
