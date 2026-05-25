<template>
  <div class="battleship-shell" role="application" aria-label="Battleship game">
    <div class="battleship-header">
      <div class="title-wrap">
        <span class="title">BATTLESHIP</span>
        <span class="subtitle">Fleet Command Link: {{ peerName }}</span>
      </div>
      <div class="phase-chip" :class="`phase-${phase}`">{{ phaseLabel }}</div>
      <button class="header-btn" type="button" @click="closeGame">EXIT</button>
    </div>

    <div class="game-shell-content">
      <aside class="sidebar">
        <div class="status-bar">
          <span>{{ statusMessage }}</span>
          <span v-if="phase === 'battle'" class="turn-indicator" :class="{ active: localTurn }">
            {{ localTurn ? 'YOUR TURN' : `${peerName} TURN` }}
          </span>
        </div>
        <div class="combat-feed">{{ combatFeed }}</div>

        <div class="score-strip">
          <div class="score-card">
            <div class="score-label">YOU</div>
            <div class="score-value">H {{ localHits }} · M {{ localMisses }}</div>
            <div class="score-meta">SUNK {{ localShipsSunk }} / {{ shipDefs.length }}</div>
          </div>
          <div class="score-card">
            <div class="score-label">{{ peerName.toUpperCase() }}</div>
            <div class="score-value">H {{ remoteHits }} · M {{ remoteMisses }}</div>
            <div class="score-meta">SUNK {{ localShipsLost }} / {{ shipDefs.length }}</div>
          </div>
        </div>

        <div class="controls" v-if="phase === 'placement'">
          <div class="controls-left">
            <button class="action-btn" type="button" @click="toggleOrientation">
              ORIENTATION: {{ orientationLabel }}
            </button>
            <button class="action-btn" type="button" @click="clearPlacement" :disabled="localReady">
              CLEAR
            </button>
          </div>
          <div class="fleet-status">
            <span v-if="nextShipToPlace">
              PLACE {{ nextShipToPlace.id.toUpperCase() }} ({{ nextShipToPlace.length }})
            </span>
            <span v-else>FLEET DEPLOYED</span>
          </div>
          <button class="action-btn primary" type="button" :disabled="!canReady" @click="confirmReady">
            READY
          </button>
        </div>

        <div class="winner-banner" v-if="phase === 'finished'">
          {{ winner === 'local' ? 'VICTORY' : 'DEFEAT' }}
        </div>
      </aside>

      <div class="board-area">
        <section class="board-panel target-board">
          <div class="panel-title">TARGET GRID</div>
          <div class="grid enemy" :class="{ interactive: canFire }">
            <button
              v-for="cell in boardCellCount"
              :key="`enemy-${cell - 1}`"
              type="button"
              class="cell"
              :class="enemyCellClass(cell - 1)"
              :disabled="!canClickEnemyCell(cell - 1)"
              @click="fireAtCell(cell - 1)"
            >
              <span class="cell-marker" v-if="localShots.get(cell - 1) === 'hit'">✹</span>
              <span class="cell-marker" v-else-if="localShots.get(cell - 1) === 'miss'">◌</span>
              <span class="cell-marker" v-else-if="pendingOutgoingShot === cell - 1">◎</span>
              <span class="impact-burst" v-if="flashOutgoingHit === cell - 1" aria-hidden="true"></span>
              <span class="splash-ring" v-if="flashOutgoingMiss === cell - 1" aria-hidden="true"></span>
            </button>
          </div>
        </section>

        <section class="board-panel your-board">
          <div class="panel-title">YOUR GRID</div>
          <div class="grid" :class="{ locked: phase !== 'placement' }">
            <button
              v-for="cell in boardCellCount"
              :key="`local-${cell - 1}`"
              type="button"
              class="cell"
              :class="localCellClass(cell - 1)"
              @click="handleLocalCellClick(cell - 1)"
            >
              <span class="cell-marker" v-if="incomingShots.get(cell - 1) === 'hit'">✹</span>
              <span class="cell-marker" v-else-if="incomingShots.get(cell - 1) === 'miss'">◌</span>
              <span class="impact-burst" v-if="flashIncomingHit === cell - 1" aria-hidden="true"></span>
              <span class="splash-ring" v-if="flashIncomingMiss === cell - 1" aria-hidden="true"></span>
            </button>
          </div>
        </section>
      </div>
    </div>

    <div v-if="showWaitingOverlay" class="invite-overlay">
      WAITING FOR OPPONENT TO ACCEPT
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

interface ShipDefinition {
  id: string;
  length: number;
}

interface ShipPlacement {
  id: string;
  length: number;
  cells: number[];
}

type ShotOutcome = 'hit' | 'miss';

