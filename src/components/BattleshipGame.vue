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
          <span v-if="phase === 'battle'" class="tactical-feed-inline">{{ combatFeed }}</span>
        </div>

        <div class="score-strip" v-if="phase === 'battle' || phase === 'finished'">
          <div class="score-card">
            <span class="score-label">YOU</span>
            <span class="score-stat">H {{ localHits }}</span>
            <span class="score-stat">M {{ localMisses }}</span>
            <span class="score-stat">SUNK {{ localShipsSunk }} / {{ shipDefs.length }}</span>
          </div>
          <div class="score-card">
            <span class="score-label">{{ peerName.toUpperCase() }}</span>
            <span class="score-stat">H {{ remoteHits }}</span>
            <span class="score-stat">M {{ remoteMisses }}</span>
            <span class="score-stat">SUNK {{ localShipsLost }} / {{ shipDefs.length }}</span>
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
            <button class="action-btn primary" type="button" :disabled="!canReady" @click="confirmReady">
              READY
            </button>
          </div>
          <div class="fleet-status">
            <span v-if="nextShipToPlace">
              PLACE {{ nextShipToPlace.id.toUpperCase() }} ({{ nextShipToPlace.length }})
            </span>
            <span v-else>FLEET DEPLOYED</span>
          </div>
        </div>

        <div class="winner-banner" v-if="phase === 'finished'">
          {{ winner === 'local' ? 'VICTORY' : 'DEFEAT' }}
        </div>
      </aside>

      <div class="board-area">
        <section
          class="board-panel target-board"
          :class="{ 'impact-active': enemyImpactActive, 'chromatic-shock': enemyChromaticShock }"
        >
          <div class="panel-title">TARGET GRID</div>
          <div class="board-stage">
            <div class="board-ocean" aria-hidden="true">
              <span class="ocean-wave wave-a"></span>
              <span class="ocean-wave wave-b"></span>
              <span class="ocean-wave wave-c"></span>
            </div>
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
                <span class="cell-marker sunk-marker" v-if="sunkEnemyCells.has(cell - 1)">✕</span>
                <span class="cell-marker" v-else-if="localShots.get(cell - 1) === 'hit'">✹</span>
                <span class="cell-marker" v-else-if="localShots.get(cell - 1) === 'miss'">◌</span>
                <span class="cell-marker" v-else-if="pendingOutgoingShot === cell - 1">◎</span>
                <span
                  class="shot-vector outgoing"
                  v-if="pendingOutgoingShot === cell - 1"
                  :style="shotVectorStyle(cell - 1, 'outgoing')"
                  aria-hidden="true"
                ></span>
                <span class="targeting-flare" v-if="pendingOutgoingShot === cell - 1" aria-hidden="true"></span>
                <span class="impact-burst" v-if="flashOutgoingHit === cell - 1" aria-hidden="true"></span>
                <span class="impact-smoke" v-if="flashOutgoingHit === cell - 1" aria-hidden="true"></span>
                <span class="splash-ring" v-if="flashOutgoingMiss === cell - 1" aria-hidden="true"></span>
              </button>
            </div>
          </div>
        </section>

        <section
          class="board-panel your-board"
          :class="{ 'impact-active': localImpactActive, 'chromatic-shock': localChromaticShock }"
        >
          <div class="panel-title">YOUR GRID</div>
          <div class="board-stage">
            <div class="board-ocean" aria-hidden="true">
              <span class="ocean-wave wave-a"></span>
              <span class="ocean-wave wave-b"></span>
              <span class="ocean-wave wave-c"></span>
            </div>
            <div class="local-grid-wrap" :class="{ locked: phase !== 'placement' }">
              <div class="ship-sprite-layer" aria-hidden="true">
                <div
                  v-for="ship in localShips"
                  :key="`ship-${ship.id}`"
                  class="ship-sprite"
                  :class="[
                    `ship-${ship.id}`,
                    shipDamageClass(ship),
                    shipOrientation(ship) === 'horizontal' ? 'horizontal' : 'vertical'
                  ]"
                  :style="shipSpriteStyle(ship)"
                >
                  <img class="ship-art" :src="shipSpriteUrls[ship.id]" :alt="`${ship.id} sprite`" draggable="false" />
                  <span class="ship-wake" aria-hidden="true"></span>
                  <span class="ship-code">{{ shipCode(ship.id) }}</span>
                </div>
              </div>
              <div class="grid local-grid">
              <button
                v-for="cell in boardCellCount"
                :key="`local-${cell - 1}`"
                type="button"
                class="cell"
                :class="localCellClass(cell - 1)"
                @click="handleLocalCellClick(cell - 1)"
                @mouseenter="setPlacementPreview(cell - 1)"
                @focus="setPlacementPreview(cell - 1)"
                @mouseleave="clearPlacementPreview"
                @blur="clearPlacementPreview"
              >
                <span class="cell-marker sunk-marker" v-if="isLocalSunkCell(cell - 1)">✕</span>
                <span class="cell-marker" v-else-if="incomingShots.get(cell - 1) === 'hit'">✹</span>
                <span class="cell-marker" v-else-if="incomingShots.get(cell - 1) === 'miss'">◌</span>
                <span
                  class="shot-vector incoming"
                  v-if="flashIncomingHit === cell - 1 || flashIncomingMiss === cell - 1"
                  :style="shotVectorStyle(cell - 1, 'incoming')"
                  aria-hidden="true"
                ></span>
                <span class="impact-burst" v-if="flashIncomingHit === cell - 1" aria-hidden="true"></span>
                <span class="impact-smoke" v-if="flashIncomingHit === cell - 1" aria-hidden="true"></span>
                <span class="splash-ring" v-if="flashIncomingMiss === cell - 1" aria-hidden="true"></span>
              </button>
              </div>
            </div>
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
import battleshipCarrier from '../assets/battleship/ships/carrier.svg';
import battleshipBattleship from '../assets/battleship/ships/battleship.svg';
import battleshipDestroyer from '../assets/battleship/ships/destroyer.svg';
import battleshipSubmarine from '../assets/battleship/ships/submarine.svg';
import battleshipPatrol from '../assets/battleship/ships/patrol.svg';

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
const sunkEnemyCells = ref<Set<number>>(new Set());

