<template>
  <div class="ttt-shell" role="application" aria-label="Tic-Tac-Toe game">
    <div class="ttt-header">
      <div class="ttt-title-wrap">
        <span class="ttt-title">TIC TAC TOE</span>
        <span class="ttt-subtitle">Linking with {{ peerName }}</span>
      </div>
      <button class="ttt-action-btn" type="button" @click="closeGame">EXIT</button>
    </div>

    <div class="ttt-main">
      <div class="ttt-spotlight" aria-hidden="true"></div>
      <div class="ttt-status-card">
        <div class="ttt-status-line">{{ statusLine }}</div>
        <div class="ttt-meta-line">
          <span>You: {{ localMark ?? '-' }}</span>
          <span>{{ peerName }}: {{ remoteMark ?? '-' }}</span>
        </div>
      </div>

      <div class="ttt-board-wrap">
        <div class="ttt-board" :class="{ 'locked': !canPlay }">
          <button
            v-for="index in 9"
            :key="`ttt-${index - 1}`"
            class="ttt-cell"
            type="button"
            :disabled="!canPlayCell(index - 1)"
            :class="cellClass(index - 1)"
            @click="playCell(index - 1)"
          >
            <span class="ttt-mark">{{ board[index - 1] ?? '' }}</span>
          </button>
        </div>
      </div>

      <div class="ttt-controls">
        <button
          class="ttt-action-btn rematch"
          type="button"
          :disabled="!canSend || awaitingRematchAck"
          @click="requestRematch"
        >
          {{ awaitingRematchAck ? 'WAITING FOR REMATCH...' : 'REMATCH' }}
        </button>
      </div>
    </div>

    <div v-if="showWaitingOverlay" class="ttt-overlay">WAITING FOR OPPONENT TO ACCEPT</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

type Mark = 'X' | 'O';
type TicTacToeBridgeEventDetail = {
  from?: string;
  data?: any;
};

const WIN_LINES: Array<[number, number, number]> = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

const props = defineProps<{
  user: string;
  peerName: string;
  dataChannel: RTCDataChannel | null;
  startSignal: number;
  isInitiator?: boolean;
  waitingForAcceptance?: boolean;
}>();

const emit = defineEmits<{ close: [] }>();

const board = ref<Array<Mark | null>>(Array(9).fill(null));
const localMark = ref<Mark | null>(null);
const remoteMark = ref<Mark | null>(null);
const turnMark = ref<Mark | null>(null);
const winner = ref<Mark | 'draw' | null>(null);
const winningLine = ref<number[]>([]);
const awaitingRematchAck = ref(false);
const roundLive = ref(false);
const statusMessage = ref('Stand by for game sync...');

const showWaitingOverlay = computed(() => Boolean(props.waitingForAcceptance));
const canSend = computed(() => Boolean(currentChannel && currentChannel.readyState === 'open'));
const canPlay = computed(() => {
  if (!roundLive.value || showWaitingOverlay.value || winner.value) {
    return false;
  }

  return turnMark.value === localMark.value;
});

const statusLine = computed(() => {
  if (showWaitingOverlay.value) {
    return 'Waiting for opponent to accept TIC TAC TOE';
  }

  if (!roundLive.value) {
    return statusMessage.value;
  }

  if (winner.value === 'draw') {
    return 'Draw game. Request a rematch to play again.';
  }

  if (winner.value) {
    return winner.value === localMark.value ? 'You win this round.' : `${props.peerName} wins this round.`;
  }

  if (!localMark.value || !turnMark.value) {
    return 'Syncing game state...';
  }

  const activeUser = turnMark.value === localMark.value ? 'Your turn' : `${props.peerName} turn`;
  return `${activeUser} (${turnMark.value})`;
});

let currentChannel: RTCDataChannel | null = null;
let messageListener: ((event: MessageEvent) => void) | null = null;
let openListener: ((event: Event) => void) | null = null;

function clearBoard() {
  board.value = Array(9).fill(null);
  winner.value = null;
  winningLine.value = [];
  awaitingRematchAck.value = false;
}

