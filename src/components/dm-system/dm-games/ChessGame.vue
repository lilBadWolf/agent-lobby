<template>
  <div class="chess-shell" role="application" aria-label="Chess game">
    <div class="chess-header">
      <div class="chess-title-wrap">
        <span class="chess-title">CHESS</span>
        <span class="chess-subtitle">Secure board with {{ peerName }}</span>
      </div>
      <div class="chess-turn-chip" :class="turnClass">{{ turnLabel }}</div>
      <button class="chess-action-btn" type="button" @click="closeGame">EXIT</button>
    </div>

    <div class="chess-main">
      <div class="chess-sidebar">
        <div class="scoreboard-card">
          <div class="scoreboard-label">BOARD STATE</div>
          <div class="scoreboard-rows">
            <div class="scoreboard-row">
              <span class="score-pill score-pill-white">WHITE {{ whiteMaterial }}</span>
              <span class="score-pill score-pill-black">BLACK {{ blackMaterial }}</span>
            </div>
            <div class="scoreboard-row scoreboard-meta">
              <span>Move {{ state.moveNumber }}</span>
              <span>{{ scoreboardStateLabel }}</span>
            </div>
          </div>
          <div class="scoreboard-note">{{ materialLeadLabel }}</div>
        </div>

        <div class="player-card" :class="{ active: localColor === 'w' }">
          <span class="player-color">WHITE</span>
          <span class="player-name">{{ whitePlayer }}</span>
          <div class="captured-tray" aria-label="White lost pieces">
            <span
              v-for="(piece, index) in lostWhitePieces"
              :key="`lost-white-${index}`"
              class="captured-piece-chip"
              :class="pieceClass(piece)"
            >
              <span class="chess-piece-sprite" :class="pieceSpriteClass(piece)" aria-hidden="true" />
            </span>
          </div>
        </div>
        <div class="player-card" :class="{ active: localColor === 'b' }">
          <span class="player-color">BLACK</span>
          <span class="player-name">{{ blackPlayer }}</span>
          <div class="captured-tray" aria-label="Black lost pieces">
            <span
              v-for="(piece, index) in lostBlackPieces"
              :key="`lost-black-${index}`"
              class="captured-piece-chip"
              :class="pieceClass(piece)"
            >
              <span class="chess-piece-sprite" :class="pieceSpriteClass(piece)" aria-hidden="true" />
            </span>
          </div>
        </div>
        <div class="status-card">{{ statusText }}</div>
        <button
          class="chess-action-btn rematch"
          type="button"
          :disabled="!canSend || awaitingRematchAck"
          @click="requestRematch"
        >
          {{ awaitingRematchAck ? 'WAITING...' : 'REMATCH' }}
        </button>
      </div>

      <div class="chess-board-shell">
        <div class="chess-board" :class="{ locked: !canInteract }" ref="boardEl">
          <button
            v-for="square in boardSquares"
            :key="`sq-${square.index}`"
            class="chess-cell"
            :class="squareClass(square.index)"
            type="button"
            :disabled="!canClickSquare(square.index)"
            @click="handleSquareClick(square.index)"
          >
            <span class="board-coordinate" v-if="square.file === 0">{{ 8 - square.rank }}</span>
            <span class="board-file" v-if="square.rank === 7">{{ fileLabel(square.file) }}</span>
            <span
              v-if="displayedBoard[square.index]"
              class="chess-piece"
              :class="pieceClass(displayedBoard[square.index]!)"
              :title="pieceName(displayedBoard[square.index]!)"
              :aria-label="pieceName(displayedBoard[square.index]!)"
            >
              <span class="chess-piece-sprite" :class="pieceSpriteClass(displayedBoard[square.index]!)" aria-hidden="true" />
            </span>
          </button>

          <div v-if="remoteAnimation" class="piece-animation">
            <span ref="movingPieceRef" class="chess-piece animated-piece moving-piece" :class="pieceClass(remoteAnimation.piece)" :style="remoteAnimation.movingStyle">
              <span class="chess-piece-sprite" :class="pieceSpriteClass(remoteAnimation.piece)" aria-hidden="true" />
            </span>
            <span
              v-if="remoteAnimation.capturedPiece"
              ref="capturedPieceRef"
              class="chess-piece animated-piece captured-piece"
              :class="pieceClass(remoteAnimation.capturedPiece)"
              :style="remoteAnimation.capturedStyle"
            >
              <span class="chess-piece-sprite" :class="pieceSpriteClass(remoteAnimation.capturedPiece)" aria-hidden="true" />
            </span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showWaitingOverlay" class="chess-overlay">WAITING FOR OPPONENT TO ACCEPT</div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

type Color = 'w' | 'b';
type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

interface Piece {
  color: Color;
  type: PieceType;
}

interface ChessState {
  board: Array<Piece | null>;
  turn: Color;
  castling: {
    wK: boolean;
    wQ: boolean;
    bK: boolean;
    bQ: boolean;
  };
  enPassant: number | null;
  moveNumber: number;
}

interface Move {
  from: number;
  to: number;
  promotion?: PieceType;
  isEnPassant?: boolean;
  capturedAt?: number;
}

type Winner = Color | 'draw' | null;

type ChessBridgeEventDetail = {
  from?: string;
  data?: any;
};

const props = defineProps<{
  user: string;
  peerName: string;
  dataChannel: RTCDataChannel | null;
  startSignal: number;
  isInitiator?: boolean;
  waitingForAcceptance?: boolean;
}>();

const emit = defineEmits<{ close: [] }>();

const boardEl = ref<HTMLElement | null>(null);
const movingPieceRef = ref<HTMLElement | null>(null);
const capturedPieceRef = ref<HTMLElement | null>(null);
const state = ref<ChessState>(createInitialState());
const animationBoard = ref<Array<Piece | null> | null>(null);
const localColor = ref<Color | null>(null);
const winner = ref<Winner>(null);
const selectedSquare = ref<number | null>(null);
const legalTargets = ref<Set<number>>(new Set());
const checkColor = ref<Color | null>(null);
const statusMessage = ref('Stand by for board sync...');
const awaitingRematchAck = ref(false);
const remoteMoveSeq = ref(-1);
const localMoveSeq = ref(0);

const remoteAnimation = ref<{
  piece: Piece;
  from: number;
  to: number;
  movingStyle: Record<string, string>;
  capturedPiece: Piece | null;
  capturedStyle: Record<string, string> | null;
} | null>(null);

