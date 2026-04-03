<template>
  <div v-if="showModal" id="settings-modal" @click="(e) => e.target === $el && handleClose()">
    <div class="modal-box">
      <div class="settings-content">
        <h3 style="margin-top: 0; border-bottom: 1px solid var(--neon-green)">CONFIG_SYS</h3>
        <div class="settings-tabs" role="tablist" aria-label="Settings Sections">
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'general' }"
            type="button"
            @click="activeTab = 'general'"
          >
            GENERAL
          </button>
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'dm' }"
            type="button"
            @click="activeTab = 'dm'"
          >
            DM
          </button>
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'media' }"
            type="button"
            @click="activeTab = 'media'"
          >
            MEDIA
          </button>
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'help' }"
            type="button"
            @click="activeTab = 'help'"
          >
            HELP
          </button>
        </div>

        <div v-if="activeTab === 'general'" class="tab-panel">
          <div class="setting-row">
            <label>SOUNDPACK</label>
            <select
              v-model="localConfig.soundpack"
              id="set-soundpack"
              @change="handleChange"
            >
              <option v-for="pack in availableSoundpacks" :key="pack" :value="pack">
                {{ pack }}
              </option>
            </select>
          </div>
          <div class="setting-row">
            <label>THEME</label>
            <select
              v-model="localConfig.theme"
              id="set-theme"
              @change="handleChange"
            >
              <option v-for="themeName in availableThemes" :key="themeName" :value="themeName">
                {{ themeName }}
              </option>
            </select>
          </div>
          <div class="setting-row">
            <label>AUTO-AWAY</label>
            <select
              v-model.number="localConfig.autoAwayMinutes"
              id="set-auto-away"
              @change="handleChange"
            >
              <option :value="10">10M</option>
              <option :value="30">30M</option>
              <option :value="60">1HR</option>
              <option :value="0">OFF</option>
            </select>
          </div>
          <div class="setting-row">
            <label>UPDATE PULSE</label>
            <select
              v-model.number="localConfig.autoUpdatePulseMinutes"
              id="set-update-pulse"
              @change="handleChange"
            >
              <option :value="15">15M</option>
              <option :value="30">30M</option>
              <option :value="60">1HR</option>
              <option :value="120">2HR</option>
              <option :value="0">OFF</option>
            </select>
          </div>
          <div class="setting-row">
            <label>AGENTAMP</label>
            <input
              v-model="localConfig.agentAmpEnabled"
              type="checkbox"
              id="set-agentamp-toggle"
              @change="handleChange"
            />
          </div>
        </div>

        <div v-if="activeTab === 'dm'" class="tab-panel">
          <div class="setting-row">
            <label>DM ENABLED</label>
            <input
              v-model="localConfig.dmEnabled"
              type="checkbox"
              id="set-dm-toggle"
              @change="handleChange"
            />
          </div>
          <div class="setting-row">
            <div style="display: flex; align-items: center; gap: 8px;">
              <label>DM EFFECT</label>
              <button class="preview-btn" @click="previewEffect">🔭</button>
            </div>
            <select
              v-model="localConfig.dmChatEffect"
              id="set-dm-effect"
              @change="handleChange"
            >
              <option value="none">NONE</option>
              <option value="matrix">MATRIX</option>
              <option value="glitch">GLITCH</option>
              <option value="flames">FLAMES</option>
            </select>
          </div>
        </div>

        <div v-if="activeTab === 'media'" class="tab-panel media-panel">
          <div class="setting-row">
            <label>AUDIO ENABLED</label>
            <input
              v-model="localConfig.audioEnabled"
              type="checkbox"
              id="set-audio-toggle"
              @change="handleChange"
            />
          </div>
          <div class="setting-row">
            <label>MASTER VOL</label>
            <input
              v-model.number="localConfig.volume"
              type="range"
              id="set-volume"
              min="0"
              max="1"
              step="0.1"
              @change="handleChange"
            />
          </div>
          <hr class="settings-divider" />
          <div class="setting-row">
            <label>DM AUDIO OUT</label>
            <select
              v-model="localConfig.audioOutputDeviceId"
              id="set-audio-output"
              @change="handleChange"
            >
              <option value="">DEFAULT</option>
              <option v-for="device in audioOutputDevices" :key="device.deviceId" :value="device.deviceId">
                {{ device.label }}
              </option>
            </select>
          </div>
          <div class="setting-row">
            <label>DM AUDIO IN</label>
            <select
              v-model="localConfig.audioInputDeviceId"
              id="set-audio-input"
              @change="handleChange"
            >
              <option value="">DEFAULT</option>
              <option :value="NO_MIC_DEVICE_ID">NO MIC (RECEIVE ONLY)</option>
              <option v-for="device in audioInputDevices" :key="device.deviceId" :value="device.deviceId">
                {{ device.label }}
              </option>
            </select>
          </div>
          <div class="setting-row">
            <label>VIDEO</label>
            <select
              v-model="localConfig.videoInputDeviceId"
              id="set-video-input"
              @change="handleChange"
            >
              <option value="">DEFAULT</option>
              <option :value="NO_WEBCAM_DEVICE_ID">NO WEBCAM (AUDIO ONLY)</option>
              <option v-for="device in videoInputDevices" :key="device.deviceId" :value="device.deviceId">
                {{ device.label }}
              </option>
            </select>
          </div>
          <div class="setting-row preview-action-row">
            <button
              class="preview-toggle-btn"
              type="button"
              :disabled="localConfig.videoInputDeviceId === NO_WEBCAM_DEVICE_ID"
              @click="toggleVideoPreview"
            >
              {{ isVideoPreviewVisible ? 'HIDE PREVIEW' : 'SHOW PREVIEW' }}
            </button>
          </div>
          <div class="setting-row">
            <div v-if="isVideoPreviewVisible" class="video-preview-wrap">
              {{ previewCameraLabel }} {{ previewResolutionLabel }}
              <video ref="videoPreviewRef" class="video-preview" autoplay muted playsinline></video>
            </div>
          </div>
        </div>

        <div v-if="activeTab === 'help'" class="tab-panel help-panel">
          <div class="help-title">SLASH COMMANDS</div>
          <div class="help-row">
            <code>/away</code>
            <span>SET STATUS TO AWAY</span>
          </div>
          <div class="help-row">
            <code>/back</code>
            <span>SET STATUS TO ACTIVE</span>
          </div>
          <div class="help-row">
            <code>/settings</code>
            <span>OPEN SETTINGS MODAL</span>
          </div>
          <div class="help-row">
            <code>/quit</code>
            <span>DISCONNECT FROM LOBBY</span>
          </div>
          <div class="help-row">
            <code>/dm on</code>
            <span>ENABLE DIRECT MESSAGES</span>
          </div>
          <div class="help-row">
            <code>/dm off</code>
            <span>DISABLE DIRECT MESSAGES</span>
          </div>
          <div class="help-row">
            <code>/dm @username</code>
            <span>REQUEST DM WITH USER</span>
          </div>

          <div class="help-title">CHAT TIPS</div>
          <div class="help-row">
            <code>:emoji_name:</code>
            <span>TYPE EMOJI SHORTCODES</span>
          </div>
          <div class="help-row">
            <code>@username</code>
            <span>TYPE @ TO PICK A USER</span>
          </div>
        </div>
      </div>
      <button v-if="activeTab === 'general'" class="clear-btn" @click="handleClearLog">CLEAR MSG LOG</button>
      <button class="close-btn" @click="handleClose">CLOSE</button>
    </div>
    <div v-if="showEffectPreview" class="effect-preview">
      <div ref="previewElement" class="preview-text"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import type { AudioConfig } from '../types/chat';
