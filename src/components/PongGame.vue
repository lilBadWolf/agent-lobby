<template>
  <div class="pong-game" role="application" aria-label="Pong game">
    <div class="pong-header">
      <span>🎮 PONG</span>
      <span class="pong-scoreboard" aria-live="polite">{{ scoreboardText }}</span>
      <button class="pong-action-btn close" type="button" @click="closeGame">
        EXIT
      </button>
    </div>

    <div
      class="pong-board"
      tabindex="0"
    >
      <div class="pong-status">{{ statusMessage }}</div>
      <div v-if="showCountdownOverlay" class="pong-countdown-overlay">
        <div class="pong-countdown-card">
          <div class="pong-countdown-subtitle">GET READY</div>
          <div class="pong-countdown-value">{{ countdownLabel }}</div>
        </div>
      </div>
      <div v-if="showWaitingOverlay" class="pong-wait-overlay">
        WAITING FOR OPPONENT TO ACCEPT
      </div>
      <div v-else-if="pausedDueToFocusLoss" class="pong-pause-overlay">
        PAUSED — RETURN FOCUS TO RESUME
      </div>
      <div
        class="pong-paddle pong-top-paddle"
        :style="{
          left: `${(remotePaddleX / boardWidth) * 100}%`,
          width: `${(paddleWidth / boardWidth) * 100}%`
        }"
      >
        {{ peerName }}
      </div>
      <div
        class="pong-ball"
        :style="{
          left: `${(renderBallX / boardWidth) * 100}%`,
          top: `${(renderBallY / boardHeight) * 100}%`,
          width: `${(ballSize / boardWidth) * 100}%`,
          height: `${(ballSize / boardHeight) * 100}%`
        }"
      />
      <div
        class="pong-paddle pong-bottom-paddle"
        :style="{
          left: `${(localPaddleX / boardWidth) * 100}%`,
          width: `${(paddleWidth / boardWidth) * 100}%`
        }"
      >
        {{ user }}
      </div>
    </div>

    <div class="pong-helper-text">
      Use ← → keys to move. The other user's paddle is shown at the top.
    </div>
  </div>
</template>

<script lang="ts">
export default {};
</script>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';

const props = defineProps<{
  user: string;
  peerName: string;
  dataChannel: RTCDataChannel | null;
  startSignal: number;
  isInitiator?: boolean;
  waitingForAcceptance?: boolean;
  autoTrackBall?: boolean;
}>();

const emit = defineEmits<{ close: [] }>();

const boardWidth = 360;
const boardHeight = 220;
const paddleWidth = 84;
const ballSize = 12;

const localPaddleX = ref((boardWidth - paddleWidth) / 2);
const remotePaddleX = ref((boardWidth - paddleWidth) / 2);
const ballX = ref((boardWidth - ballSize) / 2);
const ballY = ref((boardHeight - ballSize) / 2);
const renderBallX = ref((boardWidth - ballSize) / 2);
const renderBallY = ref((boardHeight - ballSize) / 2);
const ballVelX = ref(120);
const ballVelY = ref(140);
const isRunning = ref(false);
const statusMessage = ref('Waiting for direct line...');
const authority = ref<'local' | 'remote' | null>(null);
const pausedDueToFocusLoss = ref(false);
const rafId = ref<number | null>(null);
const lastTick = ref(performance.now());
const lastPaddleSentAt = ref(0);
const audioContext = ref<AudioContext | null>(null);
const isAudioUnlocked = ref(false);
const dataChannelReady = ref(false);
let currentChannel: RTCDataChannel | null = null;
let channelMessageListener: ((event: MessageEvent) => void) | null = null;
let channelOpenListener: ((event: Event) => void) | null = null;
let channelCloseListener: ((event: Event) => void) | null = null;

const canSend = computed(() => dataChannelReady.value);
const showWaitingOverlay = computed(() => props.waitingForAcceptance && !isRunning.value);
const roundPhase = ref<'idle' | 'countdown' | 'playing' | 'waiting' | 'paused'>('idle');
const countdownValue = ref(0);
const countdownTimerId = ref<number | null>(null);
const readyPulseTimerId = ref<number | null>(null);
const localScore = ref(0);
const remoteScore = ref(0);
const pendingStartFromRemote = ref(false);
const paddleDirection = ref<'left' | 'right' | null>(null);
const paddleSpeed = 420;
const pendingStartWhenReady = ref(false);
const peerReady = ref(false);
const remoteBallReceivedAt = ref(performance.now());
const remoteBallSequence = ref(-1);
const outgoingBallSequence = ref(0);
const lastPongMessageSignature = ref('');
const lastPongMessageAt = ref(0);

