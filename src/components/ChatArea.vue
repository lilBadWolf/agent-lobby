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
          <div v-if="getMessageYouTubeEmbeds(index).length > 0" class="message-videos">
            <div
              v-for="(embed, embedIndex) in getMessageYouTubeEmbeds(index)"
              :key="`${embed.url}-${embedIndex}`"
              class="video-container"
            >
              <details
                v-if="embed.videoId"
                class="video-expandable"
                @toggle="handleYouTubeEmbedToggle(getEmbedKey(index, embed.url, embedIndex), $event)"
              >
                <summary class="video-header">
                  <span class="video-header-title">{{ getYouTubeEmbedHeader(embed.url) }}</span>
                  <span class="video-header-control" aria-hidden="true">
                    <span class="video-control-show">SHOW</span>
                    <span class="video-control-hide">HIDE</span>
                    <span class="video-control-indicator"></span>
                  </span>
                </summary>
                <div
                  class="video-player-shell"
                  :ref="(el) => registerYouTubeShell(getEmbedKey(index, embed.url, embedIndex), el)"
                  @mousemove="handleFullscreenPointerActivity(getEmbedKey(index, embed.url, embedIndex))"
                >
                  <button
                    v-if="isYouTubeFullscreen(getEmbedKey(index, embed.url, embedIndex))"
                    class="video-fullscreen-exit"
                    :class="{ hidden: !isFullscreenOverlayVisible(getEmbedKey(index, embed.url, embedIndex)) }"
                    type="button"
                    @click="exitYouTubeFullscreen(getEmbedKey(index, embed.url, embedIndex))"
                    aria-label="Exit fullscreen"
                    title="Exit fullscreen"
                  >
                    EXIT FULLSCREEN
                  </button>
                  <div class="youtube-player-host">
                    <div
                      class="youtube-player-mount"
                      :ref="(el) => registerYouTubeContainer(getEmbedKey(index, embed.url, embedIndex), el)"
                    ></div>
                  </div>
                  <div class="video-custom-controls">
                    <button
                      class="video-control-btn"
                      type="button"
                      :disabled="!getPlayerState(getEmbedKey(index, embed.url, embedIndex)).ready"
                      @click="toggleYouTubePlayback(getEmbedKey(index, embed.url, embedIndex))"
                    >
                      {{ getPlayerState(getEmbedKey(index, embed.url, embedIndex)).isPlaying ? 'PAUSE' : 'PLAY' }}
                    </button>
                    <span class="video-timecode">
                      {{ formatYouTubeTime(getPlayerState(getEmbedKey(index, embed.url, embedIndex)).currentTime) }}
                      /
                      {{ formatYouTubeTime(getPlayerState(getEmbedKey(index, embed.url, embedIndex)).duration) }}
                    </span>
                    <input
                      class="video-range video-progress"
                      type="range"
                      min="0"
                      :max="Math.max(1, getPlayerState(getEmbedKey(index, embed.url, embedIndex)).duration)"
                      :value="getPlayerState(getEmbedKey(index, embed.url, embedIndex)).currentTime"
                      :disabled="!getPlayerState(getEmbedKey(index, embed.url, embedIndex)).ready"
                      @input="seekYouTubePlayer(getEmbedKey(index, embed.url, embedIndex), $event)"
                    />
                    <label class="video-volume-wrap">
                      <span>VOL</span>
                      <input
                        class="video-range video-volume"
                        type="range"
                        min="0"
                        max="100"
                        :value="getPlayerState(getEmbedKey(index, embed.url, embedIndex)).volume"
                        :disabled="!getPlayerState(getEmbedKey(index, embed.url, embedIndex)).ready"
                        @input="setYouTubeVolume(getEmbedKey(index, embed.url, embedIndex), $event)"
                      />
                    </label>
                    <button
                      class="video-control-btn"
                      type="button"
                      :disabled="!getPlayerState(getEmbedKey(index, embed.url, embedIndex)).ready"
                      @click="toggleYouTubeFullscreen(getEmbedKey(index, embed.url, embedIndex))"
                    >
                      {{ isYouTubeFullscreen(getEmbedKey(index, embed.url, embedIndex)) ? 'EXIT' : 'FULL' }}
                    </button>
                  </div>
                </div>
              </details>
              <span v-else class="video-fallback">{{ embed.url }}</span>
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

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { ComponentPublicInstance } from 'vue';
import type { ChatMessage } from '../types/chat';
import { useTheme } from '../composables/useTheme';
import { useImageDetection } from '../composables/useImageDetection';
import * as nodeEmoji from 'node-emoji';