import { useMessageAnimations } from '../composables/useMessageAnimations';
import { NO_WEBCAM_DEVICE_ID, NO_MIC_DEVICE_ID, useMediaDevices } from '../composables/useMediaDevices';

const props = defineProps<{
  showModal: boolean;
  config: AudioConfig;
  availableSoundpacks: string[];
  availableThemes: string[];
}>();

const emit = defineEmits<{
  update: [config: AudioConfig];
  close: [];
  clearLog: [];
}>();

function normalizeConfig(config: AudioConfig): AudioConfig {
  return {
    ...config,
    autoAwayMinutes: config.autoAwayMinutes ?? 10,
    autoUpdatePulseMinutes: config.autoUpdatePulseMinutes ?? 30,
    agentAmpEnabled: config.agentAmpEnabled ?? false,
  };
}

const localConfig = ref<AudioConfig>(normalizeConfig(props.config));
const activeTab = ref<'general' | 'dm' | 'media' | 'help'>('general');
const hasInitializedMediaForOpen = ref(false);
const showEffectPreview = ref(false);
const previewElement = ref<HTMLElement>();
const videoPreviewRef = ref<HTMLVideoElement>();
const isVideoPreviewVisible = ref(false);
const previewCameraLabel = ref('UNKNOWN');
const previewResolutionLabel = ref('N/A');
let previewStream: MediaStream | null = null;
const { playAnimation } = useMessageAnimations();

const { audioInputDevices, audioOutputDevices, videoInputDevices, requestMediaPermission } = useMediaDevices();

watch(
  () => props.showModal,
  (isOpen) => {
    if (isOpen) {
      activeTab.value = 'general';
      hasInitializedMediaForOpen.value = false;
    }
  }
);

