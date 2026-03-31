<template>
  <div class="video-window">
    <!-- Custom Titlebar -->
    <div class="titlebar">
      <div class="titlebar-title">
        <span class="glyph">█</span>
        VIDEO CALL // {{ peerName.toUpperCase() }}
      </div>
    </div>

    <!-- Video Container -->
    <div class="video-container">
      <!-- Remote Audio (hidden, just for audio output) -->
      <audio
        ref="remoteAudioRef"
        autoplay
        playsinline
        :muted="false"
        style="position: absolute; bottom: 10px; left: 10px; z-index: 100; width: 200px; background: #111;"
      ></audio>
      <!-- Remote Video (main feed) -->
      <video
        v-show="hasRemoteVideoTrack"
        ref="remoteVideoRef"
        class="remote-video"
        autoplay
        muted
        playsinline
      />
      <div v-show="!hasRemoteVideoTrack" class="remote-chat-fallback">
        <div ref="remoteFallbackAnimationRef" class="remote-fallback-animation"></div>
      </div>

      <!-- Local Video (PiP bottom-right) -->
      <div class="local-video-container" :class="{ 'chat-mode': !hasLocalVideoTrack }">
        <video
          v-show="hasLocalVideoTrack"
          ref="localVideoRef"
          class="local-video"
          autoplay
          muted
          playsinline
        />
        <div v-show="!hasLocalVideoTrack" class="local-chat-fallback">
          <div class="fallback-input-row">
            <input
              v-model="fallbackMessageInput"
              class="fallback-input"
              type="text"
              placeholder="Ready to send..."
              :disabled="!canSendMessages"
              @keydown.enter="sendFallbackMessage"
            />
            <button
              class="fallback-send"
              :disabled="!canSendMessages"
              @click="sendFallbackMessage"
            >
              SEND
            </button>
          </div>
        </div>
        <div class="pip-border"></div>
      </div>

      <!-- Glitch effect overlay -->
      <div class="glitch-overlay"></div>

      <!-- Control buttons (bottom) -->
      <div class="bottom-controls">
        <button
            v-show="hasLocalAudioTrack"
            class="control-btn"
            :class="{ 'btn-off': !audioEnabled }"
            @click="toggleAudio"
          >
            {{ audioEnabled ? '🎤 MIC ON' : '🔇 MIC OFF' }}
          </button>
          <button
            v-show="hasLocalVideoTrack"
            class="control-btn"
            :class="{ 'btn-off': !videoEnabled }"
            @click="toggleVideo"
          >
          {{ videoEnabled ? '📹 CAM ON' : '📷 CAM OFF' }}
        </button>
        <button class="control-btn btn-end" @click="closeWindow">
          ⏹ TERMINATE
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount, computed } from 'vue';
import { useMessageAnimations } from '../composables/useMessageAnimations';

interface VideoWindowMessage {
  user: string;
  message: string;
  isSystem?: boolean;
  effect?: string;
}

interface Props {
  peerName: string;
  localStream?: MediaStream | null;
  remoteStream?: MediaStream | null;
  dmMessages?: VideoWindowMessage[];
  canSendMessages?: boolean;
  username?: string;
  /** Driven by DMChat.videoEnabled — set true when remote video track arrives via ontrack */
  peerHasVideo?: boolean;
}

interface Emits {
  close: [];
  toggleAudio: [enabled: boolean];
  toggleVideo: [enabled: boolean];
  sendMessage: [message: string];
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const localVideoRef = ref<HTMLVideoElement>();
const remoteVideoRef = ref<HTMLVideoElement>();
const remoteAudioRef = ref<HTMLAudioElement>();
const remoteFallbackAnimationRef = ref<HTMLElement>();
const audioEnabled = ref(true);
const videoEnabled = ref(true);
const fallbackMessageInput = ref('');
const lastAnimatedRemoteMessageKey = ref('');
const hasLocalVideoTrack = ref(false);
const hasLocalAudioTrack = ref(false);
const { playAnimation } = useMessageAnimations();

// Remote pane visibility is driven by the peerHasVideo prop which comes from
// DMChat.videoEnabled — this is set reactively via setOrUpdateChat when the
// RTCPeerConnection ontrack event fires.  Using a prop avoids the unreliable
// MediaStream addtrack/removetrack event timing issue.
const hasRemoteVideoTrack = computed(() => props.peerHasVideo ?? false);

const latestPeerMessage = computed(() => {
  const messages = props.dmMessages ?? [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message.isSystem && message.user !== props.username) {
      return message;
    }
  }
  return null;
});

