<script setup lang="ts">
import { ref, watch } from 'vue';
import type { NetworkConfig } from '../composables/useLobbyChat';

const props = defineProps<{
  showModal: boolean;
  networkConfig: NetworkConfig;
}>();

const emit = defineEmits<{
  update: [config: NetworkConfig];
  close: [];
}>();

const localConfig = ref<NetworkConfig>({ ...props.networkConfig });

watch(
  () => props.networkConfig,
  (newConfig) => {
    localConfig.value = { ...newConfig };
  }
);

function handleClose() {
  emit('close');
}

function handleSave() {
  if (localConfig.value.mqttServer.trim() && localConfig.value.defaultLobby.trim()) {
    emit('update', {
      mqttServer: localConfig.value.mqttServer.trim(),
      defaultLobby: localConfig.value.defaultLobby.trim()
    });
    handleClose();
  }
}
</script>

<template>
  <div v-if="showModal" id="network-config-modal" @click="(e) => e.target === $el && handleClose()">
    <div class="modal-box">
      <div class="config-content">
        <h3 style="margin-top: 0; border-bottom: 1px solid var(--neon-green)">NET_CONFIG</h3>
        <div class="config-row">
          <label for="mqtt-server">MQTT SERVER</label>
          <input
            id="mqtt-server"
            v-model="localConfig.mqttServer"
            type="text"
            placeholder="wss://broker.emqx.io:8084/mqtt"
          />
        </div>
        <div class="config-row">
          <label for="default-lobby">DEFAULT LOBBY</label>
          <input
            id="default-lobby"
            v-model="localConfig.defaultLobby"
            type="text"
            placeholder="spy_terminal"
          />
        </div>
      </div>
      <button class="save-btn" @click="handleSave">SAVE CONFIG</button>
      <button class="close-btn" @click="handleClose">CLOSE</button>
    </div>
  </div>
</template>

<style scoped>
#network-config-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 400;
}

.modal-box {
  width: 350px;
  border: 2px solid var(--neon-green);
  background: var(--dark-bg);
  padding: 20px;
  text-align: left;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.config-content {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.config-row {
  margin: 20px 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

label {
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 1px;
  color: var(--neon-green);
}

input[type='text'] {
  background: rgba(57, 255, 20, 0.1);
  border: 1px solid var(--neon-green);
  color: var(--neon-green);
  padding: 10px;
  font-family: inherit;
  font-size: 12px;
  outline: none;
  transition: all 0.2s;
}

input[type='text']:focus {
  border-color: var(--neon-green);
  box-shadow: 0 0 10px rgba(57, 255, 20, 0.3);
}

input[type='text']::placeholder {
  color: rgba(57, 255, 20, 0.5);
}

.save-btn,
.close-btn {
  width: 100%;
  padding: 12px;
  background: transparent;
  border: 2px solid var(--neon-green);
  color: var(--neon-green);
  font-family: inherit;
  font-weight: bold;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-top: 10px;
}

.save-btn:hover,
.close-btn:hover {
  background: var(--neon-green);
  color: #000;
  box-shadow: 0 0 15px var(--neon-green);
}

.close-btn {
  margin-top: 5px;
}

h3 {
  color: var(--neon-green);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin: 0 0 15px 0;
}
</style>
