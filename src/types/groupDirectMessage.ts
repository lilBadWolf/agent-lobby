import type { ChatMessage } from './chat';

export type GroupGameKind = 'pong' | 'battleship' | 'tictactoe' | 'chess';

export interface GroupGameState {
  kind: GroupGameKind;
  players: string[];
  challengeId?: string;
}

export interface GroupGameChallenge {
  id: string;
  kind: GroupGameKind;
  from: string;
  to: string;
  createdAt: number;
}

export interface GroupGameEvent {
  sequence: number;
  from: string;
  payload: string;
}

export interface GroupAudioState {
  user: string;
  joined: boolean;
  micMuted: boolean;
  soundMuted: boolean;
}

export interface GroupDMInvite {
  id: string;
  groupId: string;
  from: string;
  owner: string;
  members: string[];
  timestamp: number;
}

export interface GroupDMGroup {
  id: string;
  owner: string;
  members: string[];
  createdAt: number;
}

export interface GroupDMState {
  activeGroup: GroupDMGroup | null;
  pendingInvites: GroupDMInvite[];
  messages: ChatMessage[];
}