const localShots = ref<Map<number, ShotOutcome>>(new Map());
const incomingShots = ref<Map<number, ShotOutcome>>(new Map());
const pendingOutgoingShot = ref<number | null>(null);
const placementPreviewStart = ref<number | null>(null);

const flashOutgoingHit = ref<number | null>(null);
const flashOutgoingMiss = ref<number | null>(null);
const flashIncomingHit = ref<number | null>(null);
const flashIncomingMiss = ref<number | null>(null);
const enemyImpactActive = ref(false);
const localImpactActive = ref(false);
const enemyChromaticShock = ref(false);
const localChromaticShock = ref(false);

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
const placementPreviewCells = computed(() => {
  if (phase.value !== 'placement' || localReady.value || showWaitingOverlay.value) {
    return [] as number[];
  }

  const start = placementPreviewStart.value;
  const nextShip = nextShipToPlace.value;
  if (start === null || !nextShip) {
    return [] as number[];
  }

  return canPlaceShip(start, nextShip.length) ?? [];
});
const placementPreviewCellSet = computed(() => new Set(placementPreviewCells.value));

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
let pendingShotRetryInterval: ReturnType<typeof setInterval> | null = null;
let battleBeginRetryInterval: ReturnType<typeof setInterval> | null = null;
let enemyImpactTimer: number | null = null;
let localImpactTimer: number | null = null;
let enemyShockTimer: number | null = null;
let localShockTimer: number | null = null;

const shipSpriteUrls: Record<string, string> = {
  carrier: battleshipCarrier,
  battleship: battleshipBattleship,
  destroyer: battleshipDestroyer,
  submarine: battleshipSubmarine,
  patrol: battleshipPatrol,
};

function shipCode(id: string): string {
  const codeMap: Record<string, string> = {
    carrier: 'CV',
    battleship: 'BB',
    destroyer: 'DD',
    submarine: 'SS',
    patrol: 'PT',
  };

  return codeMap[id] ?? id.slice(0, 2).toUpperCase();
}

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

