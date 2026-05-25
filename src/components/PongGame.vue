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
}>();

const emit = defineEmits<{ close: [] }>();

const boardWidth = 360;
const boardHeight = 220;
const paddleWidth = 84;
const ballSize = 12;

const localPaddleX = ref((boardWidth - paddleWidth) / 2);
const remotePaddleX = ref((boardWidth - paddleWidth) / 2);
const remotePaddleTargetX = ref((boardWidth - paddleWidth) / 2);
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
const lastStateSentAt = ref(0);
const audioContext = ref<AudioContext | null>(null);
const isAudioUnlocked = ref(false);
let currentChannel: RTCDataChannel | null = null;
let dataChannelListener: ((event: MessageEvent) => void) | null = null;

const canSend = computed(() => props.dataChannel?.readyState === 'open');
const showWaitingOverlay = computed(() => props.waitingForAcceptance && !isRunning.value);
const roundPhase = ref<'idle' | 'countdown' | 'playing' | 'waiting' | 'paused'>('idle');
const countdownValue = ref(0);
const countdownTimerId = ref<number | null>(null);
const localScore = ref(0);
const remoteScore = ref(0);
const pendingStartFromRemote = ref(false);
const paddleDirection = ref<'left' | 'right' | null>(null);
const paddleSpeed = 420;
const pendingStartWhenReady = ref(false);
const remoteBallReceivedAt = ref(performance.now());
const remoteBallSequence = ref(-1);
const outgoingBallSequence = ref(0);
const paddleLerpSpeed = 18;
const ballLerpSpeed = 16;

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
    } else if (!isRunning.value) {
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

function sendPongMessage(message: Record<string, unknown>) {
  if (!props.dataChannel || props.dataChannel.readyState !== 'open') {
    return;
  }

  try {
    props.dataChannel.send(JSON.stringify(message));
  } catch {
    // swallow non-fatal send failures
  }
}

function sendPaddleUpdate() {
  if (!canSend.value) {
    return;
  }

  const now = performance.now();
  if (now - lastPaddleSentAt.value < 33) {
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

function sendBallUpdate() {
  if (!canSend.value || authority.value !== 'local') {
    return;
  }

  const now = performance.now();
  if (now - lastStateSentAt.value < 33) {
    return;
  }

  lastStateSentAt.value = now;
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
  renderBallX.value = ballX.value;
  renderBallY.value = ballY.value;
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

function beginPlay() {
  clearCountdownTimer();
  roundPhase.value = 'playing';
  isRunning.value = true;
  statusMessage.value = 'PONG started';
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

  isRunning.value = false;
  statusMessage.value = message;
  roundPhase.value = authority.value === 'local' ? 'countdown' : 'waiting';
  resetBallState();

  if (rafId.value !== null) {
    cancelAnimationFrame(rafId.value);
    rafId.value = null;
  }

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
    return;
  }

  pendingStartWhenReady.value = false;

  if (roundPhase.value === 'countdown' || roundPhase.value === 'playing') {
    return;
  }

  unlockAudioContext();

  if (props.isInitiator) {
    authority.value = 'local';
    startCountdown(false);
    sendStartMessage();
  } else {
    authority.value = 'remote';
    roundPhase.value = 'waiting';
    statusMessage.value = 'Waiting for opponent to start PONG';
  }
}

function stopGame(message: string) {
  if (isRunning.value) {
    isRunning.value = false;
    statusMessage.value = message;
    if (rafId.value !== null) {
      cancelAnimationFrame(rafId.value);
      rafId.value = null;
    }
  }
}

function pauseForFocusLoss() {
  if (isRunning.value) {
    pausedDueToFocusLoss.value = true;
    isRunning.value = false;
    statusMessage.value = 'Paused — window lost focus';
    if (rafId.value !== null) {
      cancelAnimationFrame(rafId.value);
      rafId.value = null;
    }
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
  remotePaddleTargetX.value = clampPaddleX(x);

  // Snap quickly after round transitions, then smooth in-frame.
  if (Math.abs(remotePaddleTargetX.value - remotePaddleX.value) > paddleWidth) {
    remotePaddleX.value = remotePaddleTargetX.value;
  }
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
  remoteBallReceivedAt.value = performance.now();
}

function smoothPaddles(delta: number) {
  const factor = Math.min(1, delta * paddleLerpSpeed);
  remotePaddleX.value += (remotePaddleTargetX.value - remotePaddleX.value) * factor;
}

function advanceRemoteBallPrediction(delta: number) {
  ballX.value += ballVelX.value * delta;
  ballY.value += ballVelY.value * delta;

  if (ballX.value <= 0 || ballX.value >= boardWidth - ballSize) {
    ballX.value = clampBallX(ballX.value);
    ballVelX.value = -ballVelX.value;
  }

  if (ballY.value <= 0 || ballY.value >= boardHeight - ballSize) {
    ballY.value = clampBallY(ballY.value);
    ballVelY.value = -ballVelY.value;
  }
}

function smoothRemoteBallRender(delta: number) {
  const factor = Math.min(1, delta * ballLerpSpeed);
  renderBallX.value += (ballX.value - renderBallX.value) * factor;
  renderBallY.value += (ballY.value - renderBallY.value) * factor;
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

  if (!data?.type?.startsWith('pong-')) {
    return;
  }

  if (data.type === 'pong-paddle' && typeof data.x === 'number') {
    updateRemotePaddle(data.x);
    return;
  }

  if (data.type === 'pong-start') {
    authority.value = data.authority === props.user ? 'local' : 'remote';
    if (typeof data.seq === 'number' && Number.isFinite(data.seq)) {
      remoteBallSequence.value = data.seq;
    } else {
      remoteBallSequence.value = 0;
    }
    updateBallFromMessage(data);
    renderBallX.value = ballX.value;
    renderBallY.value = ballY.value;
    if (typeof data.paddleX === 'number') {
      updateRemotePaddle(data.paddleX);
    }
    if (!isRunning.value && roundPhase.value !== 'playing') {
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
      statusMessage.value = 'PONG started';
      scheduleFrame();
    }

    updateBallFromMessage(data);
    if (typeof data.paddleX === 'number') {
      updateRemotePaddle(data.paddleX);
    }
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

function handleVisibilityChange() {
  if (document.visibilityState !== 'visible') {
    pauseForFocusLoss();
  } else {
    resumeAfterFocusGain();
  }
}

function detachDataChannelListener() {
  if (currentChannel && dataChannelListener) {
    currentChannel.removeEventListener('message', dataChannelListener);
  }
  currentChannel = null;
  dataChannelListener = null;
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

  smoothPaddles(delta);

  if (paddleDirection.value) {
    const proposedX = clampPaddleX(localPaddleX.value + (paddleDirection.value === 'left' ? -paddleSpeed : paddleSpeed) * delta);
    if (proposedX !== localPaddleX.value) {
      localPaddleX.value = proposedX;
      sendPaddleUpdate();
    }
  }

  if (authority.value !== 'local') {
    advanceRemoteBallPrediction(delta);
    smoothRemoteBallRender(delta);
    rafId.value = requestAnimationFrame(frame);
    return;
  }

  ballX.value += ballVelX.value * delta;
  ballY.value += ballVelY.value * delta;
  renderBallX.value = ballX.value;
  renderBallY.value = ballY.value;

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
  }
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
  document.addEventListener('visibilitychange', handleVisibilityChange);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('keyup', handleKeyup);
  window.removeEventListener('blur', pauseForFocusLoss);
  window.removeEventListener('focus', resumeAfterFocusGain);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  detachDataChannelListener();
  if (rafId.value !== null) {
    cancelAnimationFrame(rafId.value);
  }
  clearCountdownTimer();
});
</script>

<style scoped>
.pong-game {
  flex: 1;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  border: 1px solid #4cff7a;
  background: radial-gradient(circle at top, rgba(10, 50, 15, 0.9), rgba(0, 0, 0, 0.95));
  padding: 12px;
  border-radius: 10px;
  margin: 0;
  color: #8cff8c;
  min-height: 0;
  font-family: 'Courier New', Courier, monospace;
  box-shadow: 0 0 20px rgba(0, 255, 0, 0.15);
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
  border: 1px solid rgba(82, 255, 87, 0.8);
  background: rgba(0, 0, 0, 0.45);
  color: #b8ffb8;
  padding: 8px 12px;
  text-transform: uppercase;
  font-size: 11px;
  cursor: pointer;
  border-radius: 4px;
  box-shadow: inset 0 0 10px rgba(0, 255, 0, 0.18);
}

.pong-action-btn.secondary {
  border-color: rgba(120, 255, 140, 0.6);
  color: #a5ffad;
}

.pong-action-btn:hover {
  background: var(--color-accent);
  color: var(--color-on-accent);
}

.pong-scoreboard {
  flex: 1;
  text-align: center;
  color: #d7ffe8;
  font-size: 11px;
  letter-spacing: 0.16em;
}

.pong-countdown-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
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
  border: 1px solid rgba(102, 255, 146, 0.75);
  background: rgba(0, 12, 0, 0.9);
  border-radius: 18px;
  box-shadow: 0 0 30px rgba(88, 255, 118, 0.18);
}

.pong-countdown-subtitle {
  font-size: 11px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #a6ffac;
}

.pong-countdown-value {
  font-size: 64px;
  line-height: 1;
  color: #dcffb0;
  text-shadow: 0 0 24px rgba(255, 255, 160, 0.45);
}

.pong-board {
  position: relative;
  width: 100%;
  height: 100%;
  background: radial-gradient(circle at 20% 20%, rgba(110, 255, 120, 0.12), rgba(0, 0, 0, 0.92));
  border: 1px solid rgba(74, 255, 122, 0.6);
  border-radius: 10px;
  margin: 0;
  overflow: hidden;
  touch-action: none;
  flex: 1;
  box-shadow: inset 0 0 60px rgba(0, 255, 100, 0.12);
}

.pong-board::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
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
  color: #c3ffc5;
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  z-index: 2;
  text-shadow: 0 0 14px rgba(115, 255, 120, 0.35);
}

.pong-pause-overlay,
.pong-wait-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
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
  background: rgba(126, 255, 146, 0.18);
  border: 1px solid rgba(110, 255, 120, 0.9);
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  color: #caffc7;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  text-shadow: 0 0 5px rgba(160, 255, 160, 0.8);
}

.pong-top-paddle {
  top: 10px;
}

.pong-bottom-paddle {
  bottom: 10px;
}

.pong-ball {
  position: absolute;
  background: radial-gradient(circle, #d4ffb4 0%, #60ff5a 40%, #1a700f 100%);
  border-radius: 50%;
  box-shadow: 0 0 14px rgba(115, 255, 108, 0.8);
}

.pong-helper-text {
  font-size: 11px;
  color: #9cff9c;
  text-align: center;
  margin-top: 6px;
  letter-spacing: 0.08em;
}
</style>