type GamePhase = 'invite' | 'placement' | 'battle' | 'finished';

const props = defineProps<{
  user: string;
  peerName: string;
  dataChannel: RTCDataChannel | null;
  startSignal: number;
  waitingForAcceptance?: boolean;
}>();

const emit = defineEmits<{ close: [] }>();

const BOARD_SIZE = 10;
const boardCellCount = BOARD_SIZE * BOARD_SIZE;
const shipDefs: ShipDefinition[] = [
  { id: 'carrier', length: 5 },
  { id: 'battleship', length: 4 },
  { id: 'destroyer', length: 3 },
  { id: 'submarine', length: 3 },
  { id: 'patrol', length: 2 },
];

const orientation = ref<'horizontal' | 'vertical'>('horizontal');
const phase = ref<GamePhase>('invite');
const statusMessage = ref('Stand by for fleet command...');
const localTurn = ref(false);
const winner = ref<'local' | 'remote' | null>(null);
const combatFeed = ref('TACTICAL FEED: Awaiting engagement...');

const localShips = ref<ShipPlacement[]>([]);
const localReady = ref(false);
const remoteReady = ref(false);
const remoteSunkShipIds = ref<Set<string>>(new Set());

const localShots = ref<Map<number, ShotOutcome>>(new Map());
const incomingShots = ref<Map<number, ShotOutcome>>(new Map());
const pendingOutgoingShot = ref<number | null>(null);

const flashOutgoingHit = ref<number | null>(null);
const flashOutgoingMiss = ref<number | null>(null);
const flashIncomingHit = ref<number | null>(null);
const flashIncomingMiss = ref<number | null>(null);

const showWaitingOverlay = computed(() => Boolean(props.waitingForAcceptance));
const phaseLabel = computed(() => {
  if (phase.value === 'placement') {
    return 'DEPLOYMENT';
  }

  if (phase.value === 'battle') {
    return 'ENGAGED';
  }

  if (phase.value === 'finished') {
    return winner.value === 'local' ? 'VICTORY' : 'DEFEAT';
  }

  return 'LINKING';
});
const orientationLabel = computed(() => (orientation.value === 'horizontal' ? 'HORIZONTAL' : 'VERTICAL'));
const nextShipToPlace = computed(() => shipDefs.find((ship) => !localShips.value.some((placed) => placed.id === ship.id)) ?? null);
const canReady = computed(() => nextShipToPlace.value === null && !localReady.value && !showWaitingOverlay.value);
const canFire = computed(() => phase.value === 'battle' && localTurn.value && pendingOutgoingShot.value === null);

const localHits = computed(() => countShots(localShots.value, 'hit'));
const localMisses = computed(() => countShots(localShots.value, 'miss'));
const remoteHits = computed(() => countShots(incomingShots.value, 'hit'));
const remoteMisses = computed(() => countShots(incomingShots.value, 'miss'));
const localShipsSunk = computed(() => remoteSunkShipIds.value.size);
const localShipsLost = computed(() => countSunkShips(localShips.value, incomingShots.value));

let audioContext: AudioContext | null = null;
let currentChannel: RTCDataChannel | null = null;
let dataChannelListener: ((event: MessageEvent) => void) | null = null;
let readyBroadcastInterval: ReturnType<typeof setInterval> | null = null;

function countShots(map: Map<number, ShotOutcome>, outcome: ShotOutcome): number {
  let count = 0;
  map.forEach((value) => {
    if (value === outcome) {
      count += 1;
    }
  });
  return count;
}

function countSunkShips(ships: ShipPlacement[], shots: Map<number, ShotOutcome>): number {
  return ships.filter((ship) => ship.cells.every((cell) => shots.get(cell) === 'hit')).length;
}

function getAudioContext(): AudioContext | null {
  if (audioContext) {
    return audioContext;
  }

  const Constructor = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!Constructor) {
    return null;
  }

  audioContext = new Constructor();
  return audioContext;
}