type PongBridgeEventDetail = {
  from?: string;
  data?: any;
};

const showCountdownOverlay = computed(() => roundPhase.value === 'countdown');
const countdownLabel = computed(() => countdownValue.value > 0 ? countdownValue.value.toString() : 'GO!');
const scoreboardText = computed(
  () => `${props.user} ${localScore.value} — ${remoteScore.value} ${props.peerName}`
);

watch(
  () => props.waitingForAcceptance,
  (waiting) => {
    if (waiting) {
      statusMessage.value = 'Waiting for opponent to accept PONG';
    } else if (!isRunning.value && props.startSignal <= 0 && roundPhase.value === 'idle') {
      statusMessage.value = 'Ready for PONG';
    }
  },
  { immediate: true }
);

function getAudioContext(): AudioContext | null {
  if (audioContext.value) {
    return audioContext.value;
  }

  const Constructor = (window as any).AudioContext || (window as any).webkitAudioContext;

  if (!Constructor) {
    return null;
  }

  audioContext.value = new Constructor();
  return audioContext.value;
}

function unlockAudioContext() {
  const context = getAudioContext();
  if (!context) {
    return;
  }

  if (context.state === 'suspended') {
    void context.resume().then(() => {
      isAudioUnlocked.value = true;
    }).catch(() => {
      // Ignore failed unlock attempts
    });
    return;
  }

  isAudioUnlocked.value = true;
}

