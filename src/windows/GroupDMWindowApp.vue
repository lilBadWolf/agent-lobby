<template>
  <div class="group-dm-window-root">
    <div data-tauri-drag-region class="custom-titlebar">
      <span class="titlebar-text">{{ pageTitle }}</span>
      <button v-if="hasTauriWindow" class="minimize-btn" @click.stop="minimize">-</button>
      <button v-if="hasTauriWindow" class="maximize-btn" @click.stop="toggleMaximize">
        <span class="window-icon" :class="{ maximized: isMaximized }" aria-hidden="true"></span>
      </button>
      <button class="titlebar-close-btn" @click.stop="handleClose">x</button>
    </div>

    <div class="group-dm-layout">
      <aside class="group-sidebar">
        <section v-if="pendingInvites.length > 0" class="group-panel invite-panel">
          <h2>PENDING INVITES</h2>
          <div v-for="invite in pendingInvites" :key="invite.id" class="invite-row">
            <div class="invite-copy">{{ invite.from }} invited you to join.</div>
            <div class="invite-actions">
              <button type="button" @click="acceptInvite(invite.id)">ACCEPT</button>
              <button type="button" @click="rejectInvite(invite.id)">REJECT</button>
            </div>
          </div>
        </section>

        <section class="group-panel members-panel">
          <h2>GROUP MEMBERS ({{ groupMembers.length }}/5)</h2>
          <ul>
            <li
              v-for="member in groupMembers"
              :key="member"
              class="member-row"
              :class="{ me: member === username, 'in-audio': isMemberInAudio(member), 'mic-muted': isMemberMicMuted(member), 'sound-muted': isMemberSoundMuted(member) }"
            >
              <span class="member-name">{{ member }}</span>
              <span class="member-status">
                <span v-if="isMemberInAudio(member)">AUD</span>
                <span v-if="isMemberMicMuted(member)">MIC OFF</span>
                <span v-if="isMemberSoundMuted(member)">SPK OFF</span>
              </span>
            </li>
          </ul>
        </section>

        <section class="group-panel audio-panel">
          <h2>GROUP AUDIO</h2>
          <button v-if="!isAudioJoined" type="button" class="primary-btn" @click="joinAudio">JOIN AUDIO</button>
          <button v-else type="button" class="secondary-btn" @click="leaveAudio">LEAVE AUDIO</button>
          <div v-if="isAudioJoined" class="audio-inline-actions">
            <button type="button" @click="toggleMicMuted">
              {{ isMicMuted ? 'UNMUTE MIC' : 'MUTE MIC' }}
            </button>
            <button type="button" @click="toggleSoundMuted">
              {{ isSoundMuted ? 'UNMUTE SOUND' : 'MUTE SOUND' }}
            </button>
          </div>
        </section>

        <section v-if="activeGroup" class="group-panel challenge-panel">
          <h2>CHALLENGE</h2>
          <div v-if="activeGame" class="challenge-copy">Game in progress. Close the current board to issue a new challenge.</div>
          <template v-else>
            <label class="challenge-label">Challenge user</label>
            <select v-model="selectedChallengeTarget" class="challenge-select">
              <option :value="null">Select member...</option>
              <option v-for="member in challengeableMembers" :key="member" :value="member">{{ member }}</option>
            </select>
            <div class="game-actions">
              <button type="button" :disabled="!selectedChallengeTarget" @click="challengeSelected('pong')">CHALLENGE TO PONG</button>
              <button type="button" :disabled="!selectedChallengeTarget" @click="challengeSelected('battleship')">CHALLENGE TO BATTLESHIP</button>
              <button type="button" :disabled="!selectedChallengeTarget" @click="challengeSelected('tictactoe')">CHALLENGE TO TIC TAC TOE</button>
              <button type="button" :disabled="!selectedChallengeTarget" @click="challengeSelected('chess')">CHALLENGE TO CHESS</button>
            </div>
          </template>
        </section>

        <section v-if="pendingGameChallenges.length > 0" class="group-panel challenge-inbox-panel">
          <h2>INCOMING CHALLENGES</h2>
          <div v-for="challenge in pendingGameChallenges" :key="challenge.id" class="invite-row">
            <div class="invite-copy">{{ challenge.from }} challenged you to {{ formatGameKind(challenge.kind) }}.</div>
            <div class="invite-actions">
              <button type="button" @click="respondChallenge(challenge.id, true)">ACCEPT</button>
              <button type="button" @click="respondChallenge(challenge.id, false)">DECLINE</button>
            </div>
          </div>
        </section>

        <button v-if="activeGroup" type="button" class="leave-btn" @click="leaveGroup">LEAVE GROUP</button>
      </aside>

      <main class="group-main" :class="{ 'with-gameboard': showGameboard }">
        <section v-if="showGameboard" class="gameboard-stage">
          <div class="gameboard-header">
            <h2>{{ activeGameLabel }}</h2>
            <div class="players-line">PLAYERS: {{ activeGamePlayersLabel }}</div>
          </div>

          <div class="gameboard-surface">
            <PongGame
              v-if="activeGame?.kind === 'pong'"
              :user="boardUser"
              :peer-name="boardPeer"
              :data-channel="gameRelayChannel"
              :start-signal="gameStartSignal"
              :is-initiator="boardIsInitiator"
              :waiting-for-acceptance="false"
              @close="handleGameClose"
            />
            <BattleshipGame
              v-else-if="activeGame?.kind === 'battleship'"
              :user="boardUser"
              :peer-name="boardPeer"
              :data-channel="gameRelayChannel"
              :start-signal="gameStartSignal"
              :waiting-for-acceptance="false"
              @close="handleGameClose"
            />
            <TicTacToeGame
              v-else-if="activeGame?.kind === 'tictactoe'"
              :user="boardUser"
              :peer-name="boardPeer"
              :data-channel="gameRelayChannel"
              :start-signal="gameStartSignal"
              :is-initiator="boardIsInitiator"
              :waiting-for-acceptance="false"
              @close="handleGameClose"
            />
            <ChessGame
              v-else-if="activeGame?.kind === 'chess'"
              :user="boardUser"
              :peer-name="boardPeer"
              :data-channel="gameRelayChannel"
              :start-signal="gameStartSignal"
              :is-initiator="boardIsInitiator"
              :waiting-for-acceptance="false"
              @close="handleGameClose"
            />

            <div v-if="isSpectator" class="spectator-overlay">
              SPECTATING LIVE: {{ activeGamePlayersLabel }}
            </div>
          </div>

          <button type="button" class="secondary-btn stop-board" @click="stopGame">CLOSE GAMEBOARD</button>
        </section>

        <section class="group-panel chat-panel" :class="{ 'chat-primary': !showGameboard }">
          <h2>GROUP CHAT</h2>
          <div class="messages">
            <div v-for="message in messages" :key="message.messageId || `${message.user}-${message.message}`" class="message-row">
              <span class="message-user" :class="{ system: message.isSystem }">{{ message.user }}</span>
              <span class="message-text">{{ message.message }}</span>
            </div>
            <div v-if="messages.length === 0" class="empty-line">No group messages yet.</div>
          </div>

          <form class="composer" @submit.prevent="submitMessage">
            <input v-model="draft" type="text" placeholder="Send a group message" />
            <button type="submit" :disabled="!activeGroup">SEND</button>
          </form>
        </section>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import type { GroupDMWindowAction, GroupDMWindowStatePayload } from '../types/groupDmWindowBridge';