function playTone(freq: number, duration = 0.06, type: OscillatorType = 'square', gainAmount = 0.16) {
  const context = getAudioContext();
  if (!context) {
    return;
  }

  if (context.state === 'suspended') {
    void context.resume();
  }

  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(context.destination);

  const now = context.currentTime;
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(gainAmount, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

function playHitSound() {
  playTone(560, 0.08, 'triangle', 0.2);
}

function playMissSound() {
  playTone(180, 0.06, 'sine', 0.12);
}

function playReadySound() {
  playTone(740, 0.05, 'square', 0.12);
  window.setTimeout(() => playTone(920, 0.05, 'square', 0.12), 45);
}

function playEndSound(didWin: boolean) {
  if (didWin) {
    playTone(760, 0.08, 'sawtooth', 0.2);
    window.setTimeout(() => playTone(980, 0.08, 'sawtooth', 0.2), 90);
    return;
  }

  playTone(140, 0.18, 'sine', 0.2);
}

function normalizeHandle(value: string): string {
  return value.trim().toLowerCase();
}

function isLocalFirstPlayer(): boolean {
  return normalizeHandle(props.user) <= normalizeHandle(props.peerName);
}

function rowFromIndex(index: number): number {
  return Math.floor(index / BOARD_SIZE);
}

function colFromIndex(index: number): number {
  return index % BOARD_SIZE;
}

function cellFromRowCol(row: number, col: number): number {
  return row * BOARD_SIZE + col;
}

function sendMessage(payload: Record<string, unknown>) {
  if (!props.dataChannel || props.dataChannel.readyState !== 'open') {
    return;
  }

  try {
    props.dataChannel.send(JSON.stringify(payload));
  } catch {
    // Ignore transient send errors.
  }
}

function stopReadyBroadcast() {
  if (readyBroadcastInterval) {
    clearInterval(readyBroadcastInterval);
    readyBroadcastInterval = null;
  }
}

function startReadyBroadcast() {
  stopReadyBroadcast();

  if (!localReady.value || phase.value !== 'placement') {
    return;
  }

  readyBroadcastInterval = setInterval(() => {
    if (!localReady.value || phase.value !== 'placement') {
      stopReadyBroadcast();
      return;
    }

    sendMessage({
      type: 'battleship-ready',
      ships: localShips.value.length,
    });
  }, 1000);
}

function activateGameIfReady() {
  if (showWaitingOverlay.value) {
    phase.value = 'invite';
    statusMessage.value = 'Waiting for opponent to accept BATTLESHIP';
    combatFeed.value = 'TACTICAL FEED: Link request in progress...';
    return;
  }

  if (phase.value === 'invite') {
    phase.value = 'placement';
    statusMessage.value = localReady.value
      ? 'Waiting for opponent fleet deployment...'
      : 'Deploy your fleet and click READY';
    combatFeed.value = localReady.value
      ? 'TACTICAL FEED: Your fleet is locked in.'
      : 'TACTICAL FEED: Position ships to begin.';
  }
}

function clearFlashes() {
  flashOutgoingHit.value = null;
  flashOutgoingMiss.value = null;
  flashIncomingHit.value = null;
  flashIncomingMiss.value = null;
}

function resetSession() {
  orientation.value = 'horizontal';
  phase.value = 'invite';
  statusMessage.value = 'Stand by for fleet command...';
  localTurn.value = false;
  winner.value = null;
  combatFeed.value = 'TACTICAL FEED: Awaiting engagement...';
  localShips.value = [];
  localReady.value = false;
  remoteReady.value = false;
  remoteSunkShipIds.value = new Set();
  localShots.value = new Map();
  incomingShots.value = new Map();
  pendingOutgoingShot.value = null;
  clearFlashes();
  stopReadyBroadcast();
}

function isValidCell(cell: number): boolean {
  return Number.isInteger(cell) && cell >= 0 && cell < boardCellCount;
}

function shipAtCell(index: number): ShipPlacement | null {
  return localShips.value.find((ship) => ship.cells.includes(index)) ?? null;
}

function canPlaceShip(startIndex: number, length: number): number[] | null {
  const row = rowFromIndex(startIndex);
  const col = colFromIndex(startIndex);

  const cells: number[] = [];
  for (let offset = 0; offset < length; offset++) {
    const targetRow = orientation.value === 'horizontal' ? row : row + offset;
    const targetCol = orientation.value === 'horizontal' ? col + offset : col;

    if (targetRow >= BOARD_SIZE || targetCol >= BOARD_SIZE) {
      return null;
    }

    const cell = cellFromRowCol(targetRow, targetCol);
    if (shipAtCell(cell)) {
      return null;
    }

    cells.push(cell);
  }

  return cells;
}

function handleLocalCellClick(index: number) {
  if (phase.value !== 'placement' || localReady.value || showWaitingOverlay.value) {
    return;
  }

  const existingShip = shipAtCell(index);
  if (existingShip) {
    localShips.value = localShips.value.filter((ship) => ship.id !== existingShip.id);
    return;
  }

  const nextShip = nextShipToPlace.value;
  if (!nextShip) {
    return;
  }

  const targetCells = canPlaceShip(index, nextShip.length);
  if (!targetCells) {
    playMissSound();
    return;
  }

  localShips.value = [...localShips.value, { id: nextShip.id, length: nextShip.length, cells: targetCells }];
  playTone(500 + nextShip.length * 40, 0.04, 'square', 0.1);
}

function toggleOrientation() {
  orientation.value = orientation.value === 'horizontal' ? 'vertical' : 'horizontal';
}

function clearPlacement() {
  if (localReady.value) {
    return;
  }
  localShips.value = [];
}

function beginBattleIfReady() {
  if (!localReady.value || !remoteReady.value || phase.value === 'finished') {
    return;
  }

  phase.value = 'battle';
  stopReadyBroadcast();
  localTurn.value = isLocalFirstPlayer();
  statusMessage.value = localTurn.value ? 'Your turn. Pick a target.' : `${props.peerName} is targeting...`;
  combatFeed.value = localTurn.value
    ? 'TACTICAL FEED: Fire control is yours.'
    : `TACTICAL FEED: ${props.peerName} has firing priority.`;
}

function confirmReady() {
  if (!canReady.value) {
    return;
  }

  localReady.value = true;
  playReadySound();
  statusMessage.value = remoteReady.value ? 'Fleet locked. Awaiting first turn...' : 'Waiting for opponent fleet deployment...';
  combatFeed.value = 'TACTICAL FEED: Fleet deployment confirmed.';

  sendMessage({
    type: 'battleship-ready',
    ships: localShips.value.length,
  });

  startReadyBroadcast();

  beginBattleIfReady();
}

function triggerFlash(type: 'outgoing-hit' | 'outgoing-miss' | 'incoming-hit' | 'incoming-miss', cell: number) {
  if (type === 'outgoing-hit') {
    flashOutgoingHit.value = cell;
  }
  if (type === 'outgoing-miss') {
    flashOutgoingMiss.value = cell;
  }
  if (type === 'incoming-hit') {
    flashIncomingHit.value = cell;
  }
  if (type === 'incoming-miss') {
    flashIncomingMiss.value = cell;
  }

  window.setTimeout(() => {
    if (type === 'outgoing-hit' && flashOutgoingHit.value === cell) {
      flashOutgoingHit.value = null;
    }
    if (type === 'outgoing-miss' && flashOutgoingMiss.value === cell) {
      flashOutgoingMiss.value = null;
    }
    if (type === 'incoming-hit' && flashIncomingHit.value === cell) {
      flashIncomingHit.value = null;
    }
    if (type === 'incoming-miss' && flashIncomingMiss.value === cell) {
      flashIncomingMiss.value = null;
    }
  }, 440);
}

function canClickEnemyCell(index: number): boolean {
  if (!canFire.value) {
    return false;
  }

  if (localShots.value.has(index)) {
    return false;
  }

  return true;
}

function fireAtCell(index: number) {
  if (!canClickEnemyCell(index)) {
    return;
  }

  pendingOutgoingShot.value = index;
  statusMessage.value = 'Transmitting coordinates...';
  combatFeed.value = `TACTICAL FEED: Firing at ${String.fromCharCode(65 + rowFromIndex(index))}${colFromIndex(index) + 1}`;
  sendMessage({
    type: 'battleship-shot',
    cell: index,
  });
}

function handleIncomingShot(cell: number) {
  if (!isValidCell(cell)) {
    return;
  }

  if (phase.value !== 'battle' && phase.value !== 'finished') {
    return;
  }

  if (incomingShots.value.has(cell)) {
    const previous = incomingShots.value.get(cell);
    const fleetDestroyed = localShips.value.every((placedShip) =>
      placedShip.cells.every((segment) => incomingShots.value.get(segment) === 'hit')
    );
    sendMessage({
      type: 'battleship-shot-result',
      cell,
      hit: previous === 'hit',
      sunkShipId: null,
      gameOver: fleetDestroyed,
    });
    return;
  }

  const ship = shipAtCell(cell);
  const hit = Boolean(ship);
  incomingShots.value.set(cell, hit ? 'hit' : 'miss');

  if (hit) {
    playHitSound();
    triggerFlash('incoming-hit', cell);
    combatFeed.value = `TACTICAL FEED: Incoming direct hit at ${String.fromCharCode(65 + rowFromIndex(cell))}${colFromIndex(cell) + 1}!`;
  } else {
    playMissSound();
    triggerFlash('incoming-miss', cell);
    combatFeed.value = `TACTICAL FEED: Enemy missed at ${String.fromCharCode(65 + rowFromIndex(cell))}${colFromIndex(cell) + 1}.`;
  }

  let sunkShipId: string | null = null;
  if (ship && ship.cells.every((segment) => incomingShots.value.get(segment) === 'hit')) {
    sunkShipId = ship.id;
  }

  const gameOver = localShips.value.every((placedShip) =>
    placedShip.cells.every((segment) => incomingShots.value.get(segment) === 'hit')
  );

  sendMessage({
    type: 'battleship-shot-result',
    cell,
    hit,
    sunkShipId,
    gameOver,
  });

  if (gameOver) {
    phase.value = 'finished';
    winner.value = 'remote';
    localTurn.value = false;
    statusMessage.value = `${props.peerName} won the battle.`;
    combatFeed.value = 'TACTICAL FEED: Our fleet has been destroyed.';
    playEndSound(false);
    return;
  }

  localTurn.value = true;
  statusMessage.value = 'Your turn. Fire when ready.';
}

function handleShotResult(data: Record<string, unknown>) {
  const cell = typeof data.cell === 'number' ? data.cell : pendingOutgoingShot.value;
  if (typeof cell !== 'number' || !isValidCell(cell)) {
    pendingOutgoingShot.value = null;
    return;
  }

  const hit = Boolean(data.hit);
  localShots.value.set(cell, hit ? 'hit' : 'miss');

  if (typeof data.sunkShipId === 'string' && data.sunkShipId) {
    const next = new Set(remoteSunkShipIds.value);
    next.add(data.sunkShipId);
    remoteSunkShipIds.value = next;
  }

  pendingOutgoingShot.value = null;

  if (hit) {
    playHitSound();
    triggerFlash('outgoing-hit', cell);
    combatFeed.value = `TACTICAL FEED: Direct hit at ${String.fromCharCode(65 + rowFromIndex(cell))}${colFromIndex(cell) + 1}.`;
  } else {
    playMissSound();
    triggerFlash('outgoing-miss', cell);
    combatFeed.value = `TACTICAL FEED: Splashdown at ${String.fromCharCode(65 + rowFromIndex(cell))}${colFromIndex(cell) + 1}.`;
  }

  const gameOver = Boolean(data.gameOver);
  if (gameOver) {
    phase.value = 'finished';
    winner.value = 'local';
    localTurn.value = false;
    statusMessage.value = 'Direct hit. Enemy fleet neutralized.';
    combatFeed.value = 'TACTICAL FEED: Mission complete. Enemy fleet sunk.';
    playEndSound(true);
    return;
  }

  localTurn.value = false;
  statusMessage.value = `${props.peerName} is targeting...`;
}

function localCellClass(index: number): Record<string, boolean> {
  const shot = incomingShots.value.get(index);
  return {
    ship: Boolean(shipAtCell(index)),
    hit: shot === 'hit',
    miss: shot === 'miss',
    'flash-hit': flashIncomingHit.value === index,
    'flash-miss': flashIncomingMiss.value === index,
  };
}

function enemyCellClass(index: number): Record<string, boolean> {
  const shot = localShots.value.get(index);
  return {
    hit: shot === 'hit',
    miss: shot === 'miss',
    pending: pendingOutgoingShot.value === index,
    'flash-hit': flashOutgoingHit.value === index,
    'flash-miss': flashOutgoingMiss.value === index,
  };
}

function handleIncomingMessage(event: MessageEvent) {
  if (!event.data || event.data instanceof ArrayBuffer || event.data instanceof Blob) {
    return;
  }

  let data: any;
  try {
    data = JSON.parse(event.data);
  } catch {
    return;
  }

  if (!data?.type?.startsWith('battleship-')) {
    return;
  }

  if (data.type === 'battleship-ready') {
    remoteReady.value = true;
    if (phase.value === 'invite') {
      phase.value = 'placement';
    }
    beginBattleIfReady();
    if (!localReady.value) {
      statusMessage.value = 'Opponent fleet locked. Finish your deployment.';
      combatFeed.value = 'TACTICAL FEED: Enemy fleet is locked in.';
    }
    return;
  }

  if (data.type === 'battleship-shot' && typeof data.cell === 'number') {
    handleIncomingShot(data.cell);
    return;
  }

  if (data.type === 'battleship-shot-result') {
    handleShotResult(data);
    return;
  }

  if (data.type === 'battleship-cancel') {
    statusMessage.value = `${props.peerName} canceled the game.`;
    combatFeed.value = 'TACTICAL FEED: Link terminated by remote command.';
    phase.value = 'invite';
    return;
  }
}

function attachDataChannelListener(channel: RTCDataChannel | null) {
  if (currentChannel && dataChannelListener) {
    currentChannel.removeEventListener('message', dataChannelListener);
  }

  currentChannel = channel;
  if (!currentChannel) {
    return;
  }

  dataChannelListener = handleIncomingMessage;
  currentChannel.addEventListener('message', dataChannelListener);
}

function detachDataChannelListener() {
  if (currentChannel && dataChannelListener) {
    currentChannel.removeEventListener('message', dataChannelListener);
  }
  currentChannel = null;
  dataChannelListener = null;
}

function closeGame() {
  emit('close');
}

watch(
  () => props.dataChannel,
  (channel) => {
    attachDataChannelListener(channel);
  },
  { immediate: true }
);

watch(
  () => props.startSignal,
  (signal) => {
    if (signal <= 0) {
      return;
    }

    // If the game is still in invite mode, preserve any pre-accept deployment state
    // so an initiator can place ships before the opponent accepts.
    if (phase.value === 'invite') {
      activateGameIfReady();
      return;
    }

    resetSession();
    activateGameIfReady();
  },
  { immediate: true }
);

watch(
  () => props.waitingForAcceptance,
  () => {
    activateGameIfReady();
  },
  { immediate: true }
);

onMounted(() => {
  if (props.startSignal > 0) {
    resetSession();
  }
  activateGameIfReady();
});

watch(
  [localReady, remoteReady, phase],
  () => {
    beginBattleIfReady();

    if (localReady.value && phase.value === 'placement') {
      startReadyBroadcast();
      return;
    }

    stopReadyBroadcast();
  }
);

onBeforeUnmount(() => {
  stopReadyBroadcast();
  detachDataChannelListener();
});
</script>

<style scoped>
.battleship-shell {
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(118, 224, 255, 0.78);
  border-radius: 12px;
  margin: 0;
  padding: 14px;
  background:
    radial-gradient(circle at 10% 8%, rgba(83, 231, 255, 0.28), transparent 34%),
    radial-gradient(circle at 90% 6%, rgba(120, 132, 255, 0.24), transparent 32%),
    linear-gradient(168deg, rgba(4, 15, 38, 0.98), rgba(1, 7, 22, 0.98));
  box-shadow: inset 0 0 56px rgba(84, 206, 255, 0.16), 0 0 34px rgba(37, 122, 202, 0.28);
  color: #ccefff;
  position: relative;
  overflow: hidden;
  font-family: Orbitron, Rajdhani, 'Segoe UI', sans-serif;
}

.battleship-shell::before {
  content: '';
  position: absolute;
  width: 140%;
  aspect-ratio: 1 / 1;
  left: -20%;
  top: -70%;
  background: conic-gradient(from 0deg, rgba(84, 208, 255, 0.2), rgba(84, 208, 255, 0.04), rgba(84, 208, 255, 0.2));
  transform-origin: center;
  animation: radar-rotate 10s linear infinite;
  opacity: 0.34;
  pointer-events: none;
}

.battleship-shell::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image: linear-gradient(rgba(160, 220, 255, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(160, 220, 255, 0.04) 1px, transparent 1px);
  background-size: 100% 18px, 18px 100%;
  opacity: 0.5;
  animation: water-drift 8s ease-in-out infinite;
  pointer-events: none;
}

.battleship-header,
.status-bar,
.combat-feed,
.score-strip,
.board-area,
.controls,
.winner-banner {
  position: relative;
  z-index: 1;
}

.battleship-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  gap: 10px;
}

.title-wrap {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.title {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: #e4f8ff;
  text-shadow: 0 0 18px rgba(120, 221, 255, 0.46);
}

.subtitle {
  font-size: 10px;
  letter-spacing: 0.11em;
  text-transform: uppercase;
  color: #a7d9ff;
}

.phase-chip {
  border: 1px solid rgba(118, 215, 255, 0.72);
  background: linear-gradient(180deg, rgba(15, 50, 90, 0.82), rgba(6, 22, 48, 0.82));
  color: #d9f6ff;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  box-shadow: inset 0 0 12px rgba(97, 205, 255, 0.22), 0 0 12px rgba(73, 170, 255, 0.16);
  margin-left: auto;
}

.phase-chip.phase-battle {
  border-color: rgba(146, 255, 191, 0.76);
  color: #dfffe9;
}

.phase-chip.phase-finished {
  border-color: rgba(255, 207, 124, 0.78);
  color: #ffeec6;
}

.header-btn {
  border: 1px solid rgba(114, 224, 255, 0.85);
  background: rgba(8, 20, 42, 0.74);
  color: #d5f6ff;
  border-radius: 8px;
  padding: 7px 11px;
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}

.header-btn:hover {
  background: rgba(95, 214, 255, 0.9);
  color: #05203a;
  transform: translateY(-1px);
  box-shadow: 0 10px 18px rgba(57, 167, 255, 0.32);
}

.status-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid rgba(95, 184, 244, 0.44);
  border-radius: 10px;
  background: linear-gradient(180deg, rgba(8, 28, 54, 0.78), rgba(6, 20, 41, 0.66));
  margin-bottom: 6px;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.combat-feed {
  margin-bottom: 10px;
  padding: 7px 10px;
  border-radius: 8px;
  border: 1px dashed rgba(111, 201, 255, 0.55);
  background: rgba(7, 23, 49, 0.55);
  color: #bfe8ff;
  font-size: 10px;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}

.turn-indicator {
  color: #95caf0;
}

.turn-indicator.active {
  color: #94ffb7;
  text-shadow: 0 0 10px rgba(148, 255, 183, 0.42);
  animation: pulse-turn 1.1s ease-in-out infinite;
}

.invite-overlay {
  position: absolute;
  inset: 48px 12px auto;
  padding: 9px 10px;
  border-radius: 10px;
  border: 1px solid rgba(140, 213, 255, 0.65);
  background: rgba(6, 17, 38, 0.95);
  text-align: center;
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  z-index: 2;
  box-shadow: 0 14px 24px rgba(5, 25, 48, 0.45);
}

.game-shell-content {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 12px;
}

.sidebar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.status-bar {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border: 1px solid rgba(118, 215, 255, 0.5);
  border-radius: 12px;
  background: rgba(10, 23, 47, 0.88);
}

.combat-feed {
  min-height: 76px;
  padding: 12px;
  border-radius: 12px;
  border: 1px dashed rgba(111, 201, 255, 0.45);
  background: rgba(7, 23, 49, 0.65);
}

.score-strip {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.score-card {
  border: 1px solid rgba(114, 191, 238, 0.56);
  border-radius: 10px;
  padding: 9px 11px;
  background: linear-gradient(180deg, rgba(10, 30, 58, 0.82), rgba(7, 22, 45, 0.72));
  box-shadow: inset 0 0 12px rgba(100, 198, 255, 0.12);
}

.score-label {
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #b5def2;
}

.score-value {
  margin-top: 2px;
  font-size: 12px;
  color: #d7f4ff;
  letter-spacing: 0.08em;
}

.score-meta {
  margin-top: 2px;
  font-size: 10px;
  color: #8ecdf0;
  letter-spacing: 0.08em;
}

.board-area {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-rows: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.board-panel {
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: 1px solid rgba(95, 173, 230, 0.45);
  border-radius: 12px;
  padding: 8px;
  background: rgba(7, 25, 51, 0.54);
  box-shadow: inset 0 0 16px rgba(88, 190, 255, 0.1);
}

.panel-title {
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #9ad8f6;
}

.grid {
  display: grid;
  grid-template-columns: repeat(10, minmax(0, 1fr));
  gap: 4px;
  min-height: 0;
  flex: 1;
  height: 100%;
}

.grid.locked .cell {
  cursor: default;
}

.cell {
  appearance: none;
  border: 1px solid rgba(115, 190, 236, 0.46);
  background: linear-gradient(180deg, rgba(11, 33, 65, 0.92), rgba(8, 24, 49, 0.92));
  color: #e0f8ff;
  border-radius: 5px;
  font-size: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1 / 1;
  min-width: 0;
  padding: 0;
  transition: transform 0.12s ease, background 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  position: relative;
  overflow: hidden;
}

.cell-marker {
  position: relative;
  z-index: 3;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-shadow: 0 0 9px rgba(194, 239, 255, 0.42);
  animation: marker-pop 0.22s ease-out;
}

.cell::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(165deg, rgba(183, 233, 255, 0.12), transparent 46%);
  pointer-events: none;
}

.cell::after {
  content: '';
  position: absolute;
  width: 140%;
  height: 140%;
  left: -20%;
  top: -120%;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0), rgba(188, 235, 255, 0.25), rgba(255, 255, 255, 0));
  transform: rotate(10deg);
  transition: transform 0.35s ease;
  pointer-events: none;
}

.enemy.interactive .cell:hover:not(:disabled) {
  transform: translateY(-1px) scale(1.03);
  border-color: rgba(170, 233, 255, 0.82);
  box-shadow: 0 0 0 1px rgba(150, 220, 255, 0.62), 0 0 14px rgba(90, 176, 255, 0.28);
}

.enemy.interactive .cell:hover:not(:disabled)::after {
  transform: translateY(175%) rotate(10deg);
}

.cell:disabled {
  cursor: default;
  opacity: 0.92;
}

.cell.ship {
  background: linear-gradient(180deg, rgba(61, 158, 210, 0.78), rgba(22, 84, 136, 0.95));
  box-shadow: inset 0 0 10px rgba(151, 224, 255, 0.25);
}

.cell.hit {
  background: linear-gradient(180deg, rgba(255, 140, 92, 0.94), rgba(191, 50, 34, 0.95));
  border-color: rgba(255, 154, 117, 0.92);
  box-shadow: 0 0 14px rgba(255, 112, 91, 0.66);
}

.cell.hit .cell-marker {
  color: #fff2d8;
  text-shadow: 0 0 10px rgba(255, 201, 144, 0.7), 0 0 18px rgba(255, 119, 86, 0.45);
}

.cell.miss {
  background: linear-gradient(180deg, rgba(93, 154, 206, 0.78), rgba(33, 96, 150, 0.95));
  border-color: rgba(135, 190, 230, 0.65);
}

.cell.miss .cell-marker {
  color: #d8f2ff;
  text-shadow: 0 0 10px rgba(149, 226, 255, 0.65);
}

.cell.pending {
  animation: ping-pending 0.9s ease-in-out infinite;
}

.cell.pending .cell-marker {
  color: #dcf8ff;
  animation: marker-pulse 0.65s ease-in-out infinite;
}

.cell.flash-hit {
  animation: flash-hit 0.45s ease-out, explosion-ring 0.45s ease-out;
}

.cell.flash-miss {
  animation: flash-miss 0.45s ease-out;
}

.impact-burst,
.splash-ring {
  position: absolute;
  inset: 12%;
  border-radius: 50%;
  pointer-events: none;
  z-index: 2;
}

.impact-burst {
  border: 2px solid rgba(255, 182, 140, 0.9);
  box-shadow: 0 0 16px rgba(255, 120, 88, 0.7), inset 0 0 8px rgba(255, 194, 145, 0.45);
  animation: impact-burst 0.44s ease-out;
}

.splash-ring {
  border: 2px solid rgba(171, 235, 255, 0.9);
  box-shadow: 0 0 14px rgba(125, 214, 255, 0.6), inset 0 0 8px rgba(188, 238, 255, 0.5);
  animation: splash-ring-expand 0.44s ease-out;
}

@keyframes ping-pending {
  0%, 100% { box-shadow: 0 0 0 rgba(155, 232, 255, 0); }
  50% { box-shadow: 0 0 12px rgba(155, 232, 255, 0.45); }
}

@keyframes flash-hit {
  0% { filter: brightness(1); }
  35% { filter: brightness(1.8); transform: scale(1.06); }
  100% { filter: brightness(1); transform: scale(1); }
}

@keyframes explosion-ring {
  0% { box-shadow: 0 0 0 0 rgba(255, 143, 95, 0.66); }
  100% { box-shadow: 0 0 0 16px rgba(255, 143, 95, 0); }
}

@keyframes flash-miss {
  0% { opacity: 1; }
  50% { opacity: 0.45; }
  100% { opacity: 1; }
}

@keyframes marker-pop {
  0% { transform: scale(0.35); opacity: 0.2; }
  100% { transform: scale(1); opacity: 1; }
}

@keyframes marker-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.16); opacity: 0.68; }
}