function playTone(freq: number, duration = 0.05, type: OscillatorType = 'square') {
  const context = getAudioContext();
  if (!context) {
    return;
  }

  if (context.state === 'suspended') {
    unlockAudioContext();
    return;
  }

  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(context.destination);
  const now = context.currentTime;
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

function playPongHit() {
  playTone(440 + Math.random() * 120, 0.045, 'square');
}

function playPongBounce() {
  playTone(280 + Math.random() * 70, 0.04, 'triangle');
}

function playPongGameOver() {
  syncRenderedBallPosition();
  playTone(120, 0.14, 'sine');
}

function clampPaddleX(x: number) {
  return Math.max(0, Math.min(x, boardWidth - paddleWidth));
}

function clampBallX(x: number) {
  return Math.max(0, Math.min(x, boardWidth - ballSize));
}

function clampBallY(y: number) {
  return Math.max(0, Math.min(y, boardHeight - ballSize));
}

function getRenderedBallY() {
  if (authority.value === 'local') {
    return clampBallY(ballY.value);
  }

  return clampBallY(boardHeight - ballSize - ballY.value);
}

function syncRenderedBallPosition() {
  renderBallX.value = clampBallX(ballX.value);
  renderBallY.value = getRenderedBallY();
}

function sendPongMessage(message: Record<string, unknown>) {
  if (!currentChannel || currentChannel.readyState !== 'open') {
    return;
  }

  try {
    if (typeof message.type === 'string' && message.type.startsWith('pong-')) {
      console.log('[pong] sending message', {
        type: message.type,
        isInitiator: props.isInitiator,
        user: props.user,
        peerName: props.peerName,
        channelState: currentChannel.readyState,
        channelId: currentChannel.id
      });
    }
    currentChannel.send(JSON.stringify(message));
  } catch {
    // swallow non-fatal send failures
  }
}

function sendPaddleUpdate(force = false) {
  if (!canSend.value) {
    return;
  }

  const now = performance.now();
  if (!force && now - lastPaddleSentAt.value < 33) {
    return;
  }

  if (force && now - lastPaddleSentAt.value < 33) {
    return;
  }

  lastPaddleSentAt.value = now;
  sendPongMessage({ type: 'pong-paddle', x: localPaddleX.value });
}

function sendStartMessage() {
  if (!canSend.value) {
    return;
  }

  authority.value = 'local';
  outgoingBallSequence.value = 0;
  resetBallState();
  sendPongMessage({
    type: 'pong-start',
    authority: props.user,
    ballX: ballX.value,
    ballY: ballY.value,
    velX: ballVelX.value,
    velY: ballVelY.value,
    seq: outgoingBallSequence.value,
    paddleX: localPaddleX.value
  });
}

function sendReadyMessage() {
  if (props.isInitiator) {
    return;
  }

  if (!canSend.value) {
    return;
  }

  sendPongMessage({
    type: 'pong-ready',
    user: props.user,
  });
  console.log('[pong] sent pong-ready', { isInitiator: props.isInitiator, user: props.user });
}

function sendScoreUpdate(winner: 'local' | 'remote') {
  if (!canSend.value) {
    return;
  }

  sendPongMessage({
    type: 'pong-score',
    scorer: winner === 'local' ? props.user : props.peerName,
  });
}

function sendBallUpdate() {
  if (!canSend.value || authority.value !== 'local') {
    return;
  }

  outgoingBallSequence.value += 1;
  sendPongMessage({
    type: 'pong-state',
    ballX: ballX.value,
    ballY: ballY.value,
    velX: ballVelX.value,
    velY: ballVelY.value,
    seq: outgoingBallSequence.value,
    paddleX: localPaddleX.value
  });
}

function resetBallState() {
  ballX.value = (boardWidth - ballSize) / 2;
  ballY.value = (boardHeight - ballSize) / 2;
  syncRenderedBallPosition();
  ballVelX.value = 120;
  ballVelY.value = 140;
  remoteBallReceivedAt.value = performance.now();
}

function clearCountdownTimer() {
  if (countdownTimerId.value !== null) {
    clearTimeout(countdownTimerId.value);
    countdownTimerId.value = null;
  }
}

function clearReadyPulseTimer() {
  if (readyPulseTimerId.value !== null) {
    clearInterval(readyPulseTimerId.value);
    readyPulseTimerId.value = null;
  }
}

function startReadyPulse() {
  if (props.isInitiator) {
    return;
  }

  if (readyPulseTimerId.value !== null) {
    return;
  }

  readyPulseTimerId.value = window.setInterval(() => {
    if (!canSend.value || isRunning.value || roundPhase.value === 'playing' || roundPhase.value === 'countdown') {
      clearReadyPulseTimer();
      return;
    }

    sendReadyMessage();
    console.log('[pong] pulse tick', { isInitiator: props.isInitiator, peerReady: peerReady.value });
  }, 400);
}

function clearAnimationFrame() {
  if (rafId.value !== null) {
    cancelAnimationFrame(rafId.value);
    rafId.value = null;
  }
}

function beginPlay() {
  clearCountdownTimer();
  clearReadyPulseTimer();
  roundPhase.value = 'playing';
  isRunning.value = true;
  statusMessage.value = '';
  scheduleFrame();
}

function scheduleCountdownTick() {
  countdownTimerId.value = window.setTimeout(() => {
    if (countdownValue.value > 1) {
      countdownValue.value -= 1;
      playTone(520 + countdownValue.value * 40, 0.08, 'triangle');
      scheduleCountdownTick();
      return;
    }

    countdownValue.value = 0;
    playTone(880, 0.12, 'sawtooth');
    beginPlay();
  }, 900);
}

function startCountdown(isRemoteStart = false) {
  clearCountdownTimer();
  clearAnimationFrame();
  isRunning.value = false;
  roundPhase.value = 'countdown';
  countdownValue.value = 3;
  pendingStartFromRemote.value = isRemoteStart;
  statusMessage.value = isRemoteStart ? 'Opponent has started PONG' : 'PONG starting';
  playTone(660, 0.08, 'triangle');
  scheduleCountdownTick();
}

function prepareNextRound(message: string, winner: 'local' | 'remote') {
  if (winner === 'local') {
    localScore.value += 1;
  } else {
    remoteScore.value += 1;
  }

  sendScoreUpdate(winner);

  isRunning.value = false;
  statusMessage.value = message;
  roundPhase.value = authority.value === 'local' ? 'countdown' : 'waiting';
  resetBallState();

  clearAnimationFrame();

  if (authority.value === 'local') {
    startCountdown(false);
    sendStartMessage();
  } else {
    statusMessage.value = 'Waiting for opponent to restart PONG';
  }
}

function startGame() {
  if (!canSend.value) {
    pendingStartWhenReady.value = true;
    statusMessage.value = 'Waiting for direct line to start PONG...';
    console.log('[pong] startGame: no channel yet', { isInitiator: props.isInitiator });
    return;
  }

  if (!props.isInitiator) {
    pendingStartWhenReady.value = true;
    authority.value = 'remote';
    roundPhase.value = 'waiting';
    statusMessage.value = 'Waiting for opponent to start PONG';
    startReadyPulse();
    console.log('[pong] startGame: non-initiator waiting, pulse started');
    return;
  }

  if (!peerReady.value) {
    pendingStartWhenReady.value = true;
    statusMessage.value = 'Waiting for opponent to get ready...';
    console.log('[pong] startGame: initiator waiting for peerReady');
    return;
  }

  pendingStartWhenReady.value = false;
  clearReadyPulseTimer();

  if (roundPhase.value === 'countdown' || roundPhase.value === 'playing') {
    return;
  }

  unlockAudioContext();

  if (props.isInitiator) {
    authority.value = 'local';
    sendStartMessage();
    startCountdown(false);
    console.log('[pong] startGame: initiator sending pong-start, countdown begun');
  } else {
    authority.value = 'remote';
  }
}

function stopGame(message: string) {
  if (isRunning.value) {
    isRunning.value = false;
    statusMessage.value = message;
    clearAnimationFrame();
  }
}

function pauseForFocusLoss() {
  if (isRunning.value) {
    pausedDueToFocusLoss.value = true;
    isRunning.value = false;
    statusMessage.value = 'Paused — window lost focus';
    clearAnimationFrame();
  }
}

function resumeAfterFocusGain() {
  if (pausedDueToFocusLoss.value) {
    pausedDueToFocusLoss.value = false;
    statusMessage.value = 'PONG resumed';

    if (!authority.value) {
      startGame();
      return;
    }

    isRunning.value = true;
    scheduleFrame();
  }
}

function closeGame() {
  stopGame('PONG closed');
  emit('close');
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
    return;
  }

  const newDirection = event.key === 'ArrowLeft' ? 'left' : 'right';
  if (paddleDirection.value !== newDirection) {
    paddleDirection.value = newDirection;
  }

  event.preventDefault();
}

