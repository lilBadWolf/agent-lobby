<template>
  <div class="dm-window-root">
    <div data-tauri-drag-region class="custom-titlebar">
      {{ pageTitle }}
      <button v-if="hasTauriWindow" class="minimize-btn" @click="minimize">—</button>
      <button v-if="hasTauriWindow" class="maximize-btn" @click="toggleMaximize">
        <span class="window-icon" :class="{ maximized: isMaximized }" aria-hidden="true"></span>
      </button>
      <button class="titlebar-close-btn" @click="handleClose">✕</button>
    </div>

    <DMChatModal
      :show-modal="true"
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

let webChannel: BroadcastChannel | null = null;
let cleanupTauriListener: (() => void) | null = null;
let webMessageListenerBound = false;
const hasTauriWindow = isTauriRuntime();

const pageTitle = computed(() => {
  const activeUsers = Array.from(activeChats.value.keys());
  const currentUser = username.value || 'AGENT';

  if (activeUsers.length > 0) {
    if (activeUsers.length === 1) {
      return `${currentUser} < - > ${activeUsers[0]}`;
    }

    return `${currentUser} < - > ${activeUsers.join(', ')}`;
  }

  return `${currentUser} // DM`;
});

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && typeof (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ === 'object';
}

function toFileTransferState(transfer: SerializedDMChat['fileTransfers'][number]): FileTransferState {
  return {
    ...transfer,
    chunks: new Map(),
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
    videoCallActive: false,
  };
}

function applyState(payload: DMWindowStatePayload) {
  activeChats.value = new Map(payload.activeChats.map((chat) => [chat.user, toChat(chat)]));
  pendingRequests.value = payload.pendingRequests;
  pendingAudioCalls.value = payload.pendingAudioCalls;
  pendingVideoCalls.value = payload.pendingVideoCalls;
  outgoingRequests.value = payload.outgoingRequests;
  notices.value = payload.notices;
  username.value = payload.username;
  dmChatEffect.value = payload.dmChatEffect;
  focusedDMUser.value = payload.focusedDMUser;
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

function handleWebMessage(event: MessageEvent) {
  if (event.origin !== window.location.origin) {
    return;
  }

  const message = event.data as { type?: string; payload?: unknown };
  if (message?.type === 'state') {
    applyState(message.payload as DMWindowStatePayload);
  }
}

async function handleClose() {
  await sendAction({ type: 'windowClosed' });

  if (isTauriRuntime()) {
    const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    await getCurrentWebviewWindow().close();
    return;
  }

  window.close();
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
  if (hasTauriWindow) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    isMaximized.value = await getCurrentWindow().isMaximized();
  }

  if (isTauriRuntime()) {
    const { listen } = await import('@tauri-apps/api/event');
    cleanupTauriListener = await listen<DMWindowStatePayload>(DM_WINDOW_STATE_EVENT, (event) => {
      applyState(event.payload);
    });
    await sendAction({ type: 'windowReady' });
    return;
  }

  if (window.opener && window.opener !== window) {
    if (!webMessageListenerBound) {
      window.addEventListener('message', handleWebMessage);
      webMessageListenerBound = true;
    }
  } else if (typeof BroadcastChannel !== 'undefined') {
    webChannel = new BroadcastChannel(DM_WEB_CHANNEL);
    webChannel.onmessage = (event: MessageEvent) => {
      const message = event.data as { type?: string; payload?: unknown };
      if (message?.type === 'state') {
        applyState(message.payload as DMWindowStatePayload);
      }
    };
  }

  await sendAction({ type: 'windowReady' });
});

onBeforeUnmount(() => {
  void sendAction({ type: 'windowClosed' });
  if (webMessageListenerBound) {
    window.removeEventListener('message', handleWebMessage);
    webMessageListenerBound = false;
  }
  cleanupTauriListener?.();
  cleanupTauriListener = null;
  webChannel?.close();
  webChannel = null;
});
</script>

<style scoped>
.dm-window-root {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.custom-titlebar {
  width: 100%;
  height: 16px;
  background: #222;
  display: flex;
  justify-content: center;
  align-items: center;
  user-select: none;
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

.dm-window-root :deep(#dm-modal) {
  position: fixed;
  top: 16px;
  left: 0;
  right: 0;
  bottom: 0;
}
</style>
