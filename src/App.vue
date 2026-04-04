<template>
  <div data-tauri-drag-region class="custom-titlebar">
    {{ pageTitle }}
    <button
      v-if="isUpdateAvailable"
      class="titlebar-update-btn"
      @click="handleInstallUpdate"
    >
      {{ isInstallingUpdate ? 'Installing...' : `Download ${availableVersion || 'Update'}` }}
    </button>
    <button
      v-if="config.agentAmpDetached"
      class="titlebar-agentamp-btn"
      :class="{ 'is-playing': isAgentAmpPlaying }"
      @click="handleShowAgentAmpWindow"
    >
      agentAMP
    </button>
    <button class="minimize-btn" @click="minimize">—</button>
    <button class="maximize-btn" @click="toggleMaximize">
      <span class="window-icon" :class="{ maximized: isMaximized }" aria-hidden="true"></span>
    </button>
    <button class="titlebar-close-btn" @click="quit">✕</button>
  </div>
  <div id="app-shell" :class="{ 'shutdown-anim': showShutdownAnim }">
    <button
      v-if="!showAuth"
      class="sidebar-pane-toggle-btn"
      type="button"
      :title="isSidebarVisible ? 'Compact agent pane' : 'Expand agent pane'"
      :aria-label="isSidebarVisible ? 'Compact agent pane' : 'Expand agent pane'"
      @click="toggleSidebarPane"
    >
      &#x1F464;&#xFE0E;
    </button>
    <button class="gear-btn" @click="toggleSettings">⚙</button>

    <SettingsModal
      :show-modal="showSettings"
      :config="config"
      :available-soundpacks="availableSoundpacks"
      :available-themes="availableThemes"
      @update="handleSettingsUpdate"
      @clear-log="clearMessages"
      @close="toggleSettings"
    />

    <NetworkConfigModal
      :show-modal="showNetworkConfig"
      :network-config="networkConfig"
      @update="(newConfig) => setNetworkConfig(newConfig)"
      @close="toggleNetworkConfig"
    />

    <DMRequestStack
      v-if="!showAuth"
      :pending-requests="dmPendingRequests"
      :pending-audio-calls="dmPendingAudioCalls"
      :pending-video-calls="dmPendingVideoCalls"
      :notices="dmNotices"
      @accept-dm="handleAcceptDM"
      @reject-dm="handleRejectDM"
      @accept-audio="handleAcceptAudio"
      @reject-audio="handleRejectAudio"
      @accept-video="handleAcceptVideo"
      @reject-video="handleRejectVideo"
      @cancel-request="handleCancelDMRequest"
    />

    <AuthScreen
      :show-auth="showAuth"
      :app-version="appVersion"
      :auth-error="authError"
      :online-agent-count="onlineAgentCount"
      :presence-ready="isPresencePreviewReady"
      :presence-status="presencePreviewStatus"
      :presence-status-message="presencePreviewStatusMessage"
      @login="handleLogin"
      @ambience="handleAmbience"
      @config-clicked="toggleNetworkConfig"
    />

    <div v-if="!showAuth" class="workspace-shell">
      <div
        class="main-view"
        :class="{ 'sidebar-compact': !isSidebarVisible }"
      >
        <ChatArea
          :messages="messages"
          :username="username"
          :is-connected="isConnected"
          :users="users"
          :lobby-tabs="lobbyTabs"
          :active-lobby-id="activeLobbyId"
          :default-lobby-id="networkConfig.defaultLobby"
          :mention-request="mentionRequest"
          @send="handleChatSend"
          @join-lobby="handleJoinLobby"
          @switch-lobby="handleSwitchLobby"
          @close-lobby="handleCloseLobby"
          @typing="(typing) => setTyping(typing)"
        />
        <Sidebar
          :users="users"
          :current-username="username"
          :is-away="isAway"
          :dm-bubble-states="dmBubbleStates"
          :show-dm-launcher="hasDMActivity"
          :is-compact="!isSidebarVisible"
          @disconnect="handleDisconnect"
          @dm-request="handleDMRequest"
          @show-dm-window="handleShowDMWindow"
          @mention-request="handleMentionRequest"
          @toggle-away="handleToggleAway"
        />
      </div>
      <AgentAmpPlayer
        v-if="config.agentAmpEnabled && !config.agentAmpDetached"
        :enabled="config.agentAmpEnabled"
      />
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
  color: var(--color-accent);
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

.titlebar-update-btn {
  position: absolute;
  right: 190px;
  height: 16px;
  border: 1px solid var(--color-accent);
  background: transparent;
  color: var(--color-accent);
  font-size: 10px;
  line-height: 1;
  padding: 0 6px;
  opacity: 0.85;
  cursor: pointer;
  display: flex;
  align-items: center;
}

.titlebar-update-btn:hover {
  opacity: 1;
}

.titlebar-agentamp-btn {
  position: absolute;
  right: 90px;
  height: 16px;
  border: none;
  background: transparent;
  color: var(--color-accent);
  font-size: 10px;
  line-height: 1;
  padding: 0 6px;
  opacity: 0.85;
  cursor: pointer;
  display: flex;
  align-items: center;
  transition: opacity 0.2s, color 0.2s, text-shadow 0.2s, filter 0.2s;
}

.titlebar-agentamp-btn:hover {
  opacity: 1;
}

.titlebar-agentamp-btn.is-playing {
  color: var(--color-accent);
  text-shadow: 0 0 8px var(--color-agentamp-track-active-glow, var(--color-accent-muted)), 0 0 14px var(--color-accent-muted);
  filter: saturate(1.15);
  opacity: 1;
}

