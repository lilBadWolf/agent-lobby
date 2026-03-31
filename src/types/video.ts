export interface VideoWindowState {
  user: string;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isOpen: boolean;
}
