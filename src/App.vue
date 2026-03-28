<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useLobbyChat } from './composables/useLobbyChat';
import { useTheme } from './composables/useTheme';
import AuthScreen from './components/AuthScreen.vue';
import ChatArea from './components/ChatArea.vue';
import Sidebar from './components/Sidebar.vue';
import SettingsModal from './components/SettingsModal.vue';
import NetworkConfigModal from './components/NetworkConfigModal.vue';

const { username, messages, users, isConnected, authError, config, networkConfig, availableSoundpacks, boot, sendMessage, disconnect, updateSettings, tryPlayAmbience, setNetworkConfig, setSoundpack, clearMessages } = useLobbyChat();
const { availableThemes, applyTheme } = useTheme();

const showAuth = computed(() => !isConnected.value);
const showSettings = ref(false);
const showNetworkConfig = ref(false);
const showShutdownAnim = ref(false);
const isMaximized = ref(false);

const pageTitle = computed(() => {
  return isConnected.value ? 'LOBBY // LISTENING' : 'LOBBY // AUTH';
});

onMounted(async () => {
  const appWindow = getCurrentWindow();
  isMaximized.value = await appWindow.isMaximized();
});

watch(pageTitle, (newTitle) => {
  document.title = newTitle;
});

async function toggleMaximize() {
  const appWindow = getCurrentWindow();
  if (isMaximized.value) {
    await appWindow.unmaximize();
  } else {
    await appWindow.maximize();
  }
  isMaximized.value = !isMaximized.value;
}

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
</script>

<template>
  <div data-tauri-drag-region class="custom-titlebar">
    {{ pageTitle }}
    <button class="maximize-btn" @click="toggleMaximize" :title="isMaximized ? 'Restore' : 'Maximize'">
      {{ isMaximized ? '◻' : '◻' }}
    </button>
  </div>
  <div id="app" :class="{ 'shutdown-anim': showShutdownAnim }">
    <button class="gear-btn" @click="toggleSettings">⚙</button>

    <SettingsModal
      :show-modal="showSettings"
      :config="config"
      :available-soundpacks="availableSoundpacks"
      :available-themes="availableThemes"
      title="Client Settings"
      @update="
        (newConfig) => {
          config.audioEnabled = newConfig.audioEnabled;
          config.volume = newConfig.volume;
          if (config.soundpack !== newConfig.soundpack) {
            setSoundpack(newConfig.soundpack);
          }
          if (config.theme !== newConfig.theme) {
            applyTheme(newConfig.theme);
            config.theme = newConfig.theme;
          }
          updateSettings();
        }
      "
      @clear-log="clearMessages"
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
.custom-titlebar {
  width: 100%;
  background: #222;
  display: flex;
  justify-content: center;
  align-items: center;
  user-select: none; /* Prevents text selection while dragging */
  z-index: 1000;
  position: relative;
}

.maximize-btn {
  position: absolute;
  right: 10px;
  background: none;
  border: none;
  color: var(--neon-green);
  font-size: 14px;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.3s;
  padding: 4px 8px;
}

.maximize-btn:hover {
  opacity: 1;
}
</style>