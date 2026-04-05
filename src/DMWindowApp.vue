<template>
  <div class="dm-window-root">
    <div data-tauri-drag-region class="custom-titlebar">
      <span class="titlebar-text">{{ pageTitle }}</span>
      <div v-if="activeDMUser" class="titlebar-call-controls">
        <span v-if="hasActiveCall" class="titlebar-call-duration">⏱ {{ activeCallDurationLabel }}</span>
        <button
          v-if="canRequestCalls"
          class="titlebar-action-btn"
          type="button"
          @click="handleTitlebarRequestAudio"
        >
          ☎
        </button>
        <button
          v-if="canRequestCalls"
          class="titlebar-action-btn"
          type="button"
          @click="handleTitlebarRequestVideo"
        >
          📹
        </button>
        <button
          v-if="hasActiveCall"
          class="titlebar-action-btn end-call"
          type="button"
          @click="handleTitlebarEndCall"
        >
          ⊗
        </button>
      </div>
      <button v-if="hasTauriWindow" class="minimize-btn" @click="minimize">—</button>
      <button v-if="hasTauriWindow" class="maximize-btn" @click="toggleMaximize">
        <span class="window-icon" :class="{ maximized: isMaximized }" aria-hidden="true"></span>
      </button>
      <button class="titlebar-close-btn" @click="handleClose">✕</button>
    </div>

    <DMChatModal
      :show-modal="true"
      presentation="window"
      :show-header-close="false"
      :show-header-title="false"
      :active-chats="viewActiveChats"
      :pending-requests="viewPendingRequests"
      :pending-audio-calls="viewPendingAudioCalls"
      :pending-video-calls="viewPendingVideoCalls"
      :outgoing-requests="viewOutgoingRequests"
      :notices="viewNotices"
      :username="viewUsername"
      :dm-chat-effect="dmChatEffect"
      :focused-dm-user="focusedDMUser"
      @close="handleClose"
      @accept-dm="handleAcceptDM"
      @reject-dm="handleRejectDM"
      @accept-audio="handleAcceptAudio"
      @reject-audio="handleRejectAudio"
      @accept-video="handleAcceptVideo"
      @reject-video="handleRejectVideo"
      @cancel-request="handleCancelRequest"
      @send-message="handleSendMessage"
      @typing="handleTyping"
      @stop-typing="handleStopTyping"
      @cancel-pending-messages="handleCancelPendingMessages"
      @close-dm="handleCloseDM"
      @request-audio="handleRequestAudio"
      @toggle-audio="handleToggleAudio"
      @request-video="handleRequestVideo"
      @toggle-video="handleToggleVideo"
      @send-file="handleSendFile"
      @accept-file="handleAcceptFile"
      @reject-file="handleRejectFile"
      @file-saved="handleFileSaved"
      @remove-file="handleRemoveFile"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, computed, onMounted, onBeforeUnmount } from 'vue';
import mqtt from 'mqtt';
import DMChatModal from './components/DMChatModal.vue';
import type { DMChat, FileTransferState } from './types/directMessage';
import type { DMWindowAction, DMWindowStatePayload, SerializedDMChat } from './types/dmWindowBridge';
import type { AudioConfig } from './types/chat';
import { useDirectMessage } from './composables/useDirectMessage';
import { useTheme } from './composables/useTheme';

const DM_WINDOW_STATE_EVENT = 'dm-window-state';
const DM_WINDOW_ACTION_EVENT = 'dm-window-action';
const DM_WEB_CHANNEL = 'agent-lobby-dm-window';
const DM_WINDOW_FORCE_CLOSE_CHANNEL = 'agent-lobby-dm-force-close';
const DM_WINDOW_LOG_PREFIX = '[DMWindowApp]';
let allowWindowClose = false;
let cleanupForceCloseListener: (() => void) | null = null;
let orphanWindowCloseTimeoutId: number | null = null;