const showWaitingOverlay = computed(() => Boolean(props.waitingForAcceptance));
const canSend = computed(() => Boolean(currentChannel && currentChannel.readyState === 'open'));
const displayedBoard = computed(() => animationBoard.value ?? state.value.board);
const whiteMaterial = computed(() => materialScoreFor('w', state.value.board));
const blackMaterial = computed(() => materialScoreFor('b', state.value.board));
const lostWhitePieces = computed(() => missingPiecesFor('w', state.value.board));
const lostBlackPieces = computed(() => missingPiecesFor('b', state.value.board));
const materialLeadLabel = computed(() => {
  if (whiteMaterial.value === blackMaterial.value) {
    return 'Material is even';
  }

  const leader = whiteMaterial.value > blackMaterial.value ? 'White leads' : 'Black leads';
  const difference = Math.abs(whiteMaterial.value - blackMaterial.value);
  return `${leader} by ${difference}`;
});
const scoreboardStateLabel = computed(() => {
  if (winner.value === 'draw') {
    return 'Draw';
  }

  if (winner.value) {
    return 'Checkmate';
  }

  if (checkColor.value) {
    return 'Check';
  }

  return state.value.turn === localColor.value ? 'Your turn' : 'Waiting';
});
const whitePlayer = computed(() => (localColor.value === 'w' ? props.user : props.peerName));
const blackPlayer = computed(() => (localColor.value === 'b' ? props.user : props.peerName));
const turnLabel = computed(() => (state.value.turn === 'w' ? 'WHITE TO MOVE' : 'BLACK TO MOVE'));
const turnClass = computed(() => (state.value.turn === 'w' ? 'turn-white' : 'turn-black'));
const canInteract = computed(() => {
  if (showWaitingOverlay.value || winner.value || remoteAnimation.value || !localColor.value) {
    return false;
  }

  return state.value.turn === localColor.value;
});

const statusText = computed(() => {
  if (showWaitingOverlay.value) {
    return 'Waiting for opponent to accept CHESS';
  }

  if (!localColor.value) {
    return statusMessage.value;
  }

  if (winner.value === 'draw') {
    return 'Stalemate. The game is a draw.';
  }

  if (winner.value) {
    const winnerName = winner.value === localColor.value ? 'You' : props.peerName;
    return `${winnerName} won by checkmate.`;
  }

  if (checkColor.value) {
    const checkedName = checkColor.value === localColor.value ? 'You are' : `${props.peerName} is`;
    return `${checkedName} in check.`;
  }

  return state.value.turn === localColor.value ? 'Your move.' : `${props.peerName} is thinking...`;
});

const boardSquares = computed(() => {
  const values: Array<{ index: number; rank: number; file: number }> = [];
  for (let rank = 0; rank < 8; rank += 1) {
    for (let file = 0; file < 8; file += 1) {
      values.push({ index: toIndex(rank, file), rank, file });
    }
  }
  return values;
});

let currentChannel: RTCDataChannel | null = null;
let channelMessageListener: ((event: MessageEvent) => void) | null = null;
let channelOpenListener: ((event: Event) => void) | null = null;
let animationTimer: ReturnType<typeof setTimeout> | null = null;

function createInitialState(): ChessState {
  const board: Array<Piece | null> = Array(64).fill(null);
  const backRank: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];

  for (let file = 0; file < 8; file += 1) {
    board[toIndex(0, file)] = { color: 'b', type: backRank[file] };
    board[toIndex(1, file)] = { color: 'b', type: 'p' };
    board[toIndex(6, file)] = { color: 'w', type: 'p' };
    board[toIndex(7, file)] = { color: 'w', type: backRank[file] };
  }

  return {
    board,
    turn: 'w',
    castling: { wK: true, wQ: true, bK: true, bQ: true },
    enPassant: null,
    moveNumber: 1,
  };
}

function randomWhiteUser() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % 2 === 0 ? props.user : props.peerName;
}

function toIndex(rank: number, file: number) {
  return rank * 8 + file;
}

function rankOf(index: number) {
  return Math.floor(index / 8);
}

function fileOf(index: number) {
  return index % 8;
}

function inBounds(rank: number, file: number) {
  return rank >= 0 && rank < 8 && file >= 0 && file < 8;
}

function oppositeColor(color: Color): Color {
  return color === 'w' ? 'b' : 'w';
}

function cloneState(input: ChessState): ChessState {
  return {
    board: input.board.map((piece) => (piece ? { ...piece } : null)),
    turn: input.turn,
    castling: { ...input.castling },
    enPassant: input.enPassant,
    moveNumber: input.moveNumber,
  };
}

function pieceClass(piece: Piece) {
  return [`piece-${piece.color}`, `piece-${piece.type}`];
}

const whiteSpriteSheet = `url(${JSON.stringify(new URL('./assets/chess-pieces/chess-pieces-white.png', import.meta.url).href)})`;
const blackSpriteSheet = `url(${JSON.stringify(new URL('./assets/chess-pieces/chess-pieces-black.png', import.meta.url).href)})`;

function pieceSpriteClass(piece: Piece) {
  return [`sprite-color-${piece.color}`, `sprite-type-${piece.type}`];
}

function pieceName(piece: Piece) {
  const colorLabel = piece.color === 'w' ? 'White' : 'Black';
  const typeLabel: Record<PieceType, string> = {
    p: 'Pawn',
    r: 'Rook',
    n: 'Knight',
    b: 'Bishop',
    q: 'Queen',
    k: 'King',
  };

  return `${colorLabel} ${typeLabel[piece.type]}`;
}

function materialScoreFor(color: Color, board: Array<Piece | null>) {
  return board.reduce((score, piece) => {
    if (!piece || piece.color !== color) {
      return score;
    }

    return score + pieceValue(piece.type);
  }, 0);
}

function pieceValue(type: PieceType) {
  const values: Record<PieceType, number> = {
    p: 1,
    n: 3,
    b: 3,
    r: 5,
    q: 9,
    k: 0,
  };

  return values[type];
}

function missingPiecesFor(color: Color, board: Array<Piece | null>) {
  const initialCounts: Record<PieceType, number> = {
    p: 8,
    n: 2,
    b: 2,
    r: 2,
    q: 1,
    k: 1,
  };
  const remaining: Record<PieceType, number> = { ...initialCounts };

  for (const piece of board) {
    if (piece && piece.color === color) {
      remaining[piece.type] -= 1;
    }
  }

  const pieces: Piece[] = [];
  (Object.keys(remaining) as PieceType[]).forEach((type) => {
    const count = initialCounts[type] - remaining[type];
    for (let index = 0; index < count; index += 1) {
      pieces.push({ color, type });
    }
  });

  return pieces;
}