watch(
  () => [props.showModal, activeTab.value] as const,
  async ([isOpen, tab]) => {
    if (!isOpen || tab !== 'media' || hasInitializedMediaForOpen.value) {
      return;
    }

    hasInitializedMediaForOpen.value = true;

    // Only initialize media permissions/devices once user opens the Media tab.
    const includeVideo = localConfig.value.videoInputDeviceId !== NO_WEBCAM_DEVICE_ID;
    const includeAudio = localConfig.value.audioInputDeviceId !== NO_MIC_DEVICE_ID;
    const hasVideoDevices = await requestMediaPermission(includeVideo, includeAudio);

    // Auto-default no-webcam when no camera found and user hasn't chosen yet.
    if (!hasVideoDevices && localConfig.value.videoInputDeviceId === '') {
      localConfig.value.videoInputDeviceId = NO_WEBCAM_DEVICE_ID;
      emit('update', { ...localConfig.value });
    }

    // Auto-default no-mic when no audio input found and user hasn't chosen yet.
    const hasAudioDevices = audioInputDevices.value.length > 0;
    if (!hasAudioDevices && localConfig.value.audioInputDeviceId === '') {
      localConfig.value.audioInputDeviceId = NO_MIC_DEVICE_ID;
      emit('update', { ...localConfig.value });
    }
  }
);

watch(
  () => props.config,
  (newConfig) => {
    localConfig.value = normalizeConfig(newConfig);
  }
);

watch(
  () => props.availableSoundpacks,
  (newPacks) => {
    // Ensure the selected soundpack is in the available list
    if (newPacks.length > 0 && !newPacks.includes(localConfig.value.soundpack)) {
      localConfig.value.soundpack = newPacks[0];
    }
  },
  { immediate: true }
);

function handleClose() {
  stopVideoPreview();
  emit('close');
}

function handleChange() {
  emit('update', { ...localConfig.value });
}

function handleClearLog() {
  emit('clearLog');
}

async function previewEffect() {
  showEffectPreview.value = true;
  await nextTick(); // Wait for DOM to render
  if (previewElement.value) {
    previewElement.value.innerHTML = '';
    const effectName = localConfig.value.dmChatEffect.toUpperCase();
    await playAnimation(localConfig.value.dmChatEffect as any, effectName, previewElement.value);
    setTimeout(() => {
      showEffectPreview.value = false;
    }, 300);
  }
}

async function startVideoPreview() {
  if (localConfig.value.videoInputDeviceId === NO_WEBCAM_DEVICE_ID) {
    return;
  }

  stopVideoPreview();

  const videoConstraints: MediaTrackConstraints | boolean = localConfig.value.videoInputDeviceId
    ? { deviceId: { ideal: localConfig.value.videoInputDeviceId } }
    : true;

  const stream = await navigator.mediaDevices.getUserMedia({
    video: videoConstraints,
    audio: false,
  });

  previewStream = stream;
  isVideoPreviewVisible.value = true;

  await nextTick();
  if (videoPreviewRef.value) {
    videoPreviewRef.value.srcObject = stream;
    await videoPreviewRef.value.play().catch(() => {});

    const settings = stream.getVideoTracks()[0]?.getSettings();
    const width = settings?.width;
    const height = settings?.height;
    previewResolutionLabel.value = width && height ? `${width}x${height}` : 'N/A';
    previewCameraLabel.value = stream.getVideoTracks()[0]?.label || 'UNKNOWN';
  }
}

function stopVideoPreview() {
  if (videoPreviewRef.value) {
    videoPreviewRef.value.srcObject = null;
  }

  if (previewStream) {
    previewStream.getTracks().forEach((track) => track.stop());
    previewStream = null;
  }

  previewCameraLabel.value = 'UNKNOWN';
  previewResolutionLabel.value = 'N/A';

  isVideoPreviewVisible.value = false;
}

async function toggleVideoPreview() {
  if (isVideoPreviewVisible.value) {
    stopVideoPreview();
    return;
  }

  try {
    await startVideoPreview();
  } catch (error) {
    console.error('Failed to start video preview:', error);
    stopVideoPreview();
  }
}

watch(
  () => localConfig.value.videoInputDeviceId,
  async () => {
    if (!isVideoPreviewVisible.value) {
      return;
    }

    try {
      await startVideoPreview();
    } catch (error) {
      console.error('Failed to refresh video preview:', error);
      stopVideoPreview();
    }
  }
);

watch(
  () => props.showModal,
  (isOpen) => {
    if (!isOpen) {
      stopVideoPreview();
    }
  }
);

watch(
  () => activeTab.value,
  (tab) => {
    if (tab !== 'media') {
      stopVideoPreview();
    }
  }
);

</script>

<style scoped>
#settings-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 400;
}