import type { GroupAudioState, GroupDMGroup, GroupDMInvite, GroupGameChallenge, GroupGameEvent, GroupGameKind, GroupGameState } from '../types/groupDirectMessage';
import type { ChatMessage } from '../types/chat';
import PongGame from '../components/dm-system/dm-games/PongGame.vue';
import BattleshipGame from '../components/dm-system/dm-games/BattleshipGame.vue';
import TicTacToeGame from '../components/dm-system/dm-games/TicTacToeGame.vue';
import ChessGame from '../components/dm-system/dm-games/ChessGame.vue';

const GROUP_DM_WINDOW_STATE_EVENT = 'group-dm-window-state';
const GROUP_DM_WINDOW_ACTION_EVENT = 'group-dm-window-action';
const GROUP_DM_WEB_CHANNEL = 'agent-lobby-group-dm-window';
const GROUP_DM_FORCE_CLOSE_CHANNEL = 'agent-lobby-group-dm-force-close';

const username = ref('');
const activeGroup = ref<GroupDMGroup | null>(null);
const pendingInvites = ref<GroupDMInvite[]>([]);
const pendingGameChallenges = ref<GroupGameChallenge[]>([]);
const messages = ref<ChatMessage[]>([]);
const activeGame = ref<GroupGameState | null>(null);
const audioStates = ref<GroupAudioState[]>([]);
const gameEvents = ref<GroupGameEvent[]>([]);
const draft = ref('');
const isMaximized = ref(false);
const selectedChallengeTarget = ref<string | null>(null);
const relayCursor = ref(0);
const gameStartSignal = ref(0);
const gameRelayChannel = shallowRef<RTCDataChannel | null>(null);

