<script setup lang="ts">
import { ref, shallowRef, computed, watch, onMounted } from 'vue';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useLobbyChat } from './composables/useLobbyChat';
import { useTheme } from './composables/useTheme';
import { useDirectMessage } from './composables/useDirectMessage';
import AuthScreen from './components/AuthScreen.vue';
import ChatArea from './components/ChatArea.vue';
import Sidebar from './components/Sidebar.vue';
import SettingsModal from './components/SettingsModal.vue';
import NetworkConfigModal from './components/NetworkConfigModal.vue';
import DMChatModal from './components/DMChatModal.vue';

const { username, messages, users, isConnected, authError, config, networkConfig, availableSoundpacks, boot, sendMessage, disconnect, updateSettings, tryPlayAmbience, setNetworkConfig, setSoundpack, clearMessages, getMqttClient, getRoomId } = useLobbyChat();
const { availableThemes, applyTheme } = useTheme();

// DM system
const showDM = ref(false);
type DMType = ReturnType<typeof useDirectMessage>;
const dm = shallowRef<DMType | null>(null);

const dmActiveChats = computed(() => dm.value?.activeChats.value || new Map());
const dmPendingRequests = computed(() => dm.value?.pendingRequests.value || []);
const dmOutgoingRequests = computed(() => dm.value?.outgoingRequests.value || []);
const dmNotices = computed(() => dm.value?.notices.value || []);

watch(
  () => dmPendingRequests.value.length,
  (pendingCount) => {
    if (pendingCount > 0) {
      showDM.value = true;
    }
  }
);

// Initialize DM when connected
watch(isConnected, (connected) => {
  if (connected && !dm.value) {
    const mqttClient = getMqttClient();
    const roomId = getRoomId();
    const connectedCallback = (callback: () => void) => {
      callback(); // Already connected, call immediately
    };

    dm.value = useDirectMessage(
      { value: username.value },
      roomId,
      mqttClient,
      connectedCallback
    );
  } else if (!connected && dm.value) {
    dm.value.cleanup();
    dm.value = null;
  }
});

const showAuth = computed(() => !isConnected.value);
const showSettings = ref(false);
const showNetworkConfig = ref(false);
const showShutdownAnim = ref(false);
const isMaximized = ref(false);

const pageTitle = computed(() => {
  if (!isConnected.value) return 'LOBBY // AUTH';
  if (isConnected.value && !showDM.value) {
    return `${username.value} // LISTENING`;
  } else if (isConnected.value && showDM.value) {
    const activeDMs = Array.from(dmActiveChats.value.keys());
    if (activeDMs.length > 0) {
      return `${username.value} // DM with ${activeDMs.join(', ')}`;
    }
  }
});

onMounted(async () => {
  const appWindow = getCurrentWindow();
  isMaximized.value = await appWindow.isMaximized();
  window.addEventListener('contextmenu', (e) => e.preventDefault());
});

watch(pageTitle, (newTitle) => {
  document.title = newTitle ?? "LOBBY // AUTH";
});

function minimize() {
  const appWindow = getCurrentWindow();
  appWindow.minimize();
}

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

function toggleDM() {
  showDM.value = !showDM.value;
}

function handleAmbience() {
  tryPlayAmbience();
}

async function handleDMRequest(user: string) {
  if (dm.value) {
    await dm.value.requestDM(user);
    showDM.value = true;
  }
}

function handleAcceptDM(user: string) {
  if (dm.value) {
    dm.value.acceptDM(user);
    showDM.value = true;
  }
}

function handleRejectDM(user: string) {
  if (dm.value) {
    dm.value.rejectDM(user);
  }
}

function handleCancelDMRequest(user: string) {
  if (dm.value) {
    dm.value.cancelDMRequest(user);
  }
}

function handleSendDMMessage(user: string, message: string) {
  if (dm.value) {
    dm.value.sendDMMessage(user, message);
  }
}

function handleCloseDM(user: string) {
  if (dm.value) {
    dm.value.closeDM(user);
  }
}
</script>

<template>
  <div data-tauri-drag-region class="custom-titlebar">
    {{ pageTitle }}
    <button class="minimize-btn" @click="minimize" title="Minimize">—</button>
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
          config.dmEnabled = newConfig.dmEnabled;
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

    <DMChatModal
      :show-modal="showDM"
      :active-chats="dmActiveChats"
      :pending-requests="dmPendingRequests"
      :outgoing-requests="dmOutgoingRequests"
      :notices="dmNotices"
      :username="username"
      @close="toggleDM"
      @accept-dm="handleAcceptDM"
      @reject-dm="handleRejectDM"
      @cancel-request="handleCancelDMRequest"
      @send-message="handleSendDMMessage"
      @close-dm="handleCloseDM"
    />

    <AuthScreen :show-auth="showAuth" :auth-error="authError" @login="handleLogin" @ambience="handleAmbience" @config-clicked="toggleNetworkConfig" />

    <div v-if="!showAuth" class="main-view">
      <ChatArea :messages="messages" :username="username" :is-connected="isConnected" @send="sendMessage" />
      <Sidebar :users="users" @disconnect="handleDisconnect" @dm-request="handleDMRequest" />
    </div>
  </div>
</template>

<style>
@import './styles/global.css';
.custom-titlebar {
  width: 100%;
  height: 16px;
  background: #222;
  display: flex;
  justify-content: center;
  align-items: center;
  user-select: none; /* Prevents text selection while dragging */
  z-index: 1000;
  position: relative;
  flex-shrink: 0;
}

.minimize-btn {
  position: absolute;
  right: 30px;
  background: none;
  border: none;
  color: var(--neon-green);
  font-size: 14px;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.3s;
  padding: 4px 8px;
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