function handleKeyup(event: KeyboardEvent) {
  if (event.key === 'ArrowLeft' && paddleDirection.value === 'left') {
    paddleDirection.value = null;
  } else if (event.key === 'ArrowRight' && paddleDirection.value === 'right') {
    paddleDirection.value = null;
  }
}

function updateRemotePaddle(x: number) {
  remotePaddleX.value = clampPaddleX(x);
}

function updateBallFromMessage(data: any) {
  if (
    typeof data.ballX !== 'number' ||
    typeof data.ballY !== 'number' ||
    typeof data.velX !== 'number' ||
    typeof data.velY !== 'number'
  ) {
    return;
  }

  ballX.value = clampBallX(data.ballX);
  ballY.value = clampBallY(data.ballY);
  ballVelX.value = data.velX;
  ballVelY.value = data.velY;
  syncRenderedBallPosition();
  remoteBallReceivedAt.value = performance.now();
}

function usersMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  const normalizedLeft = left?.trim().toLowerCase();
  const normalizedRight = right?.trim().toLowerCase();
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  return normalizedLeft === normalizedRight;
}

function isDuplicatePongMessage(data: any): boolean {
  const signature = JSON.stringify({
    type: data?.type,
    seq: data?.seq,
    x: data?.x,
    paddleX: data?.paddleX,
    scorer: data?.scorer,
    authority: data?.authority,
    ballX: data?.ballX,
    ballY: data?.ballY,
    velX: data?.velX,
    velY: data?.velY,
    user: data?.user,
  });
  const now = performance.now();

  if (signature === lastPongMessageSignature.value && now - lastPongMessageAt.value < 40) {
    return true;
  }

  lastPongMessageSignature.value = signature;
  lastPongMessageAt.value = now;
  return false;
}

