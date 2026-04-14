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
      @restore="restoreNetworkConfigDefaults"
      @close="toggleNetworkConfig"
    />

    <DMRequestStack
      v-if="!showAuth"
      :pending-requests="dmPendingRequests"
      @accept-dm="handleAcceptDM"
      @reject-dm="handleRejectDM"
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
      @quit="quit"
    />

    <div v-if="!showAuth" class="workspace-shell">
      <div
        class="main-view"
        :class="{ 'sidebar-compact': !isSidebarVisible }"
      >
        <ChatArea
          ref="chatAreaRef"
          :messages="messages"
          :username="username"
          :is-connected="isConnected"
          :users="users"
          :lobby-tabs="lobbyTabs"
          :active-lobby-id="activeLobbyId"
          :default-lobby-id="networkConfig.defaultLobby"
          :mention-request="mentionRequest"
          :agent-amp-pinned-video="agentAmpPinnedVideo"
          :agent-amp-detached="config.agentAmpDetached"
          :pinned-video-detached="pinnedVideoDetached"
          @pinned-video-change="handlePinnedVideoChange"
          @agent-amp-dock-toggle="handleToggleAgentAmpDock"
          @toggle-pinned-video-popup="handleTogglePinnedVideoPopup"
          @send="handleChatSend"
          @join-lobby="handleJoinLobby"
          @switch-lobby="handleSwitchLobby"
          @close-lobby="handleCloseLobby"
          @typing="(typing) => setTyping(typing)"
          @agent-amp-stop="sendAgentAmpStopPlayback"
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
          @pin-user-media="handlePinUserMedia"
          @toggle-away="handleToggleAway"
        />
      </div>
      <AgentAmpPlayer
        v-if="config.agentAmpEnabled && !config.agentAmpDetached"
        :enabled="config.agentAmpEnabled"
        :spectrum-bar-count="config.spectrumBarCount"
        :spectrum-fft-size="config.spectrumFftSize"
        :spectrum-sensitivity="config.spectrumSensitivity"
        :spectrum-gradient-bars="config.spectrumGradientBars"
        :threshold-low="config.spectrumThresholdLow"
        :threshold-medium="config.spectrumThresholdMedium"
        :threshold-high="config.spectrumThresholdHigh"
        @toggle-detached="handleAgentAmpDetachRequest"
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
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  overflow: hidden;
}

.workspace-shell .main-view {
  min-height: 0;
  height: auto;
}

.workspace-shell > .main-view {
  min-height: 0;
}

</style>

<script setup lang="ts">
import { ref, shallowRef, computed, watch, watchEffect, onMounted, onBeforeUnmount } from 'vue';
import packageJson from '../package.json';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useLobbyChat } from './composables/useLobbyChat';
import { useTheme } from './composables/useTheme';
import { useDirectMessage } from './composables/useDirectMessage';
import { getPersistedValue, setPersistedValue } from './composables/usePlatformStorage';
import type { ActiveMedia, AudioConfig } from './types/chat';
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
  playAlert,
  stopAlert,
  setNetworkConfig,
  restoreNetworkConfigDefaults,
  setSoundpack,
  clearMessages,
  addSystemMessage,
  getMqttClient,
  getRoomId,
  setTyping,
  toggleAway,
  isAway,
  setActiveMedia,
} = useLobbyChat();
const { availableThemes, applyTheme } = useTheme();
const {
  isUpdateAvailable,
  availableVersion,
  isInstallingUpdate,
} = useAutoUpdaterState();
const appVersion = packageJson.version;

interface AgentConfPayload {
  mqttServer: string;
  defaultLobby: string;
  filePath?: string;
}

function isValidMqttServer(url: string): boolean {
  const trimmed = url.trim();
  return trimmed.length > 0 && /^(ws|wss):\/\//i.test(trimmed) && !/\s/.test(trimmed);
}

function isValidLobbyId(raw: string): boolean {
  const trimmed = raw.trim();
  return trimmed.length > 0 && /^[A-Za-z0-9_]+$/.test(trimmed);
}

async function applyAgentConfPayload(payload: AgentConfPayload) {
  const nextConfig = {
    mqttServer: payload.mqttServer?.trim() ?? '',
    defaultLobby: payload.defaultLobby?.trim() ?? '',
  };

  if (!nextConfig.mqttServer || !nextConfig.defaultLobby) {
    window.alert('The selected .agentconf file is missing mqttServer or defaultLobby.');
    return;
  }

  if (!isValidMqttServer(nextConfig.mqttServer)) {
    window.alert('The selected .agentconf file contains an invalid mqttServer. Expected ws:// or wss:// URL without spaces.');
    return;
  }

  if (!isValidLobbyId(nextConfig.defaultLobby)) {
    window.alert('The selected .agentconf file contains an invalid defaultLobby. Use only letters, numbers, and underscores.');
    return;
  }

  const description = payload.filePath
    ? `The settings file ${payload.filePath} was opened.`
    : 'A configuration file was opened.';

  if (isConnected.value) {
    if (hasTauriWindow) {
      try {
        await getCurrentWindow().setFocus();
      } catch {
        // ignore focus failures
      }
    }

    const confirmed = window.confirm(
      `${description}\n\nApplying these settings will disconnect the current session and close all direct message windows. Continue?`
    );
    if (!confirmed) {
      return;
    }

    await closeAllDMWindows();
    disconnect();
  }

  setNetworkConfig(nextConfig);
}

function handleAgentConfError(message: string) {
  window.alert(`Unable to load .agentconf file: ${message}`);
}