function findShipLengthById(shipId: string): number {
  return shipDefs.find((ship) => ship.id === shipId)?.length ?? 0;
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

function resolveFirstPlayer(): string {
  return isLocalFirstPlayer() ? props.user : props.peerName;
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
  if (!currentChannel || currentChannel.readyState !== 'open') {
    return;
  }

  try {
    currentChannel.send(JSON.stringify(payload));
  } catch {
    // Ignore transient send errors.
  }
}

function sendReadyState() {
  sendMessage({
    type: 'battleship-ready',
    ready: localReady.value,
    ships: localShips.value.length,
  });
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

  sendReadyState();

  readyBroadcastInterval = setInterval(() => {
    if (!localReady.value || phase.value !== 'placement') {
      stopReadyBroadcast();
      return;
    }

    sendReadyState();
  }, 1000);
}

function stopPendingShotRetry() {
  if (pendingShotRetryInterval) {
    clearInterval(pendingShotRetryInterval);
    pendingShotRetryInterval = null;
  }
}

function stopBattleBeginRetry() {
  if (battleBeginRetryInterval) {
    clearInterval(battleBeginRetryInterval);
    battleBeginRetryInterval = null;
  }
}

function startBattleBeginRetry(firstPlayer: string) {
  stopBattleBeginRetry();

  let attempts = 0;
  sendMessage({
    type: 'battleship-begin',
    firstPlayer,
  });

  battleBeginRetryInterval = setInterval(() => {
    if (phase.value === 'finished' || attempts >= 6) {
      stopBattleBeginRetry();
      return;
    }

    attempts += 1;
    sendMessage({
      type: 'battleship-begin',
      firstPlayer,
    });
  }, 450);
}

function startPendingShotRetry() {
  stopPendingShotRetry();

  pendingShotRetryInterval = setInterval(() => {
    const cell = pendingOutgoingShot.value;
    if (cell === null || phase.value !== 'battle' || !localTurn.value) {
      stopPendingShotRetry();
      return;
    }

    sendMessage({
      type: 'battleship-shot',
      cell,
    });
  }, 850);
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

function enterBattle(firstPlayer: string) {
  phase.value = 'battle';
  stopReadyBroadcast();
  const localStarts = normalizeHandle(firstPlayer) === normalizeHandle(props.user);
  localTurn.value = localStarts;
  statusMessage.value = localStarts ? 'Your turn. Pick a target.' : `${props.peerName} is targeting...`;
  combatFeed.value = localStarts
    ? 'TACTICAL FEED: Fire control is yours.'
    : `TACTICAL FEED: ${props.peerName} has firing priority.`;
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
  sunkEnemyCells.value = new Set();
  localShots.value = new Map();
  incomingShots.value = new Map();
  pendingOutgoingShot.value = null;
  placementPreviewStart.value = null;
  clearFlashes();
  stopReadyBroadcast();
  stopPendingShotRetry();
  stopBattleBeginRetry();
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
    placementPreviewStart.value = null;
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
  placementPreviewStart.value = null;
  playTone(500 + nextShip.length * 40, 0.04, 'square', 0.1);
}

function toggleOrientation() {
  orientation.value = orientation.value === 'horizontal' ? 'vertical' : 'horizontal';
}

function shouldIgnoreKeybindingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (event.key.toLowerCase() !== 'r' || event.defaultPrevented || shouldIgnoreKeybindingTarget(event.target)) {
    return;
  }

  if (phase.value !== 'placement' || localReady.value || showWaitingOverlay.value) {
    return;
  }

  event.preventDefault();
  toggleOrientation();
}

function clearPlacement() {
  if (localReady.value) {
    return;
  }
  localShips.value = [];
  placementPreviewStart.value = null;
}

function setPlacementPreview(index: number) {
  if (phase.value !== 'placement' || localReady.value || showWaitingOverlay.value) {
    placementPreviewStart.value = null;
    return;
  }

  placementPreviewStart.value = index;
}

function clearPlacementPreview() {
  placementPreviewStart.value = null;
}

function beginBattleIfReady() {
  if (!localReady.value || !remoteReady.value || phase.value === 'finished' || phase.value === 'battle') {
    return;
  }

  const firstPlayer = resolveFirstPlayer();
  enterBattle(firstPlayer);
  startBattleBeginRetry(firstPlayer);
}

function confirmReady() {
  if (!canReady.value) {
    return;
  }

  localReady.value = true;
  playReadySound();
  statusMessage.value = remoteReady.value ? 'Fleet locked. Awaiting first turn...' : 'Waiting for opponent fleet deployment...';
  combatFeed.value = 'TACTICAL FEED: Fleet deployment confirmed.';

  sendReadyState();

  startReadyBroadcast();

  beginBattleIfReady();
}

function triggerFlash(type: 'outgoing-hit' | 'outgoing-miss' | 'incoming-hit' | 'incoming-miss', cell: number) {
  if (type === 'outgoing-hit') {
    flashOutgoingHit.value = cell;
    enemyImpactActive.value = true;
    enemyChromaticShock.value = true;
    if (enemyImpactTimer) {
      clearTimeout(enemyImpactTimer);
    }
    if (enemyShockTimer) {
      clearTimeout(enemyShockTimer);
    }
    enemyImpactTimer = window.setTimeout(() => {
      enemyImpactActive.value = false;
    }, 280);
    enemyShockTimer = window.setTimeout(() => {
      enemyChromaticShock.value = false;
    }, 420);
  }
  if (type === 'outgoing-miss') {
    flashOutgoingMiss.value = cell;
    enemyImpactActive.value = true;
    if (enemyImpactTimer) {
      clearTimeout(enemyImpactTimer);
    }
    enemyImpactTimer = window.setTimeout(() => {
      enemyImpactActive.value = false;
    }, 220);
  }
  if (type === 'incoming-hit') {
    flashIncomingHit.value = cell;
    localImpactActive.value = true;
    localChromaticShock.value = true;
    if (localImpactTimer) {
      clearTimeout(localImpactTimer);
    }
    if (localShockTimer) {
      clearTimeout(localShockTimer);
    }
    localImpactTimer = window.setTimeout(() => {
      localImpactActive.value = false;
    }, 300);
    localShockTimer = window.setTimeout(() => {
      localChromaticShock.value = false;
    }, 460);
  }
  if (type === 'incoming-miss') {
    flashIncomingMiss.value = cell;
    localImpactActive.value = true;
    if (localImpactTimer) {
      clearTimeout(localImpactTimer);
    }
    localImpactTimer = window.setTimeout(() => {
      localImpactActive.value = false;
    }, 220);
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

function shotVectorStyle(cell: number, direction: 'outgoing' | 'incoming'): Record<string, string> {
  const col = colFromIndex(cell);
  const colOffset = ((col / (BOARD_SIZE - 1)) - 0.5) * 22;
  const tilt = direction === 'outgoing' ? 5 + (colOffset * 0.08) : -5 + (colOffset * 0.08);
  return {
    '--vector-offset': `${colOffset}%`,
    '--vector-tilt': `${tilt}deg`,
  } as Record<string, string>;
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
  startPendingShotRetry();
}

function handleIncomingShot(cell: number) {
  if (!isValidCell(cell)) {
    return;
  }

  if (phase.value === 'placement' && localReady.value && remoteReady.value) {
    enterBattle(resolveFirstPlayer());
  }

  if (phase.value !== 'battle' && phase.value !== 'finished') {
    return;
  }

  if (incomingShots.value.has(cell)) {
    const previous = incomingShots.value.get(cell);
    const existingShip = shipAtCell(cell);
    const existingSunkShipId =
      previous === 'hit' && existingShip && existingShip.cells.every((segment) => incomingShots.value.get(segment) === 'hit')
        ? existingShip.id
        : null;
    const fleetDestroyed = localShips.value.length > 0 && localShips.value.every((placedShip) =>
      placedShip.cells.every((segment) => incomingShots.value.get(segment) === 'hit')
    );
    sendMessage({
      type: 'battleship-shot-result',
      cell,
      hit: previous === 'hit',
      sunkShipId: existingSunkShipId,
      sunkShipCells: existingSunkShipId ? existingShip?.cells ?? [] : [],
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
  let sunkShipCells: number[] = [];
  if (ship && ship.cells.every((segment) => incomingShots.value.get(segment) === 'hit')) {
    sunkShipId = ship.id;
    sunkShipCells = [...ship.cells];
    combatFeed.value = `TACTICAL FEED: Incoming hit at ${String.fromCharCode(65 + rowFromIndex(cell))}${colFromIndex(cell) + 1}. ${ship.id.toUpperCase()} sunk.`;
  }

  const gameOver = localShips.value.length > 0 && localShips.value.every((placedShip) =>
    placedShip.cells.every((segment) => incomingShots.value.get(segment) === 'hit')
  );

  sendMessage({
    type: 'battleship-shot-result',
    cell,
    hit,
    sunkShipId,
    sunkShipCells,
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
  if (phase.value === 'placement' && localReady.value && remoteReady.value) {
    enterBattle(resolveFirstPlayer());
  }

  const cell = typeof data.cell === 'number' ? data.cell : pendingOutgoingShot.value;
  if (typeof cell !== 'number' || !isValidCell(cell)) {
    pendingOutgoingShot.value = null;
    return;
  }

  const hit = Boolean(data.hit);
  localShots.value.set(cell, hit ? 'hit' : 'miss');

  const sunkShipId = typeof data.sunkShipId === 'string' && data.sunkShipId ? data.sunkShipId : null;

  if (typeof data.sunkShipId === 'string' && data.sunkShipId) {
    const next = new Set(remoteSunkShipIds.value);
    next.add(data.sunkShipId);
    remoteSunkShipIds.value = next;
  }

  if (Array.isArray(data.sunkShipCells)) {
    const next = new Set(sunkEnemyCells.value);
    data.sunkShipCells.forEach((value) => {
      if (typeof value === 'number' && isValidCell(value)) {
        next.add(value);
      }
    });
    sunkEnemyCells.value = next;
  } else if (sunkShipId) {
    const next = new Set(sunkEnemyCells.value);
    next.add(cell);
    sunkEnemyCells.value = next;
  }

  pendingOutgoingShot.value = null;
  stopPendingShotRetry();

  if (hit) {
    playHitSound();
    triggerFlash('outgoing-hit', cell);
    if (sunkShipId) {
      const sunkLength = findShipLengthById(sunkShipId);
      combatFeed.value = `TACTICAL FEED: Direct hit at ${String.fromCharCode(65 + rowFromIndex(cell))}${colFromIndex(cell) + 1}. ${sunkShipId.toUpperCase()} sunk${sunkLength ? ` (${sunkLength})` : ''}.`;
    } else {
      combatFeed.value = `TACTICAL FEED: Direct hit at ${String.fromCharCode(65 + rowFromIndex(cell))}${colFromIndex(cell) + 1}.`;
    }
  } else {
    playMissSound();
    triggerFlash('outgoing-miss', cell);
    combatFeed.value = `TACTICAL FEED: Splashdown at ${String.fromCharCode(65 + rowFromIndex(cell))}${colFromIndex(cell) + 1}.`;
  }

  const remoteFleetConfirmedSunk = remoteSunkShipIds.value.size >= shipDefs.length;
  const gameOver = Boolean(data.gameOver) && remoteFleetConfirmedSunk;
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

function shipOrientation(ship: ShipPlacement): 'horizontal' | 'vertical' {
  if (ship.cells.length <= 1) {
    return 'horizontal';
  }

  const first = ship.cells[0];
  const second = ship.cells[1];
  return rowFromIndex(first) === rowFromIndex(second) ? 'horizontal' : 'vertical';
}

function shipHitRatio(ship: ShipPlacement): number {
  if (ship.cells.length === 0) {
    return 0;
  }

  let hitCount = 0;
  ship.cells.forEach((cell) => {
    if (incomingShots.value.get(cell) === 'hit') {
      hitCount += 1;
    }
  });

  return hitCount / ship.cells.length;
}

function shipDamageClass(ship: ShipPlacement): string {
  const ratio = shipHitRatio(ship);

  if (ratio >= 1) {
    return 'damage-sunk';
  }

  if (ratio >= 0.66) {
    return 'damage-critical';
  }

  if (ratio > 0) {
    return 'damage-hit';
  }

  return 'damage-intact';
}

function shipSpriteStyle(ship: ShipPlacement): Record<string, string> {
  const orientation = shipOrientation(ship);
  const startCell = ship.cells[0];
  const row = rowFromIndex(startCell) + 1;
  const col = colFromIndex(startCell) + 1;
  const sharedStyle: Record<string, string> = {
    '--ship-length': `${ship.length}`,
  };

  if (orientation === 'horizontal') {
    return {
      gridRow: `${row} / span 1`,
      gridColumn: `${col} / span ${ship.length}`,
      ...sharedStyle,
    };
  }

  return {
    gridRow: `${row} / span ${ship.length}`,
    gridColumn: `${col} / span 1`,
    ...sharedStyle,
  };
}

function localCellClass(index: number): Record<string, boolean> {
  const shot = incomingShots.value.get(index);
  return {
    ship: Boolean(shipAtCell(index)),
    sunk: isLocalSunkCell(index),
    'placement-preview': placementPreviewCellSet.value.has(index),
    hit: shot === 'hit',
    miss: shot === 'miss',
    'flash-hit': flashIncomingHit.value === index,
    'flash-miss': flashIncomingMiss.value === index,
  };
}

function isLocalSunkCell(index: number): boolean {
  const ship = shipAtCell(index);
  if (!ship) {
    return false;
  }

  return ship.cells.every((segment) => incomingShots.value.get(segment) === 'hit');
}

function enemyCellClass(index: number): Record<string, boolean> {
  const shot = localShots.value.get(index);
  return {
    sunk: sunkEnemyCells.value.has(index),
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
    remoteReady.value = data.ready !== false;
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

  if (data.type === 'battleship-begin') {
    if (typeof data.firstPlayer === 'string' && data.firstPlayer.trim()) {
      stopBattleBeginRetry();
      enterBattle(data.firstPlayer);
      remoteReady.value = true;
    }
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
  window.addEventListener('keydown', handleWindowKeydown);
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
  window.removeEventListener('keydown', handleWindowKeydown);
  stopReadyBroadcast();
  stopPendingShotRetry();
  stopBattleBeginRetry();
  if (enemyImpactTimer) {
    clearTimeout(enemyImpactTimer);
  }
  if (localImpactTimer) {
    clearTimeout(localImpactTimer);
  }
  if (enemyShockTimer) {
    clearTimeout(enemyShockTimer);
  }
  if (localShockTimer) {
    clearTimeout(localShockTimer);
  }
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
  margin-bottom: 6px;
  gap: 10px;
}

.title-wrap {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.title {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: #e4f8ff;
  text-shadow: 0 0 18px rgba(120, 221, 255, 0.46);
}

.subtitle {
  font-size: 9px;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: #a7d9ff;
}

.phase-chip {
  border: 1px solid rgba(118, 215, 255, 0.72);
  background: linear-gradient(180deg, rgba(15, 50, 90, 0.82), rgba(6, 22, 48, 0.82));
  color: #d9f6ff;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 9px;
  letter-spacing: 0.12em;
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
  padding: 5px 9px;
  font-size: 9px;
  letter-spacing: 0.1em;
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

.turn-indicator {
  color: #95caf0;
}

.turn-indicator.active {
  color: #94ffb7;
  text-shadow: 0 0 10px rgba(148, 255, 183, 0.42);
  animation: pulse-turn 1.1s ease-in-out infinite;
}

.tactical-feed-inline {
  color: #bfe8ff;
  font-size: 9px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.92;
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
  gap: 8px;
  min-height: 0;
}

.status-bar {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border: 1px solid rgba(118, 215, 255, 0.5);
  border-radius: 12px;
  background: rgba(10, 23, 47, 0.88);
}

.score-strip {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.score-card {
  border: 1px solid rgba(114, 191, 238, 0.56);
  border-radius: 10px;
  padding: 6px 8px;
  background: linear-gradient(180deg, rgba(10, 30, 58, 0.82), rgba(7, 22, 45, 0.72));
  box-shadow: inset 0 0 12px rgba(100, 198, 255, 0.12);
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
}

.score-label {
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #b5def2;
  font-weight: 700;
  flex: 0 0 auto;
}

.score-stat {
  font-size: 10px;
  color: #8ecdf0;
  letter-spacing: 0.06em;
  flex: 0 0 auto;
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
  border: 1px solid rgba(116, 201, 255, 0.52);
  border-radius: 12px;
  padding: 8px;
  background:
    linear-gradient(160deg, rgba(14, 38, 73, 0.82), rgba(8, 24, 49, 0.66)),
    radial-gradient(circle at 14% 18%, rgba(112, 203, 255, 0.2), transparent 40%);
  box-shadow:
    inset 0 0 24px rgba(88, 190, 255, 0.16),
    inset 0 -28px 40px rgba(7, 15, 27, 0.32),
    0 8px 24px rgba(6, 20, 39, 0.28);
  position: relative;
  overflow: hidden;
}

.board-panel.impact-active {
  animation: board-impact-shake 0.26s linear;
}

.board-panel.chromatic-shock::after {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: 13px;
  pointer-events: none;
  background:
    linear-gradient(90deg, rgba(255, 82, 82, 0.16), rgba(255, 82, 82, 0) 48%),
    linear-gradient(270deg, rgba(102, 220, 255, 0.2), rgba(102, 220, 255, 0) 46%);
  mix-blend-mode: screen;
  animation: chromatic-shock-pulse 0.4s ease-out;
}

.board-panel::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: linear-gradient(rgba(182, 231, 255, 0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(182, 231, 255, 0.06) 1px, transparent 1px);
  background-size: 100% 18px, 18px 100%;
  opacity: 0.52;
  pointer-events: none;
}

.board-stage {
  position: relative;
  flex: 1;
  min-height: 0;
}

.board-ocean {
  position: absolute;
  inset: 0;
  border-radius: 10px;
  overflow: hidden;
  background:
    radial-gradient(circle at 18% 16%, rgba(123, 220, 255, 0.2), transparent 42%),
    radial-gradient(circle at 82% 22%, rgba(134, 160, 255, 0.18), transparent 44%),
    linear-gradient(180deg, rgba(7, 33, 67, 0.86), rgba(7, 21, 44, 0.9));
  z-index: 0;
}

.ocean-wave {
  position: absolute;
  left: -10%;
  width: 120%;
  border-radius: 42%;
  filter: blur(2px);
}

.ocean-wave.wave-a {
  top: 10%;
  height: 34%;
  background: linear-gradient(180deg, rgba(129, 226, 255, 0.24), rgba(129, 226, 255, 0));
  animation: ocean-swell-a 9s ease-in-out infinite;
}

.ocean-wave.wave-b {
  top: 44%;
  height: 28%;
  background: linear-gradient(180deg, rgba(108, 184, 255, 0.18), rgba(108, 184, 255, 0));
  animation: ocean-swell-b 12s ease-in-out infinite;
}

.ocean-wave.wave-c {
  top: 72%;
  height: 22%;
  background: linear-gradient(180deg, rgba(84, 173, 240, 0.14), rgba(84, 173, 240, 0));
  animation: ocean-swell-c 15s ease-in-out infinite;
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
  grid-template-rows: repeat(10, minmax(0, 1fr));
  gap: 4px;
  min-height: 0;
  flex: 1;
  height: 100%;
  position: relative;
  z-index: 2;
}

.local-grid-wrap {
  position: relative;
  min-height: 0;
  height: 100%;
  flex: 1;
}

.ship-sprite-layer {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(10, minmax(0, 1fr));
  grid-template-rows: repeat(10, minmax(0, 1fr));
  gap: 4px;
  pointer-events: none;
  z-index: 1;
}

.ship-sprite {
  border-radius: 7px;
  border: 1px solid rgba(188, 238, 255, 0.72);
  background-color: rgba(40, 97, 138, 0.95);
  box-shadow:
    inset 0 0 0 1px rgba(230, 249, 255, 0.32),
    inset 0 -6px 10px rgba(3, 26, 49, 0.28),
    0 4px 10px rgba(5, 26, 47, 0.26);
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  transform-style: preserve-3d;
  animation: ship-idle-drift 4.4s ease-in-out infinite;
}

.ship-art {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.96;
  z-index: 0;
}

.ship-wake {
  position: absolute;
  pointer-events: none;
  z-index: 0;
  opacity: 0.66;
}

.ship-sprite.horizontal .ship-wake {
  left: calc(-8px - (var(--ship-length, 2) * 1px));
  right: calc(-8px - (var(--ship-length, 2) * 1px));
  top: 52%;
  height: 34%;
  transform: translateY(-50%);
  background:
    radial-gradient(ellipse at 20% 50%, rgba(182, 238, 255, 0.42), rgba(182, 238, 255, 0) 54%),
    radial-gradient(ellipse at 80% 50%, rgba(162, 226, 255, 0.35), rgba(162, 226, 255, 0) 52%);
  animation: wake-flow-horizontal 3.4s ease-in-out infinite;
}

.ship-sprite.vertical .ship-wake {
  top: calc(-10px - (var(--ship-length, 2) * 1px));
  bottom: calc(-10px - (var(--ship-length, 2) * 1px));
  left: 50%;
  width: 34%;
  transform: translateX(-50%);
  background:
    radial-gradient(ellipse at 50% 22%, rgba(178, 236, 255, 0.42), rgba(178, 236, 255, 0) 52%),
    radial-gradient(ellipse at 50% 78%, rgba(154, 220, 255, 0.34), rgba(154, 220, 255, 0) 52%);
  animation: wake-flow-vertical 3.8s ease-in-out infinite;
}

.ship-sprite::before {
  content: '';
  position: absolute;
  inset: 14% 4%;
  border-radius: 999px;
  border: 1px solid rgba(222, 246, 255, 0.6);
  background: linear-gradient(180deg, rgba(229, 251, 255, 0.52), rgba(133, 197, 227, 0.08));
}

.ship-sprite::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image: linear-gradient(90deg, rgba(230, 249, 255, 0.28) 1px, transparent 1px);
  background-size: 16px 100%;
  opacity: 0.22;
}

.ship-sprite .ship-code {
  pointer-events: none;
}

.ship-sprite.damage-hit {
  filter: saturate(1.05) brightness(0.96);
}

.ship-sprite.damage-critical {
  filter: saturate(0.9) brightness(0.82);
  animation-duration: 2.8s;
}

.ship-sprite.damage-sunk {
  filter: grayscale(0.75) saturate(0.6) brightness(0.62);
  transform: translateY(1px) rotateX(10deg);
}

.ship-sprite.damage-hit::before,
.ship-sprite.damage-critical::before,
.ship-sprite.damage-sunk::before {
  border-color: rgba(255, 199, 168, 0.52);
}

.ship-sprite.damage-hit::after,
.ship-sprite.damage-critical::after,
.ship-sprite.damage-sunk::after {
  background-image:
    radial-gradient(circle at 32% 48%, rgba(255, 198, 145, 0.58), rgba(255, 198, 145, 0) 38%),
    radial-gradient(circle at 68% 58%, rgba(255, 154, 124, 0.5), rgba(255, 154, 124, 0) 36%),
    linear-gradient(90deg, rgba(230, 249, 255, 0.22) 1px, transparent 1px);
}

.ship-sprite.damage-critical::after,
.ship-sprite.damage-sunk::after {
  background-image:
    radial-gradient(circle at 26% 52%, rgba(255, 182, 142, 0.62), rgba(255, 182, 142, 0) 42%),
    radial-gradient(circle at 62% 40%, rgba(255, 124, 104, 0.56), rgba(255, 124, 104, 0) 36%),
    radial-gradient(circle at 82% 64%, rgba(255, 104, 88, 0.48), rgba(255, 104, 88, 0) 34%),
    linear-gradient(90deg, rgba(230, 249, 255, 0.16) 1px, transparent 1px);
}

.ship-sprite.damage-sunk::after {
  background-image:
    radial-gradient(circle at 18% 58%, rgba(37, 42, 56, 0.66), rgba(37, 42, 56, 0) 42%),
    radial-gradient(circle at 52% 42%, rgba(45, 53, 70, 0.64), rgba(45, 53, 70, 0) 40%),
    radial-gradient(circle at 78% 68%, rgba(32, 40, 54, 0.58), rgba(32, 40, 54, 0) 34%),
    linear-gradient(90deg, rgba(180, 210, 226, 0.12) 1px, transparent 1px);
}

.ship-sprite.vertical::before {
  inset: 4% 14%;
}

.ship-code {
  position: relative;
  z-index: 2;
  font-size: 9px;
  letter-spacing: 0.14em;
  font-weight: 700;
  color: rgba(223, 229, 238, 0.7);
  text-shadow: 0 0 6px rgba(14, 18, 26, 0.45);
  background: rgba(40, 48, 60, 0.42);
  border: 1px solid rgba(190, 197, 210, 0.28);
  border-radius: 999px;
  padding: 2px 6px;
  backdrop-filter: blur(1px);
  opacity: 0.38;
}

.ship-carrier {
  box-shadow:
    inset 0 0 0 1px rgba(230, 249, 255, 0.38),
    inset 0 -8px 14px rgba(3, 26, 49, 0.35),
    0 5px 12px rgba(8, 30, 50, 0.3);
}

.ship-battleship {
  box-shadow:
    inset 0 0 0 1px rgba(231, 242, 255, 0.35),
    inset 0 -8px 14px rgba(14, 26, 56, 0.42),
    0 5px 12px rgba(8, 30, 50, 0.3);
}

.ship-destroyer {
  box-shadow:
    inset 0 0 0 1px rgba(210, 248, 240, 0.35),
    inset 0 -8px 14px rgba(10, 47, 49, 0.34),
    0 5px 12px rgba(8, 30, 50, 0.3);
}

.ship-submarine {
  box-shadow:
    inset 0 0 0 1px rgba(221, 232, 255, 0.35),
    inset 0 -8px 14px rgba(16, 27, 57, 0.42),
    0 5px 12px rgba(8, 30, 50, 0.3);
}

.ship-patrol {
  box-shadow:
    inset 0 0 0 1px rgba(224, 246, 255, 0.35),
    inset 0 -8px 14px rgba(9, 40, 55, 0.38),
    0 5px 12px rgba(8, 30, 50, 0.3);
}

.local-grid {
  position: relative;
  z-index: 2;
}

.local-grid .cell {
  background: linear-gradient(180deg, rgba(11, 33, 65, 0.26), rgba(8, 24, 49, 0.22));
  border-color: rgba(123, 198, 236, 0.5);
  backdrop-filter: blur(1px);
}

.local-grid .cell.placement-preview:not(.ship):not(.hit):not(.miss):not(.sunk) {
  background: linear-gradient(180deg, rgba(126, 236, 255, 0.5), rgba(54, 175, 226, 0.48));
  border-color: rgba(158, 233, 255, 0.95);
  box-shadow: inset 0 0 0 1px rgba(191, 244, 255, 0.7), 0 0 12px rgba(82, 192, 255, 0.36);
}

.local-grid-wrap.locked .local-grid .cell {
  background: linear-gradient(180deg, rgba(10, 31, 58, 0.55), rgba(8, 24, 45, 0.52));
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
  min-height: 0;
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
  background: linear-gradient(180deg, rgba(35, 112, 166, 0.44), rgba(16, 61, 104, 0.54));
  box-shadow: inset 0 0 8px rgba(151, 224, 255, 0.2);
}

.cell.hit {
  background: linear-gradient(180deg, rgba(255, 140, 92, 0.94), rgba(191, 50, 34, 0.95));
  border-color: rgba(255, 154, 117, 0.92);
  box-shadow: 0 0 14px rgba(255, 112, 91, 0.66);
  z-index: 4;
}

.cell.hit .cell-marker {
  color: #fff2d8;
  text-shadow: 0 0 10px rgba(255, 201, 144, 0.7), 0 0 18px rgba(255, 119, 86, 0.45);
}

.cell.sunk {
  background: linear-gradient(180deg, rgba(255, 96, 96, 0.95), rgba(165, 24, 24, 0.96));
  border-color: rgba(255, 133, 133, 0.95);
  box-shadow: 0 0 16px rgba(255, 72, 72, 0.72);
}

.cell.sunk .cell-marker,
.cell-marker.sunk-marker {
  color: #ff5a5a;
  font-size: 13px;
  text-shadow: 0 0 10px rgba(255, 104, 104, 0.85), 0 0 16px rgba(255, 54, 54, 0.65);
}

.cell.miss {
  background: linear-gradient(180deg, rgba(93, 154, 206, 0.78), rgba(33, 96, 150, 0.95));
  border-color: rgba(135, 190, 230, 0.65);
  z-index: 4;
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
.splash-ring,
.impact-smoke,
.targeting-flare {
  position: absolute;
  inset: 12%;
  border-radius: 50%;
  pointer-events: none;
  z-index: 3;
}

.shot-vector {
  position: absolute;
  left: calc(50% + var(--vector-offset, 0%));
  width: 2px;
  height: 170%;
  pointer-events: none;
  z-index: 2;
  transform-origin: center;
  filter: drop-shadow(0 0 8px rgba(177, 233, 255, 0.45));
}

.shot-vector::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(164, 231, 255, 0), rgba(164, 231, 255, 0.92), rgba(255, 218, 178, 0));
}

.shot-vector.outgoing {
  bottom: -160%;
  transform: rotate(var(--vector-tilt, 8deg));
  animation: shot-vector-rise 0.54s ease-out;
}

.shot-vector.incoming {
  top: -160%;
  transform: rotate(var(--vector-tilt, -8deg));
  animation: shot-vector-drop 0.5s ease-out;
}

.impact-burst {
  border: 2px solid rgba(255, 182, 140, 0.9);
  box-shadow: 0 0 16px rgba(255, 120, 88, 0.7), inset 0 0 8px rgba(255, 194, 145, 0.45);
  animation: impact-burst 0.5s ease-out;
}

.impact-smoke {
  inset: 4%;
  background:
    radial-gradient(circle at 36% 42%, rgba(255, 206, 164, 0.66), rgba(255, 206, 164, 0) 44%),
    radial-gradient(circle at 58% 58%, rgba(78, 68, 74, 0.52), rgba(78, 68, 74, 0) 52%),
    radial-gradient(circle at 48% 46%, rgba(39, 42, 54, 0.48), rgba(39, 42, 54, 0) 60%);
  animation: impact-smoke-fade 0.68s ease-out;
}

.splash-ring {
  border: 2px solid rgba(171, 235, 255, 0.9);
  box-shadow: 0 0 14px rgba(125, 214, 255, 0.6), inset 0 0 8px rgba(188, 238, 255, 0.5);
  animation: splash-ring-expand 0.44s ease-out;
}

.targeting-flare {
  inset: 6%;
  border: 1px solid rgba(173, 235, 255, 0.72);
  box-shadow: 0 0 0 2px rgba(150, 220, 255, 0.24), 0 0 14px rgba(120, 210, 255, 0.4);
  animation: targeting-flare-pulse 0.82s ease-in-out infinite;
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

@keyframes ship-idle-drift {
  0%, 100% { transform: translateY(0) translateX(0) rotateZ(0deg); }
  35% { transform: translateY(-1px) translateX(0.5px) rotateZ(0.2deg); }
  70% { transform: translateY(0.5px) translateX(-0.5px) rotateZ(-0.25deg); }
}

@keyframes wake-flow-horizontal {
  0%, 100% { transform: translateY(-50%) scaleX(1); opacity: 0.54; }
  50% { transform: translateY(-50%) scaleX(1.08); opacity: 0.84; }
}

@keyframes wake-flow-vertical {
  0%, 100% { transform: translateX(-50%) scaleY(1); opacity: 0.52; }
  50% { transform: translateX(-50%) scaleY(1.1); opacity: 0.82; }
}

@keyframes ocean-swell-a {
  0%, 100% { transform: translateX(0) translateY(0); opacity: 0.7; }
  50% { transform: translateX(2%) translateY(3%); opacity: 1; }
}

@keyframes ocean-swell-b {
  0%, 100% { transform: translateX(0) translateY(0); opacity: 0.64; }
  50% { transform: translateX(-2%) translateY(2%); opacity: 0.9; }
}

@keyframes ocean-swell-c {
  0%, 100% { transform: translateX(0) translateY(0); opacity: 0.54; }
  50% { transform: translateX(1.4%) translateY(-2%); opacity: 0.8; }
}

@keyframes impact-burst {
  0% { transform: scale(0.3); opacity: 0.95; }
  100% { transform: scale(1.45); opacity: 0; }
}

@keyframes splash-ring-expand {
  0% { transform: scale(0.25); opacity: 0.95; }
  100% { transform: scale(1.55); opacity: 0; }
}

@keyframes impact-smoke-fade {
  0% { transform: scale(0.5); opacity: 0.86; }
  100% { transform: scale(1.4); opacity: 0; }
}

@keyframes targeting-flare-pulse {
  0%, 100% { transform: scale(0.88); opacity: 0.62; }
  50% { transform: scale(1.04); opacity: 1; }
}

@keyframes shot-vector-rise {
  0% { transform: rotate(var(--vector-tilt, 8deg)) translateY(18%); opacity: 0; }
  25% { opacity: 1; }
  100% { transform: rotate(var(--vector-tilt, 8deg)) translateY(-8%); opacity: 0; }
}

@keyframes shot-vector-drop {
  0% { transform: rotate(var(--vector-tilt, -8deg)) translateY(-18%); opacity: 0; }
  25% { opacity: 1; }
  100% { transform: rotate(var(--vector-tilt, -8deg)) translateY(8%); opacity: 0; }
}

@keyframes board-impact-shake {
  0% { transform: translate3d(0, 0, 0); }
  20% { transform: translate3d(-1.5px, 0.7px, 0); }
  40% { transform: translate3d(1.4px, -0.8px, 0); }
  60% { transform: translate3d(-1.1px, 0.5px, 0); }
  80% { transform: translate3d(1px, -0.5px, 0); }
  100% { transform: translate3d(0, 0, 0); }
}

@keyframes chromatic-shock-pulse {
  0% { opacity: 0.85; transform: scale(1); }
  100% { opacity: 0; transform: scale(1.025); }
}

.controls {
  margin-top: 6px;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 8px;
  align-items: center;
}

.controls-left {
  display: flex;
  gap: 6px;
  align-items: center;
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
  min-width: 72px;
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
  .game-shell-content {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(0, 0.26fr) minmax(0, 0.74fr);
  }

  .board-area {
    grid-template-rows: repeat(2, minmax(0, 1fr));
    min-height: 0;
  }

  .sidebar {
    min-height: 0;
    overflow: auto;
    padding-right: 2px;
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
