<template>
  <div
    v-if="showModal"
    id="dm-modal"
    :class="`presentation-${presentationMode}`"
    @click="(e) => e.target === $el && handleClose()"
  >
    <audio ref="audioElement" autoplay playsinline></audio>
    <div class="modal-box" :class="`presentation-${presentationMode}`">
      <!-- Header -->
      <div v-if="showHeaderBar" class="modal-header">
        <h3 v-if="showHeaderTitle" style="margin: 0">DIRECT MESSAGE</h3>
        <button v-if="showHeaderClose" class="close-btn" @click="handleClose">✕</button>
      </div>

      <!-- Content Area -->
      <div class="modal-content">
        <div v-if="currentTab" class="chat-section" :class="{ 'has-video-call': !!activeVideoCallUser }">
          <div v-if="chatToastNotices.length > 0 || outgoingRequestsForCurrentTab.length > 0" class="notice-stack notice-stack-inline">
            <div
              v-for="notice in chatToastNotices"
              :key="`notice-${notice.id}`"
              class="notice-item"
              :class="[notice.type || 'info', { 'stack-like': notice.type === 'audio-call' || notice.type === 'video-call' || notice.type === 'call-status' }]"
            >
              <span>{{ notice.message }}</span>
              <div v-if="notice.type === 'audio-call' || notice.type === 'video-call' || notice.type === 'file-offer'" class="notice-buttons" :class="{ 'stack-like': notice.type === 'audio-call' || notice.type === 'video-call' }">
                <button class="btn-accept" :class="{ 'stack-like': notice.type === 'audio-call' || notice.type === 'video-call' }" @click="acceptNotice(notice)">{{ notice.type === 'audio-call' || notice.type === 'video-call' ? '✅' : 'ACCEPT' }}</button>
                <button class="btn-reject" :class="{ 'stack-like': notice.type === 'audio-call' || notice.type === 'video-call' }" @click="rejectNotice(notice)">{{ notice.type === 'audio-call' || notice.type === 'video-call' ? '❌' : 'REJECT' }}</button>
              </div>
            </div>

            <div
              v-for="user in outgoingRequestsForCurrentTab"
              :key="`outgoing-${user}`"
              class="notice-item info outgoing-item"
            >
              <span>Waiting for {{ user }} to accept direct line...</span>
              <button class="btn-cancel-request" @click="emit('cancelRequest', user)">CANCEL</button>
            </div>
          </div>

          <div v-if="activeVideoCallUser" class="video-call-pane">
            <VideoWindow
              :key="activeVideoCallUser"
              :peer-name="activeVideoCallUser"
              :local-stream="props.activeChats.get(activeVideoCallUser)?.localMediaStream"
              :remote-stream="props.activeChats.get(activeVideoCallUser)?.remoteMediaStream"
              :dm-messages="props.activeChats.get(activeVideoCallUser)?.messages || []"
              :can-send-messages="props.activeChats.get(activeVideoCallUser)?.isConnected ?? false"
              :username="props.username"
              :peer-has-video="props.activeChats.get(activeVideoCallUser)?.videoEnabled ?? false"
              @close="handleVideoWindowClose"
              @toggle-audio="handleVideoWindowToggleAudio"
              @toggle-video="handleVideoWindowToggleVideo"
              @send-message="handleVideoWindowSendMessage"
            />
          </div>

          <template v-else>
            <!-- Messages: Displayed via animations only (ephemeral) -->
            <div
              ref="messagesContainer"
              class="messages"
              @dragover="handleDragOver"
              @dragleave="handleDragLeave"
              @drop="handleDrop"
              :class="{ 'drag-over': dragOverZone }"
            >
              <div v-if="dragOverZone" class="drop-overlay">
                Drop files to send
              </div>

              <div v-if="isWaitingForConnection" class="connection-wait-overlay">
                <div class="connection-wait-box">
                  <span class="connection-wait-text">Connecting<span class="connection-wait-dots"></span></span>
                </div>
              </div>
            </div>

            <!-- File Downloads -->
            <div v-if="hasVisibleTransfers()" class="files-section" :class="{ collapsed: isFilesPanelCollapsed() }">
              <div class="files-header" @click="toggleFilesPanel">
                <span>📁 FILES ({{ visibleTransferCount() }})</span>
                <span class="files-collapse-icon">{{ isFilesPanelCollapsed() ? '▸' : '▾' }}</span>
              </div>
              <div v-if="!isFilesPanelCollapsed()" class="files-list">
                <div v-for="[fileId, transfer] of getCurrentChat()?.fileTransfers || []" :key="fileId" class="file-item">
                  <div class="file-info">
                    <div class="file-name">{{ transfer.filename }}</div>
                    <div class="file-size">{{ formatBytes(transfer.totalSize) }}</div>
                    <div v-if="transfer.status === 'awaiting-accept'" class="file-status pending">AWAITING ACCEPTANCE</div>
                    <div v-else-if="transfer.status === 'pending'" class="file-status pending">PENDING YOUR DECISION</div>
                    <div v-else-if="transfer.status === 'in-progress' && transfer.direction === 'incoming'" class="file-progress">
                      <div class="progress-bar">
                        <div class="progress-fill" :style="{ width: `${transfer.progress}%` }"></div>
                      </div>
                      <span class="progress-text">{{ Math.round(transfer.progress) }}%</span>
                    </div>
                    <div v-else-if="transfer.status === 'in-progress' && transfer.direction === 'outgoing'" class="file-status awaiting-completion">AWAITING COMPLETION</div>
                    <div v-else-if="transfer.status === 'completed'" class="file-status completed">✓ COMPLETE</div>
                    <div v-else-if="transfer.status === 'rejected'" class="file-status rejected">✗ REJECTED</div>
                    <div v-else-if="transfer.status === 'failed'" class="file-status failed">✗ FAILED</div>
                  </div>
                  <div class="file-actions">
                    <button
                      v-if="transfer.status === 'pending' && transfer.direction === 'incoming'"
                      class="file-action-btn accept"
                      @click="acceptFileTransfer(fileId)"
                    >
                      ACCEPT
                    </button>
                    <button
                      v-if="transfer.status === 'pending' && transfer.direction === 'incoming'"
                      class="file-action-btn reject"
                      @click="rejectFileTransfer(fileId)"
                    >
                      REJECT
                    </button>
                    <button
                      v-if="transfer.status === 'completed' && transfer.direction === 'incoming' && !isFileAlreadySaved(transfer)"
                      class="file-action-btn"
                      :disabled="isSavingFile(fileId)"
                      @click="downloadFile(transfer)"
                    >
                      {{ getDownloadActionLabel(fileId) }}
                    </button>
                    <button
                      v-if="transfer.status === 'completed' && transfer.direction === 'incoming' && canRevealSavedFile(transfer)"
                      class="file-action-btn"
                      @click="showSavedFileInFolder(transfer)"
                    >
                      SHOW IN FOLDER
                    </button>
                    <button
                      v-if="(transfer.status === 'completed' && (isFileAlreadySaved(transfer) || transfer.direction === 'outgoing')) || transfer.status === 'rejected' || transfer.status === 'failed'"
                      class="file-action-btn reject"
                      @click="removeFileTransfer(fileId)"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Input -->
            <div class="input-bar">
              <div v-if="getCurrentChat()?.pendingDisplayMessages.length" class="waiting-indicator">
                ⏳ {{ getCurrentChat()?.pendingDisplayMessages.length }} waiting to display
              </div>
              <input
                v-model="messageInput"
                type="text"
                placeholder="Type message..."
                :disabled="!getCurrentChat()?.isConnected"
                @keydown.enter.prevent="handleMessageInputEnter"
              />
              <div class="dm-effect-picker">
                <select
                  id="dm-effect-select"
                  :value="props.dmChatEffect"
                  @change="handleDmEffectChange"
                  :disabled="!getCurrentChat()?.isConnected"
                >
                  <option v-for="option in dmEffectOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
              </div>
              <button
                class="send-btn"
                :disabled="!getCurrentChat()?.isConnected"
                @click="sendMessage"
              >
                SEND
              </button>
            </div>
          </template>
        </div>

        <div v-else class="empty-state">No active direct messages</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import type { DMChat, DMRequest, AudioCallRequest, VideoCallRequest, DMNotice, FileTransferState } from '../types/directMessage';