function randomStarterUser() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % 2 === 0 ? props.user : props.peerName;
}

function startNewRound(starterUser: string, broadcast = false) {
  clearBoard();

  const localStarts = starterUser === props.user;
  localMark.value = localStarts ? 'X' : 'O';
  remoteMark.value = localStarts ? 'O' : 'X';
  turnMark.value = 'X';
  roundLive.value = true;
  statusMessage.value = `Round started. ${starterUser} moves first.`;

  if (broadcast && canSend.value) {
    sendGameMessage({
      type: 'ttt-start',
      starter: starterUser,
    });
  }
}

function nextMark(mark: Mark): Mark {
  return mark === 'X' ? 'O' : 'X';
}

function findWinner(nextBoard: Array<Mark | null>): { winner: Mark | 'draw' | null; line: number[] } {
  for (const [a, b, c] of WIN_LINES) {
    const cell = nextBoard[a];
    if (cell && cell === nextBoard[b] && cell === nextBoard[c]) {
      return { winner: cell, line: [a, b, c] };
    }
  }

  if (nextBoard.every((cell) => cell !== null)) {
    return { winner: 'draw', line: [] };
  }

  return { winner: null, line: [] };
}

function applyMove(index: number, fromRemote = false) {
  if (!roundLive.value || winner.value || turnMark.value === null) {
    return;
  }

  if (index < 0 || index >= 9 || board.value[index] !== null) {
    return;
  }

  const movingMark = turnMark.value;
  const movingIsRemote = movingMark === remoteMark.value;

  if (fromRemote !== movingIsRemote) {
    return;
  }

  const nextBoard = [...board.value];
  nextBoard[index] = movingMark;
  board.value = nextBoard;

  const outcome = findWinner(nextBoard);
  winner.value = outcome.winner;
  winningLine.value = outcome.line;

  if (!outcome.winner) {
    turnMark.value = nextMark(movingMark);
    return;
  }

  roundLive.value = false;
}

function canPlayCell(index: number) {
  return canPlay.value && board.value[index] === null;
}

function cellClass(index: number) {
  const mark = board.value[index];
  return {
    'filled': Boolean(mark),
    'is-x': mark === 'X',
    'is-o': mark === 'O',
    'win-cell': winningLine.value.includes(index),
  };
}

function sendGameMessage(message: Record<string, unknown>) {
  if (!currentChannel || currentChannel.readyState !== 'open') {
    return;
  }

  try {
    currentChannel.send(JSON.stringify(message));
  } catch {
    // Ignore transient send errors.
  }
}

function playCell(index: number) {
  if (!canPlayCell(index)) {
    return;
  }

  applyMove(index, false);
  sendGameMessage({ type: 'ttt-move', index });
}

function requestRematch() {
  if (!canSend.value) {
    return;
  }

  awaitingRematchAck.value = true;
  sendGameMessage({ type: 'ttt-rematch-request' });
}

function acceptRemoteRematch() {
  if (!canSend.value) {
    return;
  }

  awaitingRematchAck.value = false;
  sendGameMessage({ type: 'ttt-rematch-accept' });
  const starter = randomStarterUser();
  startNewRound(starter, true);
}

function handleGameDataMessage(data: any) {
  const type = data?.type;
  if (typeof type !== 'string' || (!type.startsWith('ttt-') && !type.startsWith('tictactoe-'))) {
    return;
  }

  if (type === 'ttt-start' && typeof data.starter === 'string') {
    startNewRound(data.starter, false);
    return;
  }

  if (type === 'ttt-move' && typeof data.index === 'number') {
    applyMove(data.index, true);
    return;
  }

  if (type === 'ttt-rematch-request') {
    statusMessage.value = `${props.peerName} requested a rematch.`;
    acceptRemoteRematch();
    return;
  }

  if (type === 'ttt-rematch-accept') {
    awaitingRematchAck.value = false;
    return;
  }

  if (type === 'ttt-cancel' || type === 'tictactoe-cancel') {
    statusMessage.value = `${props.peerName} canceled TIC TAC TOE.`;
    roundLive.value = false;
  }
}