type YouTubePlayerState = {
  ready: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
};

type YouTubePlayerLike = {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setVolume: (volume: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getVolume: () => number;
  getPlayerState: () => number;
  destroy: () => void;
};

type YouTubeApiLike = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: () => void;
        onStateChange?: (event: { data: number }) => void;
      };
    }
  ) => YouTubePlayerLike;
  PlayerState: {
    PLAYING: number;
  };
};

type FullscreenElementWithLegacy = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
  msRequestFullscreen?: () => Promise<void> | void;
};

type DocumentWithLegacyFullscreen = Document & {
  webkitExitFullscreen?: () => Promise<void> | void;
  msExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenElement?: Element | null;
  msFullscreenElement?: Element | null;
};

declare global {
  interface Window {
    YT?: YouTubeApiLike;
    onYouTubeIframeAPIReady?: () => void;
  }
}

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
const youtubeTitleCache = ref<Record<string, string>>({});
const youtubeTitleRequests = new Set<string>();
const youtubePlayers = new Map<string, YouTubePlayerLike>();
const youtubeContainers = new Map<string, HTMLElement>();
const youtubeShells = new Map<string, HTMLElement>();
const youtubePlayerStates = ref<Record<string, YouTubePlayerState>>({});
let youtubeApiPromise: Promise<YouTubeApiLike> | null = null;
let youtubeSyncInterval: ReturnType<typeof setInterval> | null = null;
const fullscreenChangeTick = ref(0);
const fullscreenOverlayVisible = ref<Record<string, boolean>>({});
const fullscreenOverlayHideTimers = new Map<string, ReturnType<typeof setTimeout>>();
const emojiSuggestions = ref<{ name: string; emoji: string }[]>([]);
const emojiSelectedIndex = ref(0);
const chatInputEl = ref<HTMLInputElement>();
const TYPING_SPEED = 30; // ms per character
const FULLSCREEN_OVERLAY_HIDE_DELAY = 2000;

function createDefaultPlayerState(): YouTubePlayerState {
  return {
    ready: false,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 70,
  };
}

function getEmbedKey(messageIndex: number, embedUrl: string, embedIndex: number): string {
  return `${messageIndex}:${embedIndex}:${embedUrl}`;
}

function getPlayerState(key: string): YouTubePlayerState {
  return youtubePlayerStates.value[key] ?? createDefaultPlayerState();
}

function patchPlayerState(key: string, patch: Partial<YouTubePlayerState>) {
  youtubePlayerStates.value[key] = {
    ...getPlayerState(key),
    ...patch,
  };
}

function registerYouTubeContainer(key: string, element: Element | ComponentPublicInstance | null) {
  const candidate = element && '$el' in element ? element.$el : element;
  if (candidate instanceof HTMLElement) {
    youtubeContainers.set(key, candidate);
  } else {
    youtubeContainers.delete(key);
  }
}

function registerYouTubeShell(key: string, element: Element | ComponentPublicInstance | null) {
  const candidate = element && '$el' in element ? element.$el : element;
  if (candidate instanceof HTMLElement) {
    youtubeShells.set(key, candidate);
  } else {
    youtubeShells.delete(key);
  }
}