function handlePongDataMessage(data: any, source: 'channel' | 'bridge') {
  if (!data?.type?.startsWith('pong-')) {
    return;
  }

  if (isDuplicatePongMessage(data)) {
    return;
  }

  console.log('[pong] received message', {
    source,
    type: data.type,
    isInitiator: props.isInitiator,
    user: props.user,
    peerName: props.peerName,
    pendingStart: pendingStartWhenReady.value,
    startSignal: props.startSignal,
    canSend: canSend.value,
    roundPhase: roundPhase.value
  });

  if (data.type === 'pong-paddle' && typeof data.x === 'number') {
    updateRemotePaddle(data.x);
    return;
  }

  if (data.type === 'pong-score') {
    if (data.scorer === props.user) {
      localScore.value += 1;
    } else if (data.scorer === props.peerName) {
      remoteScore.value += 1;
    }

    return;
  }

  if (data.type === 'pong-ready') {
    peerReady.value = true;

    if (props.isInitiator) {
      clearReadyPulseTimer();
    }

    console.log('[pong] received pong-ready', { isInitiator: props.isInitiator, pendingStart: pendingStartWhenReady.value, startSignal: props.startSignal, canSend: canSend.value, source });

    if (props.isInitiator && pendingStartWhenReady.value && !isRunning.value && props.startSignal > 0 && canSend.value) {
      startGame();
    }

    return;
  }

  if (data.type === 'pong-start') {
    console.log('[pong] received pong-start', { authority: data.authority, isInitiator: props.isInitiator, source });
    authority.value = data.authority === props.user ? 'local' : 'remote';
    if (typeof data.seq === 'number' && Number.isFinite(data.seq)) {
      remoteBallSequence.value = data.seq;
    } else {
      remoteBallSequence.value = 0;
    }
    updateBallFromMessage(data);
    if (typeof data.paddleX === 'number') {
      updateRemotePaddle(data.paddleX);
    }
    if (roundPhase.value !== 'countdown') {
      startCountdown(true);
    }
    return;
  }

  if (data.type === 'pong-state') {
    if (authority.value === 'local') {
      return;
    }

    if (typeof data.seq === 'number' && Number.isFinite(data.seq)) {
      if (data.seq <= remoteBallSequence.value) {
        return;
      }
      remoteBallSequence.value = data.seq;
    }

    if (!isRunning.value) {
      roundPhase.value = 'playing';
      isRunning.value = true;
      statusMessage.value = '';
      scheduleFrame();
    }

    updateBallFromMessage(data);
    if (typeof data.paddleX === 'number') {
      updateRemotePaddle(data.paddleX);
    }
    return;
  }
}

function handleBridgePongMessage(event: Event) {
  const bridgeEvent = event as CustomEvent<PongBridgeEventDetail>;
  const fromUser = bridgeEvent.detail?.from;
  const data = bridgeEvent.detail?.data;
  if (!usersMatch(fromUser, props.peerName)) {
    return;
  }

  handlePongDataMessage(data, 'bridge');
}

function handleIncomingMessage(event: MessageEvent) {
  if (!event.data) {
    return;
  }

  if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
    return;
  }

  let data: any;
  try {
    data = JSON.parse(event.data);
  } catch {
    return;
  }

  handlePongDataMessage(data, 'channel');
}

function attachDataChannelListener(channel: RTCDataChannel | null) {
  detachDataChannelListener();

  currentChannel = channel;
  dataChannelReady.value = Boolean(currentChannel && currentChannel.readyState === 'open');
  console.log('[pong] attachDataChannelListener', {
    isInitiator: props.isInitiator,
    user: props.user,
    peerName: props.peerName,
    hasChannel: Boolean(currentChannel),
    channelState: currentChannel?.readyState ?? 'none',
    channelId: currentChannel?.id ?? null
  });
  if (!currentChannel) {
    return;
  }

  const boundChannel = currentChannel;

  channelMessageListener = (event) => {
    if (typeof event.data === 'string' && event.data.includes('pong-')) {
      console.log('[pong] channel onmessage event', {
        isInitiator: props.isInitiator,
        user: props.user,
        peerName: props.peerName,
        readyState: boundChannel.readyState,
        payloadPreview: event.data.slice(0, 160)
      });
    }

    handleIncomingMessage(event);
  };
  channelOpenListener = () => {
    dataChannelReady.value = true;
    sendReadyMessage();
    startReadyPulse();
    console.log('[pong] data channel opened', { isInitiator: props.isInitiator, user: props.user, channelId: boundChannel.id });
  };
  channelCloseListener = () => {
    dataChannelReady.value = false;
    clearReadyPulseTimer();
  };

  boundChannel.addEventListener('message', channelMessageListener as EventListener);
  boundChannel.addEventListener('open', channelOpenListener as EventListener);
  boundChannel.addEventListener('close', channelCloseListener as EventListener);

  if (boundChannel.readyState === 'open') {
    if (!props.isInitiator) {
      sendReadyMessage();
      startReadyPulse();
    }
  }
}