let localTrackListenerCleanup: (() => void) | null = null;

// Attach streams to video elements
watch(() => props.localStream, async (stream) => {
  if (localTrackListenerCleanup) {
    localTrackListenerCleanup();
    localTrackListenerCleanup = null;
  }

  if (!stream) {
    hasLocalVideoTrack.value = false;
    hasLocalAudioTrack.value = false;
    if (localVideoRef.value) localVideoRef.value.srcObject = null;
    return;
  }

  // Local stream is created once with known constraints (video: false or real camera).
  // Check tracks immediately; also listen for addtrack in case of future renegotiation.
  const update = () => {
    hasLocalVideoTrack.value = stream.getVideoTracks().length > 0;
    hasLocalAudioTrack.value = stream.getAudioTracks().length > 0;
  };
  stream.addEventListener('addtrack', update);
  stream.addEventListener('removetrack', update);
  update();
  localTrackListenerCleanup = () => {
    stream.removeEventListener('addtrack', update);
    stream.removeEventListener('removetrack', update);
  };

  await nextTick();

  if (localVideoRef.value) {
    localVideoRef.value.muted = true;
    localVideoRef.value.defaultMuted = true;
    localVideoRef.value.srcObject = stream;
    localVideoRef.value.play().catch(e => console.error('VideoWindow: Local video play error:', e));
  }
}, { immediate: true });

watch(() => props.remoteStream, async (stream) => {
  if (!stream) {
    if (remoteVideoRef.value) remoteVideoRef.value.srcObject = null;
    if (remoteAudioRef.value) remoteAudioRef.value.srcObject = null;
    return;
  }

  await nextTick();

  if (remoteVideoRef.value) {
    remoteVideoRef.value.muted = true;
    remoteVideoRef.value.defaultMuted = true;
    remoteVideoRef.value.volume = 0;
    remoteVideoRef.value.srcObject = stream;
    remoteVideoRef.value.play().catch(e => console.error('VideoWindow: Remote video play error:', e));
  }

  if (remoteAudioRef.value) {
    remoteAudioRef.value.defaultMuted = false;
    remoteAudioRef.value.muted = false;
    remoteAudioRef.value.volume = 1;
    remoteAudioRef.value.srcObject = stream;
    remoteAudioRef.value.play().catch(e => console.error('VideoWindow: Remote audio play error:', e));
  }
});

watch([hasRemoteVideoTrack, latestPeerMessage], async ([remoteHasVideo, message]) => {
  if (remoteHasVideo) {
    if (remoteFallbackAnimationRef.value) {
      remoteFallbackAnimationRef.value.innerHTML = '';
    }
    return;
  }

  if (!message || !remoteFallbackAnimationRef.value) return;

  const effect = (message.effect ?? 'none') as any;
  const messageKey = `${message.user}:${message.message}:${effect}`;
  if (messageKey === lastAnimatedRemoteMessageKey.value) return;
  lastAnimatedRemoteMessageKey.value = messageKey;

  await nextTick();
  if (!remoteFallbackAnimationRef.value) return;

  if (effect === 'none') {
    remoteFallbackAnimationRef.value.textContent = message.message;
    return;
  }

  await playAnimation(effect, message.message, remoteFallbackAnimationRef.value);
}, { immediate: true });

function toggleAudio() {
  audioEnabled.value = !audioEnabled.value;
  emit('toggleAudio', audioEnabled.value);
}

function toggleVideo() {
  videoEnabled.value = !videoEnabled.value;
  emit('toggleVideo', videoEnabled.value);
}

function closeWindow() {
  emit('close');
}

function sendFallbackMessage() {
  const nextMessage = fallbackMessageInput.value.trim();
  if (!nextMessage || !props.canSendMessages) return;
  emit('sendMessage', nextMessage);
  fallbackMessageInput.value = '';
}

onBeforeUnmount(() => {
  if (localTrackListenerCleanup) {
    localTrackListenerCleanup();
    localTrackListenerCleanup = null;
  }

  // Clear video element sources to release streams
  if (localVideoRef.value) {
    localVideoRef.value.srcObject = null;
  }
  if (remoteVideoRef.value) {
    remoteVideoRef.value.srcObject = null;
  }
  if (remoteAudioRef.value) {
    remoteAudioRef.value.srcObject = null;
  }
});
</script>