const activeChats = ref<Map<string, DMChat>>(new Map());
const pendingRequests = ref<DMWindowStatePayload['pendingRequests']>([]);
const pendingAudioCalls = ref<DMWindowStatePayload['pendingAudioCalls']>([]);
const pendingVideoCalls = ref<DMWindowStatePayload['pendingVideoCalls']>([]);
const outgoingRequests = ref<string[]>([]);
const notices = ref<DMWindowStatePayload['notices']>([]);
const username = ref('');
const dmChatEffect = ref<DMWindowStatePayload['dmChatEffect']>('none');
const focusedDMUser = ref<string | null>(null);
const isMaximized = ref(false);
const queryTargetUser = new URLSearchParams(window.location.search).get('dmUser');
const targetUser = ref<string | null>(queryTargetUser);
const runtimeUsernameRef = ref('');
const runtimeMqttServer = ref('');
const runtimeRoomId = ref('');
const runtimeAudioConfig = ref<AudioConfig | null>(null);
const dmRuntime = shallowRef<ReturnType<typeof useDirectMessage> | null>(null);
const runtimeMqttClient = ref<mqtt.MqttClient | null>(null);
const hasReceivedInitialState = ref(false);
const { applyTheme } = useTheme();

let webChannel: BroadcastChannel | null = null;
let cleanupTauriListener: (() => void) | null = null;
let webMessageListenerBound = false;
const hasTauriWindow = isTauriRuntime();

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

function debugEnabled(): boolean {
  if (typeof window === 'undefined') {
    return true;
  }

  try {
    return window.localStorage.getItem('dm-window-debug') !== '0';
  } catch {
    return true;
  }
}

function debugVerboseEnabled(): boolean {
  if (!debugEnabled() || typeof window === 'undefined') {
    return false;
  }

  try {
    return window.localStorage.getItem('dm-window-debug-verbose') === '1';
  } catch {
    return false;
  }
}

function debugLog(message: string, details?: unknown) {
  if (!debugEnabled()) {
    return;
  }

  if (details === undefined) {
    console.log(`${DM_WINDOW_LOG_PREFIX} ${message}`);
    return;
  }

  console.log(`${DM_WINDOW_LOG_PREFIX} ${message}`, details);
}

function hasVideoCallActivity(chat: DMChat): boolean {
  if (chat.videoCallActive || chat.videoEnabled) {
    return true;
  }

  const hasLocalVideoTrack = chat.localMediaStream?.getVideoTracks().some((track) => track.readyState === 'live') ?? false;
  const hasRemoteVideoTrack = chat.remoteMediaStream?.getVideoTracks().some((track) => track.readyState === 'live') ?? false;
  return hasLocalVideoTrack || hasRemoteVideoTrack;
}

function toConnectedChatMap(source: Map<string, DMChat>): Map<string, DMChat> {
  const next = new Map<string, DMChat>();
  for (const [user, chat] of source.entries()) {
    next.set(user, {
      ...chat,
      // Keep controls enabled while runtime transport catches up.
      isConnected: true,
    });
  }

  return next;
}

const viewActiveChats = computed(() => {
  const runtimeChats = dmRuntime.value?.activeChats.value;
  if (runtimeChats && runtimeChats.size > 0) {
    return runtimeChats;
  }

  return toConnectedChatMap(activeChats.value);
});
const viewPendingRequests = computed(() => dmRuntime.value?.pendingRequests.value ?? pendingRequests.value);
const viewPendingAudioCalls = computed(() => dmRuntime.value?.pendingAudioCalls.value ?? pendingAudioCalls.value);
const viewPendingVideoCalls = computed(() => dmRuntime.value?.pendingVideoCalls.value ?? pendingVideoCalls.value);
const viewOutgoingRequests = computed(() => dmRuntime.value?.outgoingRequests.value ?? outgoingRequests.value);
const viewNotices = computed(() => dmRuntime.value?.notices.value ?? notices.value);
const viewUsername = computed(() => runtimeUsernameRef.value || username.value);

const inVideo = computed(() => Array.from(viewActiveChats.value.values()).some((chat) => hasVideoCallActivity(chat)));

const activeDMUser = computed<string | null>(() => {
  const preferredTarget = normalizeDMUser(targetUser.value);
  if (preferredTarget) {
    const matched = Array.from(viewActiveChats.value.keys()).find((user) => sameDMUser(user, preferredTarget));
    return matched ?? preferredTarget;
  }

  const preferredFocused = normalizeDMUser(focusedDMUser.value);
  if (preferredFocused) {
    const matched = Array.from(viewActiveChats.value.keys()).find((user) => sameDMUser(user, preferredFocused));
    return matched ?? preferredFocused;
  }

  return Array.from(viewActiveChats.value.keys())[0] ?? null;
});

