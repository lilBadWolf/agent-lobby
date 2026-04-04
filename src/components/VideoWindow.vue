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
        class="remote-audio"
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

        <!-- PiP controls -->
        <div class="pip-controls">
          <button
            v-show="hasLocalAudioTrack"
            class="pip-control-btn"
            :class="{ 'btn-off': !audioEnabled }"
            :aria-label="audioEnabled ? 'Mute speaker' : 'Unmute speaker'"
            :title="audioEnabled ? 'Mute speaker' : 'Unmute speaker'"
            @click="toggleAudio"
          >
            <span aria-hidden="true">{{ audioEnabled ? '🔊' : '🔇' }}</span>
          </button>
          <button
            v-show="hasLocalVideoTrack"
            class="pip-control-btn"
            :class="{ 'btn-off': !videoEnabled }"
            :aria-label="videoEnabled ? 'Turn camera off' : 'Turn camera on'"
            :title="videoEnabled ? 'Turn camera off' : 'Turn camera on'"
            @click="toggleVideo"
          >
            <span aria-hidden="true">{{ videoEnabled ? '📷' : '🚫' }}</span>
          </button>
        </div>
      </div>

      <!-- Glitch effect overlay -->
      <div class="glitch-overlay"></div>

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
  background: var(--color-bg-base);
  color: var(--color-accent);
  font-family: 'Courier New', Courier, monospace;
  overflow: hidden;
  position: relative;
}

/* Video Container */
.video-container {
  flex: 1;
  min-height: 90%;
  position: relative;
  background: var(--color-video-container-bg);
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
  border: 2px solid var(--color-video-border);
  box-shadow: var(--color-video-main-shadow);
}

.remote-chat-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  border: 2px solid var(--color-video-border);
  background: var(--color-video-fallback-bg);
  box-shadow: var(--color-video-fallback-box-shadow);
  text-align: center;
  padding: 24px;
  box-sizing: border-box;
}

.remote-fallback-header {
  font-size: 14px;
  letter-spacing: 2px;
  color: var(--color-accent);
  text-shadow: var(--color-video-fallback-header-text-shadow);
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
  color: var(--color-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  text-shadow: var(--color-video-fallback-animation-text-shadow);
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
  border: 2px solid var(--color-video-border);
  box-shadow: var(--color-video-local-shadow);
  background: var(--color-video-local-bg);
  overflow: hidden;
  border-radius: 2px;
  z-index: 20;
}

.pip-controls {
  position: absolute;
  left: 50%;
  bottom: 0px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  z-index: 30;
  padding: 2px 4px;
}

.pip-control-btn {
  width: 20px;
  height: 20px;
  border: 0;
  border-radius: 50%;
  background: var(--color-video-button-bg);
  color: var(--color-accent);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  line-height: 1;
  font-size: 11px;
  text-shadow: var(--color-video-button-text-shadow);
  box-shadow: 0 0 6px rgba(0, 0, 0, 0.5);
  transition: transform 0.15s ease, opacity 0.15s ease, background 0.15s ease;
  padding: 0;
}

.pip-control-btn:hover {
  transform: translateY(-1px);
  opacity: 0.9;
  background: var(--color-video-button-hover-bg);
}

.pip-control-btn.btn-off {
  color: var(--color-danger);
  text-shadow: var(--color-video-button-off-text-shadow);
}

.pip-control-btn.btn-off:hover {
  opacity: 0.9;
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
  background: var(--color-video-local-fallback-bg);
  color: var(--color-accent);
  padding: 8px;
  box-sizing: border-box;
}

.local-preview-placeholder {
  font-size: 11px;
  letter-spacing: 1px;
  font-weight: bold;
  text-transform: uppercase;
  text-shadow: var(--color-video-fallback-header-text-shadow);
}

.pip-border {
  position: absolute;
  inset: 0;
  border: 2px solid var(--color-video-pip-border);
  pointer-events: none;
  animation: pip-flicker 0.15s infinite;
  opacity: 0.6;
  box-shadow: var(--color-video-pip-shadow);
}

@keyframes pip-flicker {
  0%, 100% {
    opacity: 0.6;
    box-shadow: var(--color-video-pip-shadow);
  }
  50% {
    opacity: 0.8;
    box-shadow: var(--color-video-pip-flicker-shadow);
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

.remote-audio {
  position: absolute;
  bottom: 10px;
  left: 10px;
  z-index: 100;
  width: 200px;
  background: var(--color-video-audio-bg);
}

/* Ensure video fills container */
video {
  appearance: none;
  -webkit-appearance: none;
  -webkit-user-select: none;
  user-select: none;
}
</style>