function fileLabel(file: number) {
  return String.fromCharCode(97 + file);
}

function squareClass(index: number) {
  const rank = rankOf(index);
  const file = fileOf(index);
  const selected = selectedSquare.value === index;
  const isLight = (rank + file) % 2 === 0;
  const piece = displayedBoard.value[index];
  const lastMoveHit = Boolean(lastMove.value && (lastMove.value.from === index || lastMove.value.to === index));

  return {
    light: isLight,
    dark: !isLight,
    selected,
    target: legalTargets.value.has(index),
    occupied: Boolean(piece),
    'last-move': lastMoveHit,
    'check-cell': Boolean(checkColor.value && piece?.type === 'k' && piece.color === checkColor.value),
  };
}

function canClickSquare(index: number) {
  if (!localColor.value || remoteAnimation.value) {
    return false;
  }

  const piece = displayedBoard.value[index];
  if (selectedSquare.value === null) {
    return canInteract.value && !!piece && piece.color === localColor.value;
  }

  if (selectedSquare.value === index) {
    return true;
  }

  if (legalTargets.value.has(index)) {
    return canInteract.value;
  }

  return canInteract.value && !!piece && piece.color === localColor.value;
}

const lastMove = ref<{ from: number; to: number } | null>(null);

function clearSelection() {
  selectedSquare.value = null;
  legalTargets.value = new Set();
}

function handleSquareClick(index: number) {
  if (!localColor.value || remoteAnimation.value) {
    return;
  }

  const piece = state.value.board[index];

  if (selectedSquare.value !== null && legalTargets.value.has(index)) {
    const move = createMoveFromSelection(selectedSquare.value, index);
    clearSelection();
    if (move) {
      executeLocalMove(move);
    }
    return;
  }

  if (!piece || piece.color !== localColor.value || !canInteract.value) {
    clearSelection();
    return;
  }

  selectedSquare.value = index;
  const legalMoves = generateLegalMovesForSquare(state.value, index, localColor.value);
  legalTargets.value = new Set(legalMoves.map((move) => move.to));
}

function createMoveFromSelection(from: number, to: number): Move | null {
  const candidates = generateLegalMovesForSquare(state.value, from, state.value.turn);
  const selected = candidates.find((move) => move.to === to);
  if (!selected) {
    return null;
  }

  return selected;
}

function sendChessMessage(payload: Record<string, unknown>) {
  if (!currentChannel || currentChannel.readyState !== 'open') {
    return;
  }

  try {
    currentChannel.send(JSON.stringify(payload));
  } catch {
    // Ignore transient send failures.
  }
}

function startNewGame(whiteUser: string, broadcast = false) {
  state.value = createInitialState();
  animationBoard.value = null;
  remoteAnimation.value = null;
  clearSelection();
  winner.value = null;
  checkColor.value = null;
  awaitingRematchAck.value = false;
  remoteMoveSeq.value = -1;
  localMoveSeq.value = 0;
  lastMove.value = null;

  localColor.value = whiteUser === props.user ? 'w' : 'b';
  statusMessage.value = `Game started. ${whiteUser} plays white.`;

  if (broadcast) {
    sendChessMessage({
      type: 'chess-init',
      whiteUser,
    });
  }
}

function executeLocalMove(move: Move) {
  if (!localColor.value || state.value.turn !== localColor.value || winner.value) {
    return;
  }

  const legalMoves = generateLegalMovesForSquare(state.value, move.from, state.value.turn);
  const confirmedMove = legalMoves.find((candidate) => candidate.to === move.to);
  if (!confirmedMove) {
    return;
  }

  const next = applyMove(state.value, confirmedMove);
  commitStateAfterMove(next, confirmedMove);

  sendChessMessage({
    type: 'chess-move',
    from: confirmedMove.from,
    to: confirmedMove.to,
    promotion: confirmedMove.promotion,
    seq: localMoveSeq.value,
  });
  localMoveSeq.value += 1;
}

function executeRemoteMove(move: Move, seq: number | null) {
  if (winner.value || !localColor.value || state.value.turn === localColor.value) {
    return;
  }

  const legalMoves = generateLegalMovesForSquare(state.value, move.from, state.value.turn);
  const confirmedMove = legalMoves.find((candidate) => candidate.to === move.to);
  if (!confirmedMove) {
    return;
  }

  if (seq !== null && seq <= remoteMoveSeq.value) {
    return;
  }

  if (seq !== null) {
    remoteMoveSeq.value = seq;
  }

  animateRemoteMove(confirmedMove);
}

function animateRemoteMove(move: Move) {
  const piece = state.value.board[move.from];
  if (!piece || !boardEl.value) {
    const next = applyMove(state.value, move);
    commitStateAfterMove(next, move);
    return;
  }

  if (animationTimer) {
    clearTimeout(animationTimer);
    animationTimer = null;
  }

  const next = applyMove(state.value, move);
  animationBoard.value = createAnimationBoard(state.value.board, move);

  const boardRect = boardEl.value.getBoundingClientRect();
  const squareSize = boardRect.width / 8;
  const movingPath = buildMovePath(move, piece, squareSize);
  const movingKeyframes = buildMoveKeyframes(movingPath, squareSize);
  const duration = Math.min(620, 360 + movingPath.length * 58);
  const capturedPiece = state.value.board[move.to] ?? null;
  const capturedKeyframes = capturedPiece ? buildCaptureKeyframes(move, squareSize) : null;

  remoteAnimation.value = {
    piece,
    from: move.from,
    to: move.to,
    movingStyle: createOverlayStyle(movingKeyframes[0].transform as string, squareSize),
    capturedPiece,
    capturedStyle: capturedKeyframes ? createOverlayStyle(capturedKeyframes[0].transform as string, squareSize) : null,
  };

  void nextTick(() => {
    if (movingPieceRef.value) {
      movingPieceRef.value.animate(movingKeyframes, {
        duration,
        easing: 'cubic-bezier(0.2, 0.82, 0.18, 1)',
        fill: 'forwards',
      });
    }

    if (capturedPieceRef.value && capturedKeyframes) {
      capturedPieceRef.value.animate(capturedKeyframes, {
        duration,
        easing: 'cubic-bezier(0.18, 0.76, 0.2, 1)',
        fill: 'forwards',
      });
    }
  });

  animationTimer = setTimeout(() => {
    remoteAnimation.value = null;
    animationBoard.value = null;
    commitStateAfterMove(next, move);
  }, duration + 20);
}

