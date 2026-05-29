import type { ChatMessage } from './chat';
import type { GroupAudioState, GroupDMGroup, GroupDMInvite, GroupGameChallenge, GroupGameEvent, GroupGameKind, GroupGameState } from './groupDirectMessage';

export interface GroupDMWindowStatePayload {
  username: string;
  activeGroup: GroupDMGroup | null;
  pendingInvites: GroupDMInvite[];
  messages: ChatMessage[];
  activeGame: GroupGameState | null;
  audioStates: GroupAudioState[];
  pendingGameChallenges: GroupGameChallenge[];
  gameEvents: GroupGameEvent[];
}

export type GroupDMWindowAction =
  | { type: 'windowReady' }
  | { type: 'sendMessage'; message: string }
  | { type: 'requestGroupTunnel'; user: string }
  | { type: 'inviteUser'; user: string }
  | { type: 'acceptInvite'; inviteId: string }
  | { type: 'rejectInvite'; inviteId: string }
  | { type: 'joinAudio' }
  | { type: 'leaveAudio' }
  | { type: 'setMicMuted'; muted: boolean }
  | { type: 'setSoundMuted'; muted: boolean }
  | { type: 'challengeUserToGame'; user: string; kind: GroupGameKind }
  | { type: 'respondGameChallenge'; challengeId: string; accepted: boolean }
  | { type: 'relayGameMessage'; payload: string }
  | { type: 'stopGame' }
  | { type: 'leaveGroup' }
  | { type: 'windowClosed' };