function getAllYouTubeEmbeds(): Array<{ key: string; videoId: string }> {
  const embeds: Array<{ key: string; videoId: string }> = [];
  props.messages.forEach((message, messageIndex) => {
    const msgEmbeds = extractYouTubeUrls(message.message)
      .map((url, embedIndex) => ({
        key: getEmbedKey(messageIndex, url, embedIndex),
        videoId: getYouTubeVideoId(url),
      }))
      .filter((item): item is { key: string; videoId: string } => Boolean(item.videoId));
    embeds.push(...msgEmbeds);
  });
  return embeds;
}

async function ensureYouTubeApi(): Promise<YouTubeApiLike> {
  if (window.YT?.Player) {
    return window.YT;
  }
  if (youtubeApiPromise) {
    return youtubeApiPromise;
  }

  youtubeApiPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById('youtube-iframe-api') as HTMLScriptElement | null;
    const script = existingScript ?? document.createElement('script');

    if (!existingScript) {
      script.id = 'youtube-iframe-api';
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => reject(new Error('Failed to load YouTube IFrame API'));
      document.head.appendChild(script);
    }

    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      if (window.YT?.Player) {
        resolve(window.YT);
      }
    };
  });

  return youtubeApiPromise;
}

function syncYouTubePlayerStates() {
  youtubePlayers.forEach((player, key) => {
    const current = Number(player.getCurrentTime()) || 0;
    const duration = Number(player.getDuration()) || 0;
    const volume = Number(player.getVolume()) || 0;
    patchPlayerState(key, {
      currentTime: current,
      duration,
      volume,
      isPlaying: player.getPlayerState() === window.YT?.PlayerState.PLAYING,
    });
  });
}

function startYouTubeSync() {
  if (youtubeSyncInterval) {
    return;
  }
  youtubeSyncInterval = setInterval(syncYouTubePlayerStates, 350);
}

function stopYouTubeSync() {
  if (youtubeSyncInterval) {
    clearInterval(youtubeSyncInterval);
    youtubeSyncInterval = null;
  }
}

async function initializeYouTubePlayers() {
  await nextTick();
  if (youtubeContainers.size === 0) {
    return;
  }

  const api = await ensureYouTubeApi();
  const activeEmbeds = getAllYouTubeEmbeds();
  const activeKeys = new Set(activeEmbeds.map((embed) => embed.key));

  youtubePlayers.forEach((player, key) => {
    if (!activeKeys.has(key)) {
      player.destroy();
      youtubePlayers.delete(key);
      const { [key]: _removed, ...rest } = youtubePlayerStates.value;
      youtubePlayerStates.value = rest;
    }
  });

  activeEmbeds.forEach(({ key, videoId }) => {
    if (youtubePlayers.has(key)) {
      return;
    }

    const container = youtubeContainers.get(key);
    if (!container) {
      return;
    }

    const player = new api.Player(container, {
      videoId,
      playerVars: {
        controls: 0,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
      },
      events: {
        onReady: () => {
          patchPlayerState(key, {
            ready: true,
            duration: Number(player.getDuration()) || 0,
            volume: Number(player.getVolume()) || 70,
          });
        },
        onStateChange: (event) => {
          patchPlayerState(key, {
            isPlaying: event.data === api.PlayerState.PLAYING,
          });
        },
      },
    });

    youtubePlayers.set(key, player);
    patchPlayerState(key, createDefaultPlayerState());
  });

  if (youtubePlayers.size > 0) {
    startYouTubeSync();
  } else {
    stopYouTubeSync();
  }
}

function destroyAllYouTubePlayers() {
  youtubePlayers.forEach((player) => player.destroy());
  youtubePlayers.clear();
  youtubeContainers.clear();
  youtubeShells.clear();
  youtubePlayerStates.value = {};
  fullscreenOverlayVisible.value = {};
  fullscreenOverlayHideTimers.forEach((timerId) => clearTimeout(timerId));
  fullscreenOverlayHideTimers.clear();
  stopYouTubeSync();
}

