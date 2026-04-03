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

      <!-- Tab Bar -->
      <div class="tab-bar">
        <div
          v-for="tab in allTabs"
          :key="tab"
          :class="['tab', { active: currentTab === tab }]"
          @click="selectTab(tab)"
        >
          <span class="tab-label" :style="{ color: getUserColor(tab) }">
            {{ tab }}
            <span v-if="audioEnabledMap.get(tab)" class="audio-indicator">☎</span>
            <span v-if="isTabConnected(tab)" class="status-indicator">●</span>
            <span v-else class="status-indicator disconnected">●</span>
            <span v-if="props.activeChats.get(tab)?.callStartTime" class="call-duration-tab">
              ⏱ {{ formatDuration(props.activeChats.get(tab)?.callDuration || 0) }}
            </span>
            <button
              v-if="isTabConnected(tab) && !props.activeChats.get(tab)?.callStartTime"
              class="tab-action-btn phone-btn"
              @click.stop="handleRequestAudio"
            >
              ☎
            </button>
            <button
              v-if="isTabConnected(tab) && !props.activeChats.get(tab)?.callStartTime"
              class="tab-action-btn camera-btn"
              @click.stop="handleRequestVideo"
            >
              📹
            </button>
            <button
              v-if="props.activeChats.get(tab)?.callStartTime"
              class="tab-action-btn end-call-btn"
              @click.stop="handleEndCall(tab)"
            >
              ⊗
            </button>
            <span v-if="props.activeChats.get(tab)?.isTyping" class="typing-indicator">
              <span class="dot"></span><span class="dot"></span><span class="dot"></span>
            </span>
          </span>
          <button
            class="tab-close"
            @click.stop="closeTab(tab)"
          >
            ✕
          </button>
        </div>
      </div>


      <!-- Content Area -->
      <div class="modal-content">
        <div v-if="currentTab" class="chat-section" :class="{ 'has-video-call': !!activeVideoCallUser }">
          <div v-if="chatToastNotices.length > 0 || outgoingRequestsForCurrentTab.length > 0" class="notice-stack notice-stack-inline">
            <div
              v-for="notice in chatToastNotices"
              :key="`notice-${notice.id}`"
              class="notice-item"
              :class="notice.type || 'info'"
            >
              <span>{{ notice.message }}</span>
              <div v-if="notice.type === 'audio-call' || notice.type === 'video-call' || notice.type === 'file-offer'" class="notice-buttons">
                <button class="btn-accept" @click="acceptNotice(notice)">ACCEPT</button>
                <button class="btn-reject" @click="rejectNotice(notice)">REJECT</button>
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
              <button
                v-if="getCurrentChat()?.pendingDisplayMessages.length"
                class="cancel-btn"
                @click="emit('cancelPendingMessages', currentTab)"
              >
                CANCEL
              </button>
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
import { ref, computed, watch } from 'vue';
import type { DMChat, DMRequest, AudioCallRequest, VideoCallRequest, DMNotice, FileTransferState } from '../types/directMessage';
import { useTheme } from '../composables/useTheme';
import { useMessageAnimations } from '../composables/useMessageAnimations';
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

const { getUserColor } = useTheme();
const { playAnimation } = useMessageAnimations();
const currentTab = ref<string>('');
const messageInput = ref('');
const messagesContainer = ref<HTMLElement>();
const audioElement = ref<HTMLAudioElement>();
const animationElements = new Map<string, HTMLElement>(); // Track animation DOM elements
const typingTimeouts = new Map<string, ReturnType<typeof setTimeout>>(); // Track debounce timeouts per user
const isTypingMap = new Map<string, boolean>(); // Track if we've sent typing signal for each user
const audioEnabledMap = new Map<string, boolean>(); // Track audio enabled state per user
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

function selectTab(tab: string) {
  currentTab.value = tab;
}

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
const chatToastNotices = computed(() => {
  if (!currentTab.value) return [];

  return props.notices.filter((notice) => {
    if (notice.type === 'audio-call' || notice.type === 'video-call' || notice.type === 'file-offer') {
      return notice.from === currentTab.value;
    }

    if (notice.type === 'info') {
      return !notice.from || notice.from === currentTab.value;
    }

    return false;
  });
});

const outgoingRequestsForCurrentTab = computed(() =>
  currentTab.value ? props.outgoingRequests.filter((user) => user === currentTab.value) : []
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
  }
});