const activeDMChat = computed<DMChat | null>(() => {
  const user = activeDMUser.value;
  if (!user) {
    return null;
  }

  const direct = viewActiveChats.value.get(user);
  if (direct) {
    return direct;
  }

  const matchedUser = Array.from(viewActiveChats.value.keys()).find((candidate) => sameDMUser(candidate, user));
  if (!matchedUser) {
    return null;
  }

  return viewActiveChats.value.get(matchedUser) ?? null;
});

const hasActiveCall = computed(() => {
  const chat = activeDMChat.value;
  if (!chat) {
    return false;
  }

  const hasLiveLocal = chat.localMediaStream?.getTracks().some((track) => track.readyState === 'live') ?? false;
  const hasLiveRemote = chat.remoteMediaStream?.getTracks().some((track) => track.readyState === 'live') ?? false;
  return Boolean(chat.callStartTime) || chat.videoCallActive || hasLiveLocal || hasLiveRemote;
});
const canRequestCalls = computed(() => Boolean(activeDMUser.value) && !hasActiveCall.value);
const activeCallDurationLabel = computed(() => formatDuration(activeDMChat.value?.callDuration ?? 0));

const hasRenderableDMContext = computed(() => {
  if (viewActiveChats.value.size > 0) {
    return true;
  }

  if (viewPendingRequests.value.length > 0) {
    return true;
  }

  if (viewPendingAudioCalls.value.length > 0 || viewPendingVideoCalls.value.length > 0) {
    return true;
  }

  if (viewOutgoingRequests.value.length > 0) {
    return true;
  }

  return false;
});