function toggleYouTubePlayback(key: string) {
  const player = youtubePlayers.get(key);
  if (!player) return;

  if (getPlayerState(key).isPlaying) {
    player.pauseVideo();
  } else {
    player.playVideo();
  }
}

function handleYouTubeEmbedToggle(key: string, event: Event) {
  const details = event.target as HTMLDetailsElement;
  if (details.open) {
    return;
  }

  const player = youtubePlayers.get(key);
  if (!player) return;

  player.pauseVideo();
  patchPlayerState(key, { isPlaying: false });
}

function seekYouTubePlayer(key: string, event: Event) {
  const player = youtubePlayers.get(key);
  if (!player) return;

  const target = event.target as HTMLInputElement;
  const value = Number(target.value) || 0;
  player.seekTo(value, true);
  patchPlayerState(key, { currentTime: value });
}

function setYouTubeVolume(key: string, event: Event) {
  const player = youtubePlayers.get(key);
  if (!player) return;

  const target = event.target as HTMLInputElement;
  const value = Math.max(0, Math.min(100, Number(target.value) || 0));
  player.setVolume(value);
  patchPlayerState(key, { volume: value });
}

function getCurrentFullscreenElement(): Element | null {
  const doc = document as DocumentWithLegacyFullscreen;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? doc.msFullscreenElement ?? null;
}

function clearFullscreenOverlayHideTimer(key: string) {
  const timerId = fullscreenOverlayHideTimers.get(key);
  if (timerId) {
    clearTimeout(timerId);
    fullscreenOverlayHideTimers.delete(key);
  }
}

function setFullscreenOverlayVisible(key: string, visible: boolean) {
  fullscreenOverlayVisible.value = {
    ...fullscreenOverlayVisible.value,
    [key]: visible,
  };
}

function scheduleFullscreenOverlayHide(key: string) {
  clearFullscreenOverlayHideTimer(key);
  const timerId = setTimeout(() => {
    if (isYouTubeFullscreen(key)) {
      setFullscreenOverlayVisible(key, false);
    }
    fullscreenOverlayHideTimers.delete(key);
  }, FULLSCREEN_OVERLAY_HIDE_DELAY);
  fullscreenOverlayHideTimers.set(key, timerId);
}

function showFullscreenOverlayTemporarily(key: string) {
  setFullscreenOverlayVisible(key, true);
  scheduleFullscreenOverlayHide(key);
}

function isFullscreenOverlayVisible(key: string): boolean {
  return fullscreenOverlayVisible.value[key] ?? true;
}

async function exitDocumentFullscreen(): Promise<void> {
  const doc = document as DocumentWithLegacyFullscreen;
  if (doc.exitFullscreen) {
    await doc.exitFullscreen();
  } else if (doc.webkitExitFullscreen) {
    await doc.webkitExitFullscreen();
  } else if (doc.msExitFullscreen) {
    await doc.msExitFullscreen();
  }
}

async function toggleYouTubeFullscreen(key: string) {
  const shell = youtubeShells.get(key);
  if (!shell) return;

  try {
    const currentFullscreenEl = getCurrentFullscreenElement();
    if (currentFullscreenEl === shell) {
      await exitDocumentFullscreen();
      return;
    }

    const fsShell = shell as FullscreenElementWithLegacy;
    if (fsShell.requestFullscreen) {
      await fsShell.requestFullscreen();
    } else if (fsShell.webkitRequestFullscreen) {
      await fsShell.webkitRequestFullscreen();
    } else if (fsShell.msRequestFullscreen) {
      await fsShell.msRequestFullscreen();
    }
  } catch {
    // Ignore fullscreen API failures on unsupported platforms.
  }
}