.maximize-btn {
  position: absolute;
  right: 35px;
  background: none;
  border: none;
  color: var(--color-accent);
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

.window-icon {
  display: block;
  position: relative;
  width: 10px;
  height: 8px;
  border: 1.5px solid currentColor;
  box-sizing: border-box;
}

.window-icon.maximized::before {
  content: '';
  position: absolute;
  width: 10px;
  height: 8px;
  border: 1.5px solid currentColor;
  top: -4px;
  left: 2px;
  box-sizing: border-box;
  background: transparent;
}

.maximize-btn:hover {
  opacity: 1;
}

.titlebar-close-btn {
  position: absolute;
  right: 10px;
  background: none;
  border: none;
  color: var(--color-danger);
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

.workspace-shell {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.workspace-shell .main-view {
  flex: 1 1 auto;
  min-height: 0;
  height: auto;
}

</style>

<script setup lang="ts">
import { ref, shallowRef, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import packageJson from '../package.json';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useLobbyChat } from './composables/useLobbyChat';
import { useTheme } from './composables/useTheme';
import { useDirectMessage } from './composables/useDirectMessage';
import { getPersistedValue, setPersistedValue } from './composables/usePlatformStorage';
import type { AudioConfig } from './types/chat';
import type { FileTransferState } from './types/directMessage';
import type { DMWindowAction, DMWindowStatePayload, SerializedDMChat } from './types/dmWindowBridge';
import { installAvailableUpdate, startAutoUpdaterPulse, stopAutoUpdaterPulse, useAutoUpdaterState } from './composables/useAutoUpdater';
import AuthScreen from './components/AuthScreen.vue';
import ChatArea from './components/ChatArea.vue';
import Sidebar from './components/Sidebar.vue';
import SettingsModal from './components/SettingsModal.vue';
import NetworkConfigModal from './components/NetworkConfigModal.vue';
import DMRequestStack from './components/DMRequestStack.vue';
import AgentAmpPlayer from './components/AgentAmpPlayer.vue';

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && typeof (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ === 'object';
}

const {
  username,
  messages,
  users,
  onlineAgentCount,
  activeLobbyId,
  lobbyTabs,
  isPresencePreviewReady,
  presencePreviewStatus,
  presencePreviewStatusMessage,
  isConnected,
  authError,
  config,
  networkConfig,
  availableSoundpacks,
  boot,
  joinLobby,
  leaveLobby,
  switchLobby,
  sendMessage,
  disconnect,
  updateSettings,
  tryPlayAmbience,
  setNetworkConfig,
  setSoundpack,
  clearMessages,
  addSystemMessage,
  getMqttClient,
  getRoomId,
  setTyping,
  toggleAway,
  isAway,
} = useLobbyChat();
const { availableThemes, applyTheme } = useTheme();
const {
  isUpdateAvailable,
  availableVersion,
  isInstallingUpdate,
} = useAutoUpdaterState();
const appVersion = packageJson.version;
const DM_WINDOW_LABEL = 'dm-window';
const DM_WINDOW_STATE_EVENT = 'dm-window-state';
const DM_WINDOW_ACTION_EVENT = 'dm-window-action';
const DM_WEB_CHANNEL = 'agent-lobby-dm-window';
const DM_WINDOW_DEFAULT_WIDTH = 640;
const DM_WINDOW_DEFAULT_HEIGHT = 400;
const DM_WINDOW_MIN_WIDTH = 320;
const DM_WINDOW_MIN_HEIGHT = 200;
const AGENTAMP_WINDOW_LABEL = 'agentamp-window';
const AGENTAMP_WINDOW_DEFAULT_WIDTH = 860;
const AGENTAMP_WINDOW_DEFAULT_HEIGHT = 320;
const AGENTAMP_WINDOW_MIN_WIDTH = 560;
const AGENTAMP_WINDOW_MIN_HEIGHT = 220;
const AGENTAMP_STATUS_CHANNEL = 'agent-lobby-agentamp-status';
const AGENTAMP_PLAYING_STORAGE_KEY = 'agent_agentamp_playing';
const AGENTAMP_FORCE_CLOSE_STORAGE_KEY = 'agent_agentamp_force_close';
const DM_WINDOW_MEDIA_EVENT = 'media-state';
const DM_WINDOW_MEDIA_RELAY_OFFER_EVENT = 'media-relay-offer';
const DM_WINDOW_MEDIA_RELAY_ANSWER_EVENT = 'media-relay-answer';
const DM_WINDOW_MEDIA_RELAY_ICE_EVENT = 'media-relay-ice';
const DM_WINDOW_MEDIA_RELAY_CLOSE_EVENT = 'media-relay-close';
//const DM_APP_LOG_PREFIX = '[AppDMBridge]';

type RelayStreamKind = 'local' | 'remote';

interface MediaRelayOfferMessage {
  type: typeof DM_WINDOW_MEDIA_RELAY_OFFER_EVENT;
  user: string;
  kind: RelayStreamKind;
  sdp: RTCSessionDescriptionInit;
}

interface MediaRelayAnswerMessage {
  type: typeof DM_WINDOW_MEDIA_RELAY_ANSWER_EVENT;
  user: string;
  kind: RelayStreamKind;
  sdp: RTCSessionDescriptionInit;
}

interface MediaRelayIceMessage {
  type: typeof DM_WINDOW_MEDIA_RELAY_ICE_EVENT;
  user: string;
  kind: RelayStreamKind;
  candidate: RTCIceCandidateInit;
}

interface MediaRelayCloseMessage {
  type: typeof DM_WINDOW_MEDIA_RELAY_CLOSE_EVENT;
  user: string;
  kind: RelayStreamKind;
}

interface RelaySenderEntry {
  user: string;
  kind: RelayStreamKind;
  streamId: string;
  trackSignature: string;
  pc: RTCPeerConnection;
}

// DM system
const dmWindowOpen = ref(false);
let dmPopupWindow: Window | null = null;
let dmPopupWatchIntervalId: number | null = null;
let dmWebChannel: BroadcastChannel | null = null;
let agentAmpPopupWindow: Window | null = null;
let agentAmpPopupWatchIntervalId: number | null = null;
let agentAmpStatusChannel: BroadcastChannel | null = null;
let cleanupAgentAmpStorageListener: (() => void) | null = null;
const relaySenders = new Map<string, RelaySenderEntry>();
let cleanupDMActionListener: (() => void) | null = null;
let webMessageListenerBound = false;
const focusedDMUser = ref<string | null>(null);
const mentionRequest = ref<{ username: string; nonce: number } | null>(null);
const isAgentAmpPlaying = ref(false);
type DMType = ReturnType<typeof useDirectMessage>;
const dm = shallowRef<DMType | null>(null);

function debugEnabled(): boolean {
  if (typeof window === 'undefined') {
    return true;
  }

  try {
    return window.localStorage.getItem('dm-window-debug') !== '0';
  } catch {
    return false;
  }
}

function debugLog(_message: string, details?: unknown) {
  if (!debugEnabled()) {
    return;
  }

  if (details === undefined) {
    //console.log(`${DM_APP_LOG_PREFIX} ${message}`);
    return;
  }

  //console.log(`${DM_APP_LOG_PREFIX} ${message}`, details);
}

function describeStream(stream: MediaStream | null | undefined) {
  if (!stream) {
    return null;
  }

  return {
    id: stream.id,
    active: stream.active,
    tracks: stream.getTracks().map((track) => ({
      id: track.id,
      kind: track.kind,
      enabled: track.enabled,
      muted: track.muted,
      readyState: track.readyState,
    })),
  };
}

const dmActiveChats = computed(() => dm.value?.activeChats.value || new Map());
const dmPendingRequests = computed(() => dm.value?.pendingRequests.value || []);
const dmPendingAudioCalls = computed(() => dm.value?.pendingAudioCalls.value || []);
const dmPendingVideoCalls = computed(() => dm.value?.pendingVideoCalls.value || []);
const dmOutgoingRequests = computed(() => dm.value?.outgoingRequests.value || []);
const dmDeniedRequests = computed(() => dm.value?.deniedRequests.value || []);
const dmNotices = computed(() => dm.value?.notices.value || []);
const connectedDMUsers = computed(() =>
  Array.from(dmActiveChats.value.values())
    .filter((chat) => chat.isConnected)
    .map((chat) => chat.user)
    .sort()
);
const hasDMActivity = computed(() => connectedDMUsers.value.length > 0);
const dmBubbleStates = computed<Record<string, 'active' | 'pending' | 'denied'>>(() => {
  const states: Record<string, 'active' | 'pending' | 'denied'> = {};

  for (const user of dmDeniedRequests.value) {
    states[user] = 'denied';
  }

  for (const user of dmOutgoingRequests.value) {
    states[user] = 'pending';
  }

  for (const user of dmActiveChats.value.keys()) {
    states[user] = 'active';
  }

  return states;
});

watch(
  () => connectedDMUsers.value.join('|'),
  (nextJoined, previousJoined) => {
    const nextUsers = nextJoined ? nextJoined.split('|').filter(Boolean) : [];
    const previousUsers = previousJoined ? previousJoined.split('|').filter(Boolean) : [];
    const newlyConnectedUser = nextUsers.find((user) => !previousUsers.includes(user));

    if (!newlyConnectedUser) {
      return;
    }

    focusedDMUser.value = newlyConnectedUser;

    if (!dmWindowOpen.value) {
      void openDetachedDMWindow();
    }
  }
);

// Auto-hide when active DMs transition from non-empty to empty (e.g. peer closed last DM),
// but do not auto-hide while the user is initiating a brand new DM from empty state.
watch(
  () => dmActiveChats.value.size,
  (newCount, oldCount) => {
    if (dmWindowOpen.value && oldCount > 0 && newCount === 0) {
      focusedDMUser.value = null;
      void closeDetachedDMWindow();
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
      connectedCallback,
      config.value
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
const SIDEBAR_VISIBILITY_KEY = 'agent_sidebar_visible';
const isSidebarVisible = ref(true);
const hasHydratedSidebarVisibility = ref(false);
const isMaximized = ref(false);
const hasTauriWindow = isTauriRuntime();

void (async () => {
  if (typeof window === 'undefined') {
    hasHydratedSidebarVisibility.value = true;
    return;
  }

  try {
    const persisted = await getPersistedValue<string>(SIDEBAR_VISIBILITY_KEY);
    if (persisted === '0' || persisted === '1') {
      isSidebarVisible.value = persisted === '1';
    }
  } catch {
    // ignore store read errors
  } finally {
    hasHydratedSidebarVisibility.value = true;
  }
})();

const pageTitle = computed(() => {
  if (!isConnected.value) return 'LOBBY // AUTH';
  if (dmWindowOpen.value) {
    const activeDMs = Array.from(dmActiveChats.value.keys());
    if (activeDMs.length > 0) {
      return `${username.value} // DM with ${activeDMs.join(', ')}`;
    }
    return `${username.value} // DM`;
  }

  return `${username.value} // ${isAway.value ? 'AWAY' : 'LISTENING'}`;
});

function readPersistedAgentAmpPlayingState(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return window.localStorage.getItem(AGENTAMP_PLAYING_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function updateAgentAmpPlayingState(nextPlaying: boolean) {
  isAgentAmpPlaying.value = nextPlaying;
}

function initializeAgentAmpStatusBridge() {
  updateAgentAmpPlayingState(readPersistedAgentAmpPlayingState());

  if (typeof window !== 'undefined') {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== AGENTAMP_PLAYING_STORAGE_KEY) {
        return;
      }

      updateAgentAmpPlayingState(event.newValue === '1');
    };

    window.addEventListener('storage', handleStorage);
    cleanupAgentAmpStorageListener = () => {
      window.removeEventListener('storage', handleStorage);
      cleanupAgentAmpStorageListener = null;
    };
  }

  if (typeof BroadcastChannel === 'undefined') {
    return;
  }

  agentAmpStatusChannel = new BroadcastChannel(AGENTAMP_STATUS_CHANNEL);
  agentAmpStatusChannel.onmessage = (event: MessageEvent) => {
    const message = event.data as { type?: string; playing?: boolean };
    if (message?.type !== 'playback-state' || typeof message.playing !== 'boolean') {
      return;
    }

    updateAgentAmpPlayingState(message.playing);
  };
}

function teardownAgentAmpStatusBridge() {
  if (agentAmpStatusChannel) {
    agentAmpStatusChannel.close();
    agentAmpStatusChannel = null;
  }

  cleanupAgentAmpStorageListener?.();
}

onMounted(async () => {
  // window.addEventListener('contextmenu', (e) => e.preventDefault());

  initializeAgentAmpStatusBridge();
  initializeWebDMBridge();
  await initializeDetachedDMActionListener();

  if (!hasTauriWindow) {
    return;
  }

  const appWindow = getCurrentWindow();
  isMaximized.value = await appWindow.isMaximized();
});

onBeforeUnmount(() => {
  teardownAgentAmpStatusBridge();
  void closeDetachedAgentAmpWindow();
  teardownAllRelaySenders(false);
  if (dmPopupWatchIntervalId !== null) {
    window.clearInterval(dmPopupWatchIntervalId);
    dmPopupWatchIntervalId = null;
  }
  dmWebChannel?.close();
  dmWebChannel = null;
  if (webMessageListenerBound) {
    window.removeEventListener('message', handleWebPopupMessage);
    webMessageListenerBound = false;
  }
  cleanupDMActionListener?.();
  cleanupDMActionListener = null;
});

watch(
  [
    dmActiveChats,
    dmPendingRequests,
    dmPendingAudioCalls,
    dmPendingVideoCalls,
    dmOutgoingRequests,
    dmNotices,
    focusedDMUser,
    () => username.value,
    () => config.value.dmChatEffect,
  ],
  () => {
    if (dmWindowOpen.value) {
      void emitDMWindowState();
    }
  },
  { deep: true }
);

watch(pageTitle, (newTitle) => {
  document.title = newTitle ?? "LOBBY // AUTH";
});

watch(isSidebarVisible, (visible) => {
  if (!hasHydratedSidebarVisibility.value) {
    return;
  }

  try {
    void setPersistedValue(SIDEBAR_VISIBILITY_KEY, visible ? '1' : '0');
  } catch {
    // Ignore storage errors in restricted environments.
  }
}, { immediate: true });

watch(
  () => config.value.autoUpdatePulseMinutes ?? 30,
  (pulseMinutes) => {
    stopAutoUpdaterPulse();

    if (pulseMinutes <= 0) {
      return;
    }

    startAutoUpdaterPulse(pulseMinutes * 60 * 1000);
  },
  { immediate: true }
);

watch(
  () => config.value.theme,
  (themeName) => {
    if (!themeName) {
      return;
    }

    applyTheme(themeName);
  },
  { immediate: true }
);

watch(
  () => config.value.scanlines ?? true,
  (enabled) => {
    if (typeof document === 'undefined') {
      return;
    }

    document.body.classList.toggle('scanlines-enabled', enabled);
  },
  { immediate: true }
);

watch(
  () => ({
    enabled: config.value.agentAmpEnabled,
    detached: config.value.agentAmpDetached,
  }),
  async ({ enabled, detached }) => {
    if (enabled && detached) {
      await openDetachedAgentAmpWindow();
      return;
    }

    await closeDetachedAgentAmpWindow();
  },
  { immediate: true, deep: true }
);

function minimize() {
  if (!hasTauriWindow) {
    return;
  }

  const appWindow = getCurrentWindow();
  appWindow.minimize();
}

async function toggleMaximize() {
  if (!hasTauriWindow) {
    return;
  }

  const appWindow = getCurrentWindow();
  if (isMaximized.value) {
    await appWindow.unmaximize();
  } else {
    await appWindow.maximize();
  }
  isMaximized.value = !isMaximized.value;

  window.dispatchEvent(
    new CustomEvent('agent-lobby-window-layout-changed', {
      detail: {
        state: isMaximized.value ? 'maximized' : 'restored',
      },
    })
  );
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

    if (!hasTauriWindow) {
      return;
    }

    const appWindow = getCurrentWindow();
    await appWindow.close();
  }, 600);
}

function handleInstallUpdate() {
  if (isInstallingUpdate.value) {
    return;
  }

  void installAvailableUpdate();
}

function handleDisconnect() {
  showShutdownAnim.value = true;
  setTimeout(() => {
    disconnect();
    showShutdownAnim.value = false;
  }, 600);
}

function handleToggleAway() {
  toggleAway();
}

function handleMentionRequest(user: string) {
  mentionRequest.value = {
    username: user,
    nonce: Date.now(),
  };
}

function toggleSettings() {
  showSettings.value = !showSettings.value;
}

function toggleSidebarPane() {
  isSidebarVisible.value = !isSidebarVisible.value;
}

function toggleNetworkConfig() {
  showNetworkConfig.value = !showNetworkConfig.value;
}

function handleShowDMWindow() {
  if (!isConnected.value) {
    return;
  }

  if (dmWindowOpen.value) {
    void focusDetachedDMWindow().then((focused) => {
      if (!focused) {
        void openDetachedDMWindow();
      }
    });
    return;
  }

  void openDetachedDMWindow();
}

function handleShowAgentAmpWindow() {
  if (!config.value.agentAmpDetached) {
    return;
  }

  void openDetachedAgentAmpWindow();
}

function handleAmbience() {
  tryPlayAmbience();
}

function handleSettingsUpdate(newConfig: AudioConfig) {
  const previousSoundpack = config.value.soundpack;

  config.value = {
    ...config.value,
    ...newConfig,
    autoAwayMinutes: newConfig.autoAwayMinutes ?? 10,
    autoUpdatePulseMinutes: newConfig.autoUpdatePulseMinutes ?? 30,
    agentAmpDetached: newConfig.agentAmpDetached ?? false,
    customSlashCommands: newConfig.customSlashCommands ?? [],
  };

  applyTheme(config.value.theme);

  if (previousSoundpack !== config.value.soundpack) {
    setSoundpack(config.value.soundpack);
    return;
  }

  updateSettings();
}

function handleChatSend(rawMessage: string) {
  const normalized = rawMessage.trim().toLowerCase().replace(/\s+/g, ' ');

  const joinLobbyMatch = rawMessage.trim().match(/^\/join\s+(.+)$/i);
  if (joinLobbyMatch) {
    void handleJoinLobby(joinLobbyMatch[1]);
    return;
  }

  const switchLobbyMatch = rawMessage.trim().match(/^\/lobby\s+(.+)$/i);
  if (switchLobbyMatch) {
    handleSwitchLobby(switchLobbyMatch[1]);
    return;
  }

  if (normalized === '/settings') {
    showSettings.value = true;
    return;
  }

  if (normalized === '/quit') {
    handleDisconnect();
    return;
  }

  if (normalized === '/dm on') {
    config.value.dmEnabled = true;
    updateSettings();
    return;
  }

  if (normalized === '/dm off') {
    config.value.dmEnabled = false;
    updateSettings();
    return;
  }

  const dmMentionMatch = rawMessage.trim().match(/^\/dm\s+@(.+)$/i);
  if (dmMentionMatch) {
    const requestedHandle = dmMentionMatch[1].trim();
    if (!requestedHandle) {
      return;
    }

    const matchingUser = Object.values(users).find(
      (user) => user.username.toLowerCase() === requestedHandle.toLowerCase()
    );

    void handleDMRequest(matchingUser?.username || requestedHandle);
    return;
  }

  sendMessage(rawMessage);
}

async function handleJoinLobby(rawLobbyId: string) {
  const result = await joinLobby(rawLobbyId);
  if (result.ok) {
    addSystemMessage(`CONNECTED TO LOBBY ${result.lobbyId.toUpperCase()}`);
    return;
  }

  if (result.reason === 'duplicate') {
    addSystemMessage('ALREADY CONNECTED TO THAT LOBBY.');
  } else if (result.reason === 'username-taken') {
    addSystemMessage('HANDLE ALREADY ACTIVE IN TARGET LOBBY.');
  } else if (result.reason === 'invalid') {
    addSystemMessage('INVALID LOBBY ID. USE LETTERS, NUMBERS, OR _.');
  } else {
    addSystemMessage('UNABLE TO JOIN LOBBY WHILE DISCONNECTED.');
  }
}

function handleSwitchLobby(rawLobbyId: string) {
  const switched = switchLobby(rawLobbyId);
  if (!switched) {
    addSystemMessage('LOBBY NOT FOUND. JOIN IT FIRST.');
  }
}

function handleCloseLobby(rawLobbyId: string) {
  const result = leaveLobby(rawLobbyId);
  if (result.ok) {
    addSystemMessage(`LEFT LOBBY ${result.lobbyId.toUpperCase()}`);
    return;
  }

  if (result.reason === 'default') {
    addSystemMessage('MAIN LOBBY CANNOT BE CLOSED.');
  } else if (result.reason === 'last-lobby') {
    addSystemMessage('AT LEAST ONE LOBBY MUST REMAIN OPEN.');
  } else if (result.reason === 'missing') {
    addSystemMessage('LOBBY NOT FOUND.');
  } else {
    addSystemMessage('UNABLE TO CLOSE LOBBY WHILE DISCONNECTED.');
  }
}

async function handleDMRequest(user: string) {
  if (dm.value) {
    const targetPresence = Object.values(users).find(
      (presence) => presence.username.toLowerCase() === user.toLowerCase()
    );

    if (targetPresence?.isAway) {
      addSystemMessage(`${targetPresence.username} IS CURRENTLY AWAY.`);
      return;
    }

    if (targetPresence && !targetPresence.dmAvailable) {
      addSystemMessage(`${targetPresence.username} IS NOT ACCEPTING DIRECT MESSAGES.`);
      return;
    }

    // Clicking a yellow (pending) DM bubble cancels that outgoing request.
    if (dmOutgoingRequests.value.includes(user)) {
      dm.value.cancelDMRequest(user);
      return;
    }

    // Check if chat already exists
    if (dm.value.activeChats.value.has(user)) {
      // Jump to existing chat
      focusedDMUser.value = user;
      await openDetachedDMWindow();
    } else {
      // Start new DM request
      await dm.value.requestDM(user);
    }
  }
}

function handleAcceptDM(user: string) {
  if (dm.value) {
    focusedDMUser.value = user;
    dm.value.acceptDM(user);
  }
}

function handleRejectDM(user: string) {
  if (dm.value) {
    dm.value.rejectDM(user);
  }
}

function handleAcceptAudio(user: string) {
  if (dm.value) {
    focusedDMUser.value = user;
    dm.value.acceptAudioCall(user);
    void openDetachedDMWindow();
  }
}

function handleRejectAudio(user: string) {
  if (dm.value) {
    dm.value.rejectAudioCall(user);
  }
}

function handleAcceptVideo(user: string) {
  if (dm.value) {
    focusedDMUser.value = user;
    dm.value.acceptVideoCall(user);
    void openDetachedDMWindow();
  }
}

function handleRejectVideo(user: string) {
  if (dm.value) {
    dm.value.rejectVideoCall(user);
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

    if (dm.value.activeChats.value.size === 0) {
      focusedDMUser.value = null;
      void closeDetachedDMWindow();
    }
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

function handleAcceptFile(user: string, fileId: string) {
  if (dm.value) {
    dm.value.acceptFileTransfer(user, fileId);
  }
}

function handleRejectFile(user: string, fileId: string) {
  if (dm.value) {
    dm.value.rejectFileTransfer(user, fileId);
  }
}

function handleFileSaved(user: string, fileId: string) {
  if (dm.value) {
    dm.value.markFileSaved(user, fileId);
  }
}

function handleRemoveFile(user: string, fileId: string) {
  if (dm.value) {
    dm.value.removeFileTransfer(user, fileId);
  }
}

function initializeWebDMBridge() {
  debugLog('initializeWebDMBridge', {
    broadcastChannelSupported: typeof BroadcastChannel !== 'undefined',
  });

  if (!webMessageListenerBound) {
    window.addEventListener('message', handleWebPopupMessage);
    webMessageListenerBound = true;
  }

  if (typeof BroadcastChannel === 'undefined') {
    return;
  }

  dmWebChannel = new BroadcastChannel(DM_WEB_CHANNEL);
  debugLog('BroadcastChannel created', { channel: DM_WEB_CHANNEL });
  dmWebChannel.onmessage = (event: MessageEvent) => {
    const message = event.data as { type?: string; payload?: unknown };
    if (message?.type === 'action') {
      handleDetachedDMAction(message.payload as DMWindowAction);
      return;
    }

    if (message?.type === DM_WINDOW_MEDIA_RELAY_ANSWER_EVENT) {
      void handleMediaRelayAnswer(message as MediaRelayAnswerMessage);
      return;
    }

    if (message?.type === DM_WINDOW_MEDIA_RELAY_ICE_EVENT) {
      void handleMediaRelayIce(message as MediaRelayIceMessage);
    }
  };
}

function relayKey(user: string, kind: RelayStreamKind): string {
  return `${user}::${kind}`;
}

function getTrackSignature(stream: MediaStream | null | undefined): string {
  if (!stream) {
    return 'none';
  }

  return stream.getTracks()
    .map((track) => `${track.kind}:${track.id}:${track.readyState}`)
    .sort()
    .join('|');
}

function teardownRelaySender(user: string, kind: RelayStreamKind, notifyPeer = true) {
  const key = relayKey(user, kind);
  const existing = relaySenders.get(key);
  if (!existing) {
    return;
  }

  try {
    existing.pc.onicecandidate = null;
    existing.pc.onconnectionstatechange = null;
    existing.pc.close();
  } catch (error) {
    debugLog(`relay sender close failed for ${user}/${kind}`, error);
  }

  relaySenders.delete(key);

  if (notifyPeer && dmWebChannel) {
    const closeMessage: MediaRelayCloseMessage = {
      type: DM_WINDOW_MEDIA_RELAY_CLOSE_EVENT,
      user,
      kind,
    };
    dmWebChannel.postMessage(closeMessage);
  }
}

function teardownAllRelaySenders(notifyPeer = true) {
  const keys = Array.from(relaySenders.keys());
  for (const key of keys) {
    const existing = relaySenders.get(key);
    if (!existing) {
      continue;
    }

    teardownRelaySender(existing.user, existing.kind, notifyPeer);
  }
}

async function handleMediaRelayAnswer(message: MediaRelayAnswerMessage) {
  const entry = relaySenders.get(relayKey(message.user, message.kind));
  if (!entry) {
    return;
  }

  try {
    await entry.pc.setRemoteDescription(new RTCSessionDescription(message.sdp));
    debugLog(`relay answer applied for ${message.user}/${message.kind}`);
  } catch (error) {
    debugLog(`relay answer failed for ${message.user}/${message.kind}`, error);
  }
}

async function handleMediaRelayIce(message: MediaRelayIceMessage) {
  const entry = relaySenders.get(relayKey(message.user, message.kind));
  if (!entry) {
    return;
  }

  try {
    await entry.pc.addIceCandidate(new RTCIceCandidate(message.candidate));
  } catch (error) {
    debugLog(`relay ICE add failed for ${message.user}/${message.kind}`, error);
  }
}

async function ensureRelaySenderForStream(user: string, kind: RelayStreamKind, stream: MediaStream | null) {
  if (!dmWebChannel) {
    return;
  }

  const tracks = stream?.getTracks() ?? [];
  const hasLiveTrack = tracks.some((track) => track.readyState === 'live');

  if (!stream || tracks.length === 0 || !hasLiveTrack) {
    teardownRelaySender(user, kind, true);
    return;
  }

  const key = relayKey(user, kind);
  const trackSignature = getTrackSignature(stream);
  const existing = relaySenders.get(key);
  if (
    existing
    && existing.streamId === stream.id
    && existing.trackSignature === trackSignature
    && existing.pc.connectionState !== 'failed'
    && existing.pc.connectionState !== 'closed'
  ) {
    return;
  }

  teardownRelaySender(user, kind, true);

  const pc = new RTCPeerConnection({ iceServers: [] });
  relaySenders.set(key, {
    user,
    kind,
    streamId: stream.id,
    trackSignature,
    pc,
  });

  pc.onicecandidate = (event) => {
    if (!event.candidate || !dmWebChannel) {
      return;
    }

    const iceMessage: MediaRelayIceMessage = {
      type: DM_WINDOW_MEDIA_RELAY_ICE_EVENT,
      user,
      kind,
      candidate: event.candidate.toJSON(),
    };
    dmWebChannel.postMessage(iceMessage);
  };

  pc.onconnectionstatechange = () => {
    debugLog(`relay sender state ${user}/${kind}`, {
      state: pc.connectionState,
      ice: pc.iceConnectionState,
      stream: describeStream(stream),
    });
  };

  for (const track of tracks) {
    pc.addTrack(track, stream);
  }

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  const offerMessage: MediaRelayOfferMessage = {
    type: DM_WINDOW_MEDIA_RELAY_OFFER_EVENT,
    user,
    kind,
    sdp: offer,
  };

  dmWebChannel.postMessage(offerMessage);
  debugLog(`relay offer posted for ${user}/${kind}`, { stream: describeStream(stream) });
}

async function syncTauriMediaRelays() {
  if (!dmWebChannel || !dmWindowOpen.value) {
    teardownAllRelaySenders(false);
    return;
  }

  const expected = new Set<string>();

  for (const chat of dmActiveChats.value.values()) {
    expected.add(relayKey(chat.user, 'local'));
    expected.add(relayKey(chat.user, 'remote'));

    await ensureRelaySenderForStream(chat.user, 'local', chat.localMediaStream);
    await ensureRelaySenderForStream(chat.user, 'remote', chat.remoteMediaStream);
  }

  const existingKeys = Array.from(relaySenders.keys());
  for (const key of existingKeys) {
    if (expected.has(key)) {
      continue;
    }

    const [user, kind] = key.split('::') as [string, RelayStreamKind];
    teardownRelaySender(user, kind, true);
  }
}

function emitDMWindowMediaState() {
  if (hasTauriWindow) {
    void syncTauriMediaRelays();
    return;
  }

  if (!dmWebChannel || !dmWindowOpen.value) {
    debugLog('emitDMWindowMediaState skipped', {
      hasChannel: Boolean(dmWebChannel),
      dmWindowOpen: dmWindowOpen.value,
    });
    return;
  }

  const mediaPayload = Array.from(dmActiveChats.value.values()).map((chat) => ({
    user: chat.user,
    localMediaStream: chat.localMediaStream,
    remoteMediaStream: chat.remoteMediaStream,
  }));

  debugLog('emitDMWindowMediaState payload', mediaPayload.map((entry) => ({
    user: entry.user,
    local: describeStream(entry.localMediaStream),
    remote: describeStream(entry.remoteMediaStream),
  })));

  try {
    dmWebChannel.postMessage({
      type: DM_WINDOW_MEDIA_EVENT,
      payload: mediaPayload,
    });
    debugLog('emitDMWindowMediaState posted');
  } catch (error) {
    debugLog('emitDMWindowMediaState failed to post', error);
  }
}

function handleWebPopupMessage(event: MessageEvent) {
  if (event.origin !== window.location.origin) {
    return;
  }

  const message = event.data as { type?: string; payload?: unknown };
  if (message?.type !== 'action') {
    return;
  }

  handleDetachedDMAction(message.payload as DMWindowAction);
}

function startWebPopupHeartbeat() {
  if (dmPopupWatchIntervalId !== null) {
    return;
  }

  dmPopupWatchIntervalId = window.setInterval(() => {
    if (dmPopupWindow?.closed) {
      dmPopupWindow = null;
      dmWindowOpen.value = false;
      window.clearInterval(dmPopupWatchIntervalId!);
      dmPopupWatchIntervalId = null;
    }
  }, 750);
}

async function initializeDetachedDMActionListener() {
  if (!hasTauriWindow) {
    return;
  }

  const { listen } = await import('@tauri-apps/api/event');
  cleanupDMActionListener = await listen<DMWindowAction>(DM_WINDOW_ACTION_EVENT, (event) => {
    handleDetachedDMAction(event.payload);
  });
}

async function emitDMWindowState() {
  const payload = buildDMWindowStatePayload();
  debugLog('emitDMWindowState', {
    hasTauriWindow,
    activeChats: payload.activeChats.length,
    focusedDMUser: payload.focusedDMUser,
  });

  if (hasTauriWindow) {
    const { emitTo } = await import('@tauri-apps/api/event');
    await emitTo(DM_WINDOW_LABEL, DM_WINDOW_STATE_EVENT, payload);
    // Tauri state events are JSON-only; relay live MediaStreams over BroadcastChannel.
    emitDMWindowMediaState();
    return;
  }

  const webPayload = toWebSerializablePayload(payload);

  if (dmPopupWindow && !dmPopupWindow.closed) {
    dmPopupWindow.postMessage({ type: 'state', payload: webPayload }, window.location.origin);
  }

  dmWebChannel?.postMessage({
    type: 'state',
    payload: webPayload,
  });

  // MediaStreams cannot be carried through Tauri events or JSON payloads.
  // Relay them over BroadcastChannel where structured cloning can preserve stream objects.
  emitDMWindowMediaState();
}

async function bringDetachedDMWindowToFront(windowHandle: import('@tauri-apps/api/webviewWindow').WebviewWindow) {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const wasRaised = await invoke<boolean>('raise_dm_window');
    if (wasRaised) {
      return;
    }
  } catch (error) {
    console.debug('Rust-side DM raise failed, falling back to frontend focus path:', error);
  }

  const { UserAttentionType } = await import('@tauri-apps/api/window');

  if (await windowHandle.isMinimized()) {
    await windowHandle.unminimize();
  }

  await windowHandle.show();

  try {
    await windowHandle.setAlwaysOnTop(true);
  } catch (error) {
    console.debug('Unable to temporarily set DM window always-on-top:', error);
  }

  try {
    await windowHandle.requestUserAttention(UserAttentionType.Critical);
  } catch (error) {
    console.debug('Unable to request DM window attention:', error);
  }

  await windowHandle.setFocus();

  window.setTimeout(() => {
    void windowHandle.setAlwaysOnTop(false).catch((error) => {
      console.debug('Unable to clear DM window always-on-top:', error);
    });
    void windowHandle.requestUserAttention(null).catch((error) => {
      console.debug('Unable to clear DM window attention request:', error);
    });
  }, 250);
}

function toSerializedChats(): SerializedDMChat[] {
  const chats: SerializedDMChat[] = [];

  for (const chat of dmActiveChats.value.values()) {
    chats.push({
      user: chat.user,
      messages: chat.messages,
      isConnected: chat.isConnected,
      pendingDisplayMessages: chat.pendingDisplayMessages,
      isTyping: chat.isTyping,
      audioEnabled: chat.audioEnabled,
      videoEnabled: chat.videoEnabled,
      callStartTime: chat.callStartTime,
      callDuration: chat.callDuration,
      videoCallActive: chat.videoCallActive,
      fileTransfers: Array.from(chat.fileTransfers.values() as Iterable<FileTransferState>).map((transfer) => {
        const includeChunks = transfer.direction === 'incoming' && transfer.status === 'completed';

        return {
          id: transfer.id,
          filename: transfer.filename,
          mimeType: transfer.mimeType,
          totalSize: transfer.totalSize,
          receivedSize: transfer.receivedSize,
          totalChunks: transfer.totalChunks,
          progress: transfer.progress,
          direction: transfer.direction,
          status: transfer.status,
          savedToDisk: transfer.savedToDisk,
          chunks: includeChunks
            ? Array.from(transfer.chunks.entries())
                .sort(([a], [b]) => a - b)
                .map(([index, data]) => ({
                  index,
                  data: Array.from(data),
                }))
            : undefined,
        };
      }),
    });
  }

  return chats;
}

function buildDMWindowStatePayload(): DMWindowStatePayload {
  return {
    activeChats: toSerializedChats(),
    pendingRequests: dmPendingRequests.value,
    pendingAudioCalls: dmPendingAudioCalls.value,
    pendingVideoCalls: dmPendingVideoCalls.value,
    outgoingRequests: dmOutgoingRequests.value,
    notices: dmNotices.value,
    username: username.value,
    dmChatEffect: config.value.dmChatEffect,
    focusedDMUser: focusedDMUser.value,
  };
}

function toWebSerializablePayload(payload: DMWindowStatePayload): DMWindowStatePayload {
  return JSON.parse(JSON.stringify(payload)) as DMWindowStatePayload;
}

async function focusDetachedDMWindow(): Promise<boolean> {
  if (hasTauriWindow) {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const existingWindow = await WebviewWindow.getByLabel(DM_WINDOW_LABEL);
    if (existingWindow) {
      await bringDetachedDMWindowToFront(existingWindow);
      dmWindowOpen.value = true;
      await emitDMWindowState();
      return true;
    }

    dmWindowOpen.value = false;
    return false;
  }

  if (dmPopupWindow && !dmPopupWindow.closed) {
    dmPopupWindow.focus();
    dmWindowOpen.value = true;
    await emitDMWindowState();
    return true;
  }

  dmWindowOpen.value = false;
  return false;
}

async function closeDetachedDMWindow() {
  teardownAllRelaySenders(false);

  if (hasTauriWindow) {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const existingWindow = await WebviewWindow.getByLabel(DM_WINDOW_LABEL);
    if (existingWindow) {
      try {
        await existingWindow.close();
      } catch (error) {
        console.debug('Unable to close detached DM window:', error);
      }
    }

    dmWindowOpen.value = false;
    return;
  }

  if (dmPopupWindow && !dmPopupWindow.closed) {
    dmPopupWindow.close();
  }

  dmPopupWindow = null;
  dmWindowOpen.value = false;

  if (dmPopupWatchIntervalId !== null) {
    window.clearInterval(dmPopupWatchIntervalId);
    dmPopupWatchIntervalId = null;
  }
}

function startAgentAmpWebPopupHeartbeat() {
  if (agentAmpPopupWatchIntervalId !== null) {
    return;
  }

  agentAmpPopupWatchIntervalId = window.setInterval(() => {
    if (agentAmpPopupWindow?.closed) {
      agentAmpPopupWindow = null;
      window.clearInterval(agentAmpPopupWatchIntervalId!);
      agentAmpPopupWatchIntervalId = null;
    }
  }, 750);
}

async function focusDetachedAgentAmpWindow(): Promise<boolean> {
  if (hasTauriWindow) {
    try {
      return await invoke<boolean>('raise_agentamp_window');
    } catch (error) {
      console.debug('Unable to raise detached AgentAmp window via native command:', error);
    }

    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const existingWindow = await WebviewWindow.getByLabel(AGENTAMP_WINDOW_LABEL);
    if (!existingWindow) {
      return false;
    }

    if (await existingWindow.isMinimized()) {
      await existingWindow.unminimize();
    }

    await existingWindow.show();
    await existingWindow.setFocus();
    return true;
  }

  if (agentAmpPopupWindow && !agentAmpPopupWindow.closed) {
    agentAmpPopupWindow.focus();
    return true;
  }

  return false;
}

async function closeDetachedAgentAmpWindow() {
  if (hasTauriWindow) {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const existingWindow = await WebviewWindow.getByLabel(AGENTAMP_WINDOW_LABEL);
    if (existingWindow) {
      try {
        try {
          window.localStorage.setItem(AGENTAMP_FORCE_CLOSE_STORAGE_KEY, '1');
        } catch {
          // Ignore localStorage write failures.
        }
        await existingWindow.close();
      } catch (error) {
        console.debug('Unable to close detached AgentAmp window:', error);
      } finally {
        try {
          window.localStorage.removeItem(AGENTAMP_FORCE_CLOSE_STORAGE_KEY);
        } catch {
          // Ignore localStorage cleanup failures.
        }
      }
    }

    return;
  }

  if (agentAmpPopupWindow && !agentAmpPopupWindow.closed) {
    agentAmpPopupWindow.close();
  }

  agentAmpPopupWindow = null;

  if (agentAmpPopupWatchIntervalId !== null) {
    window.clearInterval(agentAmpPopupWatchIntervalId);
    agentAmpPopupWatchIntervalId = null;
  }
}

async function openDetachedAgentAmpWindow() {
  const focused = await focusDetachedAgentAmpWindow();
  if (focused) {
    return;
  }

  if (hasTauriWindow) {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const agentAmpWindowUrl = new URL(window.location.href);
    agentAmpWindowUrl.searchParams.set('view', 'agentamp');

    const windowHandle = new WebviewWindow(AGENTAMP_WINDOW_LABEL, {
      url: agentAmpWindowUrl.toString(),
      title: 'AGENT // AMP',
      width: AGENTAMP_WINDOW_DEFAULT_WIDTH,
      height: AGENTAMP_WINDOW_DEFAULT_HEIGHT,
      minWidth: AGENTAMP_WINDOW_MIN_WIDTH,
      minHeight: AGENTAMP_WINDOW_MIN_HEIGHT,
      center: true,
      resizable: true,
      decorations: false,
      transparent: false,
      useHttpsScheme: true,
      dragDropEnabled: false,
    });

    windowHandle.once('tauri://created', () => {
      void focusDetachedAgentAmpWindow();
    });

    windowHandle.once('tauri://destroyed', () => {
    });

    windowHandle.once('tauri://error', (error) => {
      console.error('Failed to create detached AgentAmp window:', error);
    });

    return;
  }

  const popupUrl = `${window.location.pathname}?view=agentamp`;
  const popupFeatures = [
    'popup=yes',
    `width=${AGENTAMP_WINDOW_DEFAULT_WIDTH}`,
    `height=${AGENTAMP_WINDOW_DEFAULT_HEIGHT}`,
    'toolbar=no',
    'menubar=no',
    'location=no',
    'status=no',
    'scrollbars=yes',
    'resizable=yes',
  ].join(',');

  const popup = window.open(popupUrl, 'agent-lobby-agentamp', popupFeatures);
  if (!popup) {
    return;
  }

  agentAmpPopupWindow = popup;
  startAgentAmpWebPopupHeartbeat();
}

async function openDetachedDMWindow() {
  if (hasTauriWindow) {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const existingWindow = await WebviewWindow.getByLabel(DM_WINDOW_LABEL);
    if (existingWindow) {
      await bringDetachedDMWindowToFront(existingWindow);
      dmWindowOpen.value = true;
      await emitDMWindowState();
      return;
    }

    const dmWindowUrl = new URL(window.location.href);
    dmWindowUrl.searchParams.set('view', 'dm');
    const dmWindow = new WebviewWindow(DM_WINDOW_LABEL, {
      url: dmWindowUrl.toString(),
      title: 'AGENT // DM',
      width: DM_WINDOW_DEFAULT_WIDTH,
      height: DM_WINDOW_DEFAULT_HEIGHT,
      minWidth: DM_WINDOW_MIN_WIDTH,
      minHeight: DM_WINDOW_MIN_HEIGHT,
      center: true,
      resizable: true,
      decorations: false,
      transparent: false,
      useHttpsScheme: true,
      dragDropEnabled: false,
    });

    dmWindow.once('tauri://created', () => {
      dmWindowOpen.value = true;
      void emitDMWindowState();
    });

    dmWindow.once('tauri://destroyed', () => {
      dmWindowOpen.value = false;
    });

    dmWindow.once('tauri://error', (error) => {
      console.error('Failed to create detached DM window:', error);
      dmWindowOpen.value = false;
    });

    return;
  }

  const dmWindowUrl = `${window.location.pathname}?view=dm`;
  const popupFeatures = [
    'popup=yes',
    `width=${DM_WINDOW_DEFAULT_WIDTH}`,
    `height=${DM_WINDOW_DEFAULT_HEIGHT}`,
    'toolbar=no',
    'menubar=no',
    'location=no',
    'status=no',
    'scrollbars=yes',
    'resizable=yes',
  ].join(',');

  const popup = window.open(dmWindowUrl, 'agent-lobby-dm', popupFeatures);
  if (!popup) {
    return;
  }

  dmPopupWindow = popup;
  dmWindowOpen.value = true;
  startWebPopupHeartbeat();
  await emitDMWindowState();
}

function handleDetachedDMAction(action: DMWindowAction | undefined) {
  if (!action || !dm.value) {
    return;
  }

  switch (action.type) {
    case 'windowReady':
      dmWindowOpen.value = true;
      void emitDMWindowState();
      break;
    case 'focusUser':
      focusedDMUser.value = action.user;
      break;
    case 'requestDm':
      void handleDMRequest(action.user);
      break;
    case 'acceptDm':
      handleAcceptDM(action.user);
      break;
    case 'rejectDm':
      handleRejectDM(action.user);
      break;
    case 'acceptAudio':
      handleAcceptAudio(action.user);
      break;
    case 'rejectAudio':
      handleRejectAudio(action.user);
      break;
    case 'acceptVideo':
      handleAcceptVideo(action.user);
      break;
    case 'rejectVideo':
      handleRejectVideo(action.user);
      break;
    case 'cancelRequest':
      handleCancelDMRequest(action.user);
      break;
    case 'sendMessage':
      handleSendDMMessage(action.user, action.message, action.effect);
      break;
    case 'typing':
      handleTyping(action.user);
      break;
    case 'stopTyping':
      handleStopTyping(action.user);
      break;
    case 'closeDm':
      handleCloseDM(action.user);
      break;
    case 'cancelPendingMessages':
      handleCancelPendingMessages(action.user);
      break;
    case 'requestAudio':
      handleRequestAudio(action.user);
      break;
    case 'toggleAudio':
      handleToggleAudio(action.user, action.enabled);
      break;
    case 'requestVideo':
      handleRequestVideo(action.user);
      break;
    case 'toggleVideo':
      handleToggleVideo(action.user, action.enabled);
      break;
    case 'sendFile':
      handleSendFile(action.user, action.file);
      break;
    case 'acceptFile':
      handleAcceptFile(action.user, action.fileId);
      break;
    case 'rejectFile':
      handleRejectFile(action.user, action.fileId);
      break;
    case 'fileSaved':
      handleFileSaved(action.user, action.fileId);
      break;
    case 'removeFile':
      handleRemoveFile(action.user, action.fileId);
      break;
    case 'windowClosed':
      dmWindowOpen.value = false;
      break;
  }
}
</script>