function handleBridgeMessage(event: Event) {
  const bridgeEvent = event as CustomEvent<TicTacToeBridgeEventDetail>;
  if (!bridgeEvent.detail?.from || bridgeEvent.detail.from !== props.peerName) {
    return;
  }

  handleGameDataMessage(bridgeEvent.detail?.data);
}

function attachChannel(channel: RTCDataChannel | null) {
  if (currentChannel && messageListener) {
    currentChannel.removeEventListener('message', messageListener);
  }

  if (currentChannel && openListener) {
    currentChannel.removeEventListener('open', openListener);
  }

  currentChannel = channel;

  if (!currentChannel) {
    return;
  }

  messageListener = (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      handleGameDataMessage(data);
    } catch {
      // Ignore malformed data.
    }
  };

  openListener = () => {
    if (props.isInitiator && props.startSignal > 0 && !roundLive.value && !showWaitingOverlay.value) {
      startNewRound(randomStarterUser(), true);
    }
  };

  currentChannel.addEventListener('message', messageListener);
  currentChannel.addEventListener('open', openListener);
}

function closeGame() {
  sendGameMessage({ type: 'ttt-cancel' });
  emit('close');
}

watch(
  () => props.dataChannel,
  (channel) => {
    attachChannel(channel);
  },
  { immediate: true }
);

watch(
  () => props.startSignal,
  (signal) => {
    if (signal <= 0 || showWaitingOverlay.value) {
      return;
    }

    if (props.isInitiator) {
      startNewRound(randomStarterUser(), true);
      return;
    }

    statusMessage.value = 'Connected. Waiting for round assignment...';
  }
);

watch(
  () => props.waitingForAcceptance,
  (waiting) => {
    if (waiting) {
      statusMessage.value = 'Waiting for opponent to accept TIC TAC TOE';
      return;
    }

    if (!roundLive.value && props.startSignal <= 0) {
      statusMessage.value = 'Ready to start TIC TAC TOE.';
    }
  },
  { immediate: true }
);

onMounted(() => {
  window.addEventListener('dm-tictactoe-message', handleBridgeMessage as EventListener);

  if (!props.waitingForAcceptance) {
    statusMessage.value = 'Ready to start TIC TAC TOE.';
  }

  if (props.startSignal > 0 && props.isInitiator && !showWaitingOverlay.value) {
    startNewRound(randomStarterUser(), true);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('dm-tictactoe-message', handleBridgeMessage as EventListener);

  if (currentChannel && messageListener) {
    currentChannel.removeEventListener('message', messageListener);
  }

  if (currentChannel && openListener) {
    currentChannel.removeEventListener('open', openListener);
  }
});
</script>

<style scoped>
.ttt-shell {
  position: relative;
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 12px;
  width: min(100%, 860px);
  margin: 0 auto;
  padding: 16px;
  border: 1px solid color-mix(in srgb, var(--color-accent) 42%, transparent);
  border-radius: 16px;
  background:
    radial-gradient(circle at 12% 14%, color-mix(in srgb, var(--color-accent) 20%, transparent), transparent 36%),
    radial-gradient(circle at 88% 92%, color-mix(in srgb, var(--color-chat-link) 22%, transparent), transparent 42%),
    color-mix(in srgb, var(--color-bg-base) 82%, black);
  box-shadow: 0 20px 50px color-mix(in srgb, var(--color-accent) 24%, transparent);
  overflow: hidden;
}

.ttt-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.ttt-title-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ttt-title {
  font-size: 1.15rem;
  letter-spacing: 0.22em;
  color: var(--color-accent);
}

.ttt-subtitle {
  color: var(--color-text-secondary);
  letter-spacing: 0.08em;
  font-size: 0.76rem;
}

.ttt-main {
  position: relative;
  display: grid;
  grid-template-rows: auto auto auto;
  gap: 14px;
  min-height: 0;
}

.ttt-spotlight {
  position: absolute;
  inset: auto auto -120px -110px;
  width: 280px;
  height: 280px;
  border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--color-accent) 16%, transparent), transparent 66%);
  pointer-events: none;
  animation: ttt-pulse 4s ease-in-out infinite;
}

