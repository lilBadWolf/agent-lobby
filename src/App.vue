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
const focusedDMUser = ref<string | null>(null);
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

function quit() {
  showShutdownAnim.value = true;
  setTimeout(async () => {
    disconnect();
    showShutdownAnim.value = false;
    const window = getCurrentWindow();
    await window.close();
  }, 600);
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
    // Check if chat already exists
    if (dm.value.activeChats.value.has(user)) {
      // Jump to existing chat
      focusedDMUser.value = user;
      showDM.value = true;
    } else {
      // Start new DM request
      await dm.value.requestDM(user);
      showDM.value = true;
    }
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

function handleSendDMMessage(user: string, message: string, effect: string) {
  if (dm.value) {
    dm.value.sendDMMessage(user, message, effect);
  }
}

function handleTyping(user: string) {
  if (dm.value) {
    dm.value.sendTyping(user);
  }
}

function handleStopTyping(user: string) {
  if (dm.value) {
    dm.value.sendStopTyping(user);
  }
}

function handleCloseDM(user: string) {
  if (dm.value) {
    dm.value.closeDM(user);
  }
}

function handleCancelPendingMessages(user: string) {
  if (dm.value) {
    dm.value.cancelPendingMessages(user);
  }
}

function handleRequestAudio(user: string) {
  if (dm.value) {
    dm.value.requestAudioCall(user);
  }
}

function handleToggleAudio(user: string, enabled: boolean) {
  if (dm.value) {
    dm.value.toggleAudioStream(user, enabled);
  }
}

function handleRequestVideo(user: string) {
  if (dm.value) {
    dm.value.requestVideoCall(user);
  }
}

function handleToggleVideo(user: string, enabled: boolean) {
  if (dm.value) {
    dm.value.toggleVideoStream(user, enabled);
  }
}

function handleSendFile(user: string, file: File) {
  if (dm.value) {
    dm.value.sendFile(user, file);
  }
}
</script>

<template>
  <div data-tauri-drag-region class="custom-titlebar">
    {{ pageTitle }}
    <button class="minimize-btn" @click="minimize">—</button>
    <button class="maximize-btn" @click="toggleMaximize">
      {{ isMaximized ? '◻' : '◻' }}
    </button>
    <button class="titlebar-close-btn" @click="quit">✕</button>
  </div>
  <div id="app" :class="{ 'shutdown-anim': showShutdownAnim }">
    <button class="gear-btn" @click="toggleSettings">⚙</button>

    <SettingsModal
      :show-modal="showSettings"
      :config="config"
      :available-soundpacks="availableSoundpacks"
      :available-themes="availableThemes"
      @update="
        (newConfig) => {
          config.dmEnabled = newConfig.dmEnabled;
          config.audioEnabled = newConfig.audioEnabled;
          config.volume = newConfig.volume;
          config.dmChatEffect = newConfig.dmChatEffect;
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
      :dm-chat-effect="config.dmChatEffect"
      :focused-dm-user="focusedDMUser"
      @close="toggleDM"
      @accept-dm="handleAcceptDM"
      @reject-dm="handleRejectDM"
      @cancel-request="handleCancelDMRequest"
      @send-message="handleSendDMMessage"
      @typing="handleTyping"
      @stop-typing="handleStopTyping"
      @cancel-pending-messages="handleCancelPendingMessages"
      @close-dm="handleCloseDM"
      @request-audio="handleRequestAudio"
      @toggle-audio="handleToggleAudio"
      @request-video="handleRequestVideo"
      @toggle-video="handleToggleVideo"
      @send-file="handleSendFile"
    />

    <AuthScreen :show-auth="showAuth" :auth-error="authError" @login="handleLogin" @ambience="handleAmbience" @config-clicked="toggleNetworkConfig" />

    <div v-if="!showAuth" class="main-view">
      <ChatArea :messages="messages" :username="username" :is-connected="isConnected" @send="sendMessage" />
      <Sidebar :users="users" :current-username="username" @disconnect="handleDisconnect" @dm-request="handleDMRequest" />
    </div>
  </div>
</template>

<style>
@import './styles/global.css';
.custom-titlebar {
  grid-area: titlebar;
  width: 100%;
  height: 16px;
  background: #222;
  display: flex;
  justify-content: center;
  align-items: center;
  user-select: none; /* Prevents text selection while dragging */
  z-index: 1000;
  position: relative;
}

.minimize-btn {
  position: absolute;
  right: 60px;
  background: none;
  border: none;
  color: var(--neon-green);
  font-size: 14px;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.3s;
  width: 20px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.minimize-btn:hover {
  opacity: 1;
}

.maximize-btn {
  position: absolute;
  right: 35px;
  background: none;
  border: none;
  color: var(--neon-green);
  font-size: 14px;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.3s;
  width: 20px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.maximize-btn:hover {
  opacity: 1;
}

.titlebar-close-btn {
  position: absolute;
  right: 10px;
  background: none;
  border: none;
  color: var(--alert-red);
  font-size: 14px;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.3s;
  width: 20px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.titlebar-close-btn:hover {
  opacity: 1;
}
</style>