.modal-box {
  width: min(460px, 92vw);
  border: 2px solid var(--neon-green);
  background: var(--dark-bg);
  padding: 20px;
  text-align: left;
  height: min(80vh, 620px);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  padding-right: 10px;
  margin-bottom: 10px;
}

.setting-row {
  margin: 20px 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.settings-tabs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}

.tab-btn {
  background: transparent;
  border: 1px solid var(--neon-green);
  color: var(--neon-green);
  font-family: inherit;
  font-size: 11px;
  letter-spacing: 1px;
  padding: 8px 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn:hover {
  box-shadow: 0 0 8px var(--neon-green);
}

.tab-btn.active {
  background: var(--neon-green);
  color: #000;
}

.tab-panel {
  margin-top: 8px;
}

.settings-divider {
  border: 0;
  border-top: 1px solid rgba(57, 255, 20, 0.35);
  margin: 10px 0 4px;
}

.media-panel .setting-row {
  align-items: center;
}

.media-panel .setting-row label {
  flex: 0 0 92px;
}

.media-panel .setting-row select {
  flex: 1;
  min-width: 0;
  max-width: 100%;
  width: 100%;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}

.help-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.help-title {
  margin: 8px 0 4px;
  font-size: 12px;
  letter-spacing: 1px;
  color: var(--neon-green);
  text-transform: uppercase;
}

.help-row {
  display: grid;
  grid-template-columns: 110px 1fr;
  align-items: center;
  gap: 10px;
  font-size: 11px;
  color: var(--text-white);
}

.help-row code {
  color: var(--neon-green);
  background: rgba(57, 255, 20, 0.08);
  border: 1px solid rgba(57, 255, 20, 0.35);
  padding: 2px 6px;
  font-family: inherit;
  font-size: 11px;
  border-radius: 2px;
}

input[type='range'] {
  accent-color: var(--neon-green);
  cursor: pointer;
}

input[type='checkbox'] {
  cursor: pointer;
  width: 20px;
  height: 20px;
}

select {
  background: var(--dark-bg);
  color: var(--neon-green);
  border: 1px solid var(--neon-green);
  padding: 5px 8px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
}

select option {
  background: var(--dark-bg);
  color: var(--neon-green);
}

.clear-btn {
  width: 100%;
  padding: 12px;
  background: transparent;
  border: 2px solid #ff6b6b;
  color: #ff6b6b;
  font-family: inherit;
  font-weight: bold;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 10px;
}

.clear-btn:hover {
  background: #ff6b6b;
  color: #000;
  box-shadow: 0 0 15px #ff6b6b;
}

.close-btn {
  width: 100%;
  padding: 15px;
  background: transparent;
  border: 2px solid var(--neon-green);
  color: var(--neon-green);
  font-family: inherit;
  font-weight: bold;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s;
  text-transform: uppercase;
  letter-spacing: 2px;
}

.close-btn:hover {
  background: var(--neon-green);
  color: #000;
  box-shadow: 0 0 15px var(--neon-green);
}

h3 {
  color: var(--neon-green);
  text-transform: uppercase;
  letter-spacing: 1px;
}

label {
  text-transform: uppercase;
  font-size: 12px;
  letter-spacing: 1px;
}

.preview-btn {
  background: none;
  border: none;
  color: var(--neon-green);
  cursor: pointer;
  font-size: 16px;
  opacity: 0.6;
  transition: opacity 0.2s;
  padding: 2px;
}

.preview-btn:hover {
  opacity: 1;
}

.preview-toggle-btn {
  margin-top: 8px;
  width: 100%;
  display: block;
  padding: 8px 10px;
  background: transparent;
  border: 1px solid var(--neon-green);
  color: var(--neon-green);
  font-family: inherit;
  font-size: 11px;
  font-weight: bold;
  letter-spacing: 0.8px;
  cursor: pointer;
  text-transform: uppercase;
}

.preview-toggle-btn:hover:not(:disabled) {
  background: var(--neon-green);
  color: #000;
  box-shadow: 0 0 10px rgba(57, 255, 20, 0.35);
}

.preview-toggle-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.media-panel .setting-row.preview-action-row {
  justify-content: stretch;
}

.video-preview-wrap {
  margin-top: 10px;
  border: 1px solid var(--neon-green);
  background: #000;
  width: min(100%, 360px);
  aspect-ratio: 16 / 9;
  overflow: hidden;
}

.video-preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform: scaleX(-1);
}

.video-preview-meta {
  margin-top: 8px;
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 11px;
  letter-spacing: 0.7px;
  color: var(--neon-green);
  text-transform: uppercase;
}

.effect-preview {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 401;
  pointer-events: none;
}

.preview-text {
  font-size: 48px;
  font-weight: bold;
  text-transform: uppercase;
  font-family: 'Courier New', Courier, monospace;
  letter-spacing: 3px;
  text-align: center;
  color: var(--neon-green);
  min-height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
