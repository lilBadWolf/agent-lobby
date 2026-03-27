<script setup lang="ts">
import { ref, watch } from 'vue';
import type { ChatMessage } from '../composables/useLobbyChat';

const props = defineProps<{
  messages: ChatMessage[];
  username: string;
  isConnected: boolean;
}>();

const emit = defineEmits<{
  send: [message: string];
}>();

const chatInput = ref('');
const messagesContainer = ref<HTMLElement>();
const typingProgress = ref<Record<number, number>>({});
const TYPING_SPEED = 30; // ms per character

watch(
  () => props.messages.length,
  (newLength, oldLength) => {
    if (newLength > oldLength) {
      // New message added, start typing animation
      const messageIndex = newLength - 1;
      typingProgress.value[messageIndex] = 0;
      animateTyping(messageIndex);
    }

    setTimeout(() => {
      if (messagesContainer.value) {
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
      }
    }, 0);
  }
);

function animateTyping(messageIndex: number) {
  const message = props.messages[messageIndex];
  if (!message) return;

  const fullText = message.message;
  const currentProgress = typingProgress.value[messageIndex] || 0;

  if (currentProgress < fullText.length) {
    typingProgress.value[messageIndex] = currentProgress + 1;
    setTimeout(() => animateTyping(messageIndex), TYPING_SPEED);
  }
}

function getDisplayedText(messageIndex: number): string {
  const message = props.messages[messageIndex];
  if (!message) return '';

  const progress = typingProgress.value[messageIndex] ?? message.message.length;
  return message.message.substring(0, progress);
}

function isTyping(messageIndex: number): boolean {
  const message = props.messages[messageIndex];
  if (!message) return false;

  const progress = typingProgress.value[messageIndex];
  return progress !== undefined && progress < message.message.length;
}

function sendMessage() {
  if (chatInput.value.trim() && props.isConnected) {
    emit('send', chatInput.value.trim());
    chatInput.value = '';
  }
}

function getUserColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash % 360)}, 80%, 60%)`;
}
</script>

<template>
  <section id="chat-area">
    <div ref="messagesContainer" id="messages">
      <div v-for="(msg, index) in messages" :key="index">
        <div v-if="msg.isSystem" class="system-msg">
          <span class="text">[{{ getDisplayedText(index) }}<span v-if="isTyping(index)" class="cursor">█</span>]</span>
        </div>
        <div v-else class="msg">
          <span class="sender" :style="{ color: getUserColor(msg.user) }">{{ msg.user }}:</span>
          <span
            class="text"
            :style="{ color: msg.user === username ? 'var(--neon-green)' : 'var(--text-white)' }"
          >
            {{ getDisplayedText(index) }}<span v-if="isTyping(index)" class="cursor">█</span>
          </span>
        </div>
      </div>
    </div>
    <div class="input-bar">
      <input
        v-model="chatInput"
        type="text"
        id="chat-msg"
        placeholder="READY TO TRANSMIT..."
        :disabled="!isConnected"
        @keydown.enter="sendMessage"
      />
      <button class="send-btn" :disabled="!isConnected" @click="sendMessage">SEND</button>
    </div>
  </section>
</template>

<style scoped>
#chat-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--neon-green);
}

#messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  font-size: 16px;
  scrollbar-width: thin;
}

.input-bar {
  display: flex;
  border-top: 1px solid var(--neon-green);
  height: 60px;
  background: #000;
}

#chat-msg {
  background: transparent;
  border: none;
  color: var(--neon-green);
  padding: 0 20px;
  flex: 1;
  font-family: inherit;
  font-size: 18px;
  outline: none;
}

#chat-msg:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.send-btn {
  background: var(--neon-green);
  color: #000;
  border: none;
  padding: 0 30px;
  cursor: pointer;
  font-family: inherit;
  font-weight: bold;
  transition: all 0.2s;
}

.send-btn:hover:not(:disabled) {
  background: #fff;
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.msg {
  margin-bottom: 12px;
  line-height: 1.5;
  border-left: 3px solid var(--dim-green);
  padding-left: 12px;
}

.system-msg {
  text-align: center;
  color: var(--system-dim);
  font-size: 13px;
  margin: 15px 0;
  letter-spacing: 1px;
  font-weight: bold;
  background: linear-gradient(90deg, transparent, rgba(57, 255, 20, 0.05), transparent);
}

.sender {
  font-weight: bold;
  margin-right: 10px;
  text-shadow: 0 0 5px currentColor;
}

.text {
  word-wrap: break-word;
  white-space: pre-wrap;
}

.cursor {
  animation: blink 1s step-end infinite;
  margin-left: 2px;
  vertical-align: text-bottom;
  font-size: 0.8em;
}

@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
}

@media (max-width: 600px) {
  #messages {
    padding: 10px;
    font-size: 14px;
  }

  #chat-msg {
    font-size: 14px;
    padding: 0 10px;
  }

  .send-btn {
    padding: 0 15px;
    font-size: 12px;
  }

  .input-bar {
    height: 50px;
  }
}
</style>
