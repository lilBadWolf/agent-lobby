<script setup lang="ts">
import { ref, watch } from 'vue';
import type { ChatMessage } from '../composables/useLobbyChat';
import { useTheme } from '../composables/useTheme';
import { useImageDetection } from '../composables/useImageDetection';
import * as nodeEmoji from 'node-emoji';

const props = defineProps<{
  messages: ChatMessage[];
  username: string;
  isConnected: boolean;
}>();

const emit = defineEmits<{
  send: [message: string];
  typing: [typing: boolean];
}>();

const { getUserColor } = useTheme();
const { extractImageUris, initializeImage, markImageLoaded, markImageError, getImageState } = useImageDetection();

// --- YouTube URL detection ---
function extractYouTubeUrls(text: string): string[] {
  // Match YouTube URLs with optional query params
  const regex = /(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})(?:[\?&][^\s]*)?)/g;
  const matches = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.push(match[0]);
  }
  return matches;
}

function getYouTubeVideoId(url: string): string | null {
  // Remove query params for ID extraction
  const cleanUrl = url.split(/[?&]/)[0];
  const ytMatch = cleanUrl.match(/youtube\.com\/watch\?v=([\w-]{11})/);
  if (ytMatch) return ytMatch[1];
  const ybMatch = cleanUrl.match(/youtu\.be\/([\w-]{11})/);
  if (ybMatch) return ybMatch[1];
  return null;
}
const chatInput = ref('');
const messagesContainer = ref<HTMLElement>();
const typingProgress = ref<Record<number, number>>({});
const emojiSuggestions = ref<{ name: string; emoji: string }[]>([]);
const emojiSelectedIndex = ref(0);
const chatInputEl = ref<HTMLInputElement>();
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

  // Remove full YouTube URLs from display text
  const ytUris = extractYouTubeUrls(message.message);
  ytUris.forEach(uri => {
    text = text.replace(uri, '').trim();
  });

  // Remove CSS-like blocks from display text
  text = text.replace(/\.[\w-]+\s*\{[^}]+\}/g, '').trim();
  // Convert :emojiName: to emoji characters
  text = nodeEmoji.replace(text, (emoji) => emoji.emoji);
  const progress = typingProgress.value[messageIndex] ?? text.length;
  return text.substring(0, progress);
}
function getMessageYouTubeUrls(messageIndex: number): string[] {
  const message = props.messages[messageIndex];
  if (!message) return [];
  return extractYouTubeUrls(message.message);
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

function isEmojiOnlyMessage(messageIndex: number): boolean {
  const text = getDisplayedText(messageIndex).trim();
  if (!text) return false;
  // Strip all emoji, ZWJ sequences, variation selectors, and whitespace
  const withoutEmoji = text.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\u200D\u20E3]/gu, '').replace(/\s/g, '');
  if (withoutEmoji.length > 0) return false;
  // Count emoji by matching full emoji sequences (including ZWJ and skin tones)
  const emojiMatches = text.match(/\p{Emoji_Presentation}[\uFE0F\u200D\u20E3\p{Emoji_Modifier}]*/gu);
  const count = emojiMatches?.length ?? 0;
  return count >= 1 && count <= 10;
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

let typingTimeout: ReturnType<typeof setTimeout> | null = null;
function convertEmojisInInput() {
  const converted = nodeEmoji.replace(chatInput.value, (emoji) => emoji.emoji);
  if (converted !== chatInput.value) {
    chatInput.value = converted;
  }
  updateEmojiSuggestions();
  // --- Presence typing event ---
  emit('typing', true);
  if (typingTimeout) clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => emit('typing', false), 2000);
}

function updateEmojiSuggestions() {
  // Find the last :word fragment before the cursor
  const val = chatInput.value;
  const cursorPos = chatInputEl.value?.selectionStart ?? val.length;
  const textUpToCursor = val.slice(0, cursorPos);
  const match = textUpToCursor.match(/:([\w+-]*)$/);
  if (match && match[1].length > 0) {
    const results = nodeEmoji.search(match[1]).slice(0, 12);
    emojiSuggestions.value = results.map(r => ({ name: r.name, emoji: r.emoji }));
    emojiSelectedIndex.value = 0;
  } else if (match && match[1].length === 0) {
    // Just typed ':', show first 12 popular emojis
    emojiSuggestions.value = nodeEmoji.search('smile').concat(nodeEmoji.search('heart')).slice(0, 12).map(r => ({ name: r.name, emoji: r.emoji }));
    emojiSelectedIndex.value = 0;
  } else {
    emojiSuggestions.value = [];
  }
}

