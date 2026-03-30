<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getCurrentWindow } from '@tauri-apps/api/window';

const peerName = ref('PEER');
const localVideoRef = ref<HTMLVideoElement>();
const audioEnabled = ref(true);
const videoEnabled = ref(true);
const isMaximized = ref(false);

onMounted(async () => {
  const window = getCurrentWindow();

  // Get peer name from URL params
  const params = new URLSearchParams(window.label.split('?')[1] || '');
  const peer = params.get('peer');
  if (peer) {
    peerName.value = peer.toUpperCase();
  }

  // Listen for streams from parent window
  window.listen('streams', (event: any) => {
    console.log('Received streams:', event.payload);
  });

  // Check if window is maximized
  isMaximized.value = await window.isMaximized();
});

async function toggleMaximize() {
  const window = getCurrentWindow();
  if (isMaximized.value) {
    await window.unmaximize();
  } else {
    await window.maximize();
  }
  isMaximized.value = !isMaximized.value;
}

async function minimize() {
  const window = getCurrentWindow();
  await window.minimize();
}

async function closeWindow() {
  const window = getCurrentWindow();
  await window.close();
}

function toggleAudio() {
  audioEnabled.value = !audioEnabled.value;
  if (localVideoRef.value) {
    // Emit audio toggle event to parent
    window.dispatchEvent(new CustomEvent('toggle-audio', { detail: { enabled: audioEnabled.value } }));
  }
}

function toggleVideo() {
  videoEnabled.value = !videoEnabled.value;
  if (localVideoRef.value) {
    // Emit video toggle event to parent
    window.dispatchEvent(new CustomEvent('toggle-video', { detail: { enabled: videoEnabled.value } }));
  }
}
</script>

<template>
  <div class="video-window" data-tauri-drag-region>
    <!-- Custom Titlebar -->
    <div class="titlebar">
      <div class="titlebar-title">
        <span class="glyph">█</span>
        VIDEO CALL // {{ peerName }}
      </div>
      <div class="titlebar-controls">
        <button class="titlebar-btn" @click="toggleAudio" :class="{ active: audioEnabled }" title="Toggle Audio">
          🎤
        </button>
        <button class="titlebar-btn" @click="toggleVideo" :class="{ active: videoEnabled }" title="Toggle Video">
          📹
        </button>
        <button class="titlebar-btn" @click="minimize" title="Minimize">—</button>
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