async function initializeAgentConfFileListener() {
  if (!hasTauriWindow) {
    return;
  }

  const { listen } = await import('@tauri-apps/api/event');
  await listen<AgentConfPayload>('agentconf-file-opened', (event) => {
    void applyAgentConfPayload(event.payload);
  });
  await listen<string>('agentconf-file-error', (event) => {
    handleAgentConfError(event.payload);
  });
}
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
const AGENTAMP_WINDOW_MIN_HEIGHT = 380;
const AGENTAMP_STATUS_CHANNEL = 'agent-lobby-agentamp-status';
const AGENTAMP_ACTION_CHANNEL = 'agent-lobby-agentamp-action';
const AGENTAMP_STOP_CHANNEL = 'agent-lobby-agentamp-stop';
const AGENTAMP_FORCE_CLOSE_CHANNEL = 'agent-lobby-agentamp-force-close';
const AGENTAMP_PLAYING_STORAGE_KEY = 'agent_agentamp_playing';
const DM_WINDOW_FORCE_CLOSE_CHANNEL = 'agent-lobby-dm-force-close';

type AgentAmpPinnedVideo = {
  sourceKey: string;
  title: string;
  src: string;
  playing: boolean;
  currentTime: number;
  duration: number;
};
const DM_LOG_PREFIX = '[AppDM]';

function dmLog(message: string, details?: unknown) {
  if (details === undefined) {
    console.log(`${DM_LOG_PREFIX} ${message}`);
    return;
  }

  console.log(`${DM_LOG_PREFIX} ${message}`, details);
}

// DM system
const openDMWindowUsers = ref<Set<string>>(new Set());
const dmPopupWindows = new Map<string, Window>();
const dmPopupWatchIntervals = new Map<string, number>();
// Tracks Tauri window labels currently being created to prevent concurrent duplicate creation.
const inFlightDMWindowLabels = new Set<string>();
let dmWebChannel: BroadcastChannel | null = null;
let agentAmpPopupWindow: Window | null = null;
let agentAmpPopupWatchIntervalId: number | null = null;
let mediaLibraryAutoScanIntervalId: number | null = null;
let agentAmpStatusChannel: BroadcastChannel | null = null;
let agentAmpActionChannel: BroadcastChannel | null = null;
let cleanupAgentAmpStorageListener: (() => void) | null = null;
const agentAmpPinnedVideo = ref<AgentAmpPinnedVideo | null>(null);
const pinnedVideoDetached = ref(false);
const PINNED_VIDEO_WINDOW_LABEL = 'pinned-video-window';
const PINNED_VIDEO_ACTION_CHANNEL = 'agent-lobby-pinned-video-action';
let pinnedVideoPopupWindow: Window | null = null;
let pinnedVideoPopupWatchIntervalId: number | null = null;
let pinnedVideoActionChannel: BroadcastChannel | null = null;
const chatAreaRef = ref<any>(null);
const currentAgentAmpMedia = ref<ActiveMedia | null>(null);
const currentChatPinnedMedia = ref<ActiveMedia | null>(null);
const activeMediaSource = computed<ActiveMedia | null>(() =>
  currentChatPinnedMedia.value ??
  currentAgentAmpMedia.value ??
  (agentAmpPinnedVideo.value
    ? {
        label: agentAmpPinnedVideo.value.title,
        url: agentAmpPinnedVideo.value.src,
        mediaType: 'video',
      }
    : null)
);
watch(activeMediaSource, (next) => {
  setActiveMedia(next);
}, { immediate: true });
let cleanupDMActionListener: (() => void) | null = null;
let webMessageListenerBound = false;
const focusedDMUser = ref<string | null>(null);
const mentionRequest = ref<{ username: string; nonce: number } | null>(null);
const isAgentAmpPlaying = ref(false);
type DMType = ReturnType<typeof useDirectMessage>;
const dm = shallowRef<DMType | null>(null);
const dmWindowOpen = computed(() => openDMWindowUsers.value.size > 0);