// Switch to focused user when requested
watch(() => props.focusedDMUser, (focusedUser) => {
  if (focusedUser && props.activeChats.has(focusedUser)) {
    currentTab.value = focusedUser;
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

function closeTab(user: string) {
  emit('closeDm', user);
  // Close the DM connection via parent and switch tab
  const tabs = allTabs.value.filter(t => t !== user);
  if (tabs.length > 0) {
    currentTab.value = tabs[0];
  } else {
    handleClose();
  }
}

function sendMessage() {
  if (!messageInput.value.trim() || !currentTab.value) return;

  const chat = getCurrentChat();
  if (!chat) {
    return;
  }

  emit('sendMessage', currentTab.value, messageInput.value.trim(), props.dmChatEffect);
  messageInput.value = '';
}

function handleMessageInputEnter() {
  sendMessage();
}

function getCurrentChat(): DMChat | undefined {
  return props.activeChats.get(currentTab.value);
}

function isTabConnected(tab: string): boolean {
  return props.activeChats.get(tab)?.isConnected ?? false;
}

function handleRequestAudio() {
  if (!currentTab.value) return;
  emit('requestAudio', currentTab.value);
}

function handleRequestVideo() {
  if (!currentTab.value) return;
  emit('requestVideo', currentTab.value);
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

function handleEndCall(user: string) {
  activeVideoCallUser.value = null;
  emit('closeDm', user);
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
    // Validate file size (500MB max)
    if (file.size > 500 * 1024 * 1024) {
      console.warn(`File ${file.name} exceeds 500MB limit`);
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

// Watch for new messages and play animations
watch(
  () => {
    const chat = getCurrentChat();
    return chat?.messages.length ?? 0;
  },
  async (newLen) => {
    if (!newLen || !currentTab.value) return;

    const chat = getCurrentChat();
    if (!chat || chat.messages.length === 0) return;

    const lastMsg = chat.messages[chat.messages.length - 1];
    const msgKey = `${lastMsg.user}_${chat.messages.length - 1}`;

    // Skip if already animated
    if (animationElements.has(msgKey)) return;

    // Create animation container - full window, centered
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
    animContainer.style.padding = '20px';
    animContainer.style.boxSizing = 'border-box';

    // Add text container for animation (no sender label)
    const textContainer = document.createElement('span');
    textContainer.className = 'animation-text';
    textContainer.style.color = 'var(--neon-green, #39ff14)';
    textContainer.style.fontSize = 'clamp(2rem, 8vw, 8rem)';
    textContainer.style.fontWeight = 'bold';
    textContainer.style.textAlign = 'center';
    textContainer.style.whiteSpace = 'pre-wrap';
    textContainer.style.overflowWrap = 'normal';
    textContainer.style.wordBreak = 'normal';
    textContainer.style.textShadow = '0 0 20px rgba(57, 255, 20, 0.8)';
    textContainer.style.overflow = 'hidden';
    animContainer.appendChild(textContainer);

    if (messagesContainer.value) {
      messagesContainer.value.style.position = 'relative';
      messagesContainer.value.appendChild(animContainer);
    }

    animationElements.set(msgKey, animContainer);

    // Play animation
    const effect = (lastMsg.effect || 'none') as 'none' | 'typewriter' | 'scan' | 'matrix' | 'glitch' | 'flames';
    try {
      await playAnimation(effect, lastMsg.message, textContainer);
    } catch (e) {
      console.error('Animation error:', e);
      textContainer.textContent = lastMsg.message;
    }

    // Remove from messages array (ephemeral)
    chat.messages.pop();

    // Remove animation container
    if (animContainer.parentNode) {
      animContainer.parentNode.removeChild(animContainer);
    }

    animationElements.delete(msgKey);

    // If this was OUR message, remove it from pending display queue
    if (lastMsg.user === props.username && lastMsg.messageId) {
      chat.pendingDisplayMessages = chat.pendingDisplayMessages.filter(
        (msg) => msg.id !== lastMsg.messageId
      );
    }

    // Send ACK if message was from peer (not from current user)
    if (lastMsg.user !== props.username) {
      // Send ACK to peer
      if (chat.dataChannel && chat.dataChannel.readyState === 'open') {
        try {
          chat.dataChannel.send(JSON.stringify({
            u: props.username,
            ack: true,
            msgId: lastMsg.messageId
          }));
        } catch (e) {
          console.error('Failed to send ACK:', e);
        }
      }
    }
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
  background: rgba(0, 0, 0, 0.8);
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
  background:
    radial-gradient(circle at top, rgba(57, 255, 20, 0.09), transparent 34%),
    linear-gradient(180deg, rgba(4, 8, 4, 0.98), rgba(0, 0, 0, 1));
}

.modal-box {
  background: #000;
  border: 2px solid var(--neon-green);
  width: 100%;
  height: calc(100% - 24px);
  min-height: 0;
  display: flex;
  flex-direction: column;
  box-shadow: 0 0 20px rgba(57, 255, 20, 0.3);
  position: relative;
}

.modal-box.presentation-window {
  width: 100%;
  height: calc(100% - 34px);
  border: none;
  box-shadow:
    inset 0 1px 0 rgba(57, 255, 20, 0.16),
    inset 0 0 36px rgba(57, 255, 20, 0.08);
  background:
    linear-gradient(180deg, rgba(5, 10, 5, 0.98), rgba(0, 0, 0, 1) 24%),
    linear-gradient(135deg, rgba(57, 255, 20, 0.04), transparent 42%);
}

:deep(.video-window) {
  flex: 1;
  min-height: 0;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  border-bottom: 1px solid var(--neon-green);
  color: var(--neon-green);
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

.notice-item {
  border: 1px solid var(--alert-red);
  background: rgba(255, 0, 0, 0.08);
  color: #ff8d8d;
  padding: 8px 10px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.notice-item.audio-call,
.notice-item.video-call {
  border-color: var(--neon-green);
  background: rgba(57, 255, 20, 0.08);
  color: var(--neon-green);
}

.notice-item.file-offer {
  border-color: #ffce6b;
  background: rgba(255, 206, 107, 0.08);
  color: #ffce6b;
}

.notice-item.info {
  border-color: var(--dim-green);
  background: rgba(57, 255, 20, 0.08);
  color: var(--neon-green);
}

.notice-buttons {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.notice-item.audio-call .btn-accept,
.notice-item.video-call .btn-accept {
  border-color: var(--neon-green);
  color: var(--neon-green);
}

.notice-item.audio-call .btn-accept:hover,
.notice-item.video-call .btn-accept:hover {
  background: var(--neon-green);
  color: #000;
}

.notice-item.audio-call .btn-reject,
.notice-item.video-call .btn-reject {
  border-color: var(--alert-red);
  color: var(--alert-red);
}

.notice-item.audio-call .btn-reject:hover,
.notice-item.video-call .btn-reject:hover {
  background: var(--alert-red);
  color: #fff;
}

.notice-item.file-offer .btn-accept {
  border-color: var(--neon-green);
  color: var(--neon-green);
}

.notice-item.file-offer .btn-accept:hover {
  background: var(--neon-green);
  color: #000;
}

.notice-item.file-offer .btn-reject {
  border-color: var(--alert-red);
  color: var(--alert-red);
}

.notice-item.file-offer .btn-reject:hover {
  background: var(--alert-red);
  color: #fff;
}

.outgoing-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.btn-cancel-request {
  border: 1px solid var(--alert-red);
  background: transparent;
  color: var(--alert-red);
  padding: 4px 8px;
  font-size: 10px;
  font-weight: bold;
  text-transform: uppercase;
  cursor: pointer;
  font-family: inherit;
}

.btn-cancel-request:hover {
  background: var(--alert-red);
  color: #000;
}

.close-btn {
  background: none;
  border: none;
  color: var(--neon-green);
  font-size: 18px;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.2s;
  padding: 0;
}

.close-btn:hover {
  opacity: 1;
}

/* Tab Bar */
.tab-bar {
  display: flex;
  border-bottom: 1px solid var(--dim-green);
  background: rgba(0, 20, 0, 0.5);
  overflow-x: auto;
  flex-shrink: 0;
}

#dm-modal.presentation-window .tab-bar {
  border-bottom: 1px solid rgba(57, 255, 20, 0.16);
  background: linear-gradient(180deg, rgba(10, 18, 10, 0.96), rgba(5, 10, 5, 0.92));
}

.tab {
  flex: 1;
  min-width: 120px;
  padding: 10px 15px;
  border-right: 1px solid var(--dim-green);
  color: var(--text-dim);
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: all 0.2s;
  user-select: none;
  font-size: 12px;
  text-transform: uppercase;
  white-space: nowrap;
  background: transparent;
}

#dm-modal.presentation-window .tab {
  min-width: 144px;
  padding: 12px 16px;
  border-right: 1px solid rgba(57, 255, 20, 0.1);
}

.tab:hover {
  background: rgba(57, 255, 20, 0.05);
}

.tab.active {
  background: rgba(57, 255, 20, 0.1);
  color: var(--neon-green);
  border-bottom: 2px solid var(--neon-green);
}

#dm-modal.presentation-window .tab.active {
  background: linear-gradient(180deg, rgba(57, 255, 20, 0.14), rgba(57, 255, 20, 0.04));
  box-shadow: inset 0 1px 0 rgba(57, 255, 20, 0.16);
}

.tab-label {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
}

.tab-action-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  padding: 2px 3px;
  transition: all 0.2s;
  opacity: 0.7;
}

.tab-action-btn:hover {
  opacity: 1;
  text-shadow: 0 0 8px currentColor;
}

.phone-btn,
.camera-btn {
  color: var(--text-white);
}

.end-call-btn {
  color: var(--alert-red);
}

.call-duration-tab {
  font-size: 10px;
  color: var(--neon-green);
  font-family: 'Courier New', monospace;
  text-shadow: 0 0 4px var(--neon-green);
  margin: 0 4px;
}

.badge {
  background: var(--alert-red);
  color: #fff;
  border-radius: 3px;
  padding: 2px 6px;
  font-size: 10px;
  font-weight: bold;
}

.tab-close {
  background: none;
  border: none;
  color: inherit;
  font-size: 14px;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.2s;
  padding: 0 4px;
}

.tab-close:hover {
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
  background:
    radial-gradient(circle at top right, rgba(57, 255, 20, 0.05), transparent 32%),
    linear-gradient(180deg, rgba(2, 5, 2, 0.18), transparent 20%);
}

.requests-section {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.empty-state {
  text-align: center;
  color: var(--system-dim);
  padding-top: 40px;
}

.request-header {
  font-size: 11px;
  font-weight: bold;
  color: var(--neon-green);
  text-transform: uppercase;
  padding: 12px 0 8px 0;
  border-bottom: 1px solid var(--dim-green);
  margin-bottom: 12px;
  text-shadow: 0 0 5px var(--neon-green);
}

.request-item {
  background: rgba(57, 255, 20, 0.05);
  border: 1px solid var(--dim-green);
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
  border: 1px solid var(--neon-green);
  background: transparent;
  color: var(--neon-green);
  cursor: pointer;
  font-size: 11px;
  text-transform: uppercase;
  transition: all 0.2s;
  font-weight: bold;
  font-family: inherit;
}

.btn-accept:hover {
  background: var(--neon-green);
  color: #000;
}

.btn-reject {
  border-color: var(--alert-red);
  color: var(--alert-red);
}

.btn-reject:hover {
  background: var(--alert-red);
  color: #fff;
}

/* Chat Section */
.chat-section {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.chat-section.has-video-call {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
}

.video-call-pane {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.chat-section.has-video-call .notice-stack-inline {
  max-height: 96px;
  overflow-y: auto;
  padding-bottom: 8px;
}

.chat-section.has-video-call .video-call-pane {
  min-height: 0;
  height: 100%;
}

.chat-header {
  padding: 12px 20px;
  border-bottom: 1px solid var(--dim-green);
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
  color: var(--neon-green);
  animation: pulse 1.5s infinite;
}

.status-indicator.disconnected {
  color: var(--alert-red);
  animation: none;
}

.audio-indicator {
  color: var(--neon-green);
  font-size: 12px;
  margin-left: 4px;
  text-shadow: 0 0 8px var(--neon-green);
}

/* Controls Bar */
.controls-bar {
  display: flex;
  gap: 8px;
  padding: 10px 15px;
  border-top: 1px solid var(--dim-green);
  border-bottom: 1px solid var(--dim-green);
  background: rgba(0, 20, 0, 0.3);
  flex-shrink: 0;
}

.control-btn {
  padding: 6px 12px;
  border: 1px solid var(--neon-green);
  background: transparent;
  color: var(--neon-green);
  cursor: pointer;
  font-size: 11px;
  text-transform: uppercase;
  transition: all 0.2s;
  font-weight: bold;
  font-family: inherit;
}

.control-btn:hover {
  background: var(--neon-green);
  color: #000;
  box-shadow: 0 0 10px var(--neon-green);
}

.mic-btn {
  padding: 6px 8px;
  min-width: auto;
}

.mic-btn.active {
  background: var(--neon-green);
  color: #000;
  box-shadow: 0 0 10px var(--neon-green);
}

.call-duration {
  margin-left: auto;
  display: flex;
  align-items: center;
  font-size: 12px;
  font-weight: bold;
  color: var(--neon-green);
  text-shadow: 0 0 8px var(--neon-green);
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
  background-color: rgba(57, 255, 20, 0.1);
}

.drop-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(57, 255, 20, 0.15);
  color: var(--neon-green);
  font-size: 16px;
  font-weight: bold;
  text-transform: uppercase;
  pointer-events: none;
}

.msg {
  margin-bottom: 8px;
  line-height: 1.4;
  border-left: 2px solid var(--dim-green);
  padding-left: 10px;
}

.sender {
  font-weight: bold;
  margin-right: 6px;
}

.text {
  color: var(--text-white);
  word-wrap: break-word;
  white-space: pre-wrap;
}

.input-bar {
  display: flex;
  border-top: 1px solid var(--dim-green);
  height: 50px;
  background: rgba(0, 0, 0, 0.5);
  flex-shrink: 0;
  align-items: center;
  position: relative;
}

#dm-modal.presentation-window .input-bar {
  border-top: 1px solid rgba(57, 255, 20, 0.16);
  background: linear-gradient(180deg, rgba(6, 10, 6, 0.96), rgba(2, 4, 2, 0.98));
}

#dm-modal.presentation-window .input-bar input {
  padding: 0 18px;
}

.waiting-indicator {
  position: absolute;
  left: 15px;
  font-size: 11px;
  color: var(--dim-green);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.7;
  pointer-events: none;
}

.input-bar input {
  background: transparent;
  border: none;
  color: var(--neon-green);
  padding: 0 15px;
  flex: 1;
  font-family: inherit;
  font-size: 13px;
  outline: none;
}

.input-bar input::placeholder {
  color: var(--system-dim);
}

.input-bar input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.cancel-btn {
  background: transparent;
  color: var(--alert-red);
  border: 1px solid var(--alert-red);
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
  background: var(--alert-red);
  color: #000;
  box-shadow: 0 0 10px rgba(255, 0, 0, 0.3);
}

.send-btn {
  background: var(--neon-green);
  color: #000;
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
  background: #fff;
  box-shadow: 0 0 10px rgba(57, 255, 20, 0.5);
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
  background: rgba(57, 255, 20, 0.02);
  border-top: 1px solid var(--dim-green);
  max-height: 200px;
  overflow-y: auto;
}

#dm-modal.presentation-window .files-section {
  padding: 12px 18px;
  background: linear-gradient(180deg, rgba(57, 255, 20, 0.04), rgba(57, 255, 20, 0.015));
  border-top: 1px solid rgba(57, 255, 20, 0.14);
}

.files-header {
  font-size: 11px;
  font-weight: bold;
  color: var(--neon-green);
  text-transform: uppercase;
  margin-bottom: 10px;
  text-shadow: 0 0 5px var(--neon-green);
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
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid var(--dim-green);
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
  color: var(--text-white);
  word-break: break-word;
  margin-bottom: 2px;
}

.file-size {
  font-size: 10px;
  color: var(--system-dim);
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
  background: rgba(57, 255, 20, 0.1);
  border: 1px solid var(--dim-green);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--neon-green);
  transition: width 0.3s;
  box-shadow: 0 0 10px var(--neon-green);
}

.progress-text {
  font-size: 9px;
  color: var(--system-dim);
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
  color: #ffce6b;
  text-shadow: 0 0 5px #ffce6b;
}

.file-status.awaiting-completion {
  color: #ffce6b;
  text-shadow: 0 0 6px #ffce6b;
  animation: sender-awaiting-flash 0.9s ease-in-out infinite;
}

.file-status.completed {
  color: var(--neon-green);
  text-shadow: 0 0 5px var(--neon-green);
}

.file-status.rejected,
.file-status.failed {
  color: var(--alert-red);
  text-shadow: 0 0 5px var(--alert-red);
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
  border: 1px solid var(--neon-green);
  color: var(--neon-green);
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
  background: var(--neon-green);
  color: var(--dark-bg);
  box-shadow: 0 0 10px var(--neon-green);
}

.file-action-btn.reject {
  border-color: var(--alert-red);
  color: var(--alert-red);
}

.file-action-btn.reject:hover {
  background: var(--alert-red);
  color: #fff;
  box-shadow: 0 0 10px rgba(255, 0, 0, 0.4);
}

.file-action-btn.accept {
  border-color: var(--neon-green);
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
