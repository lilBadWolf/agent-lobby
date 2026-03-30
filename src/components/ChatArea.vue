<script setup lang="ts">
import { ref, watch } from 'vue';
import type { ChatMessage } from '../composables/useLobbyChat';
import { useTheme } from '../composables/useTheme';
import { useImageDetection } from '../composables/useImageDetection';

const props = defineProps<{
  messages: ChatMessage[];
  username: string;
  isConnected: boolean;
}>();

const emit = defineEmits<{
  send: [message: string];
}>();

const { getUserColor } = useTheme();
const { extractImageUris, initializeImage, markImageLoaded, markImageError, getImageState } = useImageDetection();
const chatInput = ref('');
const messagesContainer = ref<HTMLElement>();
const typingProgress = ref<Record<number, number>>({});
const TYPING_SPEED = 30; // ms per character

// Process images when messages change
watch(
  () => props.messages.length,
  () => {
    props.messages.forEach((msg) => {
      const imageUris = extractImageUris(msg.message);
      imageUris.forEach(uri => initializeImage(uri));
    });
  },
  { immediate: true }
);

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

  let text = message.message;

  // Remove successfully loaded image URIs from display text
  const imageUris = extractImageUris(message.message);
  imageUris.forEach(uri => {
    const imageState = getImageState(uri);
    if (imageState?.loaded && !imageState.error) {
      text = text.replace(uri, '').trim();
    }
  });

  const progress = typingProgress.value[messageIndex] ?? text.length;
  return text.substring(0, progress);
}

function getMessageImages(messageIndex: number): string[] {
  const message = props.messages[messageIndex];
  if (!message) return [];
  return extractImageUris(message.message);
}

function isTyping(messageIndex: number): boolean {
  const message = props.messages[messageIndex];
  if (!message) return false;

  const progress = typingProgress.value[messageIndex];
  return progress !== undefined && progress < message.message.length;
}

function handleImageLoad(uri: string) {
  markImageLoaded(uri);
}

function handleImageError(uri: string) {
  markImageError(uri);
}

function sendMessage() {
  if (chatInput.value.trim() && props.isConnected) {
    emit('send', chatInput.value.trim());
    chatInput.value = '';
  }
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
          <div v-if="getMessageImages(index).length > 0" class="message-images">
            <div v-for="imageUri in getMessageImages(index)" :key="imageUri" class="image-container">
              <img
                :src="imageUri"
                :alt="imageUri"
                @load="handleImageLoad(imageUri)"
                @error="handleImageError(imageUri)"
                class="embedded-image"
              />
              <span v-if="getImageState(imageUri)?.error" class="image-fallback">{{ imageUri }}</span>
            </div>
          </div>
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
  grid-area: chatarea;
  flex: 1;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--neon-green);
  min-height: 0;
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
  padding: 0px 20px;
  margin-top: -16px;
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
  display: flex;
  align-items: flex-start;
  padding-top: 16px;
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

.message-images {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.image-container {
  position: relative;
  max-width: 300px;
}

.embedded-image {
  max-width: 100%;
  max-height: 300px;
  border: 1px solid var(--dim-green);
  border-radius: 4px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.embedded-image:hover {
  opacity: 0.8;
}

.image-fallback {
  display: inline-block;
  margin-top: 4px;
  color: var(--system-dim);
  font-size: 12px;
  font-family: monospace;
  word-break: break-all;
  padding: 4px;
  border: 1px dashed var(--dim-green);
  border-radius: 2px;
  background: rgba(0, 0, 0, 0.3);
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