function normalizeDMUser(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function sameDMUser(left: string | null | undefined, right: string | null | undefined): boolean {
  const normalizedLeft = normalizeDMUser(left)?.toLowerCase();
  const normalizedRight = normalizeDMUser(right)?.toLowerCase();
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  return normalizedLeft === normalizedRight;
}

function getDMWindowLaunchUser(): string | null {
  const focusedUser = normalizeDMUser(focusedDMUser.value);
  if (focusedUser) {
    return focusedUser;
  }

  const firstActiveUser = Array.from(dmActiveChats.value.keys())[0] ?? null;
  return normalizeDMUser(firstActiveUser);
}

function dmWindowLabelForUser(user: string): string {
  const normalized = user.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  const safeSuffix = normalized || 'dm';
  return `${DM_WINDOW_LABEL}-${safeSuffix}`;
}

function markDMWindowOpen(user: string) {
  const next = new Set(openDMWindowUsers.value);
  next.add(user);
  openDMWindowUsers.value = next;
}

function markDMWindowClosed(user: string) {
  const next = new Set(openDMWindowUsers.value);
  next.delete(user);
  openDMWindowUsers.value = next;
}

const dmActiveChats = computed(() => dm.value?.activeChats.value || new Map());
const dmPendingRequests = computed(() => dm.value?.pendingRequests.value || []);
const dmPendingAudioCalls = computed(() => dm.value?.pendingAudioCalls.value || []);
const dmPendingVideoCalls = computed(() => dm.value?.pendingVideoCalls.value || []);
const dmOutgoingRequests = computed(() => dm.value?.outgoingRequests.value || []);
const dmOutgoingAudioCalls = computed(() => dm.value?.outgoingAudioCalls.value || []);
const dmOutgoingVideoCalls = computed(() => dm.value?.outgoingVideoCalls.value || []);
const dmDeniedRequests = computed(() => dm.value?.deniedRequests.value || []);
const dmNotices = computed(() => dm.value?.notices.value || []);
const connectedDMUsers = computed(() =>
  Array.from(dmActiveChats.value.keys()).sort()
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

watchEffect(() => {
  const hasRequestSound = config.value.audioEnabled &&
    (dmPendingRequests.value.length > 0 ||
     dmOutgoingRequests.value.length > 0 ||
     dmPendingAudioCalls.value.length > 0 ||
     dmOutgoingAudioCalls.value.length > 0 ||
     dmPendingVideoCalls.value.length > 0 ||
     dmOutgoingVideoCalls.value.length > 0);

  if (hasRequestSound) {
    playAlert('ringback');
  } else {
    stopAlert('ringback');
  }
});

watch(
  () => dmNotices.value.map((notice) => notice.id).join('|'),
  (_nextIds, previousIds) => {
    if (!config.value.audioEnabled) return;

    const prevSet = new Set(previousIds ? previousIds.split('|').filter(Boolean) : []);
    const addedNotice = dmNotices.value.find((notice) => !prevSet.has(String(notice.id)));

    if (addedNotice && /denied|declined|rejected/i.test(addedNotice.message)) {
      playAlert('rejected');
    }
  }
);

watch(
  () => dmDeniedRequests.value.join('|'),
  (next, previous) => {
    if (!config.value.audioEnabled) {
      return;
    }

    const nextDenied = next ? new Set(next.split('|')) : new Set<string>();
    const prevDenied = previous ? new Set(previous.split('|')) : new Set<string>();

    for (const user of nextDenied) {
      if (!prevDenied.has(user)) {
        playAlert('rejected');
        break;
      }
    }
  }
);

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

    if (!openDMWindowUsers.value.has(newlyConnectedUser)) {
      void openDMWindow(newlyConnectedUser);
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
      void closeAllDMWindows();
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
      config.value,
      { runtimeMode: 'presence' }
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

function sendAgentAmpStopPlayback() {
  if (typeof BroadcastChannel === 'undefined') {
    return;
  }

  try {
    const channel = new BroadcastChannel(AGENTAMP_STOP_CHANNEL);
    channel.postMessage('stop-for-transition');
    channel.close();
  } catch {
    // Ignore channel failures.
  }
}

function markAgentAmpStopped() {
  updateAgentAmpPlayingState(false);

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(AGENTAMP_PLAYING_STORAGE_KEY, '0');
    } catch {
      // Ignore localStorage write failures.
    }
  }

  if (typeof BroadcastChannel === 'undefined') {
    return;
  }

  try {
    if (agentAmpStatusChannel) {
      agentAmpStatusChannel.postMessage({ type: 'playback-state', playing: false });
      return;
    }

    const channel = new BroadcastChannel(AGENTAMP_STATUS_CHANNEL);
    channel.postMessage({ type: 'playback-state', playing: false });
    channel.close();
  } catch {
    // Ignore channel failures.
  }
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
    const message = event.data as { type?: string; playing?: boolean; track?: { id?: string; name?: string; location?: string; source?: string; mediaType?: string }; currentTime?: number; duration?: number; activeMedia?: { label?: string; url?: string; mediaType?: string } | null };

    if (message?.type === 'playback-state' && typeof message.playing === 'boolean') {
      updateAgentAmpPlayingState(message.playing);
      return;
    }

    if (message?.type === 'agentamp-media-state') {
      if (message.activeMedia && typeof message.activeMedia.label === 'string') {
        currentAgentAmpMedia.value = {
          label: message.activeMedia.label,
          url: typeof message.activeMedia.url === 'string' ? message.activeMedia.url : undefined,
          mediaType: message.activeMedia.mediaType === 'audio' || message.activeMedia.mediaType === 'video' ? message.activeMedia.mediaType : undefined,
        };
      } else {
        currentAgentAmpMedia.value = null;
      }
      return;
    }

    if (message?.type === 'agentamp-video-state') {
      if (
        message.playing === true &&
        message.track?.mediaType === 'video' &&
        typeof message.track.name === 'string' &&
        typeof message.track.location === 'string'
      ) {
        agentAmpPinnedVideo.value = {
          sourceKey: message.track.id ?? `${message.track.name}:${message.track.location}`,
          title: message.track.name,
          src: message.track.location,
          playing: true,
          currentTime: Number.isFinite(message.currentTime ?? NaN) ? message.currentTime ?? 0 : 0,
          duration: Number.isFinite(message.duration ?? NaN) ? message.duration ?? 0 : 0,
        };
      } else {
        agentAmpPinnedVideo.value = null;
      }
      return;
    }

    updateAgentAmpPlayingState(readPersistedAgentAmpPlayingState());
  };
}

function handleAgentAmpActionMessage(event: MessageEvent) {
  if (event.origin !== window.location.origin) {
    return;
  }

  const message = event.data as { type?: string; action?: string };
  if (message?.type !== 'agentamp-action' || message.action !== 'dock') {
    return;
  }

  if (!config.value.agentAmpDetached) {
    return;
  }

  config.value.agentAmpDetached = false;
  updateSettings();
}

function handlePinnedVideoPopupMessage(event: MessageEvent) {
  if (event.origin !== window.location.origin) {
    return;
  }

  const message = event.data as { type?: string; action?: string };
  if (message?.type !== 'pinned-video-action' || message.action !== 'repin') {
    return;
  }

  void closePinnedVideoWindow();
}

function handlePinnedVideoChange(media: ActiveMedia | null) {
  currentChatPinnedMedia.value = media ? { ...media, mediaType: media.mediaType ?? 'video' } : null;
}

function handlePinUserMedia(payload: { url: string; currentTime?: number }) {
  if (!payload?.url) {
    return;
  }

  console.debug('[App] handlePinUserMedia', payload);
  chatAreaRef.value?.pinMediaUrl?.(payload);
}

function startPinnedVideoPopupHeartbeat() {
  if (pinnedVideoPopupWatchIntervalId !== null) {
    return;
  }

  pinnedVideoPopupWatchIntervalId = window.setInterval(() => {
    if (pinnedVideoPopupWindow?.closed) {
      pinnedVideoPopupWindow = null;
      window.clearInterval(pinnedVideoPopupWatchIntervalId!);
      pinnedVideoPopupWatchIntervalId = null;
      pinnedVideoDetached.value = false;
    }
  }, 750);
}

