<script setup lang="ts">
import { ref, watch } from 'vue';

export interface AudioConfig {
  audioEnabled: boolean;
  volume: number;
}

const props = defineProps<{
  showModal: boolean;
  config: AudioConfig;
}>();

const emit = defineEmits<{
  update: [config: AudioConfig];
  close: [];
}>();

const localConfig = ref<AudioConfig>({ ...props.config });

watch(
  () => props.config,
  (newConfig) => {
    localConfig.value = { ...newConfig };
  }
);

function handleClose() {
  emit('close');
}

function handleChange() {
  emit('update', { ...localConfig.value });
}
</script>

<template>
  <div v-if="showModal" id="settings-modal" @click="(e) => e.target === $el && handleClose()">
    <div class="modal-box">
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
      <button class="close-btn" @click="handleClose">CLOSE</button>
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
}

.setting-row {
  margin: 20px 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
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
</style>