<style scoped>
.video-window {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--dark-bg);
  color: var(--neon-green);
  font-family: 'Courier New', Courier, monospace;
  overflow: hidden;
  position: relative;
}

/* Titlebar */
.titlebar {
  background: rgba(10, 15, 10, 0.95);
  border-bottom: 2px solid var(--neon-green);
  padding: 8px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  box-shadow: 0 0 20px rgba(57, 255, 20, 0.2);
  user-select: none;
  -webkit-user-select: none;
}

.titlebar-title {
  font-size: 12px;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 2px;
  display: flex;
  align-items: center;
  gap: 8px;
  text-shadow: 0 0 10px var(--neon-green);
  flex: 1;
}

.glyph {
  color: var(--alert-red);
  animation: pulse-glyph 1s infinite;
  font-size: 14px;
}

@keyframes pulse-glyph {
  0%, 100% {
    opacity: 0.6;
  }
  50% {
    opacity: 1;
  }
}

.titlebar-controls {
  display: flex;
  gap: 4px;
  align-items: center;
}

.titlebar-btn {
  background: none;
  border: none;
  color: var(--neon-green);
  cursor: pointer;
  padding: 4px 8px;
  font-size: 14px;
  transition: all 0.2s;
  opacity: 0.7;
  text-shadow: 0 0 5px var(--neon-green);
}

.titlebar-btn:hover {
  opacity: 1;
  box-shadow: 0 0 15px var(--neon-green);
  text-shadow: 0 0 10px var(--neon-green);
}

.titlebar-btn.active {
  color: var(--neon-green);
  opacity: 1;
  box-shadow: 0 0 15px var(--neon-green), inset 0 0 10px rgba(57, 255, 20, 0.3);
}

.titlebar-btn.close:hover {
  color: var(--alert-red);
  box-shadow: 0 0 15px var(--alert-red);
  text-shadow: 0 0 10px var(--alert-red);
}

/* Video Container */
.video-container {
  flex: 1;
  position: relative;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

/* Remote Video (main) */
.remote-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  border: 2px solid var(--neon-green);
  box-shadow: 0 0 30px rgba(57, 255, 20, 0.3), inset 0 0 30px rgba(57, 255, 20, 0.1);
}

.remote-chat-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  border: 2px solid var(--neon-green);
  background:
    radial-gradient(circle at 50% 45%, rgba(57, 255, 20, 0.16), rgba(0, 0, 0, 0.95) 60%),
    linear-gradient(180deg, rgba(6, 15, 6, 0.95), rgba(1, 4, 1, 0.98));
  box-shadow: inset 0 0 40px rgba(57, 255, 20, 0.15), 0 0 40px rgba(57, 255, 20, 0.15);
  text-align: center;
  padding: 24px;
  box-sizing: border-box;
}

.remote-fallback-header {
  font-size: 14px;
  letter-spacing: 2px;
  color: var(--neon-green);
  text-shadow: 0 0 10px rgba(57, 255, 20, 0.8);
  font-weight: bold;
}

.remote-fallback-animation {
  min-height: 88px;
  max-width: 75%;
  width: 100%;
  font-size: clamp(20px, 4vw, 42px);
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 2px;
  color: var(--neon-green);
  display: flex;
  align-items: center;
  justify-content: center;
  text-shadow: 0 0 18px rgba(57, 255, 20, 0.9), 0 0 28px rgba(57, 255, 20, 0.4);
  word-break: break-word;
}

.remote-fallback-caption {
  font-size: 12px;
  letter-spacing: 1px;
  opacity: 0.85;
}

/* Local Video PiP (bottom-right) */
.local-video-container {
  position: absolute;
  bottom: 12px;
  right: 20px;
  width: 220px;
  height: 150px;
  border: 2px solid var(--neon-green);
  box-shadow: 0 0 20px rgba(57, 255, 20, 0.5);
  background: #000;
  overflow: hidden;
  border-radius: 2px;
  z-index: 20;
  transition: height 0.15s ease;
}

/* When showing chat fallback, collapse to just the input row height */
.local-video-container.chat-mode {
  height: 40px;
}

