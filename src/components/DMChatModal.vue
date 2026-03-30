<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { DMChat, DMRequest, DMNotice } from '../composables/useDirectMessage';
import { useTheme } from '../composables/useTheme';

const props = defineProps<{
  showModal: boolean;
  activeChats: Map<string, DMChat>;
  pendingRequests: DMRequest[];
  outgoingRequests: string[];
  notices: DMNotice[];
  username: string;
}>();

const emit = defineEmits<{
  close: [];
  acceptDm: [user: string];
  rejectDm: [user: string];
  cancelRequest: [user: string];
  sendMessage: [user: string, message: string];
  closeDm: [user: string];
}>();

const { getUserColor } = useTheme();
const currentTab = ref<string>('requests'); // 'requests' or username
const messageInput = ref('');
const messagesContainer = ref<HTMLElement>();

// Computed list of all tabs (requests + active chats)
const allTabs = computed(() => {
  const tabs: string[] = [];
  if (props.pendingRequests.length > 0) {
    tabs.push('requests');
  }
  tabs.push(...Array.from(props.activeChats.keys()));
  return tabs;
});

// Default to first available tab
watch(allTabs, (newTabs) => {
  if (!newTabs.includes(currentTab.value) && newTabs.length > 0) {
    currentTab.value = newTabs[0];
  }
});

// Auto-scroll to latest message
watch(
  () => props.activeChats.get(currentTab.value)?.messages.length,
  () => {
    setTimeout(() => {
      if (messagesContainer.value) {
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
      }
    }, 0);
  }
);

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

function handleAccept(user: string) {
  emit('acceptDm', user);
  currentTab.value = user;
}

function handleReject(user: string) {
  emit('rejectDm', user);
}

function handleCancelRequest(user: string) {
  emit('cancelRequest', user);
}

function sendMessage() {
  if (!messageInput.value.trim() || currentTab.value === 'requests') return;
  emit('sendMessage', currentTab.value, messageInput.value.trim());
  messageInput.value = '';
}

function getCurrentChat(): DMChat | undefined {
  return props.activeChats.get(currentTab.value);
}

function isTabConnected(tab: string): boolean {
  return props.activeChats.get(tab)?.isConnected ?? false;
}
</script>

<template>
  <div v-if="showModal" id="dm-modal" @click="(e) => e.target === $el && handleClose()">
    <div class="modal-box">
      <!-- Header -->
      <div class="modal-header">
        <h3 style="margin: 0">DIRECT MESSAGE</h3>
        <button class="close-btn" @click="handleClose">✕</button>
      </div>

      <div v-if="notices.length > 0" class="notice-stack" role="status" aria-live="polite">
        <div v-for="notice in notices" :key="notice.id" class="notice-item">
          {{ notice.message }}
        </div>
      </div>

      <div v-if="outgoingRequests.length > 0" class="notice-stack" role="status" aria-live="polite">
        <div v-for="requestUser in outgoingRequests" :key="requestUser" class="notice-item info outgoing-item">
          <span>Awaiting approval from {{ requestUser }}...</span>
          <button class="btn-cancel-request" @click="handleCancelRequest(requestUser)">CANCEL</button>
        </div>
      </div>

      <!-- Tab Bar -->
      <div class="tab-bar">
        <div
          v-for="tab in allTabs"
          :key="tab"
          :class="['tab', { active: currentTab === tab }]"
          @click="currentTab = tab"
        >
          <span v-if="tab === 'requests'" class="tab-label">
            REQUESTS
            <span v-if="pendingRequests.length > 0" class="badge">{{ pendingRequests.length }}</span>
          </span>
          <span v-else class="tab-label" :style="{ color: getUserColor(tab) }">
            {{ tab }}
            <span v-if="isTabConnected(tab)" class="status-indicator">●</span>
            <span v-else class="status-indicator disconnected">●</span>
          </span>
          <button
            v-if="tab !== 'requests'"
            class="tab-close"
            @click.stop="closeTab(tab)"
            title="Close DM"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- Content Area -->
      <div class="modal-content">
        <!-- Pending Requests Tab -->
        <div v-if="currentTab === 'requests'" class="requests-section">
          <div v-if="pendingRequests.length === 0" class="empty-state">
            No pending DM requests
          </div>
          <div v-for="request in pendingRequests" :key="request.from" class="request-item">
            <div class="request-user" :style="{ color: getUserColor(request.from) }">
              {{ request.from }}
            </div>
            <div class="request-actions">
              <button class="btn-accept" @click="handleAccept(request.from)">ACCEPT</button>
              <button class="btn-reject" @click="handleReject(request.from)">DENY</button>
            </div>
          </div>
        </div>

        <!-- Chat Tab -->
        <div v-else-if="currentTab !== 'requests'" class="chat-section">
          <!-- Messages -->
          <div ref="messagesContainer" class="messages">
            <div
              v-for="(msg, index) in (getCurrentChat()?.messages || [])"
              :key="index"
              class="msg"
            >
              <span class="sender" :style="{ color: getUserColor(msg.user) }">{{ msg.user }}:</span>
              <span class="text">{{ msg.message }}</span>
            </div>
          </div>

          <!-- Input -->
          <div class="input-bar">
            <input
              v-model="messageInput"
              type="text"
              placeholder="Type message..."
              :disabled="!getCurrentChat()?.isConnected"
              @keydown.enter="sendMessage"
            />
            <button
              class="send-btn"
              :disabled="!getCurrentChat()?.isConnected"
              @click="sendMessage"
            >
              SEND
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

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

.modal-box {
  background: #000;
  border: 2px solid var(--neon-green);
  width: 100%;
  height: calc(100% - 16px);
  display: flex;
  flex-direction: column;
  box-shadow: 0 0 20px rgba(57, 255, 20, 0.3);
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
}

.notice-item.info {
  border-color: var(--dim-green);
  background: rgba(57, 255, 20, 0.08);
  color: var(--neon-green);
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

.tab:hover {
  background: rgba(57, 255, 20, 0.05);
}

.tab.active {
  background: rgba(57, 255, 20, 0.1);
  color: var(--neon-green);
  border-bottom: 2px solid var(--neon-green);
}

.tab-label {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
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
  display: flex;
  flex-direction: column;
  overflow: hidden;
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
  overflow: hidden;
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

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 15px 20px;
  font-size: 13px;
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

@media (max-width: 600px) {
  .tab {
    min-width: 80px;
    padding: 8px 10px;
    font-size: 11px;
  }

  .messages {
    font-size: 12px;
  }
}
</style>
