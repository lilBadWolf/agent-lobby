<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount } from 'vue';

interface Props {
  peerName: string;
  localStream?: MediaStream | null;
  remoteStream?: MediaStream | null;
}

interface Emits {
  close: [];
  toggleAudio: [enabled: boolean];
  toggleVideo: [enabled: boolean];
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const localVideoRef = ref<HTMLVideoElement>();
const remoteVideoRef = ref<HTMLVideoElement>();
const audioEnabled = ref(true);
const videoEnabled = ref(true);
const isMaximized = ref(false);

// Attach streams to video elements
watch(() => props.localStream, async (stream) => {
  console.log('VideoWindow: localStream watcher fired, stream:', stream);
  if (!stream) {
    console.log('VideoWindow: localStream is null/undefined');
    return;
  }
  console.log('VideoWindow: localStream has tracks:', stream.getTracks());

  // Wait for DOM to be ready
  await nextTick();

  if (localVideoRef.value) {
    console.log('VideoWindow: Setting localVideoRef.value.srcObject');
    localVideoRef.value.srcObject = stream;
    localVideoRef.value.play().then(() => {
      console.log('VideoWindow: Local video playing successfully');
    }).catch(e => {
      console.error('VideoWindow: Local video play error:', e);
    });
  } else {
    console.log('VideoWindow: localVideoRef.value not ready even after nextTick');
  }
}, { immediate: true });

watch(() => props.remoteStream, async (stream) => {
  console.log('VideoWindow: remoteStream watcher fired, stream:', stream);
  if (!stream) {
    console.log('VideoWindow: remoteStream is null/undefined');
    return;
  }
  console.log('VideoWindow: remoteStream has tracks:', stream.getTracks());

  // Wait for DOM to be ready
  await nextTick();

  if (remoteVideoRef.value) {
    console.log('VideoWindow: Setting remoteVideoRef.value.srcObject');
    remoteVideoRef.value.srcObject = stream;
    remoteVideoRef.value.play().then(() => {
      console.log('VideoWindow: Remote video playing successfully');
    }).catch(e => {
      console.error('VideoWindow: Remote video play error:', e);
    });
  } else {
    console.log('VideoWindow: remoteVideoRef.value not ready even after nextTick');
  }
}, { immediate: true });

function toggleMaximize() {
  isMaximized.value = !isMaximized.value;
}

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
  // Clear video element sources to release streams
  if (localVideoRef.value) {
    localVideoRef.value.srcObject = null;
  }
  if (remoteVideoRef.value) {
    remoteVideoRef.value.srcObject = null;
  }
});
</script>

<template>
  <div class="video-window">
    <!-- Custom Titlebar -->
    <div class="titlebar">
      <div class="titlebar-title">
        <span class="glyph">█</span>
        VIDEO CALL // {{ peerName.toUpperCase() }}
      </div>
      <div class="titlebar-controls">
        <button class="titlebar-btn" @click="toggleAudio" :class="{ active: audioEnabled }" title="Toggle Audio">
          🎤
        </button>
        <button class="titlebar-btn" @click="toggleVideo" :class="{ active: videoEnabled }" title="Toggle Video">
          📹
        </button>
        <button class="titlebar-btn" @click="toggleMaximize" title="Maximize">
          {{ isMaximized ? '◻' : '◻' }}
        </button>
        <button class="titlebar-btn close" @click="closeWindow" title="Close">✕</button>
      </div>
    </div>

    <!-- Video Container -->
    <div class="video-container">
      <!-- Remote Video (main feed) -->
      <video
        ref="remoteVideoRef"
        class="remote-video"
        autoplay
        playsinline
        muted
      />

      <!-- Local Video (PiP bottom-right) -->
      <div class="local-video-container">
        <video
          ref="localVideoRef"
          class="local-video"
          autoplay
          playsinline
          muted
        />
        <div class="pip-border"></div>
      </div>

      <!-- Glitch effect overlay -->
      <div class="glitch-overlay"></div>

      <!-- Control buttons (bottom) -->
      <div class="bottom-controls">
        <button
          class="control-btn"
          :class="{ 'btn-off': !audioEnabled }"
          @click="toggleAudio"
          title="Toggle Microphone"
        >
          {{ audioEnabled ? '🎤 MIC ON' : '🔇 MIC OFF' }}
        </button>
        <button
          class="control-btn"
          :class="{ 'btn-off': !videoEnabled }"
          @click="toggleVideo"
          title="Toggle Camera"
        >
          {{ videoEnabled ? '📹 CAM ON' : '📷 CAM OFF' }}
        </button>
        <button class="control-btn btn-end" @click="closeWindow" title="End Call">
          ⏹ END CALL
        </button>
      </div>
    </div>
  </div>
</template>

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

/* Local Video PiP (bottom-right) */
.local-video-container {
  position: absolute;
  bottom: 70px;
  right: 20px;
  width: 200px;
  height: 150px;
  border: 2px solid var(--neon-green);
  box-shadow: 0 0 20px rgba(57, 255, 20, 0.5);
  background: #000;
  overflow: hidden;
  border-radius: 2px;
  z-index: 10;
}

.local-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transform: scaleX(-1); /* Mirror local video */
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
  left: 50%;
  transform: translateX(-50%);
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
  -webkit-appearance: none;
  -webkit-user-select: none;
  user-select: none;
}
</style>