const pageTitle = computed(() => {
  const activeUsers = Array.from(viewActiveChats.value.keys());
  const currentUser = viewUsername.value || 'AGENT';
  const titleUser = inVideo.value ? `${currentUser} in video` : currentUser;

  if (targetUser.value) {
    return `${titleUser} < - > ${targetUser.value}`;
  }

  if (activeUsers.length > 0) {
    if (activeUsers.length === 1) {
      return `${titleUser} < - > ${activeUsers[0]}`;
    }

    return `${titleUser} < - > ${activeUsers.join(', ')}`;
  }

  return `${titleUser} // DM`;
});

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && typeof (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ === 'object';
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function toFileTransferState(transfer: SerializedDMChat['fileTransfers'][number]): FileTransferState {
  const chunks = new Map<number, Uint8Array>();

  for (const chunk of transfer.chunks ?? []) {
    chunks.set(chunk.index, Uint8Array.from(chunk.data));
  }

  return {
    ...transfer,
    chunks,
  };
}

function toChat(chat: SerializedDMChat): DMChat {
  return {
    user: chat.user,
    messages: chat.messages,
    dataChannel: null,
    isConnected: chat.isConnected,
    pendingDisplayMessages: chat.pendingDisplayMessages,
    isTyping: chat.isTyping,
    audioEnabled: chat.audioEnabled,
    videoEnabled: chat.videoEnabled,
    localMediaStream: null,
    remoteMediaStream: null,
    fileTransfers: new Map(chat.fileTransfers.map((transfer) => [transfer.id, toFileTransferState(transfer)])),
    callStartTime: chat.callStartTime,
    callDuration: chat.callDuration,
    videoCallActive: chat.videoCallActive,
  };
}

function teardownDMRuntime() {
  dmRuntime.value?.cleanup();
  dmRuntime.value = null;

  const client = runtimeMqttClient.value;
  if (client) {
    try {
      client.end(true);
    } catch {
      // Ignore shutdown errors during teardown.
    }
  }

  runtimeMqttClient.value = null;
}

function ensureDMRuntime(payload: DMWindowStatePayload) {
  runtimeUsernameRef.value = payload.username;
  debugLog('ensureDMRuntime invoked', {
    username: payload.username,
    roomId: payload.roomId,
    mqttServer: payload.mqttServer,
  });

  if (!runtimeAudioConfig.value) {
    runtimeAudioConfig.value = { ...payload.audioConfig };
  } else {
    Object.assign(runtimeAudioConfig.value, payload.audioConfig);
  }

  const needsRecreate =
    !dmRuntime.value ||
    runtimeMqttServer.value !== payload.mqttServer ||
    runtimeRoomId.value !== payload.roomId;

  if (!needsRecreate) {
    return;
  }

  teardownDMRuntime();

  runtimeMqttServer.value = payload.mqttServer;
  runtimeRoomId.value = payload.roomId;

  const client = mqtt.connect(payload.mqttServer);
  runtimeMqttClient.value = client;

  client.on('error', (error) => {
    debugLog('dm runtime mqtt error', error);
  });

  client.on('close', () => {
    debugLog('dm runtime mqtt closed');
  });

  const runtime = useDirectMessage(
    runtimeUsernameRef,
    payload.roomId,
    client,
    (callback) => {
      if (client.connected) {
        callback();
        return;
      }

      client.on('connect', callback);
    },
    runtimeAudioConfig.value,
    { runtimeMode: 'full' }
  );

  dmRuntime.value = runtime;
}

function applyState(payload: DMWindowStatePayload) {
  hasReceivedInitialState.value = true;
  if (debugVerboseEnabled()) {
    debugLog('applyState payload received', {
      activeChats: payload.activeChats.length,
      pendingRequests: payload.pendingRequests.length,
      pendingAudioCalls: payload.pendingAudioCalls.length,
      pendingVideoCalls: payload.pendingVideoCalls.length,
      notices: payload.notices.length,
      focusedDMUser: payload.focusedDMUser,
    });
  }

  const lockedTarget = queryTargetUser ?? targetUser.value;
  if (lockedTarget && payload.targetUser && !sameDMUser(payload.targetUser, lockedTarget)) {
    return;
  }

  const nextTarget = lockedTarget ?? payload.targetUser ?? null;
  targetUser.value = nextTarget;

  if (payload.audioConfig?.theme) {
    applyTheme(payload.audioConfig.theme, { persist: false });
  }

  ensureDMRuntime(payload);

  const stateChats = nextTarget
    ? payload.activeChats.filter((chat) => sameDMUser(chat.user, nextTarget))
    : payload.activeChats;

  const previousChats = activeChats.value;

  activeChats.value = new Map(stateChats.map((chat) => {
    const nextChat = toChat(chat);
    const existingChat = previousChats.get(chat.user);

    if (existingChat) {
      nextChat.localMediaStream = existingChat.localMediaStream;
      nextChat.remoteMediaStream = existingChat.remoteMediaStream;
    }

    return [chat.user, nextChat];
  }));

  for (const chat of stateChats) {
    void dmRuntime.value?.ensureDirectLine(chat.user);
  }

  pendingRequests.value = nextTarget
    ? payload.pendingRequests.filter((request) => sameDMUser(request.from, nextTarget))
    : payload.pendingRequests;
  pendingAudioCalls.value = nextTarget
    ? payload.pendingAudioCalls.filter((request) => sameDMUser(request.from, nextTarget))
    : payload.pendingAudioCalls;
  pendingVideoCalls.value = nextTarget
    ? payload.pendingVideoCalls.filter((request) => sameDMUser(request.from, nextTarget))
    : payload.pendingVideoCalls;
  outgoingRequests.value = nextTarget
    ? payload.outgoingRequests.filter((user) => sameDMUser(user, nextTarget))
    : payload.outgoingRequests;
  notices.value = nextTarget
    ? payload.notices.filter((notice) => !notice.from || sameDMUser(notice.from, nextTarget))
    : payload.notices;
  username.value = payload.username;
  dmChatEffect.value = payload.dmChatEffect;
  focusedDMUser.value = nextTarget ?? payload.focusedDMUser;
  scheduleOrphanWindowCheck();
}

function clearOrphanWindowTimer() {
  if (orphanWindowCloseTimeoutId !== null) {
    window.clearTimeout(orphanWindowCloseTimeoutId);
    orphanWindowCloseTimeoutId = null;
  }
}

async function closeOrphanWindow(reason: string) {
  debugLog('closing orphan DM window', { reason, targetUser: targetUser.value });
  await sendAction({ type: 'windowClosed', user: targetUser.value ?? undefined });

  if (isTauriRuntime()) {
    allowWindowClose = true;
    const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    await getCurrentWebviewWindow().close();
    return;
  }

  window.close();
}

function scheduleOrphanWindowCheck() {
  clearOrphanWindowTimer();

  if (!targetUser.value) {
    return;
  }

  if (!hasReceivedInitialState.value) {
    return;
  }

  if (hasRenderableDMContext.value) {
    return;
  }

  orphanWindowCloseTimeoutId = window.setTimeout(() => {
    if (hasRenderableDMContext.value) {
      return;
    }

    void closeOrphanWindow('no-active-dm-context');
  }, 1200);
}

async function sendAction(action: DMWindowAction) {
  if (isTauriRuntime()) {
    const { emitTo } = await import('@tauri-apps/api/event');
    await emitTo('main', DM_WINDOW_ACTION_EVENT, action);
    return;
  }

  if (window.opener && window.opener !== window) {
    window.opener.postMessage({ type: 'action', payload: action }, window.location.origin);
    return;
  }

  webChannel?.postMessage({ type: 'action', payload: action });
}

function handleAcceptDM(user: string) {
  debugLog('handleAcceptDM', { user });
  dmRuntime.value?.acceptDM(user);
}

function handleRejectDM(user: string) {
  debugLog('handleRejectDM', { user });
  dmRuntime.value?.rejectDM(user);
}

function handleAcceptAudio(user: string) {
  debugLog('handleAcceptAudio', { user });
  void dmRuntime.value?.acceptAudioCall(user);
}

function handleRejectAudio(user: string) {
  debugLog('handleRejectAudio', { user });
  dmRuntime.value?.rejectAudioCall(user);
}

function handleAcceptVideo(user: string) {
  debugLog('handleAcceptVideo', { user });
  void dmRuntime.value?.acceptVideoCall(user);
}

function handleRejectVideo(user: string) {
  debugLog('handleRejectVideo', { user });
  dmRuntime.value?.rejectVideoCall(user);
}

function handleCancelRequest(user: string) {
  debugLog('handleCancelRequest', { user });
  dmRuntime.value?.cancelDMRequest(user);
}

function handleSendMessage(user: string, message: string, effect: string) {
  debugLog('handleSendMessage', { user, length: message.length, effect });
  dmRuntime.value?.sendDMMessage(user, message, effect);
}

function handleTyping(user: string) {
  debugLog('handleTyping', { user });
  dmRuntime.value?.sendTyping(user);
}

function handleStopTyping(user: string) {
  debugLog('handleStopTyping', { user });
  dmRuntime.value?.sendStopTyping(user);
}

function handleCancelPendingMessages(user: string) {
  debugLog('handleCancelPendingMessages', { user });
  dmRuntime.value?.cancelPendingMessages(user);
}

function handleCloseDM(user: string) {
  debugLog('handleCloseDM', { user });
  dmRuntime.value?.closeDM(user);
  void sendAction({ type: 'closeDm', user });
}

function handleRequestAudio(user: string) {
  debugLog('handleRequestAudio', { user });
  void dmRuntime.value?.requestAudioCall(user);
}

function handleToggleAudio(user: string, enabled: boolean) {
  debugLog('handleToggleAudio', { user, enabled });
  void dmRuntime.value?.toggleAudioStream(user, enabled);
}

function handleRequestVideo(user: string) {
  debugLog('handleRequestVideo', { user });
  void dmRuntime.value?.requestVideoCall(user);
}

function handleToggleVideo(user: string, enabled: boolean) {
  debugLog('handleToggleVideo', { user, enabled });
  void dmRuntime.value?.toggleVideoStream(user, enabled);
}

function handleSendFile(user: string, file: File) {
  debugLog('handleSendFile', { user, name: file.name, size: file.size });
  void dmRuntime.value?.sendFile(user, file);
}

function handleAcceptFile(user: string, fileId: string) {
  debugLog('handleAcceptFile', { user, fileId });
  dmRuntime.value?.acceptFileTransfer(user, fileId);
}

function handleRejectFile(user: string, fileId: string) {
  debugLog('handleRejectFile', { user, fileId });
  dmRuntime.value?.rejectFileTransfer(user, fileId);
}

function handleFileSaved(user: string, fileId: string) {
  debugLog('handleFileSaved', { user, fileId });
  dmRuntime.value?.markFileSaved(user, fileId);
}

function handleRemoveFile(user: string, fileId: string) {
  debugLog('handleRemoveFile', { user, fileId });
  dmRuntime.value?.removeFileTransfer(user, fileId);
}

function handleWebMessage(event: MessageEvent) {
  if (event.origin !== window.location.origin) {
    return;
  }

  const message = event.data as { type?: string; payload?: unknown };
  if (message?.type === 'state') {
    debugLog('window message state received');
    applyState(message.payload as DMWindowStatePayload);
    return;
  }
}

async function handleClose() {
  const user = activeDMUser.value;
  if (user) {
    handleCloseDM(user);
  }

  await sendAction({ type: 'windowClosed', user: targetUser.value ?? user ?? undefined });

  if (isTauriRuntime()) {
    allowWindowClose = true;
    const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    await getCurrentWebviewWindow().close();
    return;
  }

  window.close();
}

async function handleTitlebarRequestAudio() {
  const user = activeDMUser.value;
  if (!user) {
    return;
  }

  debugLog('handleTitlebarRequestAudio', { user });
  handleRequestAudio(user);
}

async function handleTitlebarRequestVideo() {
  const user = activeDMUser.value;
  if (!user) {
    return;
  }

  debugLog('handleTitlebarRequestVideo', { user });
  handleRequestVideo(user);
}

async function handleTitlebarEndCall() {
  const user = activeDMUser.value;
  if (!user) {
    return;
  }

  debugLog('handleTitlebarEndCall', { user });
  dmRuntime.value?.endCall(user);
}

async function minimize() {
  if (!hasTauriWindow) {
    return;
  }

  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow().minimize();
}

async function toggleMaximize() {
  if (!hasTauriWindow) {
    return;
  }

  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const appWindow = getCurrentWindow();

  if (isMaximized.value) {
    await appWindow.unmaximize();
  } else {
    await appWindow.maximize();
  }

  isMaximized.value = !isMaximized.value;
}

onMounted(async () => {
  if (typeof BroadcastChannel !== 'undefined') {
    webChannel = new BroadcastChannel(DM_WEB_CHANNEL);
    webChannel.onmessage = (event: MessageEvent) => {
      const message = event.data as { type?: string; payload?: unknown };
      if (message?.type === 'state') {
        applyState(message.payload as DMWindowStatePayload);
      }
    };
  }

  // Set up force-close listener
  if (typeof BroadcastChannel !== 'undefined') {
    const forceCloseChannel = new BroadcastChannel(DM_WINDOW_FORCE_CLOSE_CHANNEL);
    forceCloseChannel.onmessage = async (event) => {
      if (event.data === 'force-close') {
        allowWindowClose = true;
        try {
          const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
          await getCurrentWebviewWindow().close();
        } catch (error) {
          // Ignore close errors
        }
      }
    };
    cleanupForceCloseListener = () => {
      forceCloseChannel.close();
    };
  }

  if (hasTauriWindow) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const appWindow = getCurrentWindow();
    isMaximized.value = await appWindow.isMaximized();

    // Listen for close requests to prevent accidental closes (user must properly close via main window quit)
    await appWindow.onCloseRequested(async (event) => {
      if (allowWindowClose) {
        return;
      }

      event.preventDefault();

      try {
        await appWindow.hide();
      } catch (error) {
        // Ignore hide errors
      }
    });
  }

  if (isTauriRuntime()) {
    const { listen } = await import('@tauri-apps/api/event');
    cleanupTauriListener = await listen<DMWindowStatePayload>(DM_WINDOW_STATE_EVENT, (event) => {
      applyState(event.payload);
    });
    await sendAction({ type: 'windowReady', user: targetUser.value ?? undefined });
    scheduleOrphanWindowCheck();
    return;
  }

  if (window.opener && window.opener !== window) {
    if (!webMessageListenerBound) {
      window.addEventListener('message', handleWebMessage);
      webMessageListenerBound = true;
    }
  }

  await sendAction({ type: 'windowReady', user: targetUser.value ?? undefined });
  scheduleOrphanWindowCheck();
});