async function exitYouTubeFullscreen(key: string) {
  const shell = youtubeShells.get(key);
  if (!shell) return;

  try {
    if (getCurrentFullscreenElement() === shell) {
      await exitDocumentFullscreen();
    }
  } catch {
    // Ignore fullscreen API failures on unsupported platforms.
  }
}

function handleFullscreenPointerActivity(key: string) {
  if (!isYouTubeFullscreen(key)) {
    return;
  }
  showFullscreenOverlayTemporarily(key);
}

function getYouTubeEmbedKeyByShell(shell: Element | null): string | null {
  if (!shell) return null;
  for (const [key, entryShell] of youtubeShells.entries()) {
    if (entryShell === shell) {
      return key;
    }
  }
  return null;
}

function isYouTubeFullscreen(key: string): boolean {
  // Touch this ref so computed checks react to fullscreenchange events.
  fullscreenChangeTick.value;
  const shell = youtubeShells.get(key);
  const currentFullscreenEl = getCurrentFullscreenElement();
  if (!shell || !currentFullscreenEl) return false;
  return currentFullscreenEl === shell;
}

function formatYouTubeTime(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remSeconds = totalSeconds % 60;
  return `${minutes}:${remSeconds.toString().padStart(2, '0')}`;
}

function getYouTubeEmbedHeader(url: string): string {
  return youtubeTitleCache.value[url] || url;
}

async function ensureYouTubeTitle(url: string): Promise<void> {
  if (youtubeTitleCache.value[url] || youtubeTitleRequests.has(url)) {
    return;
  }

  youtubeTitleRequests.add(url);

  try {
    const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const response = await fetch(endpoint);

    if (!response.ok) {
      return;
    }

    const data = await response.json() as { title?: unknown };
    if (typeof data.title === 'string' && data.title.trim()) {
      youtubeTitleCache.value[url] = data.title.trim();
    }
  } catch {
    // Ignore network and CORS failures; header falls back to URL.
  } finally {
    youtubeTitleRequests.delete(url);
  }
}

// Process images when messages change
watch(
  () => props.messages.length,
  () => {
    props.messages.forEach((msg) => {
      const imageUris = extractImageUris(msg.message);
      imageUris.forEach(uri => initializeImage(uri));

      const ytUris = extractYouTubeUrls(msg.message);
      ytUris.forEach(uri => {
        if (getYouTubeVideoId(uri)) {
          void ensureYouTubeTitle(uri);
        }
      });
    });

    void initializeYouTubePlayers();
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

function getMessageYouTubeEmbeds(messageIndex: number): Array<{ url: string; videoId: string | null }> {
  return getMessageYouTubeUrls(messageIndex).map(url => ({
    url,
    videoId: getYouTubeVideoId(url),
  }));
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

function dismissKeyboardIfTouchInput() {
  if (!window.matchMedia('(pointer: coarse)').matches) {
    return;
  }

  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
    activeElement.blur();
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
    if (e.key === 'Enter') {
      sendMessage();
      dismissKeyboardIfTouchInput();
    }
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

function handleFullscreenChange() {
  fullscreenChangeTick.value += 1;
  const fullscreenElement = getCurrentFullscreenElement();

  if (!fullscreenElement) {
    fullscreenOverlayHideTimers.forEach((timerId) => clearTimeout(timerId));
    fullscreenOverlayHideTimers.clear();
    return;
  }

  const fullscreenKey = getYouTubeEmbedKeyByShell(fullscreenElement);
  if (fullscreenKey) {
    showFullscreenOverlayTemporarily(fullscreenKey);
  }
}

onMounted(() => {
  document.addEventListener('fullscreenchange', handleFullscreenChange);
});

onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', handleFullscreenChange);
  destroyAllYouTubePlayers();
});
</script>

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

.video-expandable {
  border: 1px solid var(--dim-green);
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.35);
  overflow: hidden;
}

.video-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  cursor: pointer;
  color: var(--text-white);
  font-size: 12px;
  line-height: 1.2;
  user-select: none;
  border-bottom: 1px solid transparent;
}

