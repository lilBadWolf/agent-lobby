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
      :active-chats="activeChats"
      :pending-requests="pendingRequests"
      :pending-audio-calls="pendingAudioCalls"
      :pending-video-calls="pendingVideoCalls"
      :outgoing-requests="outgoingRequests"
      :notices="notices"
      :username="username"
      :dm-chat-effect="dmChatEffect"
      :focused-dm-user="focusedDMUser"
      @close="handleClose"
      @accept-dm="(user) => sendAction({ type: 'acceptDm', user })"
      @reject-dm="(user) => sendAction({ type: 'rejectDm', user })"
      @accept-audio="(user) => sendAction({ type: 'acceptAudio', user })"
      @reject-audio="(user) => sendAction({ type: 'rejectAudio', user })"
      @accept-video="(user) => sendAction({ type: 'acceptVideo', user })"
      @reject-video="(user) => sendAction({ type: 'rejectVideo', user })"
      @cancel-request="(user) => sendAction({ type: 'cancelRequest', user })"
      @send-message="(user, message, effect) => sendAction({ type: 'sendMessage', user, message, effect: effect as DMWindowStatePayload['dmChatEffect'] })"
      @typing="(user) => sendAction({ type: 'typing', user })"
      @stop-typing="(user) => sendAction({ type: 'stopTyping', user })"
      @cancel-pending-messages="(user) => sendAction({ type: 'cancelPendingMessages', user })"
      @close-dm="(user) => sendAction({ type: 'closeDm', user })"
      @request-audio="(user) => sendAction({ type: 'requestAudio', user })"
      @toggle-audio="(user, enabled) => sendAction({ type: 'toggleAudio', user, enabled })"
      @request-video="(user) => sendAction({ type: 'requestVideo', user })"
      @toggle-video="(user, enabled) => sendAction({ type: 'toggleVideo', user, enabled })"
      @send-file="(user, file) => sendFileAction(user, file)"
      @accept-file="(user, fileId) => sendAction({ type: 'acceptFile', user, fileId })"
      @reject-file="(user, fileId) => sendAction({ type: 'rejectFile', user, fileId })"
      @file-saved="(user, fileId) => sendAction({ type: 'fileSaved', user, fileId })"
      @remove-file="(user, fileId) => sendAction({ type: 'removeFile', user, fileId })"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import DMChatModal from './components/DMChatModal.vue';
import type { DMChat, FileTransferState } from './types/directMessage';
import type { DMWindowAction, DMWindowStatePayload, SerializedDMChat } from './types/dmWindowBridge';

const DM_WINDOW_STATE_EVENT = 'dm-window-state';
const DM_WINDOW_ACTION_EVENT = 'dm-window-action';
const DM_WEB_CHANNEL = 'agent-lobby-dm-window';
const DM_WINDOW_MEDIA_EVENT = 'media-state';
const DM_WINDOW_FORCE_CLOSE_CHANNEL = 'agent-lobby-dm-force-close';
const DM_WINDOW_LOG_PREFIX = '[DMWindowApp]';
let allowWindowClose = false;
let cleanupForceCloseListener: (() => void) | null = null;

interface DMWindowMediaState {
  user: string;
  localMediaStream: MediaStream | null;
  remoteMediaStream: MediaStream | null;
}

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

function hasVideoCallActivity(chat: DMChat): boolean {
  if (chat.videoCallActive || chat.videoEnabled) {
    return true;
  }

  const hasLocalVideoTrack = chat.localMediaStream?.getVideoTracks().some((track) => track.readyState === 'live') ?? false;
  const hasRemoteVideoTrack = chat.remoteMediaStream?.getVideoTracks().some((track) => track.readyState === 'live') ?? false;
  return hasLocalVideoTrack || hasRemoteVideoTrack;
}

const inVideo = computed(() => Array.from(activeChats.value.values()).some((chat) => hasVideoCallActivity(chat)));

const activeDMUser = computed<string | null>(() => {
  const preferredTarget = normalizeDMUser(targetUser.value);
  if (preferredTarget) {
    const matched = Array.from(activeChats.value.keys()).find((user) => sameDMUser(user, preferredTarget));
    return matched ?? preferredTarget;
  }

  const preferredFocused = normalizeDMUser(focusedDMUser.value);
  if (preferredFocused) {
    const matched = Array.from(activeChats.value.keys()).find((user) => sameDMUser(user, preferredFocused));
    return matched ?? preferredFocused;
  }

  return Array.from(activeChats.value.keys())[0] ?? null;
});