function createAnimationBoard(board: Array<Piece | null>, move: Move) {
  return board.map((entry, index) => {
    if (index === move.from || index === move.to || index === move.capturedAt) {
      return null;
    }

    if (entry && move.from === toIndex(7, 4) && move.to === toIndex(7, 6) && index === toIndex(7, 7)) {
      return null;
    }

    if (entry && move.from === toIndex(7, 4) && move.to === toIndex(7, 2) && index === toIndex(7, 0)) {
      return null;
    }

    if (entry && move.from === toIndex(0, 4) && move.to === toIndex(0, 6) && index === toIndex(0, 7)) {
      return null;
    }

    if (entry && move.from === toIndex(0, 4) && move.to === toIndex(0, 2) && index === toIndex(0, 0)) {
      return null;
    }

    return entry ? { ...entry } : null;
  });
}

function createOverlayStyle(transform: string, squareSize: number) {
  const pieceSize = squareSize * 0.86;

  return {
    width: `${pieceSize}px`,
    height: `${pieceSize}px`,
    transform,
  };
}

function buildMovePath(move: Move, piece: Piece, squareSize: number) {
  const points = buildBoardPathPoints(move, piece);

  if (points.length === 2 && piece.type !== 'n') {
    const start = points[0];
    const end = points[1];
    const lift = squareSize * 0.18;
    const mid = {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2 - lift,
    };

    return [start, mid, end];
  }

  return points;
}

function buildBoardPathPoints(move: Move, piece: Piece) {
  const fromRank = rankOf(move.from);
  const fromFile = fileOf(move.from);
  const toRank = rankOf(move.to);
  const toFile = fileOf(move.to);

  const squareCenters = (index: number) => ({
    x: (fileOf(index) + 0.5) / 8,
    y: (rankOf(index) + 0.5) / 8,
  });

  if (piece.type === 'n') {
    const start = squareCenters(move.from);
    const end = squareCenters(move.to);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy) || 1;
    const lift = 0.18;
    return [
      start,
      {
        x: (start.x + end.x) / 2 - (dy / length) * lift,
        y: (start.y + end.y) / 2 + (dx / length) * lift - 0.03,
      },
      end,
    ];
  }

  if (fromRank !== toRank && fromFile !== toFile && Math.abs(fromRank - toRank) !== Math.abs(fromFile - toFile)) {
    return [squareCenters(move.from), squareCenters(move.to)];
  }

  const points = [squareCenters(move.from)];
  const stepRank = Math.sign(toRank - fromRank);
  const stepFile = Math.sign(toFile - fromFile);
  let currentRank = fromRank + stepRank;
  let currentFile = fromFile + stepFile;

  while (currentRank !== toRank || currentFile !== toFile) {
    points.push({ x: (currentFile + 0.5) / 8, y: (currentRank + 0.5) / 8 });
    currentRank += stepRank;
    currentFile += stepFile;
  }

  points.push(squareCenters(move.to));
  return points;
}

function buildMoveKeyframes(points: Array<{ x: number; y: number }>, squareSize: number) {
  const pieceSize = squareSize * 0.86;
  const absolutePoints = points.map((point, index) => ({
    x: point.x * squareSize * 8 - pieceSize / 2,
    y: point.y * squareSize * 8 - pieceSize / 2,
    scale: index === 0 || index === points.length - 1 ? 1 : 1.06,
  }));

  const totalDistance = absolutePoints.reduce((sum, point, index) => {
    if (index === 0) {
      return 0;
    }

    const previous = absolutePoints[index - 1];
    return sum + Math.hypot(point.x - previous.x, point.y - previous.y);
  }, 0) || 1;

  let travelled = 0;
  return absolutePoints.map((point, index) => {
    if (index > 0) {
      const previous = absolutePoints[index - 1];
      travelled += Math.hypot(point.x - previous.x, point.y - previous.y);
    }

    return {
      offset: travelled / totalDistance,
      transform: `translate3d(${point.x}px, ${point.y}px, 0) scale(${point.scale})`,
      filter: index === 0 || index === absolutePoints.length - 1 ? 'drop-shadow(0 14px 18px rgba(0, 0, 0, 0.28))' : 'drop-shadow(0 18px 22px rgba(0, 0, 0, 0.22))',
    } satisfies Keyframe;
  });
}

function buildCaptureKeyframes(move: Move, squareSize: number) {
  const pieceSize = squareSize * 0.86;
  const from = {
    x: (fileOf(move.from) + 0.5) * squareSize - pieceSize / 2,
    y: (rankOf(move.from) + 0.5) * squareSize - pieceSize / 2,
  };
  const to = {
    x: (fileOf(move.to) + 0.5) * squareSize - pieceSize / 2,
    y: (rankOf(move.to) + 0.5) * squareSize - pieceSize / 2,
  };
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const pushX = (dx / length) * squareSize * 0.22;
  const pushY = (dy / length) * squareSize * 0.22;
  const driftX = -(dy / length) * squareSize * 0.08;
  const driftY = (dx / length) * squareSize * 0.08;

  return [
    {
      offset: 0,
      transform: `translate3d(${to.x}px, ${to.y}px, 0) rotate(0deg) scale(1)`,
      opacity: 1,
    },
    {
      offset: 0.34,
      transform: `translate3d(${to.x + pushX * 0.45 + driftX}px, ${to.y + pushY * 0.45 + driftY}px, 0) rotate(7deg) scale(0.98)`,
      opacity: 1,
    },
    {
      offset: 1,
      transform: `translate3d(${to.x + pushX}px, ${to.y + pushY}px, 0) rotate(18deg) scale(0.84)`,
      opacity: 0,
    },
  ] satisfies Keyframe[];
}

function commitStateAfterMove(next: ChessState, move: Move) {
  state.value = next;
  lastMove.value = { from: move.from, to: move.to };
  checkColor.value = isKingInCheck(next, next.turn) ? next.turn : null;

  const nextMoves = generateAllLegalMoves(next, next.turn);
  if (nextMoves.length === 0) {
    winner.value = checkColor.value ? oppositeColor(next.turn) : 'draw';
    return;
  }

  winner.value = null;
}

function requestRematch() {
  if (!canSend.value) {
    return;
  }

  awaitingRematchAck.value = true;
  sendChessMessage({ type: 'chess-rematch-request' });
}