.video-expandable[open] .video-header {
  border-bottom-color: var(--dim-green);
}

.video-header::-webkit-details-marker {
  color: var(--neon-green);
}

.video-header-title {
  color: var(--text-white);
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.video-header-control {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  color: var(--system-dim);
  font-size: 11px;
  letter-spacing: 0.3px;
}

.video-header:hover .video-header-control {
  color: var(--neon-green);
}

.video-expandable[open] .video-header-control {
  color: var(--neon-green);
}

.video-control-indicator {
  font-size: 13px;
  line-height: 1;
  font-weight: 700;
  width: 12px;
  text-align: center;
}

.video-control-indicator::before {
  content: "⤵";
}

.video-control-show,
.video-control-hide {
  font-weight: 700;
}

.video-control-hide {
  display: none;
}

.video-expandable[open] .video-control-indicator::before {
  content: "⤴";
}

.video-expandable[open] .video-control-show {
  display: none;
}

.video-expandable[open] .video-control-hide {
  display: inline;
}

.embedded-video {
  width: 100%;
  max-width: 100%;
  aspect-ratio: 16 / 9;
  height: auto;
  border: 1px solid var(--dim-green);
  border-radius: 4px;
  background: #000;
}

.video-player-shell {
  position: relative;
  width: 100%;
  max-width: 100%;
  border: 1px solid var(--dim-green);
  border-top: none;
  border-radius: 0 0 4px 4px;
  background: rgba(0, 0, 0, 0.45);
  overflow: hidden;
}

.youtube-player-host {
  position: relative;
  width: 100%;
  max-width: 100%;
  height: 0;
  padding-top: 56.25%;
  border-bottom: 1px solid var(--dim-green);
  background: #000;
  overflow: hidden;
}

.youtube-player-mount {
  position: absolute;
  inset: 0;
}

.youtube-player-host :deep(iframe) {
  position: absolute;
  inset: 0;
  width: 100% !important;
  height: 100% !important;
  max-width: 100% !important;
  display: block;
  border: 0;
}

.video-fullscreen-exit {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 3;
  border: 1px solid var(--neon-green);
  background: rgba(0, 0, 0, 0.72);
  color: var(--neon-green);
  font-family: inherit;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.4px;
  padding: 5px 10px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, opacity 0.2s;
}

.video-fullscreen-exit:hover {
  background: var(--neon-green);
  color: #000;
}

.video-fullscreen-exit.hidden {
  opacity: 0;
  pointer-events: none;
}

.video-custom-controls {
  display: grid;
  grid-template-columns: auto auto 1fr auto auto;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  color: var(--text-white);
  font-size: 11px;
}

.video-control-btn {
  border: 1px solid var(--neon-green);
  background: transparent;
  color: var(--neon-green);
  font-family: inherit;
  font-size: 11px;
  letter-spacing: 0.5px;
  font-weight: 700;
  padding: 4px 8px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, opacity 0.15s;
}

.video-control-btn:hover:not(:disabled) {
  background: var(--neon-green);
  color: #000;
}

.video-control-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.video-timecode {
  color: var(--system-dim);
  min-width: 76px;
  text-align: right;
  font-family: monospace;
}

.video-range {
  accent-color: var(--neon-green);
}

.video-progress {
  width: 100%;
}

.video-volume-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--system-dim);
  font-weight: 700;
}

.video-volume {
  width: 82px;
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
    font-size: 16px;
    padding: 0 10px;
    margin-top: 0;
  }

  .send-btn {
    padding: 0 15px;
    font-size: 12px;
    align-items: center;
    padding-top: 0;
  }

  .input-bar {
    height: 56px;
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }

  .video-custom-controls {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .video-timecode {
    text-align: left;
    min-width: 0;
  }

  .video-volume-wrap {
    justify-content: space-between;
  }

  .video-volume {
    width: 120px;
  }
}
</style>
