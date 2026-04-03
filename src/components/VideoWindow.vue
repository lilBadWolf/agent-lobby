<template>
  <div class="video-window">
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
      <div class="local-video-container">
        <video
          v-show="hasLocalVideoTrack"
          ref="localVideoRef"
          class="local-video"
          autoplay
          muted
          playsinline
        />
        <div v-show="!hasLocalVideoTrack" class="local-chat-fallback">
          <div class="local-preview-placeholder">{{ localPreviewStatusText }}</div>
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
const lastAnimatedRemoteMessageKey = ref('');
const fallbackLocalPreviewStream = ref<MediaStream | null>(null);
const localPreviewUnavailable = ref(false);
const remoteTrackRevision = ref(0);
let remoteDiagnosticsIntervalId: number | null = null;
const { playAnimation } = useMessageAnimations();

function debugEnabled(): boolean {
  if (typeof window === 'undefined') {
    return true;
  }

  try {
    return window.localStorage.getItem('dm-window-debug') !== '0';
  } catch {
    return true;
  }
}

function debugVerboseEnabled(): boolean {
  if (!debugEnabled() || typeof window === 'undefined') {
    return false;
  }

  try {
    return window.localStorage.getItem('dm-window-debug-verbose') === '1';
  } catch {
    return false;
  }
}

function debugLog(message: string, details?: unknown) {
  if (!debugEnabled()) {
    return;
  }

  if (details === undefined) {
    console.log(`[VideoWindow:${props.peerName}] ${message}`);
    return;
  }

  console.log(`[VideoWindow:${props.peerName}] ${message}`, details);
}

function describeStream(stream: MediaStream | null | undefined) {
  if (!stream) {
    return null;
  }

  return {
    id: stream.id,
    active: stream.active,
    tracks: stream.getTracks().map((track) => ({
      id: track.id,
      kind: track.kind,
      enabled: track.enabled,
      muted: track.muted,
      readyState: track.readyState,
    })),
  };
}

function describeMediaElement(element: HTMLMediaElement | undefined) {
  if (!element) {
    return null;
  }

  return {
    readyState: element.readyState,
    networkState: element.networkState,
    paused: element.paused,
    currentTime: element.currentTime,
    muted: element.muted,
    volume: element.volume,
    srcObjectKind: element.srcObject ? element.srcObject.constructor.name : null,
  };
}

function startRemoteDiagnostics() {
  if (!debugVerboseEnabled()) {
    return;
  }

  if (remoteDiagnosticsIntervalId !== null) {
    return;
  }

  remoteDiagnosticsIntervalId = window.setInterval(() => {
    debugLog('remote diagnostics tick', {
      remoteStream: describeStream(props.remoteStream),
      remoteVideo: describeMediaElement(remoteVideoRef.value),
      remoteAudio: describeMediaElement(remoteAudioRef.value),
      hasRemoteVideoTrack: hasRemoteVideoTrack.value,
      peerHasVideo: props.peerHasVideo ?? false,
    });
  }, 2000);
}