function acceptRemoteRematch() {
  if (!canSend.value) {
    return;
  }

  sendChessMessage({ type: 'chess-rematch-accept' });
  awaitingRematchAck.value = false;
  startNewGame(randomWhiteUser(), true);
}

function handleGameDataMessage(data: any) {
  if (!data?.type?.startsWith('chess-')) {
    return;
  }

  if (data.type === 'chess-init' && typeof data.whiteUser === 'string') {
    startNewGame(data.whiteUser, false);
    return;
  }

  if (data.type === 'chess-move' && typeof data.from === 'number' && typeof data.to === 'number') {
    executeRemoteMove({ from: data.from, to: data.to, promotion: data.promotion }, typeof data.seq === 'number' ? data.seq : null);
    return;
  }

  if (data.type === 'chess-rematch-request') {
    statusMessage.value = `${props.peerName} requested a rematch.`;
    acceptRemoteRematch();
    return;
  }

  if (data.type === 'chess-rematch-accept') {
    awaitingRematchAck.value = false;
    return;
  }

  if (data.type === 'chess-cancel') {
    winner.value = null;
    statusMessage.value = `${props.peerName} canceled CHESS.`;
  }
}

function handleBridgeMessage(event: Event) {
  const bridgeEvent = event as CustomEvent<ChessBridgeEventDetail>;
  if (!bridgeEvent.detail?.from || bridgeEvent.detail.from !== props.peerName) {
    return;
  }

  handleGameDataMessage(bridgeEvent.detail?.data);
}

function attachDataChannel(channel: RTCDataChannel | null) {
  if (currentChannel && channelMessageListener) {
    currentChannel.removeEventListener('message', channelMessageListener);
  }

  if (currentChannel && channelOpenListener) {
    currentChannel.removeEventListener('open', channelOpenListener);
  }

  currentChannel = channel;

  if (!currentChannel) {
    return;
  }

  channelMessageListener = (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      handleGameDataMessage(data);
    } catch {
      // Ignore malformed messages.
    }
  };

  channelOpenListener = () => {
    if (props.isInitiator && props.startSignal > 0 && !showWaitingOverlay.value && !localColor.value) {
      startNewGame(randomWhiteUser(), true);
    }
  };

  currentChannel.addEventListener('message', channelMessageListener);
  currentChannel.addEventListener('open', channelOpenListener);
}

function closeGame() {
  sendChessMessage({ type: 'chess-cancel' });
  emit('close');
}

function generateAllLegalMoves(inputState: ChessState, color: Color): Move[] {
  const moves: Move[] = [];
  for (let index = 0; index < 64; index += 1) {
    const piece = inputState.board[index];
    if (!piece || piece.color !== color) {
      continue;
    }

    moves.push(...generateLegalMovesForSquare(inputState, index, color));
  }

  return moves;
}

function generateLegalMovesForSquare(inputState: ChessState, index: number, color: Color): Move[] {
  const piece = inputState.board[index];
  if (!piece || piece.color !== color) {
    return [];
  }

  const pseudoMoves = generatePseudoMoves(inputState, index, piece);
  return pseudoMoves.filter((move) => {
    const simulated = applyMove(inputState, move);
    return !isKingInCheck(simulated, color);
  });
}

function generatePseudoMoves(inputState: ChessState, index: number, piece: Piece): Move[] {
  const rank = rankOf(index);
  const file = fileOf(index);
  const moves: Move[] = [];

  if (piece.type === 'p') {
    const direction = piece.color === 'w' ? -1 : 1;
    const startRank = piece.color === 'w' ? 6 : 1;
    const promoteRank = piece.color === 'w' ? 0 : 7;

    const oneStepRank = rank + direction;
    if (inBounds(oneStepRank, file)) {
      const oneStep = toIndex(oneStepRank, file);
      if (!inputState.board[oneStep]) {
        moves.push({
          from: index,
          to: oneStep,
          promotion: oneStepRank === promoteRank ? 'q' : undefined,
        });

        if (rank === startRank) {
          const twoStep = toIndex(rank + direction * 2, file);
          if (!inputState.board[twoStep]) {
            moves.push({ from: index, to: twoStep });
          }
        }
      }
    }

    const captureFiles = [file - 1, file + 1];
    for (const captureFile of captureFiles) {
      if (!inBounds(rank + direction, captureFile)) {
        continue;
      }

      const target = toIndex(rank + direction, captureFile);
      const occupant = inputState.board[target];
      if (occupant && occupant.color !== piece.color) {
        moves.push({
          from: index,
          to: target,
          promotion: rank + direction === promoteRank ? 'q' : undefined,
        });
      }

      if (inputState.enPassant !== null && inputState.enPassant === target) {
        const capturedAt = toIndex(rank, captureFile);
        moves.push({ from: index, to: target, isEnPassant: true, capturedAt });
      }
    }

    return moves;
  }

  if (piece.type === 'n') {
    const knightOffsets = [
      [-2, -1],
      [-2, 1],
      [-1, -2],
      [-1, 2],
      [1, -2],
      [1, 2],
      [2, -1],
      [2, 1],
    ];

    for (const [dr, df] of knightOffsets) {
      const nextRank = rank + dr;
      const nextFile = file + df;
      if (!inBounds(nextRank, nextFile)) {
        continue;
      }

      const target = toIndex(nextRank, nextFile);
      const occupant = inputState.board[target];
      if (!occupant || occupant.color !== piece.color) {
        moves.push({ from: index, to: target });
      }
    }

    return moves;
  }

  if (piece.type === 'b' || piece.type === 'r' || piece.type === 'q') {
    const directions: Array<[number, number]> = [];

    if (piece.type === 'b' || piece.type === 'q') {
      directions.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
    }

    if (piece.type === 'r' || piece.type === 'q') {
      directions.push([-1, 0], [1, 0], [0, -1], [0, 1]);
    }

    for (const [dr, df] of directions) {
      let nextRank = rank + dr;
      let nextFile = file + df;

      while (inBounds(nextRank, nextFile)) {
        const target = toIndex(nextRank, nextFile);
        const occupant = inputState.board[target];
        if (!occupant) {
          moves.push({ from: index, to: target });
        } else {
          if (occupant.color !== piece.color) {
            moves.push({ from: index, to: target });
          }
          break;
        }

        nextRank += dr;
        nextFile += df;
      }
    }

    return moves;
  }

  if (piece.type === 'k') {
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let df = -1; df <= 1; df += 1) {
        if (dr === 0 && df === 0) {
          continue;
        }

        const nextRank = rank + dr;
        const nextFile = file + df;
        if (!inBounds(nextRank, nextFile)) {
          continue;
        }

        const target = toIndex(nextRank, nextFile);
        const occupant = inputState.board[target];
        if (!occupant || occupant.color !== piece.color) {
          moves.push({ from: index, to: target });
        }
      }
    }

    moves.push(...generateCastleMoves(inputState, piece.color));
  }

  return moves;
}