function handleVisibilityChange() {
  if (document.visibilityState !== 'visible') {
    pauseForFocusLoss();
  } else {
    resumeAfterFocusGain();
  }
}

function detachDataChannelListener() {
  if (currentChannel) {
    if (channelMessageListener) {
      currentChannel.removeEventListener('message', channelMessageListener as EventListener);
    }
    if (channelOpenListener) {
      currentChannel.removeEventListener('open', channelOpenListener as EventListener);
    }
    if (channelCloseListener) {
      currentChannel.removeEventListener('close', channelCloseListener as EventListener);
    }
  }

  currentChannel = null;
  dataChannelReady.value = false;
  channelMessageListener = null;
  channelOpenListener = null;
  channelCloseListener = null;
}

function scheduleFrame() {
  if (rafId.value !== null) {
    return;
  }

  lastTick.value = performance.now();
  rafId.value = requestAnimationFrame(frame);
}

function frame(now: number) {
  if (!isRunning.value) {
    rafId.value = null;
    return;
  }

  const delta = Math.min(0.05, (now - lastTick.value) / 1000);
  lastTick.value = now;

  if (props.autoTrackBall) {
    const targetX = clampPaddleX(ballX.value + ballSize / 2 - paddleWidth / 2);
    if (Math.abs(targetX - localPaddleX.value) > 0.1) {
      localPaddleX.value = targetX;
      sendPaddleUpdate();
    }
  }

  if (!props.autoTrackBall && paddleDirection.value) {
    const proposedX = clampPaddleX(localPaddleX.value + (paddleDirection.value === 'left' ? -paddleSpeed : paddleSpeed) * delta);
    if (proposedX !== localPaddleX.value) {
      localPaddleX.value = proposedX;
      sendPaddleUpdate();
    }
  }

  // Periodically send absolute paddle position even while stationary,
  // so both peers stay aligned when packets are dropped.
  sendPaddleUpdate(true);

  if (authority.value !== 'local') {
    rafId.value = requestAnimationFrame(frame);
    return;
  }

  ballX.value += ballVelX.value * delta;
  ballY.value += ballVelY.value * delta;

  if (ballX.value <= 0 || ballX.value >= boardWidth - ballSize) {
    ballX.value = clampBallX(ballX.value);
    ballVelX.value = -ballVelX.value;
    playPongBounce();
  }

  if (ballY.value <= 0) {
    if (authority.value === 'local') {
      if (ballX.value + ballSize >= remotePaddleX.value && ballX.value <= remotePaddleX.value + paddleWidth) {
        ballY.value = 0;
        ballVelY.value = Math.abs(ballVelY.value);
        playPongHit();
      } else {
        playPongGameOver();
        prepareNextRound('Point for you', 'local');
        return;
      }
    } else {
      ballY.value = 0;
      ballVelY.value = Math.abs(ballVelY.value);
    }
  }

  if (ballY.value >= boardHeight - ballSize) {
    if (authority.value === 'local') {
      if (ballX.value + ballSize >= localPaddleX.value && ballX.value <= localPaddleX.value + paddleWidth) {
        ballY.value = boardHeight - ballSize;
        ballVelY.value = -Math.abs(ballVelY.value);
        playPongHit();
      } else {
        playPongGameOver();
        prepareNextRound('Opponent scored', 'remote');
        return;
      }
    } else {
      ballY.value = boardHeight - ballSize;
      ballVelY.value = -Math.abs(ballVelY.value);
    }
  }

  syncRenderedBallPosition();
  sendBallUpdate();
  rafId.value = requestAnimationFrame(frame);
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
    if (signal > 0 && !isRunning.value) {
      startGame();
    }
  },
  { immediate: true }
);

watch(
  canSend,
  (isOpen) => {
    if (isOpen && pendingStartWhenReady.value && !isRunning.value) {
      startGame();
    }
  }
);

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('keyup', handleKeyup);
  window.addEventListener('blur', pauseForFocusLoss);
  window.addEventListener('focus', resumeAfterFocusGain);
  window.addEventListener('dm-pong-message', handleBridgePongMessage as EventListener);
  document.addEventListener('visibilitychange', handleVisibilityChange);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('keyup', handleKeyup);
  window.removeEventListener('blur', pauseForFocusLoss);
  window.removeEventListener('focus', resumeAfterFocusGain);
  window.removeEventListener('dm-pong-message', handleBridgePongMessage as EventListener);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  detachDataChannelListener();
  clearAnimationFrame();
  clearCountdownTimer();
  clearReadyPulseTimer();
});
</script>