let webChannel: BroadcastChannel | null = null;
let cleanupTauriListener: (() => void) | null = null;
let cleanupForceCloseListener: (() => void) | null = null;
let webMessageListenerBound = false;
let allowWindowClose = false;

class GroupGameRelayChannel {
  readyState: RTCDataChannelState = 'open';
  onmessage: ((event: MessageEvent) => void) | null = null;
  private messageListeners = new Set<(event: MessageEvent) => void>();
  private readonly onSend: (payload: string) => void;

  constructor(onSend: (payload: string) => void) {
    this.onSend = onSend;
  }

  send(data: string) {
    this.onSend(data);
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    if (type !== 'message') {
      return;
    }

    const wrapped = (event: MessageEvent) => {
      if (typeof listener === 'function') {
        listener(event);
        return;
      }

      listener.handleEvent(event);
    };

    this.messageListeners.add(wrapped);
  }

  removeEventListener(_type: string, _listener: EventListenerOrEventListenerObject) {
    // No-op: this relay channel is ephemeral per game session and listeners are discarded on reset.
  }

  dispatchMessage(data: string) {
    const event = new MessageEvent('message', { data });
    this.onmessage?.(event);
    for (const listener of this.messageListeners) {
      listener(event);
    }
  }

  close() {
    this.readyState = 'closed';
    this.messageListeners.clear();
    this.onmessage = null;
  }
}

const hasTauriWindow = isTauriRuntime();
const groupMembers = computed(() => activeGroup.value?.members ?? []);
const challengeableMembers = computed(() => {
  const game = activeGame.value;
  return groupMembers.value.filter((member) => member !== username.value && (!game || !game.players.includes(member)));
});
const currentAudioState = computed(() => audioStates.value.find((entry) => entry.user === username.value) ?? null);
const isAudioJoined = computed(() => Boolean(currentAudioState.value?.joined));
const isMicMuted = computed(() => Boolean(currentAudioState.value?.micMuted));
const isSoundMuted = computed(() => Boolean(currentAudioState.value?.soundMuted));
const isCurrentUserPlayer = computed(() => Boolean(activeGame.value?.players.includes(username.value)));
const isSpectator = computed(() => Boolean(activeGame.value) && !isCurrentUserPlayer.value);
const showGameboard = computed(() => Boolean(activeGame.value && activeGame.value.players.length === 2));
const boardUser = computed(() => {
  if (!activeGame.value) {
    return username.value;
  }

  if (isCurrentUserPlayer.value) {
    return username.value;
  }

  return activeGame.value.players[0];
});
const boardPeer = computed(() => {
  if (!activeGame.value) {
    return '';
  }

  if (isCurrentUserPlayer.value) {
    const other = activeGame.value.players.find((player) => player !== username.value);
    return other ?? activeGame.value.players[0];
  }

  return activeGame.value.players[1] ?? activeGame.value.players[0];
});
const boardIsInitiator = computed(() => {
  if (!activeGame.value) {
    return true;
  }

  return boardUser.value === activeGame.value.players[0];
});
const activeGameLabel = computed(() => {
  if (!activeGame.value) {
    return 'NO ACTIVE BOARD';
  }

  return formatGameKind(activeGame.value.kind);
});
const activeGamePlayersLabel = computed(() => activeGame.value?.players.join(' vs ') ?? 'NONE');

const pageTitle = computed(() => {
  if (activeGroup.value && activeGame.value) {
    return `${username.value} // GROUP DM // ${activeGameLabel.value}`;
  }

  if (activeGroup.value) {
    return `${username.value} // GROUP DM`;
  }

  return `${username.value || 'AGENT'} // GROUP INVITES`;
});

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
}

function formatGameKind(kind: GroupGameKind): string {
  if (kind === 'tictactoe') return 'TIC TAC TOE';
  if (kind === 'battleship') return 'BATTLESHIP';
  if (kind === 'pong') return 'PONG';
  return 'CHESS';
}