@keyframes impact-burst {
  0% { transform: scale(0.3); opacity: 0.95; }
  100% { transform: scale(1.45); opacity: 0; }
}

@keyframes splash-ring-expand {
  0% { transform: scale(0.25); opacity: 0.95; }
  100% { transform: scale(1.55); opacity: 0; }
}

.controls {
  margin-top: 12px;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 8px;
  align-items: center;
}

.controls-left {
  display: flex;
  gap: 6px;
}

.action-btn {
  border: 1px solid rgba(110, 210, 255, 0.75);
  background: linear-gradient(180deg, rgba(9, 30, 60, 0.85), rgba(6, 22, 44, 0.72));
  color: #d2f2ff;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}

.action-btn.primary {
  background: rgba(97, 212, 255, 0.2);
  box-shadow: 0 0 14px rgba(99, 197, 255, 0.26);
}

.action-btn:hover:not(:disabled) {
  background: rgba(94, 214, 255, 0.9);
  color: #04203c;
  transform: translateY(-1px);
  box-shadow: 0 10px 16px rgba(70, 172, 255, 0.3);
}

.action-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.fleet-status {
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #9ed6f5;
}

.winner-banner {
  margin-top: 10px;
  text-align: center;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(136, 233, 255, 0.7);
  background: linear-gradient(90deg, rgba(16, 44, 79, 0.88), rgba(10, 64, 90, 0.82), rgba(16, 44, 79, 0.88));
  font-size: 14px;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: #e6fbff;
  text-shadow: 0 0 14px rgba(126, 221, 255, 0.45);
  animation: winner-shimmer 3s linear infinite;
}

@keyframes radar-rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes water-drift {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(4px); }
}

@keyframes pulse-turn {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}

@keyframes winner-shimmer {
  0% { background-position: 0% 50%; }
  100% { background-position: 200% 50%; }
}

@media (max-width: 980px) {
  .board-wrap {
    grid-template-columns: 1fr;
  }

  .battleship-header {
    flex-wrap: wrap;
  }

  .phase-chip {
    margin-left: 0;
  }

  .controls {
    grid-template-columns: 1fr;
  }

  .controls-left {
    flex-wrap: wrap;
  }
}
</style>