function generateCastleMoves(inputState: ChessState, color: Color): Move[] {
  const options: Move[] = [];
  const row = color === 'w' ? 7 : 0;
  const kingFrom = toIndex(row, 4);
  const king = inputState.board[kingFrom];

  if (!king || king.type !== 'k' || isKingInCheck(inputState, color)) {
    return options;
  }

  const rights = color === 'w'
    ? { kingSide: inputState.castling.wK, queenSide: inputState.castling.wQ }
    : { kingSide: inputState.castling.bK, queenSide: inputState.castling.bQ };

  if (rights.kingSide) {
    const through = [toIndex(row, 5), toIndex(row, 6)];
    const rookCell = toIndex(row, 7);
    const rook = inputState.board[rookCell];

    if (
      rook
      && rook.type === 'r'
      && rook.color === color
      && through.every((cell) => !inputState.board[cell])
      && !through.some((cell) => isSquareAttacked(inputState, cell, oppositeColor(color)))
    ) {
      options.push({ from: kingFrom, to: toIndex(row, 6) });
    }
  }

  if (rights.queenSide) {
    const clearCells = [toIndex(row, 1), toIndex(row, 2), toIndex(row, 3)];
    const passCells = [toIndex(row, 3), toIndex(row, 2)];
    const rookCell = toIndex(row, 0);
    const rook = inputState.board[rookCell];

    if (
      rook
      && rook.type === 'r'
      && rook.color === color
      && clearCells.every((cell) => !inputState.board[cell])
      && !passCells.some((cell) => isSquareAttacked(inputState, cell, oppositeColor(color)))
    ) {
      options.push({ from: kingFrom, to: toIndex(row, 2) });
    }
  }

  return options;
}

function applyMove(inputState: ChessState, move: Move): ChessState {
  const next = cloneState(inputState);
  const movingPiece = next.board[move.from];
  if (!movingPiece) {
    return next;
  }

  const targetPiece = next.board[move.to];

  next.board[move.from] = null;

  if (move.isEnPassant && move.capturedAt !== undefined) {
    next.board[move.capturedAt] = null;
  }

  let placedPiece: Piece = { ...movingPiece };
  if (movingPiece.type === 'p' && move.promotion) {
    placedPiece = { color: movingPiece.color, type: move.promotion };
  }

  next.board[move.to] = placedPiece;

  if (movingPiece.type === 'k') {
    if (movingPiece.color === 'w') {
      next.castling.wK = false;
      next.castling.wQ = false;
    } else {
      next.castling.bK = false;
      next.castling.bQ = false;
    }

    const fromFile = fileOf(move.from);
    const toFile = fileOf(move.to);
    if (Math.abs(fromFile - toFile) === 2) {
      const row = movingPiece.color === 'w' ? 7 : 0;
      if (toFile === 6) {
        const rookFrom = toIndex(row, 7);
        const rookTo = toIndex(row, 5);
        next.board[rookTo] = next.board[rookFrom];
        next.board[rookFrom] = null;
      }

      if (toFile === 2) {
        const rookFrom = toIndex(row, 0);
        const rookTo = toIndex(row, 3);
        next.board[rookTo] = next.board[rookFrom];
        next.board[rookFrom] = null;
      }
    }
  }

  if (movingPiece.type === 'r') {
    if (move.from === toIndex(7, 0)) next.castling.wQ = false;
    if (move.from === toIndex(7, 7)) next.castling.wK = false;
    if (move.from === toIndex(0, 0)) next.castling.bQ = false;
    if (move.from === toIndex(0, 7)) next.castling.bK = false;
  }

  if (targetPiece?.type === 'r') {
    if (move.to === toIndex(7, 0)) next.castling.wQ = false;
    if (move.to === toIndex(7, 7)) next.castling.wK = false;
    if (move.to === toIndex(0, 0)) next.castling.bQ = false;
    if (move.to === toIndex(0, 7)) next.castling.bK = false;
  }

  next.enPassant = null;
  if (movingPiece.type === 'p') {
    const fromRank = rankOf(move.from);
    const toRank = rankOf(move.to);
    if (Math.abs(fromRank - toRank) === 2) {
      const direction = movingPiece.color === 'w' ? -1 : 1;
      next.enPassant = toIndex(fromRank + direction, fileOf(move.from));
    }
  }

  next.turn = oppositeColor(inputState.turn);
  if (next.turn === 'w') {
    next.moveNumber += 1;
  }

  return next;
}

function findKing(inputState: ChessState, color: Color): number | null {
  for (let i = 0; i < 64; i += 1) {
    const piece = inputState.board[i];
    if (piece && piece.color === color && piece.type === 'k') {
      return i;
    }
  }

  return null;
}

function isKingInCheck(inputState: ChessState, color: Color) {
  const kingCell = findKing(inputState, color);
  if (kingCell === null) {
    return false;
  }

  return isSquareAttacked(inputState, kingCell, oppositeColor(color));
}