import { useMessageAnimations } from '../composables/useMessageAnimations';
import { dmEffectOptions } from '../composables/messageEffectHelpers';
import VideoWindow from './VideoWindow.vue';

type TauriFsModule = typeof import('@tauri-apps/plugin-fs');
type TauriPathModule = typeof import('@tauri-apps/api/path');
type TauriOpenerModule = typeof import('@tauri-apps/plugin-opener');

const props = defineProps<{
  showModal: boolean;
  activeChats: Map<string, DMChat>;
  pendingRequests: DMRequest[];
  pendingAudioCalls: AudioCallRequest[];
  pendingVideoCalls: VideoCallRequest[];
  outgoingRequests: string[];
  notices: DMNotice[];
  username: string;
  dmChatEffect: string;
  focusedDMUser?: string | null;
  showHeaderClose?: boolean;
  showHeaderTitle?: boolean;
  presentation?: 'modal' | 'window';
}>();

const showHeaderClose = computed(() => props.showHeaderClose ?? true);
const showHeaderTitle = computed(() => props.showHeaderTitle ?? true);
const showHeaderBar = computed(() => showHeaderClose.value || showHeaderTitle.value);
const presentationMode = computed(() => props.presentation ?? 'modal');
const isWaitingForConnection = computed(() => {
  const chat = getCurrentChat();
  return Boolean(currentTab.value && chat && !chat.isConnected);
});

const emit = defineEmits<{
  close: [];
  acceptDm: [user: string];
  rejectDm: [user: string];
  acceptAudio: [user: string];
  rejectAudio: [user: string];
  acceptVideo: [user: string];
  rejectVideo: [user: string];
  cancelRequest: [user: string];
  sendMessage: [user: string, message: string, effect: string];
  closeDm: [user: string];
  'update:dmChatEffect': [effect: string];
  cancelPendingMessages: [user: string];
  typing: [user: string];
  stopTyping: [user: string];
  requestAudio: [user: string];
  toggleAudio: [user: string, enabled: boolean];
  requestVideo: [user: string];
  toggleVideo: [user: string, enabled: boolean];
  sendFile: [user: string, file: File];
  acceptFile: [user: string, fileId: string];
  rejectFile: [user: string, fileId: string];
  fileSaved: [user: string, fileId: string];
  removeFile: [user: string, fileId: string];
}>();


const { playAnimation } = useMessageAnimations();
const currentTab = ref<string>('');
const messageInput = ref('');
const messagesContainer = ref<HTMLElement>();
const audioElement = ref<HTMLAudioElement>();
const isMessageAnimationActive = ref(false);
const playedMessageIds = new Set<string>();

function getStableMessageId(message: { user: string; message: string; effect?: string; duration?: number; messageId?: string }) {
  if (message.messageId) {
    return message.messageId;
  }

  return `${message.user}_${message.message}_${message.effect ?? 'none'}_${message.duration ?? 0}`;
}

