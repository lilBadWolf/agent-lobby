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
const DM_WINDOW_MEDIA_RELAY_OFFER_EVENT = 'media-relay-offer';
const DM_WINDOW_MEDIA_RELAY_ANSWER_EVENT = 'media-relay-answer';
const DM_WINDOW_MEDIA_RELAY_ICE_EVENT = 'media-relay-ice';
const DM_WINDOW_MEDIA_RELAY_CLOSE_EVENT = 'media-relay-close';
const DM_WINDOW_LOG_PREFIX = '[DMWindowApp]';

type RelayStreamKind = 'local' | 'remote';

interface DMWindowMediaState {
  user: string;
  localMediaStream: MediaStream | null;
  remoteMediaStream: MediaStream | null;
}

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

interface RelayReceiverEntry {
  user: string;
  kind: RelayStreamKind;
  pc: RTCPeerConnection;
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

let webChannel: BroadcastChannel | null = null;
const relayReceivers = new Map<string, RelayReceiverEntry>();
let cleanupTauriListener: (() => void) | null = null;
let webMessageListenerBound = false;
const hasTauriWindow = isTauriRuntime();

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

function relayKey(user: string, kind: RelayStreamKind): string {
  return `${user}::${kind}`;
}

function updateChatStream(user: string, kind: RelayStreamKind, stream: MediaStream | null) {
  const current = activeChats.value.get(user);
  if (!current) {
    return;
  }

  const nextChats = new Map(activeChats.value);
  const nextChat: DMChat = {
    ...current,
    localMediaStream: kind === 'local' ? stream : current.localMediaStream,
    remoteMediaStream: kind === 'remote' ? stream : current.remoteMediaStream,
  };
  nextChats.set(user, nextChat);
  activeChats.value = nextChats;

  debugLog(`chat stream updated ${user}/${kind}`, {
    stream: describeStream(stream),
  });
}

function teardownRelayReceiver(user: string, kind: RelayStreamKind, clearStream = true) {
  const key = relayKey(user, kind);
  const existing = relayReceivers.get(key);
  if (!existing) {
    return;
  }

  try {
    existing.pc.ontrack = null;
    existing.pc.onicecandidate = null;
    existing.pc.onconnectionstatechange = null;
    existing.pc.close();
  } catch (error) {
    debugLog(`relay receiver close failed for ${user}/${kind}`, error);
  }

  relayReceivers.delete(key);

  if (clearStream) {
    updateChatStream(user, kind, null);
  }
}

function teardownAllRelayReceivers(clearStreams = false) {
  const keys = Array.from(relayReceivers.keys());
  for (const key of keys) {
    const existing = relayReceivers.get(key);
    if (!existing) {
      continue;
    }

    teardownRelayReceiver(existing.user, existing.kind, clearStreams);
  }
}

async function handleMediaRelayOffer(message: MediaRelayOfferMessage) {
  if (!webChannel) {
    return;
  }

  teardownRelayReceiver(message.user, message.kind, true);

  const pc = new RTCPeerConnection({ iceServers: [] });
  relayReceivers.set(relayKey(message.user, message.kind), {
    user: message.user,
    kind: message.kind,
    pc,
  });

  pc.onconnectionstatechange = () => {
    debugLog(`relay receiver state ${message.user}/${message.kind}`, {
      state: pc.connectionState,
      ice: pc.iceConnectionState,
    });
  };

  pc.onicecandidate = (event) => {
    if (!event.candidate || !webChannel) {
      return;
    }

    const iceMessage: MediaRelayIceMessage = {
      type: DM_WINDOW_MEDIA_RELAY_ICE_EVENT,
      user: message.user,
      kind: message.kind,
      candidate: event.candidate.toJSON(),
    };
    webChannel.postMessage(iceMessage);
  };

  pc.ontrack = (event) => {
    const stream = event.streams[0] ?? new MediaStream([event.track]);
    debugLog(`relay track received ${message.user}/${message.kind}`, {
      trackKind: event.track.kind,
      stream: describeStream(stream),
    });
    updateChatStream(message.user, message.kind, stream);
  };

  await pc.setRemoteDescription(new RTCSessionDescription(message.sdp));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  const answerMessage: MediaRelayAnswerMessage = {
    type: DM_WINDOW_MEDIA_RELAY_ANSWER_EVENT,
    user: message.user,
    kind: message.kind,
    sdp: answer,
  };
  webChannel.postMessage(answerMessage);
  debugLog(`relay answer posted for ${message.user}/${message.kind}`);
}

async function handleMediaRelayIce(message: MediaRelayIceMessage) {
  const entry = relayReceivers.get(relayKey(message.user, message.kind));
  if (!entry) {
    return;
  }

  try {
    await entry.pc.addIceCandidate(new RTCIceCandidate(message.candidate));
  } catch (error) {
    debugLog(`relay receiver ICE add failed for ${message.user}/${message.kind}`, error);
  }
}

function handleMediaRelayClose(message: MediaRelayCloseMessage) {
  debugLog(`relay close received for ${message.user}/${message.kind}`);
  teardownRelayReceiver(message.user, message.kind, true);
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

const pageTitle = computed(() => {
  const activeUsers = Array.from(activeChats.value.keys());
  const currentUser = username.value || 'AGENT';
  const titleUser = inVideo.value ? `${currentUser} in video` : currentUser;

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

  for (const mediaState of payload) {
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

  const previousChats = activeChats.value;

  activeChats.value = new Map(payload.activeChats.map((chat) => {
    const nextChat = toChat(chat);
    const existingChat = previousChats.get(chat.user);

    if (existingChat) {
      nextChat.localMediaStream = existingChat.localMediaStream;
      nextChat.remoteMediaStream = existingChat.remoteMediaStream;
    }

    return [chat.user, nextChat];
  }));
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

  if (message?.type === DM_WINDOW_MEDIA_RELAY_OFFER_EVENT) {
    debugLog('window message relay offer received');
    void handleMediaRelayOffer(message as MediaRelayOfferMessage);
    return;
  }

  if (message?.type === DM_WINDOW_MEDIA_RELAY_ICE_EVENT) {
    void handleMediaRelayIce(message as MediaRelayIceMessage);
    return;
  }

  if (message?.type === DM_WINDOW_MEDIA_RELAY_CLOSE_EVENT) {
    handleMediaRelayClose(message as MediaRelayCloseMessage);
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
  debugLog('mounted', {
    hasTauriWindow,
    tauriRuntime: isTauriRuntime(),
    location: window.location.href,
  });

  if (typeof BroadcastChannel !== 'undefined') {
    webChannel = new BroadcastChannel(DM_WEB_CHANNEL);
    debugLog('BroadcastChannel initialized', { channel: DM_WEB_CHANNEL });
    webChannel.onmessage = (event: MessageEvent) => {
      const message = event.data as { type?: string; payload?: unknown };
      if (message?.type === 'state') {
        debugLog('BroadcastChannel state received');
        applyState(message.payload as DMWindowStatePayload);
        return;
      }

      if (message?.type === DM_WINDOW_MEDIA_EVENT) {
        debugLog('BroadcastChannel media-state received');
        applyMediaState(message.payload as DMWindowMediaState[]);
        return;
      }

      if (message?.type === DM_WINDOW_MEDIA_RELAY_OFFER_EVENT) {
        debugLog('BroadcastChannel relay offer received');
        void handleMediaRelayOffer(message as MediaRelayOfferMessage);
        return;
      }

      if (message?.type === DM_WINDOW_MEDIA_RELAY_ICE_EVENT) {
        void handleMediaRelayIce(message as MediaRelayIceMessage);
        return;
      }

      if (message?.type === DM_WINDOW_MEDIA_RELAY_CLOSE_EVENT) {
        handleMediaRelayClose(message as MediaRelayCloseMessage);
      }
    };
  } else {
    debugLog('BroadcastChannel unavailable in this environment');
  }

  if (hasTauriWindow) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const appWindow = getCurrentWindow();
    isMaximized.value = await appWindow.isMaximized();
  }

  if (isTauriRuntime()) {
    const { listen } = await import('@tauri-apps/api/event');
    cleanupTauriListener = await listen<DMWindowStatePayload>(DM_WINDOW_STATE_EVENT, (event) => {
      if (debugVerboseEnabled()) {
        debugLog('Tauri event dm-window-state received');
      }
      applyState(event.payload);
    });
    debugLog('Tauri listener registered', { event: DM_WINDOW_STATE_EVENT });
    await sendAction({ type: 'windowReady' });
    debugLog('windowReady sent');
    return;
  }

  if (window.opener && window.opener !== window) {
    if (!webMessageListenerBound) {
      window.addEventListener('message', handleWebMessage);
      webMessageListenerBound = true;
    }
  }

  await sendAction({ type: 'windowReady' });
  debugLog('windowReady sent');
});

onBeforeUnmount(() => {
  debugLog('before unmount');
  teardownAllRelayReceivers(false);
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
  background: var(--color-dmwindow-bg);
  color: var(--color-accent);
}

.custom-titlebar {
  width: 100%;
  height: 28px;
  padding: 0 92px 0 18px;
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
}
</style>