function isSquareAttacked(inputState: ChessState, target: number, byColor: Color) {
  const targetRank = rankOf(target);
  const targetFile = fileOf(target);

  const pawnDirection = byColor === 'w' ? -1 : 1;
  const pawnRank = targetRank - pawnDirection;
  for (const pawnFile of [targetFile - 1, targetFile + 1]) {
    if (!inBounds(pawnRank, pawnFile)) continue;
    const pawn = inputState.board[toIndex(pawnRank, pawnFile)];
    if (pawn && pawn.color === byColor && pawn.type === 'p') {
      return true;
    }
  }

  const knightOffsets = [
    [-2, -1],
    [-2, 1],
    [-1, -2],
    [-1, 2],
    [1, -2],
    [1, 2],
    [2, -1],
    [2, 1],
  ];

  for (const [dr, df] of knightOffsets) {
    const rank = targetRank + dr;
    const file = targetFile + df;
    if (!inBounds(rank, file)) continue;
    const piece = inputState.board[toIndex(rank, file)];
    if (piece && piece.color === byColor && piece.type === 'n') {
      return true;
    }
  }

  const diagonalDirs: Array<[number, number]> = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  for (const [dr, df] of diagonalDirs) {
    let rank = targetRank + dr;
    let file = targetFile + df;
    while (inBounds(rank, file)) {
      const piece = inputState.board[toIndex(rank, file)];
      if (piece) {
        if (piece.color === byColor && (piece.type === 'b' || piece.type === 'q')) {
          return true;
        }
        break;
      }
      rank += dr;
      file += df;
    }
  }

  const lineDirs: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [dr, df] of lineDirs) {
    let rank = targetRank + dr;
    let file = targetFile + df;
    while (inBounds(rank, file)) {
      const piece = inputState.board[toIndex(rank, file)];
      if (piece) {
        if (piece.color === byColor && (piece.type === 'r' || piece.type === 'q')) {
          return true;
        }
        break;
      }
      rank += dr;
      file += df;
    }
  }

  for (let dr = -1; dr <= 1; dr += 1) {
    for (let df = -1; df <= 1; df += 1) {
      if (dr === 0 && df === 0) continue;
      const rank = targetRank + dr;
      const file = targetFile + df;
      if (!inBounds(rank, file)) continue;
      const piece = inputState.board[toIndex(rank, file)];
      if (piece && piece.color === byColor && piece.type === 'k') {
        return true;
      }
    }
  }

  return false;
}

watch(
  () => props.dataChannel,
  (channel) => {
    attachDataChannel(channel);
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
      startNewGame(randomWhiteUser(), true);
      return;
    }

    statusMessage.value = 'Connected. Waiting for board assignment...';
  }
);

watch(
  () => props.waitingForAcceptance,
  (waiting) => {
    if (waiting) {
      statusMessage.value = 'Waiting for opponent to accept CHESS';
      return;
    }

    if (!localColor.value && props.startSignal <= 0) {
      statusMessage.value = 'Ready to start CHESS.';
    }
  },
  { immediate: true }
);

onMounted(() => {
  window.addEventListener('dm-chess-message', handleBridgeMessage as EventListener);

  if (!props.waitingForAcceptance) {
    statusMessage.value = 'Ready to start CHESS.';
  }

  if (props.startSignal > 0 && props.isInitiator && !showWaitingOverlay.value) {
    startNewGame(randomWhiteUser(), true);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('dm-chess-message', handleBridgeMessage as EventListener);

  if (currentChannel && channelMessageListener) {
    currentChannel.removeEventListener('message', channelMessageListener);
  }

  if (currentChannel && channelOpenListener) {
    currentChannel.removeEventListener('open', channelOpenListener);
  }

  if (animationTimer) {
    clearTimeout(animationTimer);
    animationTimer = null;
  }
});
</script>

<style scoped>
.chess-shell {
  position: relative;
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 12px;
  width: min(100%, 980px);
  margin: 0 auto;
  padding: 16px;
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--color-accent) 36%, transparent);
  background:
    radial-gradient(circle at 18% 14%, color-mix(in srgb, var(--color-accent) 18%, transparent), transparent 34%),
    radial-gradient(circle at 92% 86%, color-mix(in srgb, var(--color-chat-link) 20%, transparent), transparent 42%),
    color-mix(in srgb, var(--color-bg-base) 84%, black);
  box-shadow:
    0 28px 60px color-mix(in srgb, var(--color-accent) 16%, transparent),
    inset 0 0 0 1px color-mix(in srgb, var(--color-accent-muted) 45%, transparent);
  overflow: hidden;
}

.chess-header {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 10px;
}

.chess-title-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.chess-title {
  letter-spacing: 0.22em;
  font-size: 1.12rem;
  color: var(--color-accent);
}

.chess-subtitle {
  color: var(--color-text-secondary);
  font-size: 0.75rem;
  letter-spacing: 0.08em;
}

.chess-turn-chip {
  padding: 7px 12px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--color-accent) 48%, transparent);
  letter-spacing: 0.08em;
  font-size: 0.74rem;
}

.chess-turn-chip.turn-white {
  background: color-mix(in srgb, var(--color-chat-warning) 24%, transparent);
  color: var(--color-text-primary);
}

.chess-turn-chip.turn-black {
  background: color-mix(in srgb, var(--color-chat-link) 24%, transparent);
  color: var(--color-text-primary);
}

.chess-main {
  display: grid;
  grid-template-columns: minmax(178px, 230px) minmax(300px, 1fr);
  gap: 14px;
  min-height: 0;
}

.chess-sidebar {
  display: grid;
  align-content: start;
  gap: 10px;
}

.scoreboard-card,
.player-card,
.status-card {
  position: relative;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--color-accent) 22%, transparent);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--color-chat-surface) 72%, transparent), color-mix(in srgb, var(--color-chat-surface-strong) 80%, transparent)),
    color-mix(in srgb, var(--color-bg-base) 60%, black);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.scoreboard-card {
  padding: 12px;
  display: grid;
  gap: 10px;
}

.scoreboard-label {
  color: var(--color-text-secondary);
  letter-spacing: 0.18em;
  font-size: 0.66rem;
}

.scoreboard-rows {
  display: grid;
  gap: 8px;
}

.scoreboard-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.scoreboard-meta {
  color: var(--color-text-secondary);
  font-size: 0.72rem;
  letter-spacing: 0.04em;
}

.score-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 999px;
  letter-spacing: 0.08em;
  font-size: 0.72rem;
  border: 1px solid transparent;
}

.score-pill-white {
  color: #2a1d13;
  background: linear-gradient(180deg, #f2e8d7, #d8c1a1);
  border-color: rgba(118, 84, 46, 0.45);
}

.score-pill-black {
  color: #eff5ff;
  background: linear-gradient(180deg, #5b6b82, #202633);
  border-color: rgba(208, 225, 255, 0.24);
}

.scoreboard-note {
  color: var(--color-text-secondary);
  font-size: 0.76rem;
  letter-spacing: 0.05em;
}

.player-card {
  display: grid;
  gap: 4px;
  padding: 10px;
}

.player-card.active {
  border-color: color-mix(in srgb, var(--color-accent) 62%, transparent);
  box-shadow: 0 10px 22px color-mix(in srgb, var(--color-accent) 20%, transparent);
}

.player-color {
  font-size: 0.68rem;
  color: var(--color-text-secondary);
  letter-spacing: 0.08em;
}

.player-name {
  color: var(--color-text-primary);
  letter-spacing: 0.05em;
}

.captured-tray {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  min-height: 20px;
  padding-top: 2px;
}

.captured-piece-chip {
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  overflow: hidden;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
}

.status-card {
  min-height: 76px;
  padding: 10px;
  color: var(--color-text-primary);
  text-transform: none;
  line-height: 1.34;
}

.chess-board-shell {
  display: grid;
  place-items: center;
  min-height: 0;
}

.chess-board {
  position: relative;
  width: min(92vw, 590px);
  aspect-ratio: 1;
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  grid-template-rows: repeat(8, minmax(0, 1fr));
  grid-auto-rows: minmax(0, 1fr);
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--color-accent) 45%, transparent);
  box-shadow: 0 20px 40px color-mix(in srgb, var(--color-accent) 22%, transparent);
}