function applyState(payload: GroupDMWindowStatePayload) {
  username.value = payload.username;
  activeGroup.value = payload.activeGroup;
  pendingInvites.value = payload.pendingInvites;
  pendingGameChallenges.value = payload.pendingGameChallenges;
  messages.value = payload.messages;
  activeGame.value = payload.activeGame;
  audioStates.value = payload.audioStates;
  gameEvents.value = payload.gameEvents;
}

async function sendAction(action: GroupDMWindowAction) {
  if (isTauriRuntime()) {
    const { emitTo } = await import('@tauri-apps/api/event');
    await emitTo('main', GROUP_DM_WINDOW_ACTION_EVENT, action);
    return;
  }

  if (window.opener && window.opener !== window) {
    window.opener.postMessage({ type: 'group-dm-action', payload: action }, window.location.origin);
    return;
  }

  webChannel?.postMessage({ type: 'group-dm-action', payload: action });
}

function setupRelayChannel() {
  if (!activeGame.value) {
    gameRelayChannel.value = null;
    return;
  }

  relayCursor.value = 0;
  gameStartSignal.value += 1;

  const channel = new GroupGameRelayChannel((payload: string) => {
    if (!isCurrentUserPlayer.value) {
      return;
    }

    void sendAction({ type: 'relayGameMessage', payload });
  });

  gameRelayChannel.value = channel as unknown as RTCDataChannel;
}

watch(
  () => activeGame.value?.challengeId ?? activeGame.value?.kind ?? null,
  () => {
    setupRelayChannel();
  },
  { immediate: true }
);

watch(
  () => gameEvents.value,
  (events) => {
    const channel = gameRelayChannel.value as unknown as GroupGameRelayChannel | null;
    if (!channel || !activeGame.value) {
      return;
    }

    const sorted = [...events].sort((a, b) => a.sequence - b.sequence);
    for (const event of sorted) {
      if (event.sequence <= relayCursor.value) {
        continue;
      }

      if (!activeGame.value.players.includes(event.from)) {
        continue;
      }

      relayCursor.value = event.sequence;
      channel.dispatchMessage(event.payload);
    }
  },
  { deep: true }
);

function submitMessage() {
  const message = draft.value.trim();
  if (!message) {
    return;
  }

  void sendAction({ type: 'sendMessage', message });
  draft.value = '';
}

function acceptInvite(inviteId: string) {
  void sendAction({ type: 'acceptInvite', inviteId });
}

function rejectInvite(inviteId: string) {
  void sendAction({ type: 'rejectInvite', inviteId });
}

function leaveGroup() {
  void sendAction({ type: 'leaveGroup' });
}

function joinAudio() {
  void sendAction({ type: 'joinAudio' });
}

function leaveAudio() {
  void sendAction({ type: 'leaveAudio' });
}

function toggleMicMuted() {
  if (!isAudioJoined.value) {
    return;
  }

  void sendAction({ type: 'setMicMuted', muted: !isMicMuted.value });
}

function toggleSoundMuted() {
  if (!isAudioJoined.value) {
    return;
  }

  void sendAction({ type: 'setSoundMuted', muted: !isSoundMuted.value });
}

function challengeSelected(kind: GroupGameKind) {
  if (!selectedChallengeTarget.value) {
    return;
  }

  void sendAction({
    type: 'challengeUserToGame',
    user: selectedChallengeTarget.value,
    kind,
  });
}

function respondChallenge(challengeId: string, accepted: boolean) {
  void sendAction({ type: 'respondGameChallenge', challengeId, accepted });
}

function stopGame() {
  void sendAction({ type: 'stopGame' });
}

function handleGameClose() {
  if (!isCurrentUserPlayer.value) {
    return;
  }

  stopGame();
}

function getMemberAudioState(member: string): GroupAudioState | null {
  return audioStates.value.find((entry) => entry.user === member) ?? null;
}

function isMemberInAudio(member: string): boolean {
  return Boolean(getMemberAudioState(member)?.joined);
}

function isMemberMicMuted(member: string): boolean {
  return Boolean(getMemberAudioState(member)?.joined && getMemberAudioState(member)?.micMuted);
}

function isMemberSoundMuted(member: string): boolean {
  return Boolean(getMemberAudioState(member)?.joined && getMemberAudioState(member)?.soundMuted);
}