onBeforeUnmount(() => {
  clearOrphanWindowTimer();
  void sendAction({ type: 'windowClosed', user: targetUser.value ?? undefined });
  teardownDMRuntime();
  if (webMessageListenerBound) {
    window.removeEventListener('message', handleWebMessage);
    webMessageListenerBound = false;
  }
  cleanupTauriListener?.();
  cleanupTauriListener = null;
  cleanupForceCloseListener?.();
  cleanupForceCloseListener = null;
  webChannel?.close();
  webChannel = null;
});
</script>

<style scoped>
.dm-window-root {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: var(--color-dmwindow-bg);
  color: var(--color-accent);
}

.custom-titlebar {
  -webkit-app-region: drag;
  width: 100%;
  height: 28px;
  padding: 0 176px 0 14px;
  box-sizing: border-box;
  background: var(--color-dmwindow-titlebar-bg);
  border-bottom: 1px solid var(--color-dmwindow-titlebar-border);
  display: flex;
  justify-content: flex-start;
  align-items: center;
  user-select: none;
  z-index: 1000;
  position: relative;
  font-size: 11px;
  letter-spacing: 1.6px;
  text-transform: uppercase;
  text-shadow: var(--color-dmwindow-titlebar-text-shadow);
}

.titlebar-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.titlebar-call-controls {
  position: absolute;
  top: 4px;
  right: 94px;
  display: flex;
  align-items: center;
  gap: 6px;
  -webkit-app-region: no-drag;
}