function selectEmojiSuggestion(item: { name: string; emoji: string }) {
  const val = chatInput.value;
  const cursorPos = chatInputEl.value?.selectionStart ?? val.length;
  const textUpToCursor = val.slice(0, cursorPos);
  const replaced = textUpToCursor.replace(/:([\w+-]*)$/, item.emoji);
  chatInput.value = replaced + val.slice(cursorPos);
  emojiSuggestions.value = [];
  // Restore focus
  chatInputEl.value?.focus();
}

function handleInputKeydown(e: KeyboardEvent) {
  if (emojiSuggestions.value.length === 0) {
    if (e.key === 'Enter') sendMessage();
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    emojiSelectedIndex.value = (emojiSelectedIndex.value + 1) % emojiSuggestions.value.length;
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    emojiSelectedIndex.value = (emojiSelectedIndex.value - 1 + emojiSuggestions.value.length) % emojiSuggestions.value.length;
  } else if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault();
    selectEmojiSuggestion(emojiSuggestions.value[emojiSelectedIndex.value]);
  } else if (e.key === 'Escape') {
    emojiSuggestions.value = [];
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
            :class="{ 'large-emoji': isEmojiOnlyMessage(index) }"
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
          <div v-if="getMessageYouTubeUrls(index).length > 0" class="message-videos">
            <div v-for="ytUrl in getMessageYouTubeUrls(index)" :key="ytUrl" class="video-container">
              <iframe
                v-if="getYouTubeVideoId(ytUrl)"
                :src="`https://www.youtube.com/embed/${getYouTubeVideoId(ytUrl)}`"
                frameborder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen
                class="embedded-video"
              ></iframe>
              <span v-else class="video-fallback">{{ ytUrl }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="input-bar" style="position: relative;">
      <div v-if="emojiSuggestions.length > 0" class="emoji-picker">
        <div
          v-for="(item, i) in emojiSuggestions"
          :key="item.name"
          class="emoji-item"
          :class="{ active: i === emojiSelectedIndex }"
          @mousedown.prevent="selectEmojiSuggestion(item)"
        >
          <span class="emoji-char">{{ item.emoji }}</span>
          <span class="emoji-name">:{{ item.name }}:</span>
        </div>
      </div>
      <input
        ref="chatInputEl"
        v-model="chatInput"
        type="text"
        id="chat-msg"
        placeholder="READY TO TRANSMIT..."
        :disabled="!isConnected"
        @input="convertEmojisInInput"
        @keydown="handleInputKeydown"
        @blur="emit('typing', false)"
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

.large-emoji {
  font-size: 2.5em;
  line-height: 1.3;
  display: block;
  margin-top: 2px;
}

.cursor {
  animation: blink 1s step-end infinite;
  margin-left: 2px;
  vertical-align: text-bottom;
  font-size: 0.8em;
}

.emoji-picker {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  background: #0a0a0a;
  border: 1px solid var(--neon-green);
  border-bottom: none;
  max-height: 220px;
  overflow-y: auto;
  z-index: 100;
  scrollbar-width: thin;
}

.emoji-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 14px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-white);
  transition: background 0.1s;
}

.emoji-item:hover,
.emoji-item.active {
  background: rgba(57, 255, 20, 0.12);
  color: var(--neon-green);
}

.emoji-char {
  font-size: 18px;
  line-height: 1;
}

.emoji-name {
  font-family: monospace;
  font-size: 13px;
  opacity: 0.7;
}

.message-images {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.message-videos {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.video-container {
  position: relative;
  max-width: 400px;
  width: 100%;
}

.embedded-video {
  width: 100%;
  min-width: 250px;
  max-width: 400px;
  height: 225px;
  border: 1px solid var(--dim-green);
  border-radius: 4px;
  background: #000;
}

.video-fallback {
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