<style scoped>
.pong-game {
  flex: 1;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-accent);
  background: radial-gradient(circle at top, var(--color-accent-muted), var(--color-bg-base));
  padding: 12px;
  border-radius: 10px;
  margin: 0;
  color: var(--color-text-primary);
  min-height: 0;
  font-family: 'Courier New', Courier, monospace;
  box-shadow: 0 0 20px var(--color-accent-muted);
}

.pong-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
  text-transform: uppercase;
  letter-spacing: 0.22em;
  font-size: 12px;
}

.pong-action-btn {
  border: 1px solid var(--color-accent);
  background: var(--color-chat-surface);
  color: var(--color-text-primary);
  padding: 8px 12px;
  text-transform: uppercase;
  font-size: 11px;
  cursor: pointer;
  border-radius: 4px;
  box-shadow: inset 0 0 10px var(--color-accent-muted);
}

.pong-action-btn.secondary {
  border-color: var(--color-accent-muted);
  color: var(--color-text-secondary);
}

.pong-action-btn:hover {
  background: var(--color-accent);
  color: var(--color-on-accent);
}

.pong-scoreboard {
  flex: 1;
  text-align: center;
  color: var(--color-text-primary);
  font-size: 11px;
  letter-spacing: 0.16em;
}

.pong-countdown-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-chat-overlay);
  z-index: 4;
  pointer-events: none;
}

.pong-countdown-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 18px 22px;
  border: 1px solid var(--color-accent);
  background: var(--color-chat-surface-strong);
  border-radius: 18px;
  box-shadow: 0 0 30px var(--color-accent-muted);
}

.pong-countdown-subtitle {
  font-size: 11px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-text-secondary);
}

.pong-countdown-value {
  font-size: 64px;
  line-height: 1;
  color: var(--color-accent);
  text-shadow: 0 0 24px var(--color-accent-muted);
}

.pong-board {
  position: relative;
  width: 100%;
  height: 100%;
  background: radial-gradient(circle at 20% 20%, var(--color-accent-muted), var(--color-chat-bg));
  border: 1px solid var(--color-accent-muted);
  border-radius: 10px;
  margin: 0;
  overflow: hidden;
  touch-action: none;
  flex: 1;
  box-shadow: inset 0 0 60px var(--color-accent-muted);
}

.pong-board::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: linear-gradient(var(--color-accent-muted) 1px, transparent 1px), linear-gradient(90deg, var(--color-accent-muted) 1px, transparent 1px);
  background-size: 100% 18px, 18px 100%;
  pointer-events: none;
  animation: pong-scanline 8s infinite linear;
}

@keyframes pong-scanline {
  0%, 100% { transform: translateY(0); opacity: 0.15; }
  50% { transform: translateY(6px); opacity: 0.08; }
}

.pong-status {
  position: absolute;
  inset: 8px 10px auto;
  color: var(--color-text-primary);
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  z-index: 2;
  text-shadow: 0 0 14px var(--color-accent-muted);
}

.pong-pause-overlay,
.pong-wait-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-chat-overlay);
  color: var(--color-on-accent);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 12px;
  font-weight: bold;
  z-index: 3;
  pointer-events: none;
}

.pong-paddle {
  position: absolute;
  width: 84px;
  height: 12px;
  background: var(--color-accent-muted);
  border: 1px solid var(--color-accent);
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  color: var(--color-text-primary);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  text-shadow: 0 0 5px var(--color-accent-muted);
}

.pong-top-paddle {
  top: 10px;
}

.pong-bottom-paddle {
  bottom: 10px;
}

.pong-ball {
  position: absolute;
  background: radial-gradient(circle, var(--color-text-primary) 0%, var(--color-accent) 40%, var(--color-bg-base) 100%);
  border-radius: 50%;
  box-shadow: 0 0 14px var(--color-accent-muted);
}

.pong-helper-text {
  font-size: 11px;
  color: var(--color-text-secondary);
  text-align: center;
  margin-top: 6px;
  letter-spacing: 0.08em;
}
</style>