.ttt-status-card {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 8px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--color-accent) 26%, transparent);
  background: color-mix(in srgb, var(--color-chat-surface-strong) 72%, transparent);
}

.ttt-status-line {
  color: var(--color-text-primary);
  letter-spacing: 0.04em;
  text-transform: none;
}

.ttt-meta-line {
  display: flex;
  justify-content: space-between;
  color: var(--color-text-secondary);
  font-size: 0.78rem;
  letter-spacing: 0.08em;
}

.ttt-board-wrap {
  display: grid;
  place-items: center;
}

.ttt-board {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(3, minmax(78px, 116px));
  gap: 10px;
  padding: 10px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--color-accent) 28%, transparent);
  background: color-mix(in srgb, var(--color-chat-surface) 72%, transparent);
}

.ttt-board.locked {
  opacity: 0.84;
}

.ttt-cell {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 1;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--color-accent) 32%, transparent);
  background:
    radial-gradient(circle at 20% 22%, color-mix(in srgb, var(--color-accent-muted) 58%, transparent), transparent 52%),
    color-mix(in srgb, var(--color-chat-surface) 62%, black);
  color: var(--color-text-primary);
  cursor: pointer;
  transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
}

.ttt-cell:hover:enabled {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--color-accent) 55%, transparent);
  box-shadow: 0 12px 26px color-mix(in srgb, var(--color-accent) 26%, transparent);
}

.ttt-cell:disabled {
  cursor: default;
}

.ttt-mark {
  font-size: clamp(2rem, 8vw, 3.6rem);
  font-weight: 800;
  line-height: 1;
  text-shadow: 0 0 14px color-mix(in srgb, var(--color-accent) 35%, transparent);
}

.ttt-cell.is-x .ttt-mark {
  color: var(--color-accent);
}

.ttt-cell.is-o .ttt-mark {
  color: var(--color-chat-link);
  text-shadow: 0 0 14px color-mix(in srgb, var(--color-chat-link) 45%, transparent);
}

.ttt-cell.win-cell {
  border-color: var(--color-chat-warning);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-chat-warning) 65%, transparent),
    0 0 30px color-mix(in srgb, var(--color-chat-warning) 35%, transparent);
}

.ttt-controls {
  display: flex;
  justify-content: center;
}

.ttt-action-btn {
  border: 1px solid color-mix(in srgb, var(--color-accent) 44%, transparent);
  border-radius: 999px;
  padding: 8px 14px;
  background: color-mix(in srgb, var(--color-chat-surface) 66%, black);
  color: var(--color-text-primary);
  letter-spacing: 0.08em;
  font-size: 0.76rem;
  cursor: pointer;
  transition: transform 140ms ease, border-color 140ms ease, background 140ms ease;
}

.ttt-action-btn:hover:enabled {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--color-accent) 70%, transparent);
  background: color-mix(in srgb, var(--color-accent-muted) 60%, transparent);
}

.ttt-action-btn:disabled {
  opacity: 0.7;
  cursor: default;
}

.ttt-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  border-radius: 16px;
  background: color-mix(in srgb, var(--color-chat-overlay) 88%, transparent);
  color: var(--color-text-primary);
  letter-spacing: 0.14em;
  font-size: 0.84rem;
  backdrop-filter: blur(2px);
}

@keyframes ttt-pulse {
  0%,
  100% {
    transform: scale(0.92);
    opacity: 0.7;
  }
  50% {
    transform: scale(1.05);
    opacity: 1;
  }
}

@media (max-width: 680px) {
  .ttt-shell {
    padding: 12px;
  }

  .ttt-board {
    grid-template-columns: repeat(3, minmax(72px, 1fr));
    width: min(100%, 320px);
  }

  .ttt-meta-line {
    flex-direction: column;
    gap: 4px;
  }
}
</style>