function cleanupPinnedVideoPopupHeartbeat() {
  if (pinnedVideoPopupWatchIntervalId !== null) {
    window.clearInterval(pinnedVideoPopupWatchIntervalId);
    pinnedVideoPopupWatchIntervalId = null;
  }
}

async function focusPinnedVideoWindow(): Promise<boolean> {
  if (hasTauriWindow) {
    try {
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      const existingWindow = await WebviewWindow.getByLabel(PINNED_VIDEO_WINDOW_LABEL);
      if (!existingWindow) {
        return false;
      }

      if (await existingWindow.isMinimized()) {
        await existingWindow.unminimize();
      }

      await existingWindow.show();
      await existingWindow.setFocus();
      return true;
    } catch {
      return false;
    }
  }

  if (pinnedVideoPopupWindow && !pinnedVideoPopupWindow.closed) {
    pinnedVideoPopupWindow.focus();
    return true;
  }

  return false;
}

async function closePinnedVideoWindow() {
  pinnedVideoDetached.value = false;

  if (hasTauriWindow) {
    try {
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      const existingWindow = await WebviewWindow.getByLabel(PINNED_VIDEO_WINDOW_LABEL);
      if (existingWindow) {
        await existingWindow.close();
      }
    } catch {
      // Ignore close failures.
    }
  }

  if (pinnedVideoPopupWindow && !pinnedVideoPopupWindow.closed) {
    pinnedVideoPopupWindow.close();
  }

  pinnedVideoPopupWindow = null;
  cleanupPinnedVideoPopupHeartbeat();
}

function getPinnedVideoSourceType(url: string): 'youtube' | 'twitch' | 'direct' {
  if (/\b(?:youtube\.com|youtu\.be)\b/i.test(url)) {
    return 'youtube';
  }

  if (/\b(?:twitch\.tv)\b/i.test(url)) {
    return 'twitch';
  }

  return 'direct';
}

function isLocalFileSource(url: string): boolean {
  const trimmed = url.trim();
  return /^file:/i.test(trimmed)
    || /^[a-zA-Z]:[\\/]/.test(trimmed)
    || /^\\\\/.test(trimmed)
    || /^\/\//.test(trimmed)
    || /^\/[^/]/.test(trimmed);
}