.local-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transform: scaleX(-1); /* Mirror local video */
}

.local-chat-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: rgba(3, 10, 3, 0.95);
  color: var(--neon-green);
  padding: 4px 6px;
  box-sizing: border-box;
  gap: 0;
  justify-content: center;
}

.fallback-header {
  font-size: 9px;
  letter-spacing: 1px;
  font-weight: bold;
  border-bottom: 1px solid rgba(57, 255, 20, 0.6);
  padding-bottom: 4px;
  text-shadow: 0 0 6px rgba(57, 255, 20, 0.8);
}

.fallback-messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 10px;
  line-height: 1.25;
}

.fallback-empty {
  opacity: 0.7;
  font-size: 10px;
}

.fallback-message {
  word-break: break-word;
}

.fallback-user {
  color: var(--neon-green);
  font-weight: bold;
  margin-right: 4px;
}

.fallback-user.mine {
  color: #7ec8ff;
}

.fallback-body {
  color: #d5ffd5;
}

.fallback-input-row {
  display: flex;
  gap: 4px;
}

.fallback-input {
  flex: 1;
  min-width: 0;
  background: rgba(0, 0, 0, 0.8);
  border: 1px solid var(--neon-green);
  color: var(--neon-green);
  font-family: 'Courier New', Courier, monospace;
  font-size: 10px;
  padding: 4px;
}

.fallback-input:disabled {
  opacity: 0.6;
}

.fallback-send {
  background: transparent;
  border: 1px solid var(--neon-green);
  color: var(--neon-green);
  font-family: 'Courier New', Courier, monospace;
  font-size: 9px;
  font-weight: bold;
  padding: 0 6px;
  cursor: pointer;
}

.fallback-send:hover:not(:disabled) {
  background: var(--neon-green);
  color: #000;
}

.fallback-send:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.pip-border {
  position: absolute;
  inset: 0;
  border: 2px solid var(--neon-green);
  pointer-events: none;
  animation: pip-flicker 0.15s infinite;
  opacity: 0.6;
}

@keyframes pip-flicker {
  0%, 100% {
    opacity: 0.6;
    box-shadow: 0 0 10px rgba(57, 255, 20, 0.4);
  }
  50% {
    opacity: 0.8;
    box-shadow: 0 0 20px rgba(57, 255, 20, 0.6);
  }
}

/* Glitch overlay */
.glitch-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.15) 50%);
  background-size: 100% 3px;
  pointer-events: none;
  z-index: 5;
}

/* Bottom Controls */
.bottom-controls {
  position: absolute;
  bottom: 12px;
  left: 20px;
  display: flex;
  gap: 12px;
  z-index: 20;
}

.control-btn {
  padding: 10px 16px;
  background: transparent;
  border: 2px solid var(--neon-green);
  color: var(--neon-green);
  font-family: 'Courier New', Courier, monospace;
  font-size: 11px;
  font-weight: bold;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s;
  letter-spacing: 1px;
  box-shadow: 0 0 10px rgba(57, 255, 20, 0.3);
  text-shadow: 0 0 5px var(--neon-green);
}

.control-btn:hover {
  background: var(--neon-green);
  color: var(--dark-bg);
  box-shadow: 0 0 20px var(--neon-green);
  text-shadow: none;
}

.control-btn.btn-off {
  border-color: var(--alert-red);
  color: var(--alert-red);
  box-shadow: 0 0 10px rgba(255, 57, 57, 0.3);
  text-shadow: 0 0 5px var(--alert-red);
}

.control-btn.btn-off:hover {
  background: var(--alert-red);
  color: var(--dark-bg);
  box-shadow: 0 0 20px var(--alert-red);
  text-shadow: none;
}

.control-btn.btn-end {
  border-color: var(--alert-red);
  color: var(--alert-red);
  box-shadow: 0 0 10px rgba(255, 57, 57, 0.3);
  text-shadow: 0 0 5px var(--alert-red);
}

.control-btn.btn-end:hover {
  background: var(--alert-red);
  color: var(--dark-bg);
  box-shadow: 0 0 20px var(--alert-red), inset 0 0 10px rgba(255, 57, 57, 0.3);
  text-shadow: none;
}

/* Ensure video fills container */
video {
  appearance: none;
  -webkit-appearance: none;
  -webkit-user-select: none;
  user-select: none;
}
</style>