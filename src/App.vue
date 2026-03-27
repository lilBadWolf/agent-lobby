<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useLobbyChat } from './composables/useLobbyChat';
import AuthScreen from './components/AuthScreen.vue';
import ChatArea from './components/ChatArea.vue';
import Sidebar from './components/Sidebar.vue';
import SettingsModal from './components/SettingsModal.vue';
import NetworkConfigModal from './components/NetworkConfigModal.vue';

const { username, messages, users, isConnected, authError, config, networkConfig, boot, sendMessage, disconnect, updateSettings, tryPlayAmbience, setNetworkConfig } = useLobbyChat();

const showAuth = computed(() => !isConnected.value);
const showSettings = ref(false);
const showNetworkConfig = ref(false);
const showShutdownAnim = ref(false);

const pageTitle = computed(() => {
  return isConnected.value ? 'LOBBY // LISTENING' : 'LOBBY // AUTH';
});

watch(pageTitle, (newTitle) => {
  document.title = newTitle;
});

function handleLogin(handle: string) {
  const params = new URLSearchParams(window.location.search);
  const rawId = params.get('id');
  boot(handle, rawId || undefined);
}

function handleDisconnect() {
  showShutdownAnim.value = true;
  setTimeout(() => {
    disconnect();
    showShutdownAnim.value = false;
  }, 600);
}

function toggleSettings() {
  showSettings.value = !showSettings.value;
}

function toggleNetworkConfig() {
  showNetworkConfig.value = !showNetworkConfig.value;
}

function handleAmbience() {
  tryPlayAmbience();
}

// Set initial page title
document.title = 'LOBBY // AUTH';
</script>

<template>
  <div id="app" :class="{ 'shutdown-anim': showShutdownAnim }">
    <button class="gear-btn" @click="toggleSettings">⚙</button>

    <SettingsModal
      :show-modal="showSettings"
      :config="config"
      @update="
        (newConfig) => {
          config.audioEnabled = newConfig.audioEnabled;
          config.volume = newConfig.volume;
          updateSettings();
        }
      "
      @close="toggleSettings"
    />

    <NetworkConfigModal
      :show-modal="showNetworkConfig"
      :network-config="networkConfig"
      @update="(newConfig) => setNetworkConfig(newConfig)"
      @close="toggleNetworkConfig"
    />

    <AuthScreen :show-auth="showAuth" :auth-error="authError" @login="handleLogin" @ambience="handleAmbience" @config-clicked="toggleNetworkConfig" />

    <div v-if="!showAuth" class="main-view">
      <ChatArea :messages="messages" :username="username" :is-connected="isConnected" @send="sendMessage" />
      <Sidebar :users="users" @disconnect="handleDisconnect" />
    </div>
  </div>
</template>

<style>
@import './styles/global.css';
</style>