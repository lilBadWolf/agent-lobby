<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import type { AudioConfig } from '../composables/useLobbyChat';
import { useMessageAnimations } from '../composables/useMessageAnimations';
import { useMediaDevices } from '../composables/useMediaDevices';

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

const localConfig = ref<AudioConfig>({ ...props.config });
const showEffectPreview = ref(false);
const previewElement = ref<HTMLElement>();
const { playAnimation } = useMessageAnimations();

const { audioInputDevices, audioOutputDevices, videoInputDevices, requestMediaPermission } = useMediaDevices();

watch(
  () => props.showModal,
  async (isOpen) => {
    if (isOpen) {
      // Request media permission and enumerate devices when settings modal opens
      await requestMediaPermission();
    }
  }
);

watch(
  () => props.config,
  (newConfig) => {
    localConfig.value = { ...newConfig };
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

</script>

<template>
  <div v-if="showModal" id="settings-modal" @click="(e) => e.target === $el && handleClose()">
    <div class="modal-box">
      <div class="settings-content">
        <h3 style="margin-top: 0; border-bottom: 1px solid var(--neon-green)">CONFIG_SYS</h3>
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
            <label>DM CHAT EFFECT</label>
            <button class="preview-btn" @click="previewEffect" title="Preview Effect">🔭</button>
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
          <label>AUDIO INPUT</label>
          <select
            v-model="localConfig.audioInputDeviceId"
            id="set-audio-input"
            @change="handleChange"
          >
            <option value="">DEFAULT</option>
            <option v-for="device in audioInputDevices" :key="device.deviceId" :value="device.deviceId">
              {{ device.label }}
            </option>
          </select>
        </div>
        <div class="setting-row">
          <label>AUDIO OUTPUT</label>
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
          <label>VIDEO INPUT</label>
          <select
            v-model="localConfig.videoInputDeviceId"
            id="set-video-input"
            @change="handleChange"
          >
            <option value="">DEFAULT</option>
            <option v-for="device in videoInputDevices" :key="device.deviceId" :value="device.deviceId">
              {{ device.label }}
            </option>
          </select>
        </div>
      </div>
      <button class="clear-btn" @click="handleClearLog">CLEAR MSG LOG</button>
      <button class="close-btn" @click="handleClose">CLOSE</button>
    </div>
    <div v-if="showEffectPreview" class="effect-preview">
      <div ref="previewElement" class="preview-text"></div>
    </div>
  </div>
</template>

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
  width: 300px;
  border: 2px solid var(--neon-green);
  background: var(--dark-bg);
  padding: 20px;
  text-align: left;
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