.titlebar-call-duration {
  font-size: 10px;
  letter-spacing: 0.6px;
  color: var(--color-accent-muted);
}

.titlebar-action-btn {
  width: 22px;
  height: 20px;
  border-radius: 4px;
  border: 1px solid var(--color-dmwindow-button-border);
  background: none;
  color: var(--color-accent);
  font-size: 11px;
  cursor: pointer;
  opacity: 0.82;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.2s, background 0.2s, border-color 0.2s;
}

.titlebar-action-btn:hover {
  opacity: 1;
  background: var(--color-dmwindow-button-hover-bg);
  border-color: var(--color-dmwindow-button-hover-border);
}

.titlebar-action-btn.end-call {
  color: var(--color-danger);
  border-color: var(--color-dmwindow-close-border);
}

.titlebar-action-btn.end-call:hover {
  background: var(--color-dmwindow-close-hover-bg);
  border-color: var(--color-dmwindow-close-hover-border);
}

.minimize-btn,
.maximize-btn,
.titlebar-close-btn {
  -webkit-app-region: no-drag;
}

.minimize-btn,
.maximize-btn {
  position: absolute;
  top: 4px;
  background: none;
  border: 1px solid var(--color-dmwindow-button-border);
  color: var(--color-accent);
  font-size: 12px;
  cursor: pointer;
  opacity: 0.8;
  transition: opacity 0.2s, background 0.2s, border-color 0.2s;
  width: 22px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.minimize-btn {
  right: 66px;
}

.maximize-btn {
  right: 38px;
}

.minimize-btn:hover,
.maximize-btn:hover {
  opacity: 1;
  background: var(--color-dmwindow-button-hover-bg);
  border-color: var(--color-dmwindow-button-hover-border);
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

.titlebar-close-btn {
  position: absolute;
  top: 4px;
  right: 10px;
  background: none;
  border: 1px solid var(--color-dmwindow-close-border);
  color: var(--color-danger);
  font-size: 12px;
  cursor: pointer;
  opacity: 0.82;
  transition: opacity 0.2s, background 0.2s, border-color 0.2s;
  width: 22px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.titlebar-close-btn:hover {
  opacity: 1;
  background: var(--color-dmwindow-close-hover-bg);
  border-color: var(--color-dmwindow-close-hover-border);
}

.dm-window-root :deep(#dm-modal) {
  position: absolute;
  top: 28px;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
}
</style>