function normalizeLocalFilePathForProxy(raw: string): string {
  let normalized = raw.trim();
  if (/^file:\/\/localhost\//i.test(normalized)) {
    normalized = normalized.replace(/^file:\/\/localhost\//i, '');
  } else if (/^file:\/\//i.test(normalized)) {
    normalized = normalized.replace(/^file:\/\//i, '');
  }
  return normalized.replace(/\\/g, '/');
}

async function getLocalPinnedVideoProxyUrl(url: string): Promise<string> {
  const proxyBaseUrl = await invoke<string>('get_local_video_proxy_base_url');
  const normalizedPath = normalizeLocalFilePathForProxy(url);
  return `${proxyBaseUrl}/local-video?path=${encodeURIComponent(normalizedPath)}`;
}

async function getPinnedVideoPopupUrl(sourceType: 'youtube' | 'twitch' | 'direct', url: string, title: string | undefined, currentTime?: number) {
  const popupUrl = new URL(window.location.href);
  popupUrl.searchParams.set('view', 'pinned-video');
  popupUrl.searchParams.set('sourceType', sourceType);

  if (sourceType === 'direct') {
    let directUrl = url;
    if (hasTauriWindow && isLocalFileSource(url)) {
      try {
        directUrl = await getLocalPinnedVideoProxyUrl(url);
      } catch {
        directUrl = url;
      }
    }
    popupUrl.searchParams.set('url', directUrl);
  } else {
    popupUrl.searchParams.set('url', url);
  }

  if (title) {
    popupUrl.searchParams.set('title', title);
  }
  if (sourceType === 'youtube' && typeof currentTime === 'number') {
    popupUrl.searchParams.set('currentTime', String(Math.floor(currentTime)));
  }
  return popupUrl.toString();
}

async function openPinnedVideoWindow() {
  const pinned = currentChatPinnedMedia.value ?? (agentAmpPinnedVideo.value
    ? {
        url: agentAmpPinnedVideo.value.src,
        label: agentAmpPinnedVideo.value.title,
        currentTime: agentAmpPinnedVideo.value.currentTime,
        mediaType: 'video' as const,
      }
    : null);

  if (!pinned || pinned.mediaType !== 'video' || !pinned.url) {
    return;
  }

  const sourceType = getPinnedVideoSourceType(pinned.url);

  const focused = await focusPinnedVideoWindow();
  if (focused) {
    return;
  }

  pinnedVideoDetached.value = true;

  if (hasTauriWindow) {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const pinnedVideoWindowUrl = await getPinnedVideoPopupUrl(sourceType, pinned.url, pinned.label, pinned.currentTime);

    const windowHandle = new WebviewWindow(PINNED_VIDEO_WINDOW_LABEL, {
      url: pinnedVideoWindowUrl,
      title: 'PINNED VIDEO',
      width: 860,
      height: 520,
      minWidth: 560,
      minHeight: 320,
      center: true,
      resizable: true,
      decorations: false,
      transparent: false,
      useHttpsScheme: true,
      dragDropEnabled: false,
    });

    windowHandle.once('tauri://created', () => {
      void focusPinnedVideoWindow();
    });

    windowHandle.once('tauri://destroyed', () => {
      pinnedVideoDetached.value = false;
      cleanupPinnedVideoPopupHeartbeat();
    });

    return;
  }

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

  pinnedVideoPopupWindow = window.open(await getPinnedVideoPopupUrl(sourceType, pinned.url, pinned.label, pinned.currentTime), 'agent-lobby-pinned-video', popupFeatures);
  if (!pinnedVideoPopupWindow) {
    pinnedVideoDetached.value = false;
    return;
  }

  startPinnedVideoPopupHeartbeat();
}

function handleTogglePinnedVideoPopup() {
  if (pinnedVideoDetached.value) {
    void closePinnedVideoWindow();
    return;
  }

  void openPinnedVideoWindow();
}

function initializePinnedVideoActionBridge() {
  if (typeof window !== 'undefined') {
    window.addEventListener('message', handlePinnedVideoPopupMessage);
  }

  if (typeof BroadcastChannel === 'undefined') {
    return;
  }

  pinnedVideoActionChannel = new BroadcastChannel(PINNED_VIDEO_ACTION_CHANNEL);
  pinnedVideoActionChannel.onmessage = (event: MessageEvent) => {
    const message = event.data as { type?: string; action?: string };
    if (message?.type !== 'pinned-video-action' || message.action !== 'repin') {
      return;
    }

    void closePinnedVideoWindow();
  };
}

function teardownPinnedVideoActionBridge() {
  if (pinnedVideoActionChannel) {
    pinnedVideoActionChannel.close();
    pinnedVideoActionChannel = null;
  }

  if (typeof window !== 'undefined') {
    window.removeEventListener('message', handlePinnedVideoPopupMessage);
  }
}

function initializeAgentAmpActionBridge() {
  if (typeof window !== 'undefined') {
    window.addEventListener('message', handleAgentAmpActionMessage);
  }

  if (typeof BroadcastChannel === 'undefined') {
    return;
  }

  agentAmpActionChannel = new BroadcastChannel(AGENTAMP_ACTION_CHANNEL);
  agentAmpActionChannel.onmessage = (event: MessageEvent) => {
    const message = event.data as { type?: string; action?: string };
    if (message?.type !== 'agentamp-action' || message.action !== 'dock') {
      return;
    }

    if (!config.value.agentAmpDetached) {
      return;
    }

    config.value.agentAmpDetached = false;
    updateSettings();
  };
}

function teardownAgentAmpStatusBridge() {
  if (agentAmpStatusChannel) {
    agentAmpStatusChannel.close();
    agentAmpStatusChannel = null;
  }

  if (agentAmpActionChannel) {
    agentAmpActionChannel.close();
    agentAmpActionChannel = null;
  }

  cleanupAgentAmpStorageListener?.();
}

onMounted(async () => {
  // window.addEventListener('contextmenu', (e) => e.preventDefault());

  initializeAgentAmpStatusBridge();
  initializeAgentAmpActionBridge();
  initializePinnedVideoActionBridge();
  initializeWebDMBridge();
  await initializeDMWindowActionListener();
  await initializeAgentConfFileListener();

  if (!hasTauriWindow) {
    return;
  }

  const appWindow = getCurrentWindow();
  isMaximized.value = await appWindow.isMaximized();
});

onBeforeUnmount(() => {
  markAgentAmpStopped();
  teardownAgentAmpStatusBridge();
  teardownPinnedVideoActionBridge();
  void closeDetachedAgentAmpWindow();
  void closePinnedVideoWindow();
  for (const intervalId of dmPopupWatchIntervals.values()) {
    window.clearInterval(intervalId);
  }
  dmPopupWatchIntervals.clear();
  dmPopupWindows.clear();
  clearMediaLibraryAutoScanInterval();
  openDMWindowUsers.value = new Set();
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
  ({ enabled, detached }, previous) => {
    const wasDetached = previous?.detached ?? false;
    const switchingToDocked = enabled && !detached && wasDetached;

    if (switchingToDocked && isAgentAmpPlaying.value) {
      // Stop the detached window's audio immediately so it doesn't overlap
      // with the docked player that is about to mount.
      try {
        const stopChannel = new BroadcastChannel('agent-lobby-agentamp-stop');
        stopChannel.postMessage('stop-for-transition');
        stopChannel.close();
      } catch {
        // Ignore
      }
    }
  },
  { flush: 'pre' }
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
  { immediate: true, deep: true, flush: 'post' }
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
    markAgentAmpStopped();
    disconnect();
    showShutdownAnim.value = false;

    if (!hasTauriWindow) {
      return;
    }

    try {
      const { WebviewWindow, getAllWebviewWindows } = await import('@tauri-apps/api/webviewWindow');

      // Enumerate all windows directly from Tauri so ghost windows (those that
      // were knocked out of openDMWindowUsers by an error-handler race) are also
      // captured and properly closed.
      const allWindows = await getAllWebviewWindows();
      const dmWindowHandles = allWindows.filter((w) => w.label.startsWith(DM_WINDOW_LABEL + '-'));
      const agentAmpWindow = await WebviewWindow.getByLabel(AGENTAMP_WINDOW_LABEL);
      const hasDmWindows = dmWindowHandles.length > 0;

      if (agentAmpWindow) {
        const agentAmpChannel = new BroadcastChannel(AGENTAMP_FORCE_CLOSE_CHANNEL);
        agentAmpChannel.postMessage('force-close');
        agentAmpChannel.close();
      }

      // Always broadcast force-close to every DM window (tracked or ghost).
      if (hasDmWindows) {
        const dmChannel = new BroadcastChannel(DM_WINDOW_FORCE_CLOSE_CHANNEL);
        dmChannel.postMessage('force-close');
        dmChannel.close();
      }

      await new Promise<void>((resolve) => {
        const expectedAgentAmp = agentAmpWindow ? 1 : 0;
        const expectedDm = hasDmWindows ? dmWindowHandles.length : 0;

        if (expectedAgentAmp + expectedDm === 0) {
          resolve();
          return;
        }

        const checkInterval = setInterval(async () => {
          const currentAll = await getAllWebviewWindows().catch(() => [] as typeof allWindows);
          const currentDmStillOpen = currentAll.some((w) => w.label.startsWith(DM_WINDOW_LABEL + '-'));
          const currentAgentAmpWindow = await WebviewWindow.getByLabel(AGENTAMP_WINDOW_LABEL).catch(() => null);

          const agentAmpDone = !agentAmpWindow || !currentAgentAmpWindow;
          const dmDone = !hasDmWindows || !currentDmStillOpen;

          if (agentAmpDone && dmDone) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);

        setTimeout(() => {
          clearInterval(checkInterval);
          resolve();
        }, 2500);
      });

      const appWindow = getCurrentWindow();
      await appWindow.close();
    } catch (error) {
      const appWindow = getCurrentWindow();
      await appWindow.close();
    }
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
  const nextOpen = !showNetworkConfig.value;
  showNetworkConfig.value = nextOpen;
  if (nextOpen && config.value.audioEnabled) {
    playAlert('secret');
  }
}

function handleShowDMWindow() {
  if (!isConnected.value) {
    return;
  }

  const targetUser = getDMWindowLaunchUser();
  if (!targetUser) {
    return;
  }

  if (openDMWindowUsers.value.has(targetUser)) {
    void focusDMWindow(targetUser).then((focused) => {
      if (!focused) {
        void openDMWindow(targetUser);
      }
    });
    return;
  }

  void openDMWindow(targetUser);
}

function handleShowAgentAmpWindow() {
  if (!config.value.agentAmpDetached) {
    return;
  }

  void openDetachedAgentAmpWindow();
}

function handleAgentAmpDetachRequest() {
  if (!config.value.agentAmpEnabled) {
    return;
  }

  config.value.agentAmpDetached = true;
  updateSettings();
}

function handleToggleAgentAmpDock() {
  if (!config.value.agentAmpEnabled) {
    return;
  }

  config.value.agentAmpDetached = !config.value.agentAmpDetached;
  updateSettings();
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
    autoScanMediaLibraryMinutes: newConfig.autoScanMediaLibraryMinutes ?? 0,
    spectrumBarCount: newConfig.spectrumBarCount ?? 64,
    spectrumFftSize: newConfig.spectrumFftSize ?? 2048,
    spectrumThresholdLow: newConfig.spectrumThresholdLow ?? config.value.spectrumThresholdLow ?? 0.15,
    spectrumThresholdMedium: newConfig.spectrumThresholdMedium ?? config.value.spectrumThresholdMedium ?? 0.3,
    spectrumThresholdHigh: newConfig.spectrumThresholdHigh ?? config.value.spectrumThresholdHigh ?? 0.6,
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

watch(
  () => config.value.autoScanMediaLibraryMinutes ?? 0,
  (minutes) => {
    scheduleMediaLibraryAutoScan(minutes);
  },
  { immediate: true }
);

function clearMediaLibraryAutoScanInterval() {
  if (mediaLibraryAutoScanIntervalId !== null) {
    window.clearInterval(mediaLibraryAutoScanIntervalId);
    mediaLibraryAutoScanIntervalId = null;
  }
}

async function scanMediaLibraryFolders() {
  if (!hasTauriWindow) {
    return;
  }

  try {
    const state = await invoke<{ folders: Array<{ path: string }> }>('load_media_library_state');
    if (!state?.folders?.length) {
      return;
    }

    for (const folder of state.folders) {
      if (folder?.path) {
        await invoke('scan_media_library_folder', { folderPath: folder.path });
      }
    }
  } catch (error) {
    console.error('Media library auto-scan failed:', error);
  }
}

function scheduleMediaLibraryAutoScan(minutes: number) {
  clearMediaLibraryAutoScanInterval();
  if (!hasTauriWindow || !minutes || minutes <= 0) {
    return;
  }

  mediaLibraryAutoScanIntervalId = window.setInterval(() => {
    void scanMediaLibraryFolders();
  }, minutes * 60000);
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
  dmLog('handleDMRequest invoked', { user, hasDmRuntime: Boolean(dm.value) });
  if (dm.value) {
    const targetPresence = Object.values(users).find(
      (presence) => presence.username.toLowerCase() === user.toLowerCase()
    );

    if (targetPresence?.isAway) {
      dmLog('handleDMRequest aborted: target away', { user: targetPresence.username });
      addSystemMessage(`${targetPresence.username} IS CURRENTLY AWAY.`);
      return;
    }

    if (targetPresence && !targetPresence.dmAvailable) {
      dmLog('handleDMRequest aborted: target unavailable', { user: targetPresence.username });
      addSystemMessage(`${targetPresence.username} IS NOT ACCEPTING DIRECT MESSAGES.`);
      return;
    }

    // Clicking a yellow (pending) DM bubble cancels that outgoing request.
    if (dmOutgoingRequests.value.includes(user)) {
      dmLog('handleDMRequest cancelling outgoing request', { user });
      dm.value.cancelDMRequest(user);
      return;
    }

    // Check if chat already exists
    if (dm.value.activeChats.value.has(user)) {
      dmLog('handleDMRequest focusing existing chat', { user });
      // Jump to existing chat
      focusedDMUser.value = user;
      await openDMWindow(user);
    } else {
      dmLog('handleDMRequest creating new request', { user });
      // Start new DM request
      await dm.value.requestDM(user);
    }
  }
}

function handleAcceptDM(user: string) {
  if (dm.value) {
    focusedDMUser.value = user;
    dm.value.acceptDM(user);
    // openDMWindow is triggered automatically by the connectedDMUsers watcher when
    // acceptDM adds the user to activeChats. Calling it here too would race with
    // the watcher and cause "webview already exists" errors.
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
    void openDMWindow(user);
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
    void openDMWindow(user);
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
    void closeDMWindow(user);

    if (dm.value.activeChats.value.size === 0) {
      focusedDMUser.value = null;
      void closeAllDMWindows();
    }
  }
}

function handleCancelPendingMessages(user: string) {
  if (dm.value) {
    dm.value.cancelPendingMessages(user);
  }
}

function initializeWebDMBridge() {
  if (!webMessageListenerBound) {
    window.addEventListener('message', handleWebPopupMessage);
    webMessageListenerBound = true;
  }

  if (typeof BroadcastChannel === 'undefined') {
    return;
  }

  dmWebChannel = new BroadcastChannel(DM_WEB_CHANNEL);
  dmWebChannel.onmessage = (event: MessageEvent) => {
    const message = event.data as { type?: string; payload?: unknown };
    if (message?.type === 'action') {
      handleDMWindowAction(message.payload as DMWindowAction);
    }
  };
}

function handleWebPopupMessage(event: MessageEvent) {
  if (event.origin !== window.location.origin) {
    return;
  }

  const message = event.data as { type?: string; payload?: unknown };
  if (message?.type !== 'action') {
    return;
  }

  handleDMWindowAction(message.payload as DMWindowAction);
}

function startWebPopupHeartbeat(user: string) {
  if (dmPopupWatchIntervals.has(user)) {
    return;
  }

  const intervalId = window.setInterval(() => {
    const popup = dmPopupWindows.get(user);
    if (!popup || popup.closed) {
      dmPopupWindows.delete(user);
      markDMWindowClosed(user);
      const existingInterval = dmPopupWatchIntervals.get(user);
      if (existingInterval !== undefined) {
        window.clearInterval(existingInterval);
        dmPopupWatchIntervals.delete(user);
      }
    }
  }, 750);

  dmPopupWatchIntervals.set(user, intervalId);
}

async function initializeDMWindowActionListener() {
  if (!hasTauriWindow) {
    return;
  }

  const { listen } = await import('@tauri-apps/api/event');
  cleanupDMActionListener = await listen<DMWindowAction>(DM_WINDOW_ACTION_EVENT, (event) => {
    dmLog('received tauri dm-window-action', event.payload);
    handleDMWindowAction(event.payload);
  });
}

async function emitDMWindowState() {
  const openUsers = Array.from(openDMWindowUsers.value);
  if (openUsers.length === 0) {
    return;
  }

  dmLog('emitDMWindowState', {
    openUsers,
    activeChats: dmActiveChats.value.size,
    pendingRequests: dmPendingRequests.value.length,
    pendingAudioCalls: dmPendingAudioCalls.value.length,
    pendingVideoCalls: dmPendingVideoCalls.value.length,
  });

  if (hasTauriWindow) {
    const { emitTo } = await import('@tauri-apps/api/event');
    for (const user of openUsers) {
      const payload = buildDMWindowStatePayload(user);
      await emitTo(dmWindowLabelForUser(user), DM_WINDOW_STATE_EVENT, payload);
    }
    return;
  }

  for (const user of openUsers) {
    const payload = buildDMWindowStatePayload(user);
    const webPayload = toWebSerializablePayload(payload);
    const popup = dmPopupWindows.get(user);

    if (popup && !popup.closed) {
      popup.postMessage({ type: 'state', payload: webPayload }, window.location.origin);
    }

    dmWebChannel?.postMessage({
      type: 'state',
      payload: webPayload,
    });
  }
}

async function bringDMWindowToFront(windowHandle: import('@tauri-apps/api/webviewWindow').WebviewWindow) {
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

function buildDMWindowStatePayload(targetUser: string | null = null): DMWindowStatePayload {
  const normalizedTarget = normalizeDMUser(targetUser);

  const activeChats = normalizedTarget
    ? toSerializedChats().filter((chat) => sameDMUser(chat.user, normalizedTarget))
    : toSerializedChats();

  const pendingRequests = normalizedTarget
    ? dmPendingRequests.value.filter((request) => sameDMUser(request.from, normalizedTarget))
    : dmPendingRequests.value;

  const pendingAudioCalls = normalizedTarget
    ? dmPendingAudioCalls.value.filter((request) => sameDMUser(request.from, normalizedTarget))
    : dmPendingAudioCalls.value;

  const pendingVideoCalls = normalizedTarget
    ? dmPendingVideoCalls.value.filter((request) => sameDMUser(request.from, normalizedTarget))
    : dmPendingVideoCalls.value;

  const outgoingRequests = normalizedTarget
    ? dmOutgoingRequests.value.filter((user) => sameDMUser(user, normalizedTarget))
    : dmOutgoingRequests.value;

  const notices = normalizedTarget
    ? dmNotices.value.filter((notice) => !notice.from || sameDMUser(notice.from, normalizedTarget))
    : dmNotices.value;

  return {
    activeChats,
    pendingRequests,
    pendingAudioCalls,
    pendingVideoCalls,
    outgoingRequests,
    notices,
    username: username.value,
    mqttServer: networkConfig.value.mqttServer,
    roomId: getRoomId(),
    audioConfig: { ...config.value },
    dmChatEffect: config.value.dmChatEffect,
    focusedDMUser: normalizedTarget ?? focusedDMUser.value,
    targetUser: normalizedTarget,
  };
}

function toWebSerializablePayload(payload: DMWindowStatePayload): DMWindowStatePayload {
  return JSON.parse(JSON.stringify(payload)) as DMWindowStatePayload;
}

async function focusDMWindow(user: string): Promise<boolean> {
  const normalizedUser = normalizeDMUser(user);
  if (!normalizedUser) {
    return false;
  }

  if (hasTauriWindow) {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const existingWindow = await WebviewWindow.getByLabel(dmWindowLabelForUser(normalizedUser));
    if (existingWindow) {
      await bringDMWindowToFront(existingWindow);
      markDMWindowOpen(normalizedUser);
      await emitDMWindowState();
      return true;
    }
    return false;
  }

  const popup = dmPopupWindows.get(normalizedUser);
  if (popup && !popup.closed) {
    popup.focus();
    markDMWindowOpen(normalizedUser);
    await emitDMWindowState();
    return true;
  }
  return false;
}

async function closeDMWindow(user: string) {
  const normalizedUser = normalizeDMUser(user);
  if (!normalizedUser) {
    return;
  }

  const usersToClose = [normalizedUser];

  if (hasTauriWindow) {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    for (const userToClose of usersToClose) {
      const existingWindow = await WebviewWindow.getByLabel(dmWindowLabelForUser(userToClose));
      if (existingWindow) {
        try {
          await existingWindow.close();
        } catch (error) {
          console.debug(`Unable to close DM window for ${userToClose}:`, error);
        }
      }

      markDMWindowClosed(userToClose);
    }
    return;
  }

  for (const userToClose of usersToClose) {
    const popup = dmPopupWindows.get(userToClose);
    if (popup && !popup.closed) {
      popup.close();
    }

    dmPopupWindows.delete(userToClose);
    markDMWindowClosed(userToClose);

    const intervalId = dmPopupWatchIntervals.get(userToClose);
    if (intervalId !== undefined) {
      window.clearInterval(intervalId);
      dmPopupWatchIntervals.delete(userToClose);
    }
  }
}

async function closeAllDMWindows() {
  const usersToClose = Array.from(openDMWindowUsers.value);
  for (const user of usersToClose) {
    await closeDMWindow(user);
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
        const agentAmpChannel = new BroadcastChannel(AGENTAMP_FORCE_CLOSE_CHANNEL);
        agentAmpChannel.postMessage('force-close');
        agentAmpChannel.close();
      } catch (error) {
        // Ignore close signaling errors
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

async function openDMWindow(user: string) {
  const normalizedUser = normalizeDMUser(user);
  if (!normalizedUser) {
    return;
  }

  dmLog('openDMWindow', { user: normalizedUser });

  focusedDMUser.value = normalizedUser;

  if (hasTauriWindow) {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const windowLabel = dmWindowLabelForUser(normalizedUser);

    // If creation is already in-flight for this label, do not attempt a second creation.
    if (inFlightDMWindowLabels.has(windowLabel)) {
      dmLog('openDMWindow: creation already in-flight, skipping', { user: normalizedUser, windowLabel });
      return;
    }

    const existingWindow = await WebviewWindow.getByLabel(windowLabel);
    if (existingWindow) {
      await bringDMWindowToFront(existingWindow);
      markDMWindowOpen(normalizedUser);
      await emitDMWindowState();
      return;
    }

    // Re-check after the async getByLabel round-trip in case a concurrent call
    // already started creation while we were awaiting.
    if (inFlightDMWindowLabels.has(windowLabel)) {
      dmLog('openDMWindow: creation now in-flight after getByLabel, skipping', { user: normalizedUser });
      return;
    }

    inFlightDMWindowLabels.add(windowLabel);

    const dmWindowUrl = new URL(window.location.href);
    dmWindowUrl.searchParams.set('view', 'dm');
    dmWindowUrl.searchParams.set('dmUser', normalizedUser);
    const dmWindow = new WebviewWindow(windowLabel, {
      url: dmWindowUrl.toString(),
      title: `AGENT // DM // ${normalizedUser}`,
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
      inFlightDMWindowLabels.delete(windowLabel);
      markDMWindowOpen(normalizedUser);
      void emitDMWindowState();
    });

    dmWindow.once('tauri://destroyed', () => {
      inFlightDMWindowLabels.delete(windowLabel);
      markDMWindowClosed(normalizedUser);
    });

    dmWindow.once('tauri://error', (error) => {
      inFlightDMWindowLabels.delete(windowLabel);
      // If the error is because the window already exists (race between two concurrent
      // openDMWindow calls), the window IS open — mark it open and bring it to front
      // rather than marking it closed (which would orphan it from quit cleanup).
      const errorStr = String((error as { payload?: unknown })?.payload ?? error ?? '');
      const isAlreadyExists = errorStr.toLowerCase().includes('already exists');
      if (isAlreadyExists) {
        dmLog('openDMWindow: window creation race — window already exists, recovering', { user: normalizedUser });
        markDMWindowOpen(normalizedUser);
        void WebviewWindow.getByLabel(windowLabel).then((w) => {
          if (w) void bringDMWindowToFront(w).catch(() => undefined);
          void emitDMWindowState();
        });
      } else {
        console.error(`Failed to create DM window for ${normalizedUser}:`, error);
        markDMWindowClosed(normalizedUser);
      }
    });

    return;
  }

  const dmWindowUrl = `${window.location.pathname}?view=dm&dmUser=${encodeURIComponent(normalizedUser)}`;
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

  const popup = window.open(dmWindowUrl, `agent-lobby-dm-${normalizedUser}`, popupFeatures);
  if (!popup) {
    return;
  }

  dmPopupWindows.set(normalizedUser, popup);
  markDMWindowOpen(normalizedUser);
  startWebPopupHeartbeat(normalizedUser);
  await emitDMWindowState();
}

function handleDMWindowAction(action: DMWindowAction | undefined) {
  if (!action || !dm.value) {
    return;
  }

  dmLog('handleDMWindowAction', action);

  switch (action.type) {
    case 'windowReady':
      if (action.user) {
        markDMWindowOpen(action.user);
        focusedDMUser.value = action.user;
      }
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
      // Phase 2: media runtime is owned by DM window process.
      break;
    case 'endCall':
      // Phase 2: media runtime is owned by DM window process.
      break;
    case 'toggleAudio':
      // Phase 2: media runtime is owned by DM window process.
      break;
    case 'requestVideo':
      // Phase 2: media runtime is owned by DM window process.
      break;
    case 'toggleVideo':
      // Phase 2: media runtime is owned by DM window process.
      break;
    case 'sendFile':
      // Phase 2: media runtime is owned by DM window process.
      break;
    case 'acceptFile':
      // Phase 2: media runtime is owned by DM window process.
      break;
    case 'rejectFile':
      // Phase 2: media runtime is owned by DM window process.
      break;
    case 'fileSaved':
      // Phase 2: media runtime is owned by DM window process.
      break;
    case 'removeFile':
      // Phase 2: media runtime is owned by DM window process.
      break;
    case 'windowClosed':
      if (action.user && focusedDMUser.value === action.user) {
        focusedDMUser.value = null;
      }
      if (action.user) {
        markDMWindowClosed(action.user);
      }
      break;
  }
}
</script>