function handleWebMessage(event: MessageEvent) {
  if (event.origin !== window.location.origin) {
    return;
  }

  const message = event.data as { type?: string; payload?: unknown };
  if (message.type !== 'group-dm-state') {
    return;
  }

  applyState(message.payload as GroupDMWindowStatePayload);
}

async function minimize() {
  if (!hasTauriWindow) {
    return;
  }

  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow().minimize();
}

async function toggleMaximize() {
  if (!hasTauriWindow) {
    return;
  }

  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const appWindow = getCurrentWindow();
  if (isMaximized.value) {
    await appWindow.unmaximize();
  } else {
    await appWindow.maximize();
  }

  isMaximized.value = !isMaximized.value;
}

async function handleClose() {
  try {
    await sendAction({ type: 'windowClosed' });
  } catch {
    // Continue closing even if signaling fails.
  }

  if (isTauriRuntime()) {
    allowWindowClose = true;
    const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    await getCurrentWebviewWindow().close();
    return;
  }

  window.close();
}

onMounted(async () => {
  if (typeof BroadcastChannel !== 'undefined') {
    webChannel = new BroadcastChannel(GROUP_DM_WEB_CHANNEL);
    webChannel.onmessage = (event: MessageEvent) => {
      const message = event.data as { type?: string; payload?: unknown };
      if (message?.type === 'group-dm-state') {
        applyState(message.payload as GroupDMWindowStatePayload);
      }
    };

    const forceCloseChannel = new BroadcastChannel(GROUP_DM_FORCE_CLOSE_CHANNEL);
    forceCloseChannel.onmessage = async (event) => {
      if (event.data !== 'force-close') {
        return;
      }

      allowWindowClose = true;
      if (isTauriRuntime()) {
        const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        await getCurrentWebviewWindow().close();
        return;
      }

      window.close();
    };

    cleanupForceCloseListener = () => forceCloseChannel.close();
  }

  if (isTauriRuntime()) {
    const { listen } = await import('@tauri-apps/api/event');
    cleanupTauriListener = await listen<GroupDMWindowStatePayload>(GROUP_DM_WINDOW_STATE_EVENT, (event) => {
      applyState(event.payload);
    });

    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const appWindow = getCurrentWindow();
    isMaximized.value = await appWindow.isMaximized();
    await appWindow.onCloseRequested((event) => {
      if (allowWindowClose) {
        return;
      }

      event.preventDefault();
      void appWindow.hide();
    });

    await sendAction({ type: 'windowReady' });
    return;
  }

  if (!webMessageListenerBound) {
    window.addEventListener('message', handleWebMessage);
    webMessageListenerBound = true;
  }

  await sendAction({ type: 'windowReady' });
});

onBeforeUnmount(() => {
  void sendAction({ type: 'windowClosed' });
  const relay = gameRelayChannel.value as unknown as GroupGameRelayChannel | null;
  relay?.close();
  if (webMessageListenerBound) {
    window.removeEventListener('message', handleWebMessage);
    webMessageListenerBound = false;
  }
  cleanupTauriListener?.();
  cleanupTauriListener = null;
  cleanupForceCloseListener?.();
  cleanupForceCloseListener = null;
  webChannel?.close();
  webChannel = null;
});
</script>

<style scoped>
.group-dm-window-root {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: var(--color-dmwindow-bg);
  color: var(--color-accent);
}

.custom-titlebar {
  -webkit-app-region: drag;
  width: 100%;
  height: 28px;
  padding: 0 88px 0 14px;
  box-sizing: border-box;
  background: var(--color-dmwindow-titlebar-bg);
  border-bottom: 1px solid var(--color-dmwindow-titlebar-border);
  display: flex;
  align-items: center;
  user-select: none;
  z-index: 1000;
  position: relative;
  font-size: 11px;
  letter-spacing: 1.6px;
  text-transform: uppercase;
}

.titlebar-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.minimize-btn,
.maximize-btn,
.titlebar-close-btn {
  position: absolute;
  top: 0;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--color-accent);
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.minimize-btn {
  right: 56px;
}

.maximize-btn {
  right: 28px;
}

.titlebar-close-btn {
  right: 0;
  color: var(--color-danger);
}

.window-icon {
  display: block;
  position: relative;
  width: 10px;
  height: 8px;
  border: 1.5px solid currentColor;
  box-sizing: border-box;
}

.window-icon.maximized::before {
  content: '';
  position: absolute;
  width: 10px;
  height: 8px;
  border: 1.5px solid currentColor;
  top: -4px;
  left: 2px;
  box-sizing: border-box;
  background: transparent;
}