const activeDMChat = computed<DMChat | null>(() => {
  const user = activeDMUser.value;
  if (!user) {
    return null;
  }

  const direct = activeChats.value.get(user);
  if (direct) {
    return direct;
  }

  const matchedUser = Array.from(activeChats.value.keys()).find((candidate) => sameDMUser(candidate, user));
  if (!matchedUser) {
    return null;
  }

  return activeChats.value.get(matchedUser) ?? null;
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
const canRequestCalls = computed(() => Boolean(activeDMChat.value?.isConnected) && !hasActiveCall.value);
const activeCallDurationLabel = computed(() => formatDuration(activeDMChat.value?.callDuration ?? 0));

const pageTitle = computed(() => {
  const activeUsers = Array.from(activeChats.value.keys());
  const currentUser = username.value || 'AGENT';
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

function applyMediaState(payload: DMWindowMediaState[]) {
  if (!Array.isArray(payload) || payload.length === 0) {
    debugLog('applyMediaState called with empty payload');
    return;
  }

  debugLog('applyMediaState payload received', payload.map((entry) => ({
    user: entry.user,
    local: describeStream(entry.localMediaStream),
    remote: describeStream(entry.remoteMediaStream),
  })));

  const nextChats = new Map(activeChats.value);
  const activeTarget = targetUser.value;

  for (const mediaState of payload) {
    if (activeTarget && !sameDMUser(mediaState.user, activeTarget)) {
      continue;
    }

    const chat = nextChats.get(mediaState.user);
    if (!chat) {
      continue;
    }

    chat.localMediaStream = mediaState.localMediaStream;
    chat.remoteMediaStream = mediaState.remoteMediaStream;
    nextChats.set(mediaState.user, chat);

    debugLog(`media applied for ${mediaState.user}`, {
      local: describeStream(chat.localMediaStream),
      remote: describeStream(chat.remoteMediaStream),
      videoCallActive: chat.videoCallActive,
      videoEnabled: chat.videoEnabled,
      audioEnabled: chat.audioEnabled,
    });
  }

  activeChats.value = nextChats;
}

function applyState(payload: DMWindowStatePayload) {
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

async function sendFileAction(user: string, file: File) {
  const fileAction: DMWindowAction = { type: 'sendFile', user, file };

  // Tauri event payloads cannot reliably carry File objects, so forward file sends through
  // BroadcastChannel where structured cloning supports File payloads.
  if (isTauriRuntime() && webChannel) {
    webChannel.postMessage({ type: 'action', payload: fileAction });
    return;
  }

  await sendAction(fileAction);
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

  if (message?.type === DM_WINDOW_MEDIA_EVENT) {
    debugLog('window message media-state received');
    applyMediaState(message.payload as DMWindowMediaState[]);
    return;
  }
}

async function handleClose() {
  const user = activeDMUser.value;
  if (user) {
    await sendAction({ type: 'closeDm', user });
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

  await sendAction({ type: 'requestAudio', user });
}

async function handleTitlebarRequestVideo() {
  const user = activeDMUser.value;
  if (!user) {
    return;
  }

  await sendAction({ type: 'requestVideo', user });
}

async function handleTitlebarEndCall() {
  const user = activeDMUser.value;
  if (!user) {
    return;
  }

  await sendAction({ type: 'endCall', user });
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
        return;
      }

      if (message?.type === DM_WINDOW_MEDIA_EVENT) {
        applyMediaState(message.payload as DMWindowMediaState[]);
        return;
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
    return;
  }

  if (window.opener && window.opener !== window) {
    if (!webMessageListenerBound) {
      window.addEventListener('message', handleWebMessage);
      webMessageListenerBound = true;
    }
  }

  await sendAction({ type: 'windowReady', user: targetUser.value ?? undefined });
});

onBeforeUnmount(() => {
  void sendAction({ type: 'windowClosed', user: targetUser.value ?? undefined });
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