.chess-board.locked {
  opacity: 0.9;
}

.chess-cell {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  border: none;
  margin: 0;
  padding: 0;
  display: grid;
  place-items: center;
  transition: filter 140ms ease;
}

.chess-cell:enabled {
  cursor: pointer;
}

.chess-cell:disabled {
  cursor: default;
}

.chess-cell.light {
  background: color-mix(in srgb, var(--color-bg-accent, var(--color-accent)) 82%, #ffffff 18%);
}

.chess-cell.dark {
  background: color-mix(in srgb, var(--color-bg-base) 92%, #000000 8%);
}

.chess-cell:hover:enabled {
  filter: brightness(1.08);
}

.chess-cell.selected {
  box-shadow: inset 0 0 0 999px color-mix(in srgb, var(--color-accent) 20%, transparent), inset 0 0 0 2px color-mix(in srgb, var(--color-accent) 72%, transparent);
}

.chess-cell.target {
  box-shadow: inset 0 0 0 999px color-mix(in srgb, var(--color-sidebar-dm-active) 12%, transparent), inset 0 0 0 2px color-mix(in srgb, var(--color-sidebar-dm-active) 72%, transparent);
}

.chess-cell.last-move {
  box-shadow: inset 0 0 0 999px color-mix(in srgb, var(--color-chat-warning) 20%, transparent);
}

.chess-cell.check-cell {
  box-shadow: inset 0 0 0 999px color-mix(in srgb, var(--color-danger) 25%, transparent);
}

.chess-piece {
  position: relative;
  z-index: 2;
  width: 84%;
  height: 84%;
  display: grid;
  place-items: center;
  overflow: visible;
  isolation: isolate;
  transform: translateZ(0);
}

.chess-piece-sprite {
  --sprite-x: 0%;
  --sprite-nudge-x: 0%;
  width: 100%;
  height: 100%;
  display: block;
  background-repeat: no-repeat;
  background-size: 600% 100%;
  background-position: calc(var(--sprite-x) + var(--sprite-nudge-x)) 50%;
  filter: drop-shadow(0 12px 14px rgba(0, 0, 0, 0.26));
  transition: filter 150ms ease, transform 150ms ease;
}

.chess-cell:hover:enabled .chess-piece-sprite {
  filter: brightness(1.08) saturate(1.12) drop-shadow(0 14px 16px rgba(0, 0, 0, 0.34));
  transform: translateY(-1px) scale(1.02);
}

.chess-cell.selected .chess-piece-sprite {
  filter: brightness(1.12) saturate(1.18) drop-shadow(0 15px 18px rgba(0, 0, 0, 0.38));
  transform: translateY(-1px) scale(1.04);
}

.sprite-color-w {
  background-image: v-bind(whiteSpriteSheet);
}

.sprite-color-b {
  background-image: v-bind(blackSpriteSheet);
}

.sprite-type-p {
  --sprite-x: 0%;
  --sprite-nudge-x: 4.5%;
}

.sprite-type-r {
  --sprite-x: 20%;
  --sprite-nudge-x: 2%;
}

.sprite-type-n {
  --sprite-x: 40%;
}

.sprite-type-b {
  --sprite-x: 60%;
}

.sprite-type-q {
  --sprite-x: 80%;
  --sprite-nudge-x: -2%;
}

.sprite-type-k {
  --sprite-x: 100%;
  --sprite-nudge-x: -3.5%;
}

.animated-piece {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 14;
  width: 86%;
  height: 86%;
  pointer-events: none;
  will-change: transform, opacity;
}

.piece-animation {
  position: absolute;
  inset: 0;
  z-index: 12;
  pointer-events: none;
}


.captured-piece {
  filter: drop-shadow(0 10px 14px rgba(0, 0, 0, 0.24));
}

.board-coordinate,
.board-file {
  position: absolute;
  z-index: 3;
  font-size: 0.6rem;
  color: color-mix(in srgb, var(--color-bg-base) 56%, black);
  opacity: 0.75;
  font-weight: 700;
}

.board-coordinate {
  top: 3px;
  left: 4px;
}

.board-file {
  right: 4px;
  bottom: 2px;
  text-transform: lowercase;
}

.chess-action-btn {
  border: 1px solid color-mix(in srgb, var(--color-accent) 42%, transparent);
  border-radius: 999px;
  padding: 8px 14px;
  background: color-mix(in srgb, var(--color-chat-surface) 64%, transparent);
  color: var(--color-text-primary);
  letter-spacing: 0.08em;
  font-size: 0.75rem;
  cursor: pointer;
  transition: transform 140ms ease, border-color 140ms ease;
}

.chess-action-btn:hover:enabled {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--color-accent) 68%, transparent);
}

.chess-action-btn:disabled {
  opacity: 0.7;
  cursor: default;
}

.chess-overlay {
  position: absolute;
  inset: 0;
  border-radius: 18px;
  background: color-mix(in srgb, var(--color-chat-overlay) 86%, transparent);
  backdrop-filter: blur(2px);
  display: grid;
  place-items: center;
  color: var(--color-text-primary);
  letter-spacing: 0.16em;
  font-size: 0.84rem;
}

@media (max-width: 860px) {
  .chess-main {
    grid-template-columns: 1fr;
  }

  .chess-sidebar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: stretch;
  }

  .status-card {
    grid-column: span 2;
  }

  .chess-action-btn.rematch {
    grid-column: span 2;
  }

  .scoreboard-card {
    grid-column: span 2;
  }
}

@media (max-width: 620px) {
  .chess-shell {
    padding: 12px;
  }

  .chess-header {
    grid-template-columns: 1fr;
    justify-items: start;
  }

  .chess-sidebar {
    grid-template-columns: 1fr;
  }

  .scoreboard-card,
  .status-card,
  .rematch {
    grid-column: span 1;
  }

  .chess-board {
    width: min(94vw, 520px);
  }
}
</style>