function ensureMessageId(message: { user: string; message: string; effect?: string; duration?: number; messageId?: string }) {
  if (message.messageId) {
    return message.messageId;
  }

  const generatedId = `${message.user}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  message.messageId = generatedId;
  return generatedId;
}

function handleDmEffectChange(event: Event) {
  const nextEffect = (event.target as HTMLSelectElement).value
  emit('update:dmChatEffect', nextEffect)
}

const typingTimeouts = new Map<string, ReturnType<typeof setTimeout>>(); // Track debounce timeouts per user
const isTypingMap = new Map<string, boolean>(); // Track if we've sent typing signal for each user
const dragOverZone = ref(false); // Track drag-over state for file drop zone
const activeVideoCallUser = ref<string | null>(null); // Track active video call user
const filesCollapsed = ref<Record<string, boolean>>({}); // Collapsed state per tab
const savingFileIds = ref<Set<string>>(new Set()); // Track in-flight save operations
const savedFileIds = ref<Set<string>>(new Set()); // Track successful local saves before parent sync
const savedFilePaths = ref<Map<string, string>>(new Map()); // Track saved absolute paths by transfer id
let tauriApisPromise: Promise<{
  fs: TauriFsModule;
  path: TauriPathModule;
  opener: TauriOpenerModule;
} | null> | null = null;

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function getTauriApis() {
  if (!isTauriRuntime()) {
    return null;
  }

  if (!tauriApisPromise) {
    tauriApisPromise = Promise.all([
      import('@tauri-apps/plugin-fs'),
      import('@tauri-apps/api/path'),
      import('@tauri-apps/plugin-opener')
    ])
      .then(([fs, path, opener]) => ({ fs, path, opener }))
      .catch((error) => {
        console.error('Failed to load Tauri file APIs:', error);
        tauriApisPromise = null;
        return null;
      });
  }

  return tauriApisPromise;
}

function toggleFilesPanel() {
  filesCollapsed.value[currentTab.value] = !filesCollapsed.value[currentTab.value];
}

function isFilesPanelCollapsed(): boolean {
  return filesCollapsed.value[currentTab.value] ?? false;
}

function expandFilesPanelForTab(tab: string) {
  filesCollapsed.value[tab] = false;
}

function hasVisibleTransfers(): boolean {
  const chat = getCurrentChat();
  if (!chat) return false;
  for (const t of chat.fileTransfers.values()) {
    if (t.status !== 'rejected' && t.status !== 'failed') return true;
  }
  return false;
}

function visibleTransferCount(): number {
  const chat = getCurrentChat();
  if (!chat) return 0;
  let count = 0;
  for (const t of chat.fileTransfers.values()) {
    if (t.status !== 'rejected' && t.status !== 'failed') {
      count += 1;
    }
  }
  return count;
}

function removeFileTransfer(fileId: string) {
  if (!currentTab.value) return;

  savedFileIds.value.delete(fileId);
  savingFileIds.value.delete(fileId);
  savedFilePaths.value.delete(fileId);
  emit('removeFile', currentTab.value, fileId);
}

const allTabs = computed(() => Array.from(props.activeChats.keys()));

function sameDMUser(left: string | null | undefined, right: string | null | undefined): boolean {
  const normalizedLeft = left?.trim().toLowerCase();
  const normalizedRight = right?.trim().toLowerCase();
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  return normalizedLeft === normalizedRight;
}

function resolveTabUser(user: string | null | undefined): string | null {
  if (!user) {
    return null;
  }

  const exact = allTabs.value.find((tab) => tab === user);
  if (exact) {
    return exact;
  }

  const caseInsensitive = allTabs.value.find((tab) => sameDMUser(tab, user));
  return caseInsensitive ?? user;
}

const chatToastNotices = computed(() => {
  if (!currentTab.value) return [];

  return props.notices.filter((notice) => {
    if (notice.type === 'audio-call' || notice.type === 'video-call' || notice.type === 'call-status' || notice.type === 'file-offer') {
      return sameDMUser(notice.from, currentTab.value);
    }

    if (notice.type === 'info') {
      return !notice.from || sameDMUser(notice.from, currentTab.value);
    }

    return false;
  });
});

const outgoingRequestsForCurrentTab = computed(() =>
  currentTab.value ? props.outgoingRequests.filter((user) => sameDMUser(user, currentTab.value)) : []
);

function acceptNotice(notice: DMNotice) {
  if (!notice.from) return;

  if (notice.type === 'audio-call') {
    emit('acceptAudio', notice.from);
    return;
  }

  if (notice.type === 'video-call') {
    emit('acceptVideo', notice.from);
    return;
  }

  if (notice.type === 'file-offer' && notice.fileId) {
    emit('acceptFile', notice.from, notice.fileId);
  }
}

function rejectNotice(notice: DMNotice) {
  if (!notice.from) return;

  if (notice.type === 'audio-call') {
    emit('rejectAudio', notice.from);
    return;
  }

  if (notice.type === 'video-call') {
    emit('rejectVideo', notice.from);
    return;
  }

  if (notice.type === 'file-offer' && notice.fileId) {
    emit('rejectFile', notice.from, notice.fileId);
  }
}

// Default to first available tab
watch(allTabs, (newTabs) => {
  if (!newTabs.includes(currentTab.value) && newTabs.length > 0) {
    currentTab.value = newTabs[0];
    return;
  }

  if (!currentTab.value && props.focusedDMUser) {
    currentTab.value = resolveTabUser(props.focusedDMUser) ?? '';
  }
});

// Switch to focused user when requested
watch(() => props.focusedDMUser, (focusedUser) => {
  if (focusedUser) {
    currentTab.value = resolveTabUser(focusedUser) ?? '';
  }
});

// Auto-expand files panel when a new incoming file request appears on the active tab.
watch(
  () => {
    const chat = getCurrentChat();
    if (!chat) return 0;
    let pendingIncoming = 0;
    for (const transfer of chat.fileTransfers.values()) {
      if (transfer.direction === 'incoming' && transfer.status === 'pending') {
        pendingIncoming += 1;
      }
    }
    return pendingIncoming;
  },
  (pendingIncoming, previousPendingIncoming) => {
    if (currentTab.value && pendingIncoming > (previousPendingIncoming ?? 0)) {
      expandFilesPanelForTab(currentTab.value);
    }
  }
);

// Watch for input changes and send typing indicators (debounced)
watch(messageInput, (newVal) => {
  const user = currentTab.value;
  if (!user || !props.activeChats.has(user)) return;

  // Clear existing timeout
  if (typingTimeouts.has(user)) {
    clearTimeout(typingTimeouts.get(user));
  }

  // If there's text being typed
  if (newVal.trim().length > 0) {
    // Send typing indicator if we haven't already
    if (!isTypingMap.get(user)) {
      emit('typing', user);
      isTypingMap.set(user, true);
    }

    // Set timeout to send stop_typing after 1 second of inactivity
    const timeout = setTimeout(() => {
      emit('stopTyping', user);
      isTypingMap.set(user, false);
      typingTimeouts.delete(user);
    }, 1000);

    typingTimeouts.set(user, timeout);
  } else {
    // No text, send stop_typing immediately
    if (isTypingMap.get(user)) {
      emit('stopTyping', user);
      isTypingMap.set(user, false);
    }
  }
});

// Sync audio element with active chat's remote media stream
watch([currentTab, () => props.activeChats], () => {
  if (!audioElement.value) return;

  // VideoWindow owns remote audio playback while a video call overlay is active.
  if (activeVideoCallUser.value) {
    audioElement.value.pause();
    audioElement.value.srcObject = null;
    return;
  }

  const chat = props.activeChats.get(currentTab.value);
  if (chat && chat.remoteMediaStream) {
    audioElement.value.muted = false;
    audioElement.value.defaultMuted = false;
    audioElement.value.volume = 1;
    audioElement.value.srcObject = chat.remoteMediaStream;
  } else {
    audioElement.value.srcObject = null;
  }
});

// Watch for video call state (when remote media stream has video tracks)
function hasVideoCallActivity(chat?: DMChat): boolean {
  if (!chat) return false;

  const hasLocalVideoTrack = chat.localMediaStream?.getVideoTracks().some((track) => track.readyState === 'live') ?? false;
  const hasRemoteVideoTrack = chat.remoteMediaStream?.getVideoTracks().some((track) => track.readyState === 'live') ?? false;

  return chat.videoCallActive || chat.videoEnabled || hasLocalVideoTrack || hasRemoteVideoTrack;
}

watch([currentTab, () => props.activeChats], () => {
  const chat = props.activeChats.get(currentTab.value);
  if (hasVideoCallActivity(chat)) {
    activeVideoCallUser.value = currentTab.value;
    return;
  }

  const fallbackVideoUser = Array.from(props.activeChats.entries()).find(([, candidateChat]) => hasVideoCallActivity(candidateChat))?.[0] ?? null;
  activeVideoCallUser.value = fallbackVideoUser;
});

function handleClose() {
  emit('close');
}

function sendMessage() {
  if (!messageInput.value.trim() || !currentTab.value) return;

  const chat = getCurrentChat();
  if (!chat) {
    console.log('[DMChatModal] sendMessage aborted: no current chat', { currentTab: currentTab.value });
    return;
  }

  console.log('[DMChatModal] sendMessage emit', {
    user: currentTab.value,
    length: messageInput.value.trim().length,
    effect: props.dmChatEffect,
    connected: chat.isConnected,
  });

  emit('sendMessage', currentTab.value, messageInput.value.trim(), props.dmChatEffect);
  messageInput.value = '';
}

function handleMessageInputEnter() {
  sendMessage();
}

function getCurrentChat(): DMChat | undefined {
  return props.activeChats.get(currentTab.value);
}

function handleVideoWindowClose() {
  if (currentTab.value) {
    // Close the entire DM, which will clean up all resources
    emit('closeDm', currentTab.value);
  }
  activeVideoCallUser.value = null;
}

function handleVideoWindowToggleAudio(enabled: boolean) {
  if (activeVideoCallUser.value) {
    emit('toggleAudio', activeVideoCallUser.value, enabled);
  }
}

function handleVideoWindowToggleVideo(enabled: boolean) {
  if (activeVideoCallUser.value) {
    emit('toggleVideo', activeVideoCallUser.value, enabled);
  }
}

function handleVideoWindowSendMessage(message: string) {
  const user = activeVideoCallUser.value;
  const trimmed = message.trim();
  if (!user || !trimmed) return;

  console.log('[DMChatModal] handleVideoWindowSendMessage emit', {
    user,
    length: trimmed.length,
    effect: props.dmChatEffect,
  });

  emit('sendMessage', user, trimmed, props.dmChatEffect);
}

function handleDragOver(e: DragEvent) {
  e.preventDefault();
  dragOverZone.value = true;
}

function handleDragLeave(e: DragEvent) {
  // Only clear when the cursor leaves the messages container entirely
  // (relatedTarget is outside the container or null).
  if (!messagesContainer.value?.contains(e.relatedTarget as Node | null)) {
    dragOverZone.value = false;
  }
}

function handleDrop(e: DragEvent) {
  e.preventDefault();
  dragOverZone.value = false;

  if (!currentTab.value || !e.dataTransfer?.files.length) return;

  const files = e.dataTransfer.files;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    // Validate file size (1GB max)
    if (file.size > 1024 * 1024 * 1024) {
      console.warn(`File ${file.name} exceeds 1GB limit`);
      continue;
    }
    emit('sendFile', currentTab.value, file);
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function acceptFileTransfer(fileId: string) {
  if (!currentTab.value) return;
  emit('acceptFile', currentTab.value, fileId);
}

function rejectFileTransfer(fileId: string) {
  if (!currentTab.value) return;
  emit('rejectFile', currentTab.value, fileId);
}

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim() || 'download.bin';
}

function splitFilenameParts(filename: string): { base: string; ext: string } {
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === filename.length - 1) {
    return { base: filename, ext: '' };
  }
  return {
    base: filename.slice(0, dotIndex),
    ext: filename.slice(dotIndex)
  };
}

async function resolveAvailableFilename(preferredName: string): Promise<string> {
  const tauriApis = await getTauriApis();
  if (!tauriApis) {
    return preferredName;
  }

  const { BaseDirectory, exists } = tauriApis.fs;
  const { base, ext } = splitFilenameParts(preferredName);
  let candidate = preferredName;
  let counter = 1;

  while (await exists(candidate, { baseDir: BaseDirectory.Download })) {
    candidate = `${base} (${counter})${ext}`;
    counter += 1;
  }

  return candidate;
}

function buildTransferBytes(transfer: FileTransferState): Uint8Array {
  const collected: Uint8Array[] = [];
  let totalLength = 0;

  for (let i = 0; i < transfer.totalChunks; i++) {
    const chunk = transfer.chunks.get(i);
    if (chunk) {
      const normalized = Uint8Array.from(chunk);
      collected.push(normalized);
      totalLength += normalized.length;
    }
  }

  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of collected) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

function isSavingFile(fileId: string): boolean {
  return savingFileIds.value.has(fileId);
}

function isFileAlreadySaved(transfer: FileTransferState): boolean {
  return transfer.savedToDisk || savedFileIds.value.has(transfer.id);
}

function canRevealSavedFile(transfer: FileTransferState): boolean {
  return isTauriRuntime() && isFileAlreadySaved(transfer) && savedFilePaths.value.has(transfer.id);
}

function getDownloadActionLabel(fileId: string): string {
  if (isSavingFile(fileId)) {
    return isTauriRuntime() ? 'SAVING...' : 'DOWNLOADING...';
  }

  return isTauriRuntime() ? 'SAVE' : 'DOWNLOAD';
}

async function showSavedFileInFolder(transfer: FileTransferState) {
  const filePath = savedFilePaths.value.get(transfer.id);
  if (!filePath) return;

  try {
    const tauriApis = await getTauriApis();
    if (!tauriApis) return;

    await tauriApis.opener.revealItemInDir(filePath);
  } catch (error) {
    console.error('Failed to reveal file in folder:', error);
  }
}

function triggerBrowserDownload(bytes: Uint8Array, filename: string) {
  const blobBytes = bytes.slice();
  const blob = new Blob([blobBytes.buffer]);
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

async function downloadFile(transfer: FileTransferState) {
  if (!transfer || !transfer.chunks) return;
  if (isFileAlreadySaved(transfer) || isSavingFile(transfer.id)) return;

  savingFileIds.value.add(transfer.id);

  try {
    const bytes = buildTransferBytes(transfer);
    if (bytes.length === 0) {
      throw new Error('No file data available to save');
    }

    const baseName = sanitizeFilename(transfer.filename);
    const tauriApis = await getTauriApis();

    if (tauriApis) {
      const targetPath = await resolveAvailableFilename(baseName);

      await tauriApis.fs.writeFile(targetPath, bytes, {
        baseDir: tauriApis.fs.BaseDirectory.Download
      });

      const downloadsPath = await tauriApis.path.downloadDir();
      const absolutePath = await tauriApis.path.join(downloadsPath, targetPath);
      savedFilePaths.value.set(transfer.id, absolutePath);
    } else {
      triggerBrowserDownload(bytes, baseName);
    }

    savedFileIds.value.add(transfer.id);

    if (currentTab.value) {
      emit('fileSaved', currentTab.value, transfer.id);
    }
  } catch (error) {
    console.error('Failed to save file via Tauri FS:', error);
  } finally {
    savingFileIds.value.delete(transfer.id);
  }
}

async function processPendingMessage(): Promise<void> {
  const chat = getCurrentChat();
  if (!chat || isMessageAnimationActive.value || chat.messages.length === 0) return;

  // Remove any already-played messages from the current queue
  for (let i = chat.messages.length - 1; i >= 0; i--) {
    const msg = chat.messages[i];
    const stableId = msg.messageId ?? getStableMessageId(msg as any);
    if (playedMessageIds.has(stableId)) {
      chat.messages.splice(i, 1);
    }
  }

  if (chat.messages.length === 0) {
    return;
  }

  let nextIndex = -1;
  for (let i = chat.messages.length - 1; i >= 0; i--) {
    const msg = chat.messages[i];
    const stableId = msg.messageId ?? getStableMessageId(msg as any);
    if (!playedMessageIds.has(stableId)) {
      nextIndex = i;
      break;
    }
  }

  if (nextIndex === -1) {
    return;
  }

  const nextMsg = chat.messages[nextIndex];
  const animatedMessageId = ensureMessageId(nextMsg);

  isMessageAnimationActive.value = true;
  const animatedUser = currentTab.value;

  const animContainer = document.createElement('div');
  animContainer.className = 'animation-container';
  animContainer.style.position = 'absolute';
  animContainer.style.top = '0';
  animContainer.style.left = '0';
  animContainer.style.width = '100%';
  animContainer.style.height = '100%';
  animContainer.style.display = 'flex';
  animContainer.style.alignItems = 'center';
  animContainer.style.justifyContent = 'center';
  animContainer.style.padding = '0';
  animContainer.style.boxSizing = 'border-box';

  const textContainer = document.createElement('span');
  textContainer.className = 'animation-text';
  textContainer.style.color = 'var(--color-accent, #39ff14)';
  textContainer.style.fontSize = 'clamp(2rem, 8vw, 8rem)';
  textContainer.style.fontWeight = 'bold';
  textContainer.style.textAlign = 'center';
  textContainer.style.whiteSpace = 'pre-wrap';
  textContainer.style.overflowWrap = 'normal';
  textContainer.style.wordBreak = 'normal';
  textContainer.style.textShadow = 'var(--color-dmchatmodal-effect-text-shadow, 0 0 20px rgba(57, 255, 20, 0.8))';
  textContainer.style.overflow = 'hidden';
  animContainer.appendChild(textContainer);

  if (messagesContainer.value) {
    messagesContainer.value.style.position = 'relative';
    messagesContainer.value.appendChild(animContainer);
  }

  const effect = (nextMsg.effect || 'none') as 'none' | 'typewriter' | 'scan' | 'codex' | 'glitch' | 'flames' | 'rust' | 'bubbles' | 'smoke' | 'inferno';
  try {
    await playAnimation(effect, nextMsg.message, textContainer);
  } catch (e) {
    console.error('Animation error:', e);
    textContainer.textContent = nextMsg.message;
  }

  const animatedChat = props.activeChats.get(animatedUser);
  if (animatedChat) {
    const index = animatedChat.messages.findIndex((msg) => msg.messageId === animatedMessageId);
    if (index !== -1) {
      animatedChat.messages.splice(index, 1);
    }

    if (nextMsg.user === props.username) {
      animatedChat.pendingDisplayMessages = animatedChat.pendingDisplayMessages.filter(
        (msg) => msg.id !== animatedMessageId
      );
    }

    if (nextMsg.user !== props.username && animatedChat.dataChannel && animatedChat.dataChannel.readyState === 'open') {
      try {
        animatedChat.dataChannel.send(JSON.stringify({
          u: props.username,
          ack: true,
          msgId: animatedMessageId
        }));
      } catch (e) {
        console.error('Failed to send ACK:', e);
      }
    }
  }

  playedMessageIds.add(animatedMessageId);

  if (animContainer.parentNode) {
    animContainer.parentNode.removeChild(animContainer);
  }

  isMessageAnimationActive.value = false;

  if (currentTab.value === animatedUser) {
    await nextTick();
    await processPendingMessage();
  }
}

watch(
  [() => currentTab.value, () => getCurrentChat()?.messages.length],
  async ([newTab, newLength]) => {
    if (!newTab || !newLength) return;
    await processPendingMessage();
  }
);
</script>

<style scoped>
#dm-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: var(--color-chat-surface-strong);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 500;
}

#dm-modal.presentation-window {
  position: relative;
  inset: auto;
  width: 100%;
  height: 100%;
  justify-content: stretch;
  align-items: stretch;
  background: var(--color-dmchatmodal-window-bg);
}

.modal-box {
  background: var(--color-chat-bg);
  border: 2px solid var(--color-accent);
  width: 100%;
  height: calc(100% - 24px);
  min-height: 0;
  display: flex;
  flex-direction: column;
  box-shadow: var(--color-dmchatmodal-modal-shadow);
  position: relative;
}

.modal-box.presentation-window {
  width: 100%;
  height: calc(100% - 34px);
  border: none;
  box-shadow: var(--color-dmchatmodal-modal-window-shadow);
  background: var(--color-dmchatmodal-modal-window-bg);
}

:deep(.video-window) {
  flex: 1;
  min-height: 0;
}

.animation-text {
  display: flex;
  align-self: stretch;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  border-bottom: 1px solid var(--color-accent);
  color: var(--color-accent);
  flex-shrink: 0;
}

.modal-header h3 {
  font-size: 16px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.notice-stack {
  padding: 10px 20px 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.notice-stack-inline {
  position: absolute;
  top: 10px;
  right: 20px;
  z-index: 20;
  width: min(440px, calc(100% - 40px));
  align-items: flex-end;
}

.notice-item {
  border: 1px solid var(--color-dmchatmodal-notice-danger-border);
  background: var(--color-dmchatmodal-notice-danger-bg);
  color: var(--color-dmchatmodal-notice-danger-color);
  padding: 8px 10px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.notice-item.stack-like {
  border: none;
  border-radius: 10px;
  background: var(--color-dm-request-card-bg);
  box-shadow: var(--color-dm-request-call-shadow);
  padding: 8px 10px;
  max-width: min(420px, calc(100vw - 40px));
  width: max-content;
  min-width: 280px;
  margin-left: auto;
}

.notice-item.audio-call,
.notice-item.video-call {
  border-color: var(--color-dmchatmodal-notice-call-border);
  background: var(--color-dmchatmodal-notice-call-bg);
  color: var(--color-dmchatmodal-notice-call-color);
}

.notice-item.call-status {
  border-color: var(--color-dmchatmodal-notice-call-border);
  background: var(--color-dmchatmodal-notice-call-bg);
  color: var(--color-dmchatmodal-notice-call-color);
}

.notice-item.file-offer {
  border-color: var(--color-dmchatmodal-notice-file-offer-border);
  background: var(--color-dmchatmodal-notice-file-offer-bg);
  color: var(--color-dmchatmodal-notice-file-offer-color);
}

.notice-item.info {
  border-color: var(--color-dmchatmodal-notice-info-border);
  background: var(--color-dmchatmodal-notice-info-bg);
  color: var(--color-dmchatmodal-notice-info-color);
}

.notice-buttons {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.notice-buttons.stack-like {
  gap: 6px;
}

.notice-item.audio-call .btn-accept,
.notice-item.video-call .btn-accept {
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.notice-item.stack-like .btn-accept.stack-like,
.notice-item.stack-like .btn-reject.stack-like {
  border: none;
  background: transparent;
  width: 24px;
  height: 22px;
  min-width: 24px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}

.notice-item.stack-like .btn-accept.stack-like:hover {
  background: var(--color-dm-request-accept-hover);
}

.notice-item.stack-like .btn-reject.stack-like:hover {
  background: var(--color-dm-request-reject-hover);
}

.notice-item.audio-call .btn-accept:hover,
.notice-item.video-call .btn-accept:hover {
  background: var(--color-accent);
  color: var(--color-on-accent);
}

.notice-item.audio-call .btn-reject,
.notice-item.video-call .btn-reject {
  border-color: var(--color-danger);
  color: var(--color-danger);
}

.notice-item.audio-call .btn-reject:hover,
.notice-item.video-call .btn-reject:hover {
  background: var(--color-danger);
  color: var(--color-on-danger);
}

.notice-item.file-offer .btn-accept {
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.notice-item.file-offer .btn-accept:hover {
  background: var(--color-accent);
  color: var(--color-on-accent);
}

.notice-item.file-offer .btn-reject {
  border-color: var(--color-danger);
  color: var(--color-danger);
}

.notice-item.file-offer .btn-reject:hover {
  background: var(--color-danger);
  color: var(--color-on-danger);
}

.outgoing-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.btn-cancel-request {
  border: 1px solid var(--color-danger);
  background: transparent;
  color: var(--color-danger);
  padding: 4px 8px;
  font-size: 10px;
  font-weight: bold;
  text-transform: uppercase;
  cursor: pointer;
  font-family: inherit;
}

.btn-cancel-request:hover {
  background: var(--color-danger);
  color: var(--color-on-danger);
}

.close-btn {
  background: none;
  border: none;
  color: var(--color-accent);
  font-size: 18px;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.2s;
  padding: 0;
}

.close-btn:hover {
  opacity: 1;
}

/* Content Area */
.modal-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

#dm-modal.presentation-window .modal-content {
  background: var(--color-dmchatmodal-content-window-bg);
}

.requests-section {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.empty-state {
  text-align: center;
  color: var(--color-text-secondary);
  padding-top: 40px;
}

.request-header {
  font-size: 11px;
  font-weight: bold;
  color: var(--color-accent);
  text-transform: uppercase;
  padding: 12px 0 8px 0;
  border-bottom: 1px solid var(--color-accent-muted);
  margin-bottom: 12px;
  text-shadow: 0 0 5px var(--color-accent);
}

.request-item {
  background: var(--color-dmchatmodal-request-item-bg);
  border: 1px solid var(--color-accent-muted);
  padding: 15px;
  margin-bottom: 12px;
  border-radius: 2px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.request-user {
  font-weight: bold;
  font-size: 14px;
  text-shadow: 0 0 5px currentColor;
}

.request-actions {
  display: flex;
  gap: 8px;
}

.btn-accept,
.btn-reject {
  padding: 6px 12px;
  border: 1px solid var(--color-accent);
  background: transparent;
  color: var(--color-accent);
  cursor: pointer;
  font-size: 11px;
  text-transform: uppercase;
  transition: all 0.2s;
  font-weight: bold;
  font-family: inherit;
}

.btn-accept:hover {
  background: var(--color-accent);
  color: var(--color-on-accent);
}

.btn-reject {
  border-color: var(--color-danger);
  color: var(--color-danger);
}

.btn-reject:hover {
  background: var(--color-danger);
  color: var(--color-on-danger);
}

/* Chat Section */
.chat-section {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

.chat-section.has-video-call {
  display: flex;
  height: 100%;
}

.video-call-pane {
  flex: 1;
  min-height: 0;
  height: 100%;
  display: flex;
  overflow: hidden;
}

.chat-section.has-video-call .notice-stack-inline {
  max-height: min(45%, 240px);
  overflow-y: auto;
}

.chat-section.has-video-call .video-call-pane {
  min-height: 0;
  height: 100%;
}

.chat-header {
  padding: 12px 20px;
  border-bottom: 1px solid var(--color-accent-muted);
  font-size: 13px;
  text-transform: uppercase;
  font-weight: bold;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.status-indicator {
  font-size: 10px;
  color: var(--color-accent);
  animation: pulse 1.5s infinite;
}

.status-indicator.disconnected {
  color: var(--color-danger);
  animation: none;
}

.audio-indicator {
  color: var(--color-accent);
  font-size: 12px;
  margin-left: 4px;
  text-shadow: 0 0 8px var(--color-accent);
}

/* Controls Bar */
.controls-bar {
  display: flex;
  gap: 8px;
  padding: 10px 15px;
  border-top: 1px solid var(--color-accent-muted);
  border-bottom: 1px solid var(--color-accent-muted);
  background: var(--color-chat-surface);
  flex-shrink: 0;
}

.control-btn {
  padding: 6px 12px;
  border: 1px solid var(--color-accent);
  background: transparent;
  color: var(--color-accent);
  cursor: pointer;
  font-size: 11px;
  text-transform: uppercase;
  transition: all 0.2s;
  font-weight: bold;
  font-family: inherit;
}

.control-btn:hover {
  background: var(--color-accent);
  color: var(--color-on-accent);
  box-shadow: 0 0 10px var(--color-accent);
}

.mic-btn {
  padding: 6px 8px;
  min-width: auto;
}

.mic-btn.active {
  background: var(--color-accent);
  color: var(--color-on-accent);
  box-shadow: 0 0 10px var(--color-accent);
}

.call-duration {
  margin-left: auto;
  display: flex;
  align-items: center;
  font-size: 12px;
  font-weight: bold;
  color: var(--color-accent);
  text-shadow: 0 0 8px var(--color-accent);
  font-family: 'Courier New', monospace;
  letter-spacing: 1px;
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 15px 20px;
  font-size: 13px;
  position: relative;
  transition: background-color 0.2s;
}

#dm-modal.presentation-window .messages {
  padding: 20px 22px;
}

.messages.drag-over {
  background-color: var(--color-dmchatmodal-drag-over-bg);
}

.drop-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-dmchatmodal-drop-overlay-bg);
  color: var(--color-accent);
  font-size: 16px;
  font-weight: bold;
  text-transform: uppercase;
  pointer-events: none;
}

.msg {
  margin-bottom: 8px;
  line-height: 1.4;
  border-left: 2px solid var(--color-accent-muted);
  padding-left: 10px;
}

.sender {
  font-weight: bold;
  margin-right: 6px;
}

.text {
  color: var(--color-chat-text);
  word-wrap: break-word;
  white-space: pre-wrap;
}

.input-bar {
  display: flex;
  border-top: 1px solid var(--color-accent-muted);
  height: 26px;
  background: var(--color-chat-surface);
  flex-shrink: 0;
  align-items: center;
  position: relative;
  gap: 8px;
  padding: 0 10px;
}

#dm-modal.presentation-window .input-bar {
  border-top: 1px solid var(--color-dmchatmodal-input-bar-window-border);
  background: var(--color-dmchatmodal-input-bar-window-bg);
  height: 26px;
}

#dm-modal.presentation-window .input-bar input {
  padding: 0 12px;
  font-size: 12px;
}

#dm-modal.presentation-window .send-btn {
  padding: 0 12px;
  min-width: 56px;
  font-size: 11px;
}

.waiting-indicator {
  position: absolute;
  left: 15px;
  font-size: 11px;
  color: var(--color-accent-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.7;
  pointer-events: none;
}

.input-bar input {
  background: transparent;
  border: none;
  color: var(--color-accent);
  padding: 0 15px;
  flex: 1;
  min-width: 0;
  font-family: inherit;
  font-size: 13px;
  outline: none;
}

.dm-effect-picker {
  display: inline-flex;
  align-items: center;
  min-width: 88px;
  height: 20px;
  background: var(--color-chat-surface);
  border: 1px solid var(--color-accent-muted);
  border-radius: 10px;
  padding: 0 4px;
}

.dm-effect-picker select {
  width: 100%;
  height: 100%;
  background: transparent;
  color: var(--color-chat-text);
  border: none;
  border-radius: 10px;
  padding: 0 6px;
  font-size: 11px;
  outline: none;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
}

.dm-effect-picker select option {
  background: var(--color-chat-surface);
  color: var(--color-chat-text);
}

.input-bar input::placeholder {
  color: var(--color-chat-text-muted);
}

.input-bar input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.connection-wait-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.26);
  pointer-events: none;
  z-index: 1;
}

.connection-wait-box {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 18px;
  border-radius: 14px;
  background: rgba(12, 16, 24, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.connection-wait-text {
  color: var(--color-accent);
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.connection-wait-dots::after {
  content: '';
  animation: connection-wait-dots 1.2s steps(4, end) infinite;
}

@keyframes connection-wait-dots {
  0%, 20% { content: ''; }
  40% { content: '.'; }
  60% { content: '..'; }
  80%, 100% { content: '...'; }
}

.cancel-btn {
  background: transparent;
  color: var(--color-danger);
  border: 1px solid var(--color-danger);
  padding: 0 12px;
  cursor: pointer;
  font-family: inherit;
  font-weight: bold;
  font-size: 11px;
  transition: all 0.2s;
  text-transform: uppercase;
  height: 100%;
  margin-right: 4px;
}

.cancel-btn:hover {
  background: var(--color-danger);
  color: var(--color-on-danger);
  box-shadow: var(--color-dmchatmodal-danger-shadow);
}

.send-btn {
  background: var(--color-accent);
  color: var(--color-on-accent);
  border: none;
  padding: 0 20px;
  cursor: pointer;
  font-family: inherit;
  font-weight: bold;
  font-size: 12px;
  transition: all 0.2s;
  text-transform: uppercase;
  height: 100%;
}

.send-btn:hover:not(:disabled) {
  filter: brightness(1.08);
  box-shadow: var(--color-dmchatmodal-send-btn-hover-shadow);
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

@keyframes bounce {
  0%, 80%, 100% {
    transform: translateY(0);
    opacity: 0.7;
  }
  40% {
    transform: translateY(-8px);
    opacity: 1;
  }
}

.typing-indicator {
  display: inline-flex;
  gap: 2px;
  margin-left: 4px;
}

.typing-indicator .dot {
  display: inline-block;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background-color: currentColor;
  animation: bounce 1.4s infinite;
}

.typing-indicator .dot:nth-child(1) {
  animation-delay: 0s;
}

.typing-indicator .dot:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-indicator .dot:nth-child(3) {
  animation-delay: 0.4s;
}

/* Files Section */
.files-section {
  padding: 12px 15px;
  background: var(--color-dmchatmodal-files-section-bg);
  border-top: 1px solid var(--color-dmchatmodal-files-section-border);
  max-height: 200px;
  overflow-y: auto;
}

#dm-modal.presentation-window .files-section {
  padding: 12px 18px;
  background: var(--color-dmchatmodal-files-section-window-bg);
  border-top: 1px solid var(--color-dmchatmodal-files-section-window-border);
}

.files-header {
  font-size: 11px;
  font-weight: bold;
  color: var(--color-accent);
  text-transform: uppercase;
  margin-bottom: 10px;
  text-shadow: 0 0 5px var(--color-accent);
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  user-select: none;
}

.files-header:hover {
  opacity: 0.8;
}

.files-collapse-icon {
  font-size: 10px;
  opacity: 0.7;
}

.files-section.collapsed {
  max-height: none;
  overflow: visible;
  padding-bottom: 4px;
}

.files-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.file-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--color-dmchatmodal-file-item-bg);
  border: 1px solid var(--color-accent-muted);
  padding: 8px 10px;
  border-radius: 2px;
  gap: 8px;
}

.file-info {
  flex: 1;
  min-width: 0;
}

.file-name {
  font-size: 12px;
  font-weight: bold;
  color: var(--color-chat-text);
  word-break: break-word;
  margin-bottom: 2px;
}

.file-size {
  font-size: 10px;
  color: var(--color-chat-text-muted);
}

.file-progress {
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.progress-bar {
  flex: 1;
  height: 4px;
  background: var(--color-dmchatmodal-progress-bar-bg);
  border: 1px solid var(--color-accent-muted);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--color-accent);
  transition: width 0.3s;
  box-shadow: 0 0 10px var(--color-accent);
}

.progress-text {
  font-size: 9px;
  color: var(--color-chat-text-muted);
  min-width: 25px;
  text-align: right;
}

.file-status {
  font-size: 10px;
  font-weight: bold;
  text-transform: uppercase;
  margin-top: 4px;
}

.file-status.pending {
  color: var(--color-chat-warning);
  text-shadow: 0 0 5px var(--color-chat-warning);
}

.file-status.awaiting-completion {
  color: var(--color-chat-warning);
  text-shadow: 0 0 6px var(--color-chat-warning);
  animation: sender-awaiting-flash 0.9s ease-in-out infinite;
}

.file-status.completed {
  color: var(--color-accent);
  text-shadow: 0 0 5px var(--color-accent);
}

.file-status.rejected,
.file-status.failed {
  color: var(--color-danger);
  text-shadow: 0 0 5px var(--color-danger);
}

.file-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.file-action-btn {
  padding: 4px 8px;
  background: transparent;
  border: 1px solid var(--color-accent);
  color: var(--color-accent);
  font-size: 10px;
  font-weight: bold;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s;
  border-radius: 2px;
  white-space: nowrap;
  font-family: inherit;
}

.file-action-btn:hover {
  background: var(--color-accent);
  color: var(--color-bg-base);
  box-shadow: 0 0 10px var(--color-accent);
}

.file-action-btn.reject {
  border-color: var(--color-danger);
  color: var(--color-danger);
}

.file-action-btn.reject:hover {
  background: var(--color-danger);
  color: var(--color-on-danger);
  box-shadow: var(--color-dmchatmodal-danger-shadow);
}

.file-action-btn.accept {
  border-color: var(--color-accent);
}

@keyframes sender-awaiting-flash {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}

</style>