function stopRemoteDiagnostics() {
  if (remoteDiagnosticsIntervalId !== null) {
    window.clearInterval(remoteDiagnosticsIntervalId);
    remoteDiagnosticsIntervalId = null;
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : typeof error === 'object' && error !== null && 'name' in error && (error as { name?: string }).name === 'AbortError';
}

function setMediaElementStream(element: HTMLMediaElement, stream: MediaStream | null) {
  if (element.srcObject !== stream) {
    element.srcObject = stream;
  }
}

async function safePlayMediaElement(element: HTMLMediaElement, label: string) {
  try {
    await element.play();
  } catch (error) {
    // Expected race when srcObject changes during play startup.
    if (isAbortError(error)) {
      return;
    }
    console.error(`VideoWindow: ${label} play error:`, error);
  }
}

// Remote pane visibility prefers explicit stream tracks and falls back to peer flag.
const hasRemoteVideoTrack = computed(() => {
  // Depend on revision so addtrack/removetrack updates are reflected.
  remoteTrackRevision.value;

  const streamHasVideo = props.remoteStream?.getVideoTracks().some((track) => track.readyState === 'live') ?? false;

  // If we have a stream object in this window but no live video tracks, prefer chat fallback
  // over forcing an empty video pane from the peer metadata flag.
  if (props.remoteStream) {
    return streamHasVideo;
  }

  return streamHasVideo || (props.peerHasVideo ?? false);
});
const activeLocalStream = computed<MediaStream | null>(() => props.localStream ?? fallbackLocalPreviewStream.value);
const hasLocalVideoTrack = computed(() => (activeLocalStream.value?.getVideoTracks().length ?? 0) > 0);
const hasLocalAudioTrack = computed(() => (props.localStream?.getAudioTracks().length ?? 0) > 0);
const localPreviewStatusText = computed(() => localPreviewUnavailable.value ? 'PREVIEW UNAVAILABLE' : 'CAMERA OFF');

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

async function attachLocalPreviewStream(stream: MediaStream | null) {
  if (!localVideoRef.value) {
    await nextTick();
  }

  if (!localVideoRef.value) {
    return;
  }

  if (!stream) {
    setMediaElementStream(localVideoRef.value, null);
    return;
  }

  localVideoRef.value.muted = true;
  localVideoRef.value.defaultMuted = true;
  setMediaElementStream(localVideoRef.value, stream);
  await safePlayMediaElement(localVideoRef.value, 'Local video');
}

function clearFallbackPreviewStream() {
  if (fallbackLocalPreviewStream.value) {
    fallbackLocalPreviewStream.value.getTracks().forEach((track) => track.stop());
    fallbackLocalPreviewStream.value = null;
  }
}

async function ensureFallbackPreviewStream() {
  if (props.localStream || fallbackLocalPreviewStream.value) {
    return;
  }

  try {
    localPreviewUnavailable.value = false;
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    fallbackLocalPreviewStream.value = stream;
  } catch (error) {
    console.debug('VideoWindow: Fallback local preview unavailable:', error);
    localPreviewUnavailable.value = true;
  }
}

watch(() => props.localStream, async (stream) => {
  if (stream) {
    localPreviewUnavailable.value = false;
    clearFallbackPreviewStream();
    await attachLocalPreviewStream(stream);
    return;
  }

  await ensureFallbackPreviewStream();
  await attachLocalPreviewStream(fallbackLocalPreviewStream.value);
}, { immediate: true });

watch(fallbackLocalPreviewStream, async (stream) => {
  if (props.localStream) {
    return;
  }
  await attachLocalPreviewStream(stream);
});

watch(() => props.remoteStream, async (stream, _previous, onCleanup) => {
  debugLog('remoteStream watcher fired', {
    stream: describeStream(stream),
    peerHasVideo: props.peerHasVideo ?? false,
  });

  remoteTrackRevision.value += 1;

  let cleanupRemoteTrackListeners: (() => void) | null = null;
  if (stream) {
    const refreshTrackState = () => {
      remoteTrackRevision.value += 1;
      debugLog('remote stream track topology changed', describeStream(stream));
    };

    const trackTeardowns: Array<() => void> = [];
    for (const track of stream.getTracks()) {
      const onMute = () => debugLog(`remote ${track.kind} track muted`, { id: track.id, readyState: track.readyState });
      const onUnmute = () => debugLog(`remote ${track.kind} track unmuted`, { id: track.id, readyState: track.readyState });
      const onEnded = () => debugLog(`remote ${track.kind} track ended`, { id: track.id, readyState: track.readyState });
      track.addEventListener('mute', onMute);
      track.addEventListener('unmute', onUnmute);
      track.addEventListener('ended', onEnded);
      trackTeardowns.push(() => {
        track.removeEventListener('mute', onMute);
        track.removeEventListener('unmute', onUnmute);
        track.removeEventListener('ended', onEnded);
      });
    }

    stream.addEventListener('addtrack', refreshTrackState);
    stream.addEventListener('removetrack', refreshTrackState);
    cleanupRemoteTrackListeners = () => {
      stream.removeEventListener('addtrack', refreshTrackState);
      stream.removeEventListener('removetrack', refreshTrackState);
      for (const teardown of trackTeardowns) {
        teardown();
      }
    };

    // Ensure initial state is reflected after attaching listeners.
    refreshTrackState();
  }

  onCleanup(() => {
    cleanupRemoteTrackListeners?.();
  });

  if (!stream) {
    debugLog('remote stream missing, clearing media elements');
    if (remoteVideoRef.value) setMediaElementStream(remoteVideoRef.value, null);
    if (remoteAudioRef.value) setMediaElementStream(remoteAudioRef.value, null);
    return;
  }

  await nextTick();

  const wireElementEvents = (element: HTMLMediaElement | undefined, label: string) => {
    if (!element) {
      return () => undefined;
    }

    const eventNames = ['loadedmetadata', 'loadeddata', 'canplay', 'playing', 'pause', 'stalled', 'waiting', 'emptied', 'error'];
    const handlers = eventNames.map((eventName) => {
      const handler = () => {
        debugLog(`${label} event: ${eventName}`, describeMediaElement(element));
      };
      element.addEventListener(eventName, handler);
      return { eventName, handler };
    });

    return () => {
      for (const { eventName, handler } of handlers) {
        element.removeEventListener(eventName, handler);
      }
    };
  };

  const clearVideoEvents = wireElementEvents(remoteVideoRef.value, 'remoteVideo');
  const clearAudioEvents = wireElementEvents(remoteAudioRef.value, 'remoteAudio');
  onCleanup(() => {
    clearVideoEvents();
    clearAudioEvents();
  });

  if (remoteVideoRef.value) {
    remoteVideoRef.value.muted = true;
    remoteVideoRef.value.defaultMuted = true;
    remoteVideoRef.value.volume = 0;
    setMediaElementStream(remoteVideoRef.value, stream);
    debugLog('remote video srcObject set', {
      stream: describeStream(stream),
      element: describeMediaElement(remoteVideoRef.value),
    });
    await safePlayMediaElement(remoteVideoRef.value, 'Remote video');
    debugLog('remote video play attempted', describeMediaElement(remoteVideoRef.value));
  }

  if (remoteAudioRef.value) {
    remoteAudioRef.value.defaultMuted = false;
    remoteAudioRef.value.muted = false;
    remoteAudioRef.value.volume = 1;
    setMediaElementStream(remoteAudioRef.value, stream);
    debugLog('remote audio srcObject set', {
      stream: describeStream(stream),
      element: describeMediaElement(remoteAudioRef.value),
    });
    await safePlayMediaElement(remoteAudioRef.value, 'Remote audio');
    debugLog('remote audio play attempted', describeMediaElement(remoteAudioRef.value));
  }
}, { immediate: true });

watch(() => props.peerHasVideo, (value) => {
  debugLog('peerHasVideo changed', { peerHasVideo: value, remoteStream: describeStream(props.remoteStream) });
}, { immediate: true });

watch(hasRemoteVideoTrack, (value) => {
  debugLog('hasRemoteVideoTrack changed', {
    hasRemoteVideoTrack: value,
    remoteStream: describeStream(props.remoteStream),
  });
}, { immediate: true });

startRemoteDiagnostics();

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

onBeforeUnmount(() => {
  stopRemoteDiagnostics();
  debugLog('before unmount, clearing media refs');
  clearFallbackPreviewStream();

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
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--dark-bg);
  color: var(--neon-green);
  font-family: 'Courier New', Courier, monospace;
  overflow: hidden;
  position: relative;
}

/* Video Container */
.video-container {
  flex: 1;
  min-height: 90%;
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
  bottom: 10px;
  right: 9px;
  width: 23%;
  height: 30%;
  border: 2px solid var(--neon-green);
  box-shadow: 0 0 20px rgba(57, 255, 20, 0.5);
  background: #000;
  overflow: hidden;
  border-radius: 2px;
  z-index: 20;
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
  align-items: center;
  justify-content: center;
  background: rgba(3, 10, 3, 0.95);
  color: var(--neon-green);
  padding: 8px;
  box-sizing: border-box;
}

.local-preview-placeholder {
  font-size: 11px;
  letter-spacing: 1px;
  font-weight: bold;
  text-transform: uppercase;
  text-shadow: 0 0 8px rgba(57, 255, 20, 0.8);
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
  bottom: 10px;
  left: 9px;
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