.group-dm-layout {
  display: grid;
  grid-template-columns: minmax(250px, 320px) minmax(0, 1fr);
  gap: 12px;
  height: calc(100% - 28px);
  padding: 12px;
  box-sizing: border-box;
}

.group-sidebar {
  display: grid;
  grid-template-rows: auto auto auto auto auto minmax(0, 1fr) auto;
  gap: 10px;
  min-height: 0;
}

.group-main {
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  gap: 12px;
  min-height: 0;
}

.group-main.with-gameboard {
  grid-template-rows: minmax(0, 1.25fr) minmax(210px, 0.75fr);
}

.group-panel {
  border: 1px solid var(--color-accent-muted);
  background: rgba(0, 0, 0, 0.24);
  padding: 10px;
  overflow: auto;
  min-height: 0;
}

.group-panel h2 {
  margin: 0 0 10px;
  font-size: 11px;
  letter-spacing: 1.2px;
}

.members-panel ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.member-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content;
  gap: 8px;
  padding: 5px 0;
  border-bottom: 1px dotted var(--color-accent-muted);
  font-size: 11px;
}

.member-row.me .member-name {
  font-weight: 700;
}

.member-status {
  display: inline-flex;
  gap: 6px;
  font-size: 10px;
  color: var(--color-accent-muted);
}

.leave-btn {
  margin-top: 12px;
  width: 100%;
  border: 1px solid var(--color-danger);
  color: var(--color-danger);
  background: transparent;
  padding: 8px;
}

.invite-row {
  display: grid;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--color-accent-muted);
  margin-bottom: 8px;
}

.invite-actions {
  display: flex;
  gap: 8px;
}

.invite-copy {
  font-size: 11px;
}

.challenge-label {
  display: block;
  margin-bottom: 6px;
  font-size: 10px;
  color: var(--color-accent-muted);
}

.challenge-copy {
  font-size: 11px;
  color: var(--color-accent-muted);
}

.challenge-select {
  width: 100%;
  margin-bottom: 8px;
  border: 1px solid var(--color-accent-muted);
  background: transparent;
  color: var(--color-accent);
  padding: 8px;
}

.audio-inline-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  margin-top: 8px;
}

.audio-panel button,
.challenge-panel button,
.challenge-inbox-panel button,
.invite-actions button,
.composer button,
.composer input,
.primary-btn,
.secondary-btn {
  border: 1px solid var(--color-accent-muted);
  background: transparent;
  color: var(--color-accent);
  padding: 8px;
  font-size: 11px;
}

.challenge-panel button:disabled,
.audio-panel button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.game-actions {
  display: grid;
  gap: 8px;
}

.gameboard-stage {
  border: 1px solid var(--color-accent-muted);
  background: radial-gradient(circle at 20% 10%, rgba(120, 138, 255, 0.15), rgba(0, 0, 0, 0.2) 55%), rgba(0, 0, 0, 0.24);
  padding: 12px;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-height: 0;
}

.gameboard-header {
  display: grid;
  gap: 4px;
  margin-bottom: 10px;
}

.gameboard-header h2 {
  margin: 0;
  font-size: 14px;
  letter-spacing: 1.2px;
}

.players-line {
  font-size: 11px;
  color: var(--color-accent-muted);
}

.gameboard-surface {
  border: 1px dashed var(--color-accent-muted);
  background: rgba(0, 0, 0, 0.28);
  display: grid;
  place-items: stretch;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

.spectator-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.1);
  display: grid;
  place-items: center;
  font-size: 12px;
  letter-spacing: 0.8px;
  pointer-events: all;
}

.stop-board {
  margin-top: 10px;
}

.chat-panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
}

.messages {
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--color-accent-muted);
  padding: 8px;
}

.message-row {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 8px;
  margin-bottom: 6px;
}

.message-user {
  color: var(--color-accent-muted);
  text-transform: uppercase;
}

.message-user.system {
  color: var(--color-text-primary);
}

.empty-line {
  color: var(--color-muted);
}

.composer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content;
  gap: 8px;
  margin-top: 10px;
}

.composer button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

@media (max-width: 900px) {
  .group-dm-layout {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(220px, auto) minmax(0, 1fr);
  }

  .group-sidebar {
    grid-template-rows: repeat(6, auto);
    max-height: 42vh;
  }
}
</style>
