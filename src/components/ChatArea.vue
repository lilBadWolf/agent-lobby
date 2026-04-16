<template>
  <section id="chat-area" ref="chatAreaEl">
    <div v-if="pinnedYouTubeEmbed && !props.pinnedVideoDetached" class="pinned-video-panel">
      <div class="pinned-video-header">
        <span class="pinned-video-title">{{ getYouTubeEmbedHeader(pinnedYouTubeEmbed.url) }}</span>
        <div class="pinned-video-actions">
          <button class="video-control-btn pinned-video-nav-btn" type="button" aria-label="Previous video" @click="goToPreviousPinnedVideo">
            &lt;
          </button>
          <button class="video-control-btn pinned-video-nav-btn" type="button" aria-label="Next video" @click="goToNextPinnedVideo">
            &gt;
          </button>
          <button class="video-control-btn" type="button" @click="emit('togglePinnedVideoPopup')">
            {{ props.pinnedVideoDetached ? 'REPIN' : 'POP OUT' }}
          </button>
          <button class="video-control-btn" type="button" @click="unpinPinnedEmbed">
            UNPIN
          </button>
        </div>
      </div>
      <div
        class="video-player-shell pinned-video-shell"
        :style="{
          height: `${pinnedVideoHeight}px`,
          '--pinned-video-height': `${pinnedVideoHeight}px`,
          '--pinned-control-scale': pinnedControlScale.toString(),
        }"
        :ref="(el) => registerYouTubeShell(PINNED_YOUTUBE_KEY, el)"
        @mousemove="handleFullscreenPointerActivity(PINNED_YOUTUBE_KEY)"
      >
        <button
          v-if="isYouTubeFullscreen(PINNED_YOUTUBE_KEY)"
          class="video-fullscreen-exit"
          :class="{ hidden: !isFullscreenOverlayVisible(PINNED_YOUTUBE_KEY) }"
          type="button"
          @click="exitYouTubeFullscreen(PINNED_YOUTUBE_KEY)"
          aria-label="Exit fullscreen"
          title="Exit fullscreen"
        >
          EXIT FULLSCREEN
        </button>
        <div class="youtube-player-host">
          <div
            class="youtube-player-mount"
            :ref="(el) => registerYouTubeContainer(PINNED_YOUTUBE_KEY, el)"
          ></div>
        </div>
        <div class="video-custom-controls">
          <button
            class="video-control-btn"
            type="button"
            :disabled="!getPlayerState(PINNED_YOUTUBE_KEY).ready"
            @click="toggleYouTubePlayback(PINNED_YOUTUBE_KEY)"
          >
            {{ getPlayerState(PINNED_YOUTUBE_KEY).isPlaying ? 'PAUSE' : 'PLAY' }}
          </button>
          <span class="video-timecode">
            {{ formatYouTubeTime(getPlayerState(PINNED_YOUTUBE_KEY).currentTime) }}
            /
            {{ formatYouTubeTime(getPlayerState(PINNED_YOUTUBE_KEY).duration) }}
          </span>
          <input
            class="video-range video-progress"
            type="range"
            min="0"
            :max="Math.max(1, getPlayerState(PINNED_YOUTUBE_KEY).duration)"
            :value="getPlayerState(PINNED_YOUTUBE_KEY).currentTime"
            :disabled="!getPlayerState(PINNED_YOUTUBE_KEY).ready"
            @input="seekYouTubePlayer(PINNED_YOUTUBE_KEY, $event)"
          />
          <label class="video-volume-wrap">
            <span>VOL</span>
            <input
              class="video-range video-volume"
              type="range"
              min="0"
              max="100"
              :value="getPlayerState(PINNED_YOUTUBE_KEY).volume"
              :disabled="!getPlayerState(PINNED_YOUTUBE_KEY).ready"
              @input="setYouTubeVolume(PINNED_YOUTUBE_KEY, $event)"
            />
          </label>
          <button
            class="video-control-btn"
            type="button"
            :disabled="!getPlayerState(PINNED_YOUTUBE_KEY).ready"
            @click="toggleYouTubeFullscreen(PINNED_YOUTUBE_KEY)"
          >
            {{ isYouTubeFullscreen(PINNED_YOUTUBE_KEY) ? 'EXIT' : 'FULL' }}
          </button>
        </div>
      </div>
    </div>
    <div v-else-if="pinnedTwitchEmbed && !props.pinnedVideoDetached" class="pinned-video-panel">
      <div class="pinned-video-header">
        <span class="pinned-video-title">{{ getTwitchEmbedHeader(pinnedTwitchEmbed.url) }}</span>
        <div class="pinned-video-actions">
          <button class="video-control-btn pinned-video-nav-btn" type="button" aria-label="Previous video" @click="goToPreviousPinnedVideo">&lt;</button>
          <button class="video-control-btn pinned-video-nav-btn" type="button" aria-label="Next video" @click="goToNextPinnedVideo">&gt;</button>
          <button class="video-control-btn" type="button" @click="emit('togglePinnedVideoPopup')">
            {{ props.pinnedVideoDetached ? 'REPIN' : 'POP OUT' }}
          </button>
          <button class="video-control-btn" type="button" @click="unpinPinnedEmbed">UNPIN</button>
        </div>
      </div>
      <div class="video-player-shell pinned-video-shell"
        :style="{
          height: `${pinnedVideoHeight}px`,
          '--pinned-video-height': `${pinnedVideoHeight}px`,
          '--pinned-control-scale': pinnedControlScale.toString(),
        }"
      >
        <iframe
          class="pinned-video-frame"
          :key="pinnedTwitchEmbed.channel"
          :src="getTwitchEmbedSrc(pinnedTwitchEmbed.channel)"
          sandbox="allow-scripts allow-same-origin allow-presentation"
          allow="autoplay; fullscreen; picture-in-picture"
          allowfullscreen
          referrerpolicy="strict-origin"
        ></iframe>
      </div>
    </div>
    <div v-else-if="props.agentAmpPinnedVideo && !props.pinnedVideoDetached" class="pinned-video-panel">
      <div class="pinned-video-header">
        <span class="pinned-video-title">{{ props.agentAmpPinnedVideo.title }}</span>
        <div class="pinned-video-actions">
          <button
            class="video-control-btn"
            type="button"
            @click="emit('togglePinnedVideoPopup')"
            :aria-label="props.pinnedVideoDetached ? 'Repin pinned video' : 'Pop out pinned video'"
          >
            {{ props.pinnedVideoDetached ? 'REPIN' : 'POP OUT' }}
          </button>
        </div>
      </div>
      <div
        class="video-player-shell pinned-video-shell"
        :style="{
          height: `${pinnedVideoHeight}px`,
          '--pinned-video-height': `${pinnedVideoHeight}px`,
          '--pinned-control-scale': pinnedControlScale.toString(),
        }"
      >
        <video
          ref="pinnedVideoElement"
          class="pinned-video-frame"
          :key="props.agentAmpPinnedVideo.sourceKey"
          :src="props.agentAmpPinnedVideo.src"
          muted
          playsinline
          autoplay
          preload="metadata"
          @loadedmetadata="syncPinnedVideoElementFromState"
        ></video>
      </div>
    </div>
    <div
      v-if="hasPinnedVideo"
      class="pinned-video-divider"
      role="separator"
      aria-label="Resize pinned video"
      aria-orientation="horizontal"
      @mousedown.prevent="startPinnedResize"
    >
      <span class="pinned-video-divider-grip" aria-hidden="true"></span>
    </div>
    <div v-if="isConnected" class="lobby-tabs-wrap">
      <div class="lobby-tabs" role="tablist" aria-label="Lobby tabs">
        <button
          v-for="lobby in lobbyTabs"
          :key="lobby.id"
          class="lobby-tab"
          :class="{
            active: lobby.id === activeLobbyId,
            'has-unread': lobby.unreadCount > 0 && lobby.id !== activeLobbyId,
          }"
          role="tab"
          :aria-selected="lobby.id === activeLobbyId"
          @click="emit('switchLobby', lobby.id)"
        >
          <span class="lobby-label">#{{ lobby.label }}</span>
          <span v-if="lobby.unreadCount > 0 && lobby.id !== activeLobbyId" class="tab-unread">
            {{ lobby.unreadCount }}
          </span>
          <span
            v-if="!lobby.isDefault"
            class="tab-close"
            role="button"
            aria-label="Close lobby"
            title="Close lobby"
            @click.stop="emit('closeLobby', lobby.id)"
          >
            ×
          </span>
        </button>
      </div>
      <div class="lobby-actions">
        <button class="lobby-join-toggle" type="button" @click="toggleJoinLobbyInput">
          + JOIN
        </button>
      </div>
    </div>
    <div v-if="isConnected && showJoinLobbyInput" class="lobby-join-bar">
      <input
        ref="joinLobbyInputEl"
        v-model="joinLobbyInput"
        class="lobby-join-input"
        type="text"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        maxlength="32"
        placeholder="JOIN LOBBY ID"
        @keydown.enter.prevent="submitJoinLobby"
        @keydown.esc.prevent="cancelJoinLobby"
      />
      <button class="lobby-join-confirm" type="button" @click="submitJoinLobby">CONNECT</button>
      <button class="lobby-join-cancel" type="button" @click="cancelJoinLobby">CANCEL</button>
    </div>
    <div ref="messagesContainer" id="messages">
      <div v-for="(msg, index) in messages" :key="index">
        <div v-if="msg.isSystem" class="system-msg">
          <span class="text">[{{ getDisplayedText(index) }}<span v-if="isTyping(index)" class="cursor">█</span>]</span>
        </div>
        <div v-else :class="['msg', { 'self-msg': msg.user === username }]">
          <div v-if="getSenderAvatarUrl(msg.user)" class="sender-avatar-wrap">
            <div
              v-if="getSenderAvatarPackStyle(msg.user)"
              class="sender-avatar-sprite"
              :style="getSenderAvatarPackStyle(msg.user)"
              aria-hidden="true"
            />
            <img
              v-else
              :src="getSenderAvatarUrl(msg.user)"
              alt=""
              class="sender-avatar"
            />
          </div>
          <div class="message-body">
            <span class="sender" :style="{ color: getUserColor(msg.user) }">{{ msg.user }}:</span>
            <span
              class="text"
              :class="{ 'large-emoji': isEmojiOnlyMessage(index) }"
              :style="{ color: msg.user === username ? 'var(--color-accent)' : 'var(--color-text-primary)' }"
            >
              <template v-for="(part, partIndex) in getDisplayedParts(index)" :key="`${index}-${partIndex}`">
                <span v-if="part.type === 'mention'" class="mention-highlight">{{ part.text }}</span>
                <a
                  v-else-if="part.type === 'link'"
                  class="chat-link"
                  :href="part.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  @click.prevent="openExternalLink(part.url)"
                >
                  {{ getExternalLinkLabel(part) }}
                </a>
                <span v-else>{{ part.text }}</span>
              </template>
              <span v-if="isTyping(index)" class="cursor">█</span>
            </span>
          </div>
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
                :class="{ 'is-pinned-in-feed': isYouTubeEmbedPinned(index, embed.url, embedIndex) }"
                :ref="(el) => registerYouTubeDetails(getEmbedKey(index, embed.url, embedIndex), el)"
                @toggle="handleYouTubeEmbedToggle(getEmbedKey(index, embed.url, embedIndex), $event)"
              >
                <summary class="video-header">
                  <span class="video-header-title">{{ getYouTubeEmbedHeader(embed.url) }}</span>
                  <span class="video-header-control" aria-hidden="true">
                    <button
                      class="video-pin-btn"
                      type="button"
                      :aria-pressed="isYouTubeEmbedPinned(index, embed.url, embedIndex)"
                      @click.stop="togglePinYouTubeEmbed(index, embed.url, embedIndex, $event)"
                    >
                      {{ isYouTubeEmbedPinned(index, embed.url, embedIndex) ? 'UNPIN' : 'PIN' }}
                    </button>
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
          <div v-if="getMessageTwitchEmbeds(index).length > 0" class="message-videos">
            <div
              v-for="(embed, embedIndex) in getMessageTwitchEmbeds(index)"
              :key="`${embed.url}-${embedIndex}`"
              class="video-container"
            >
              <details
                v-if="embed.channel"
                class="video-expandable"
                :class="{ 'is-pinned-in-feed': isTwitchEmbedPinned(index, embed.url, embedIndex) }"
              >
                <summary class="video-header">
                  <span class="video-header-title">{{ getTwitchEmbedHeader(embed.url) }}</span>
                  <span class="video-header-control" aria-hidden="true">
                    <button
                      class="video-pin-btn"
                      type="button"
                      :aria-pressed="isTwitchEmbedPinned(index, embed.url, embedIndex)"
                      @click.stop="togglePinTwitchEmbed(index, embed.url, embedIndex, $event)"
                    >
                      {{ isTwitchEmbedPinned(index, embed.url, embedIndex) ? 'UNPIN' : 'PIN' }}
                    </button>
                    <span class="video-control-show">SHOW</span>
                    <span class="video-control-hide">HIDE</span>
                    <span class="video-control-indicator"></span>
                  </span>
                </summary>
                <div class="video-player-shell">
                  <div class="twitch-player-host">
                    <iframe
                      class="twitch-player-frame"
                      :src="getTwitchEmbedSrc(embed.channel)"
                      allow="autoplay; fullscreen; picture-in-picture"
                      scrolling="no"
                    ></iframe>
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
      <div v-if="mentionSuggestions.length > 0" class="emoji-picker">
        <div
          v-for="(item, i) in mentionSuggestions"
          :key="item"
          class="emoji-item"
          :class="{ active: i === mentionSelectedIndex }"
          @mousedown.prevent="selectMentionSuggestion(item)"
        >
          <span class="emoji-char">@</span>
          <span class="emoji-name">{{ item }}</span>
        </div>
      </div>
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
        name="chat-message"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        data-form-type="other"
        data-lpignore="true"
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { ComponentPublicInstance } from 'vue';
import type { ActiveMedia, ChatMessage, UserPresence } from '../types/chat';
import { useTheme } from '../composables/useTheme';
import { useImageDetection } from '../composables/useImageDetection';
import { getPersistedValue, removePersistedValue, setPersistedValue } from '../composables/usePlatformStorage';
import { parseAvatarUrl, getAvatarObjectPosition } from '../composables/useAvatarPacks';
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

type AgentAmpPinnedVideo = {
  sourceKey: string;
  title: string;
  src: string;
  playing: boolean;
  currentTime: number;
  duration: number;
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

type TauriOpenerModule = typeof import('@tauri-apps/plugin-opener');

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
  users: Record<string, UserPresence>;
  enableAvatars?: boolean;
  lobbyTabs?: Array<{ id: string; label: string; unreadCount: number; isDefault?: boolean }>;
  activeLobbyId?: string;
  defaultLobbyId?: string;
  mentionRequest?: { username: string; nonce: number } | null;
  agentAmpPinnedVideo?: AgentAmpPinnedVideo | null;
  agentAmpDetached?: boolean;
  pinnedVideoDetached?: boolean;
}>();

const emit = defineEmits<{
  send: [message: string];
  typing: [typing: boolean];
  joinLobby: [lobbyId: string];
  switchLobby: [lobbyId: string];
  closeLobby: [lobbyId: string];
  agentAmpStop: [];
  agentAmpDockToggle: [];
  togglePinnedVideoPopup: [];
  pinnedVideoChange: [media: ActiveMedia | null];
}>();

const { getUserColor } = useTheme();
const { extractImageUris, initializeImage, markImageLoaded, markImageError, getImageState } = useImageDetection();

function normalizeUserPresenceUsername(user: string): string {
  return user ? user.toUpperCase() : '';
}

function getUserPresence(user: string): UserPresence | undefined {
  const exact = props.users[user] ?? props.users[normalizeUserPresenceUsername(user)];
  if (exact) {
    return exact;
  }

  return Object.values(props.users).find(
    (presence) => presence.username?.toLowerCase() === user.toLowerCase()
  );
}

function isSafeAvatarUrl(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) && !/\s/.test(trimmed);
}

function getSenderAvatarUrl(user: string): string | undefined {
  if (!props.enableAvatars) {
    return undefined;
  }

  const presence = getUserPresence(user);
  const url = presence?.avatarUrl?.trim();
  if (!isSafeAvatarUrl(url)) {
    return undefined;
  }

  const parsed = parseAvatarUrl(url);
  return parsed ? parsed.src : undefined;
}

function getSenderAvatarPackStyle(user: string): Record<string, string> | undefined {
  if (!props.enableAvatars) {
    return undefined;
  }

  const presence = getUserPresence(user);
  const url = presence?.avatarUrl?.trim();
  if (!isSafeAvatarUrl(url)) {
    return undefined;
  }

  const parsed = parseAvatarUrl(url);
  if (!parsed || parsed.avatarIndex === null) {
    return undefined;
  }

  return {
    backgroundImage: `url(${parsed.src})`,
    backgroundSize: '300% 300%',
    backgroundPosition: getAvatarObjectPosition(parsed.avatarIndex),
    width: '100%',
    height: '100%',
  };
}

// --- YouTube URL detection ---
function extractYouTubeUrls(text: string): string[] {
  // Match common YouTube URL forms with optional query params.
  const regex = /https?:\/\/(?:www\.|m\.)?(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/|v\/|live\/))[\w-]{11}(?:[?&][^\s]*)?/gi;
  const matches = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.push(match[0]);
  }
  return matches;
}

function getYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname;

    if (hostname === 'youtu.be') {
      const id = pathname.slice(1);
      return id.length === 11 ? id : null;
    }

    if (!hostname.endsWith('youtube.com')) {
      return null;
    }

    if (pathname === '/watch') {
      const v = parsed.searchParams.get('v');
      return v && v.length === 11 ? v : null;
    }

    const pathSegments = pathname.split('/').filter(Boolean);
    if (pathSegments.length >= 2) {
      const [firstSegment, secondSegment] = pathSegments;
      if ((firstSegment === 'shorts' || firstSegment === 'embed' || firstSegment === 'v' || firstSegment === 'live') && secondSegment.length === 11) {
        return secondSegment;
      }
    }

    return null;
  } catch {
    return null;
  }
}

function parseYouTubeTimeValue(value: string | null): number | null {
  if (!value || !value.trim()) {
    return null;
  }

  const normalized = value.trim();
  if (/^\d+$/.test(normalized)) {
    return Number(normalized);
  }

  const match = normalized.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (!match) {
    return null;
  }

  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  return hours * 3600 + minutes * 60 + seconds;
}

function getYouTubeStartTime(url: string): number | null {
  try {
    const parsed = new URL(url);
    const startValue = parsed.searchParams.get('start') ?? parsed.searchParams.get('t');
    const queryTime = parseYouTubeTimeValue(startValue);
    if (Number.isFinite(queryTime ?? NaN)) {
      return queryTime;
    }

    const hash = parsed.hash.replace(/^#/, '');
    if (hash) {
      const hashParams = new URLSearchParams(hash);
      const hashTime = parseYouTubeTimeValue(hashParams.get('t') ?? hashParams.get('start'));
      if (Number.isFinite(hashTime ?? NaN)) {
        return hashTime;
      }

      const plainHashTime = parseYouTubeTimeValue(hash);
      if (Number.isFinite(plainHashTime ?? NaN)) {
        return plainHashTime;
      }
    }

    return null;
  } catch {
    return null;
  }
}

const TWITCH_RESERVED_PATHS = new Set([
  'clip',
  'clips',
  'collections',
  'directory',
  'downloads',
  'drops',
  'friends',
  'inventory',
  'jobs',
  'p',
  'search',
  'settings',
  'store',
  'subscriptions',
  'team',
  'turbo',
  'videos',
  'wallet',
]);

const TWITCH_DEFAULT_PARENTS = ['localhost', '127.0.0.1', 'tauri.localhost'];

function getTwitchChannelName(url: string): string | null {
  try {
    const parsed = new URL(normalizeUrlToken(url));
    if (!/(^|\.)twitch\.tv$/i.test(parsed.hostname)) {
      return null;
    }

    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length !== 1) {
      return null;
    }

    const candidate = segments[0];
    if (!candidate || TWITCH_RESERVED_PATHS.has(candidate.toLowerCase())) {
      return null;
    }

    if (!/^[a-zA-Z0-9_]{4,25}$/.test(candidate)) {
      return null;
    }

    return candidate;
  } catch {
    return null;
  }
}

function extractTwitchUrls(text: string): string[] {
  const regex = /https?:\/\/(?:www\.)?twitch\.tv\/[\w-]+(?:\?[^\s]*)?/gi;
  const candidates = Array.from(text.match(regex) ?? []).map(normalizeUrlToken);
  return candidates.filter((url) => Boolean(getTwitchChannelName(url)));
}

function getTwitchEmbedParents(): string[] {
  const hosts = new Set<string>(TWITCH_DEFAULT_PARENTS);
  if (typeof window !== 'undefined' && window.location?.hostname) {
    hosts.add(window.location.hostname);
  }
  return Array.from(hosts);
}

function getTwitchEmbedSrc(channel: string): string {
  const params = new URLSearchParams();
  params.set('channel', channel);
  params.set('autoplay', 'true');
  params.set('muted', 'false');
  getTwitchEmbedParents().forEach((parent) => params.append('parent', parent));
  return `https://player.twitch.tv/?${params.toString()}`;
}
const chatInput = ref('');
const messagesContainer = ref<HTMLElement>();
const typingProgress = ref<Record<number, number>>({});
const youtubeTitleCache = ref<Record<string, string>>({});
const twitchTitleCache = ref<Record<string, string>>({});
const externalLinkTitleCache = ref<Record<string, string>>({});
const youtubeTitleRequests = new Set<string>();
const twitchTitleRequests = new Set<string>();
const externalLinkTitleRequests = new Set<string>();
const youtubePlayers = new Map<string, YouTubePlayerLike>();
const youtubePlayerVideoIds = new Map<string, string>();
const youtubeContainers = new Map<string, HTMLElement>();
const youtubeShells = new Map<string, HTMLElement>();
const youtubeDetails = new Map<string, HTMLDetailsElement>();
const youtubePlayerStates = ref<Record<string, YouTubePlayerState>>({});
let youtubeApiPromise: Promise<YouTubeApiLike> | null = null;
let tauriOpenerPromise: Promise<TauriOpenerModule | null> | null = null;
let youtubeSyncInterval: ReturnType<typeof setInterval> | null = null;
const fullscreenChangeTick = ref(0);
const pinnedVideoElement = ref<HTMLVideoElement | null>(null);
const fullscreenOverlayVisible = ref<Record<string, boolean>>({});
const fullscreenOverlayHideTimers = new Map<string, ReturnType<typeof setTimeout>>();
const PINNED_YOUTUBE_KEY = 'pinned:top';
const PINNED_VIDEO_DEFAULT_HEIGHT = 190;
const PINNED_VIDEO_MIN_HEIGHT = 140;
const MIN_CHAT_VISIBLE_HEIGHT = 180;
const NEAR_BOTTOM_THRESHOLD_PX = 48;
const PINNED_SPLIT_RATIO = 0.5;
const PINNED_PANEL_OVERHEAD_ESTIMATE = 24;
const WINDOW_LAYOUT_CHANGED_EVENT = 'agent-lobby-window-layout-changed';
const PINNED_VIDEO_STATE_STORAGE_KEY = 'agent_chat_pinned_video_state';
const RESTORED_PINNED_SOURCE_KEY_PREFIX = 'restored:';

let restoredPinnedYouTubeTime: number | null = null;

type PersistedPinnedVideoState =
  | { type: 'youtube'; url: string; height: number; currentTime?: number }
  | { type: 'twitch'; url: string; height: number }
  | { type: 'agentAmp'; height: number };

let pinnedStateHydrated = false;
const pinnedYouTubeEmbed = ref<{ sourceKey: string; url: string; videoId: string } | null>(null);
const pinnedTwitchEmbed = ref<{ sourceKey: string; url: string; channel: string } | null>(null);
const pinnedVideoHeight = ref(PINNED_VIDEO_DEFAULT_HEIGHT);
const shouldAutoplayPinnedOnReady = ref(false);
const hasPinnedVideo = computed(() => Boolean(pinnedYouTubeEmbed.value || pinnedTwitchEmbed.value || props.agentAmpPinnedVideo));

watch(
  [pinnedYouTubeEmbed, pinnedTwitchEmbed, youtubeTitleCache, twitchTitleCache],
  () => {
    if (pinnedYouTubeEmbed.value) {
      emit('pinnedVideoChange', {
        label: getYouTubeEmbedHeader(pinnedYouTubeEmbed.value.url),
        url: pinnedYouTubeEmbed.value.url,
        mediaType: 'video',
        currentTime: getPlayerState(PINNED_YOUTUBE_KEY).currentTime,
      });
      return;
    }

    if (pinnedTwitchEmbed.value) {
      emit('pinnedVideoChange', {
        label: getTwitchEmbedHeader(pinnedTwitchEmbed.value.url),
        url: pinnedTwitchEmbed.value.url,
        mediaType: 'video',
      });
      return;
    }

    emit('pinnedVideoChange', null);
  },
  { immediate: true }
);

const lastPinnedYouTubeTimeSent = ref<number>(0);

watch(pinnedYouTubeEmbed, (next) => {
  if (next) {
    void ensureYouTubeTitle(next.url);
  }
}, { immediate: true });

watch(pinnedTwitchEmbed, (next) => {
  if (next) {
    void ensureTwitchTitle(next.url);
  }
}, { immediate: true });

watch(
  () => getPlayerState(PINNED_YOUTUBE_KEY).currentTime,
  (currentTime) => {
    if (!pinnedYouTubeEmbed.value) {
      return;
    }

    const roundedTime = Math.floor(currentTime);
    if (roundedTime === lastPinnedYouTubeTimeSent.value) {
      return;
    }

    lastPinnedYouTubeTimeSent.value = roundedTime;
    emit('pinnedVideoChange', {
      label: getYouTubeEmbedHeader(pinnedYouTubeEmbed.value.url),
      url: pinnedYouTubeEmbed.value.url,
      mediaType: 'video',
      currentTime: roundedTime,
    });
  }
);

watch(
  () => getPlayerState(PINNED_YOUTUBE_KEY).currentTime,
  () => {
    if (pinnedYouTubeEmbed.value && getPlayerState(PINNED_YOUTUBE_KEY).duration > 0) {
      persistPinnedVideoState();
    }
  }
);

const pinnedControlScale = computed(() => {
  const rawScale = pinnedVideoHeight.value / PINNED_VIDEO_DEFAULT_HEIGHT;
  return Math.max(0.78, Math.min(1.2, rawScale));
});
const chatAreaEl = ref<HTMLElement | null>(null);
const activePinnedResize = ref<{ startY: number; startHeight: number } | null>(null);
const stickToBottomWhileResizing = ref(false);
let chatAreaResizeObserver: ResizeObserver | null = null;
const emojiSuggestions = ref<{ name: string; emoji: string }[]>([]);
const emojiSelectedIndex = ref(0);
const mentionSuggestions = ref<string[]>([]);
const mentionSelectedIndex = ref(0);
const chatInputEl = ref<HTMLInputElement>();
const showJoinLobbyInput = ref(false);
const joinLobbyInput = ref('');
const joinLobbyInputEl = ref<HTMLInputElement>();
const TYPING_SPEED = 30; // ms per character
const FULLSCREEN_OVERLAY_HIDE_DELAY = 2000;

const lobbyTabs = computed(() => (props.lobbyTabs ?? []).map((lobby) => ({
  ...lobby,
  isDefault: Boolean(lobby.isDefault) || lobby.id === props.defaultLobbyId,
})));
const activeLobbyId = computed(() => props.activeLobbyId ?? '');

function toggleJoinLobbyInput() {
  showJoinLobbyInput.value = !showJoinLobbyInput.value;
  if (showJoinLobbyInput.value) {
    nextTick(() => {
      joinLobbyInputEl.value?.focus();
      joinLobbyInputEl.value?.select();
    });
  }
}

function cancelJoinLobby() {
  showJoinLobbyInput.value = false;
  joinLobbyInput.value = '';
}

function submitJoinLobby() {
  const rawLobbyId = joinLobbyInput.value.trim();
  if (!rawLobbyId) {
    return;
  }

  emit('joinLobby', rawLobbyId);
  cancelJoinLobby();
}

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

function registerYouTubeDetails(key: string, element: Element | ComponentPublicInstance | null) {
  const candidate = element && '$el' in element ? element.$el : element;
  if (candidate instanceof HTMLDetailsElement) {
    youtubeDetails.set(key, candidate);
  } else {
    youtubeDetails.delete(key);
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

  if (pinnedYouTubeEmbed.value?.videoId) {
    embeds.push({ key: PINNED_YOUTUBE_KEY, videoId: pinnedYouTubeEmbed.value.videoId });
  }

  return embeds;
}

function getFeedYouTubeEmbeds(): Array<{ key: string; url: string; videoId: string }> {
  const embeds: Array<{ key: string; url: string; videoId: string }> = [];

  props.messages.forEach((message, messageIndex) => {
    extractYouTubeUrls(message.message).forEach((url, embedIndex) => {
      const videoId = getYouTubeVideoId(url);
      if (!videoId) {
        return;
      }

      embeds.push({
        key: getEmbedKey(messageIndex, url, embedIndex),
        url,
        videoId,
      });
    });
  });

  return embeds;
}

function getFeedTwitchEmbeds(): Array<{ key: string; url: string; channel: string }> {
  const embeds: Array<{ key: string; url: string; channel: string }> = [];

  props.messages.forEach((message, messageIndex) => {
    extractTwitchUrls(message.message).forEach((url, embedIndex) => {
      const channel = getTwitchChannelName(url);
      if (!channel) {
        return;
      }

      embeds.push({
        key: getEmbedKey(messageIndex, url, embedIndex),
        url,
        channel,
      });
    });
  });

  return embeds;
}

function isYouTubeEmbedPinned(messageIndex: number, embedUrl: string, embedIndex: number): boolean {
  const sourceKey = getEmbedKey(messageIndex, embedUrl, embedIndex);
  return pinnedYouTubeEmbed.value?.sourceKey === sourceKey;
}

function isPinnedEmbedKey(key: string): boolean {
  return pinnedYouTubeEmbed.value?.sourceKey === key;
}

function isTwitchEmbedPinned(messageIndex: number, embedUrl: string, embedIndex: number): boolean {
  const sourceKey = getEmbedKey(messageIndex, embedUrl, embedIndex);
  return pinnedTwitchEmbed.value?.sourceKey === sourceKey;
}

function collapseEmbedInChatFeed(key: string) {
  const details = youtubeDetails.get(key);
  if (details?.open) {
    details.open = false;
  }

  const player = youtubePlayers.get(key);
  if (player) {
    player.pauseVideo();
    patchPlayerState(key, { isPlaying: false });
  }
}

function pinEmbedBySource(sourceKey: string, url: string, videoId: string) {
  pinnedYouTubeEmbed.value = {
    sourceKey,
    url,
    videoId,
  };

  collapseEmbedInChatFeed(sourceKey);
}

type PinMediaPayload = string | { url: string; currentTime?: number };

function setPendingPinnedYouTubeTime(startTime: number | undefined | null) {
  if (!Number.isFinite(startTime ?? NaN) || (startTime ?? 0) < 0) {
    return;
  }

  const seekTime = Math.max(0, startTime ?? 0);
  restoredPinnedYouTubeTime = seekTime;
  console.debug('[ChatArea] pending pinned YouTube time', seekTime);

  const player = youtubePlayers.get(PINNED_YOUTUBE_KEY);
  if (player && getPlayerState(PINNED_YOUTUBE_KEY).ready) {
    seekYouTubePlayerTo(PINNED_YOUTUBE_KEY, seekTime);
    restoredPinnedYouTubeTime = null;
  }
}

function pinMediaUrl(payload: PinMediaPayload) {
  const rawUrl = typeof payload === 'string' ? payload : payload.url;
  const normalizedUrl = normalizeUrlToken(rawUrl);
  const explicitStartTime = typeof payload === 'object' ? payload.currentTime : undefined;
  const urlStartTime = getYouTubeStartTime(normalizedUrl);
  const startTime = Number.isFinite(explicitStartTime ?? NaN) ? explicitStartTime : urlStartTime;
  let youtubeId = getYouTubeVideoId(normalizedUrl);

  if (!youtubeId) {
    const youtubeUrls = extractYouTubeUrls(normalizedUrl);
    if (youtubeUrls.length > 0) {
      youtubeId = getYouTubeVideoId(youtubeUrls[0]);
    }
  }

  if (youtubeId) {
    pinEmbedBySource(`remote:${normalizedUrl}`, normalizedUrl, youtubeId);
    setPendingPinnedYouTubeTime(startTime);
    void initializeYouTubePlayers();
    return;
  }

  const twitchChannel = getTwitchChannelName(normalizedUrl);
  if (twitchChannel) {
    pinnedTwitchEmbed.value = {
      sourceKey: `remote:${normalizedUrl}`,
      url: normalizedUrl,
      channel: twitchChannel,
    };
    return;
  }
}

defineExpose({ pinMediaUrl });

function findSourceKeyForYouTubeUrl(url: string): string | null {
  const normalizedTarget = normalizeUrlToken(url);

  for (let messageIndex = 0; messageIndex < props.messages.length; messageIndex++) {
    const message = props.messages[messageIndex];
    const urls = extractYouTubeUrls(message.message);

    for (let embedIndex = 0; embedIndex < urls.length; embedIndex++) {
      if (normalizeUrlToken(urls[embedIndex]) === normalizedTarget) {
        return getEmbedKey(messageIndex, urls[embedIndex], embedIndex);
      }
    }
  }

  return null;
}

function findSourceKeyForTwitchUrl(url: string): string | null {
  const normalizedTarget = normalizeUrlToken(url);

  for (let messageIndex = 0; messageIndex < props.messages.length; messageIndex++) {
    const message = props.messages[messageIndex];
    const urls = extractTwitchUrls(message.message);

    for (let embedIndex = 0; embedIndex < urls.length; embedIndex++) {
      if (normalizeUrlToken(urls[embedIndex]) === normalizedTarget) {
        return getEmbedKey(messageIndex, urls[embedIndex], embedIndex);
      }
    }
  }

  return null;
}

function updateRestoredPinnedSourceKey() {
  if (pinnedYouTubeEmbed.value?.sourceKey.startsWith(RESTORED_PINNED_SOURCE_KEY_PREFIX)) {
    const resolvedKey = findSourceKeyForYouTubeUrl(pinnedYouTubeEmbed.value.url);
    if (resolvedKey) {
      pinnedYouTubeEmbed.value.sourceKey = resolvedKey;
    }
  }

  if (pinnedTwitchEmbed.value?.sourceKey.startsWith(RESTORED_PINNED_SOURCE_KEY_PREFIX)) {
    const resolvedKey = findSourceKeyForTwitchUrl(pinnedTwitchEmbed.value.url);
    if (resolvedKey) {
      pinnedTwitchEmbed.value.sourceKey = resolvedKey;
    }
  }
}

async function restorePersistedPinnedVideoState(): Promise<void> {
  if (typeof window === 'undefined') {
    pinnedStateHydrated = true;
    return;
  }

  await nextTick();

  try {
    const persisted = await getPersistedValue<PersistedPinnedVideoState>(PINNED_VIDEO_STATE_STORAGE_KEY);
    if (!persisted) {
      return;
    }

    pinnedVideoHeight.value = clampPinnedVideoHeight(persisted.height ?? pinnedVideoHeight.value);

    if (persisted.type === 'youtube') {
      const videoId = getYouTubeVideoId(persisted.url);
      if (!videoId) {
        return;
      }

      const sourceKey = findSourceKeyForYouTubeUrl(persisted.url) ?? `${RESTORED_PINNED_SOURCE_KEY_PREFIX}${persisted.url}`;
      if (Number.isFinite(persisted.currentTime ?? NaN)) {
        restoredPinnedYouTubeTime = persisted.currentTime ?? null;
      }
      pinEmbedBySource(sourceKey, persisted.url, videoId);
      await initializeYouTubePlayers();
    } else if (persisted.type === 'twitch') {
      const channel = getTwitchChannelName(persisted.url);
      if (!channel) {
        return;
      }

      pinnedTwitchEmbed.value = {
        sourceKey: findSourceKeyForTwitchUrl(persisted.url) ?? `${RESTORED_PINNED_SOURCE_KEY_PREFIX}${persisted.url}`,
        url: persisted.url,
        channel,
      };
    } else if (persisted.type === 'agentAmp') {
      // Local agentAMP videos are not persisted as a URL.
      // We still restore the last pinned height when available.
      return;
    }
  } catch {
    // Ignore storage errors.
  } finally {
    pinnedStateHydrated = true;
  }
}

function persistPinnedVideoState() {
  if (!pinnedStateHydrated) {
    return;
  }

  if (!hasPinnedVideo.value) {
    void removePersistedValue(PINNED_VIDEO_STATE_STORAGE_KEY);
    return;
  }

  const height = clampPinnedVideoHeight(pinnedVideoHeight.value);
  pinnedVideoHeight.value = height;

  const pinnedYouTubeState = pinnedYouTubeEmbed.value ? getPlayerState(PINNED_YOUTUBE_KEY) : null;
  const youtubeCurrentTime = pinnedYouTubeState && pinnedYouTubeState.duration > 0 && Number.isFinite(pinnedYouTubeState.currentTime)
    ? Math.max(0, Math.min(pinnedYouTubeState.currentTime, pinnedYouTubeState.duration))
    : undefined;

  const persisted: PersistedPinnedVideoState = pinnedYouTubeEmbed.value
    ? { type: 'youtube', url: pinnedYouTubeEmbed.value.url, height, currentTime: youtubeCurrentTime }
    : pinnedTwitchEmbed.value
    ? { type: 'twitch', url: pinnedTwitchEmbed.value.url, height }
    : { type: 'agentAmp', height };

  void setPersistedValue(PINNED_VIDEO_STATE_STORAGE_KEY, persisted);
}

function cyclePinnedVideo(direction: 1 | -1, { autoplay = false }: { autoplay?: boolean } = {}) {
  const currentPinned = pinnedYouTubeEmbed.value;
  if (!currentPinned) {
    return;
  }

  const feedEmbeds = getFeedYouTubeEmbeds();
  if (feedEmbeds.length <= 1) {
    return;
  }

  const currentIndex = feedEmbeds.findIndex((embed) => embed.key === currentPinned.sourceKey);
  if (currentIndex < 0) {
    return;
  }

  const nextIndex = (currentIndex + direction + feedEmbeds.length) % feedEmbeds.length;
  const nextEmbed = feedEmbeds[nextIndex];
  if (!nextEmbed || nextEmbed.key === currentPinned.sourceKey) {
    return;
  }

  const shouldStickToBottom = isMessagesNearBottom();
  shouldAutoplayPinnedOnReady.value = autoplay;
  pinEmbedBySource(nextEmbed.key, nextEmbed.url, nextEmbed.videoId);
  scrollMessagesToBottomAfterLayout(shouldStickToBottom);
  void initializeYouTubePlayers();
}

function cyclePinnedTwitchStream(direction: 1 | -1) {
  const currentPinned = pinnedTwitchEmbed.value;
  if (!currentPinned) {
    return;
  }

  const feedEmbeds = getFeedTwitchEmbeds();
  if (feedEmbeds.length <= 1) {
    return;
  }

  const currentIndex = feedEmbeds.findIndex((embed) => embed.key === currentPinned.sourceKey);
  if (currentIndex < 0) {
    return;
  }

  const nextIndex = (currentIndex + direction + feedEmbeds.length) % feedEmbeds.length;
  const nextEmbed = feedEmbeds[nextIndex];
  if (!nextEmbed || nextEmbed.key === currentPinned.sourceKey) {
    return;
  }

  const shouldStickToBottom = isMessagesNearBottom();
  pinnedTwitchEmbed.value = {
    sourceKey: nextEmbed.key,
    url: nextEmbed.url,
    channel: nextEmbed.channel,
  };
  scrollMessagesToBottomAfterLayout(shouldStickToBottom);
}

function advancePinnedVideo() {
  cyclePinnedVideo(1, { autoplay: true });
}

function goToNextPinnedVideo() {
  if (pinnedTwitchEmbed.value) {
    cyclePinnedTwitchStream(1);
    return;
  }

  cyclePinnedVideo(1, { autoplay: true });
}

function goToPreviousPinnedVideo() {
  if (pinnedTwitchEmbed.value) {
    cyclePinnedTwitchStream(-1);
    return;
  }

  cyclePinnedVideo(-1, { autoplay: true });
}

function collapsePinButtonDetails(event?: Event) {
  const trigger = event?.currentTarget;
  if (!(trigger instanceof HTMLElement)) {
    return;
  }

  const details = trigger.closest('details');
  if (details instanceof HTMLDetailsElement && details.open) {
    details.open = false;
  }
}

function togglePinYouTubeEmbed(messageIndex: number, embedUrl: string, embedIndex: number, event?: Event) {
  const sourceKey = getEmbedKey(messageIndex, embedUrl, embedIndex);

  if (pinnedYouTubeEmbed.value?.sourceKey === sourceKey) {
    unpinYouTubeEmbed();
    return;
  }

  const videoId = getYouTubeVideoId(embedUrl);
  if (!videoId) {
    return;
  }

  const shouldStickToBottom = isMessagesNearBottom();
  shouldAutoplayPinnedOnReady.value = true;
  if (pinnedTwitchEmbed.value) {
    unpinTwitchEmbed();
  }
  emit('agentAmpStop');
  collapsePinButtonDetails(event);
  pinEmbedBySource(sourceKey, embedUrl, videoId);

  resetPinnedSplitToHalf();
  scrollMessagesToBottomAfterLayout(shouldStickToBottom);

  void initializeYouTubePlayers();
}

function togglePinTwitchEmbed(messageIndex: number, embedUrl: string, embedIndex: number, event?: Event) {
  const sourceKey = getEmbedKey(messageIndex, embedUrl, embedIndex);

  if (pinnedTwitchEmbed.value?.sourceKey === sourceKey) {
    unpinTwitchEmbed();
    return;
  }

  const channel = getTwitchChannelName(embedUrl);
  if (!channel) {
    return;
  }

  const shouldStickToBottom = isMessagesNearBottom();

  if (pinnedYouTubeEmbed.value) {
    unpinYouTubeEmbed();
  }

  emit('agentAmpStop');
  collapsePinButtonDetails(event);

  pinnedTwitchEmbed.value = {
    sourceKey,
    url: embedUrl,
    channel,
  };

  resetPinnedSplitToHalf();
  scrollMessagesToBottomAfterLayout(shouldStickToBottom);
}

function unpinYouTubeEmbed() {
  const pinnedPlayer = youtubePlayers.get(PINNED_YOUTUBE_KEY);
  if (pinnedPlayer) {
    pinnedPlayer.destroy();
    youtubePlayers.delete(PINNED_YOUTUBE_KEY);
    youtubePlayerVideoIds.delete(PINNED_YOUTUBE_KEY);
  }

  youtubeContainers.delete(PINNED_YOUTUBE_KEY);
  youtubeShells.delete(PINNED_YOUTUBE_KEY);
  clearFullscreenOverlayHideTimer(PINNED_YOUTUBE_KEY);

  const { [PINNED_YOUTUBE_KEY]: _removedOverlay, ...overlayRest } = fullscreenOverlayVisible.value;
  fullscreenOverlayVisible.value = overlayRest;

  const { [PINNED_YOUTUBE_KEY]: _removedState, ...stateRest } = youtubePlayerStates.value;
  youtubePlayerStates.value = stateRest;

  pinnedYouTubeEmbed.value = null;
  shouldAutoplayPinnedOnReady.value = false;

  if (youtubePlayers.size === 0) {
    stopYouTubeSync();
  }
}

function unpinTwitchEmbed() {
  pinnedTwitchEmbed.value = null;
}

function unpinPinnedEmbed() {
  if (pinnedTwitchEmbed.value) {
    unpinTwitchEmbed();
    return;
  }

  unpinYouTubeEmbed();
}

function getPinnedHeightBounds() {
  const areaHeight = chatAreaEl.value?.clientHeight || 0;
  if (areaHeight <= 0) {
    return {
      min: PINNED_VIDEO_MIN_HEIGHT,
      max: PINNED_VIDEO_DEFAULT_HEIGHT,
    };
  }

  const maxByReservedChat = areaHeight - MIN_CHAT_VISIBLE_HEIGHT;
  const maxByRatio = Math.floor(areaHeight * 0.65);
  const max = Math.max(PINNED_VIDEO_MIN_HEIGHT, Math.min(maxByReservedChat, maxByRatio));

  return {
    min: PINNED_VIDEO_MIN_HEIGHT,
    max,
  };
}

function clampPinnedVideoHeight(nextHeight: number) {
  const bounds = getPinnedHeightBounds();
  return Math.max(bounds.min, Math.min(bounds.max, nextHeight));
}

function scrollMessagesToBottom() {
  if (!messagesContainer.value) {
    return;
  }

  const container = messagesContainer.value;
  container.scrollTop = container.scrollHeight;
}

function isMessagesNearBottom(): boolean {
  if (!messagesContainer.value) {
    return true;
  }

  const container = messagesContainer.value;
  const distanceFromBottom = container.scrollHeight - (container.scrollTop + container.clientHeight);
  return distanceFromBottom <= NEAR_BOTTOM_THRESHOLD_PX;
}

function scrollMessagesToBottomAfterLayout(shouldStickToBottom: boolean) {
  if (!shouldStickToBottom) {
    return;
  }

  void nextTick(() => {
    scrollMessagesToBottom();

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => {
        scrollMessagesToBottom();
      });
    }
  });
}

function resetPinnedSplitToHalf() {
  if (!hasPinnedVideo.value) {
    return;
  }

  const shouldStickToBottom = isMessagesNearBottom();

  const areaHeight = chatAreaEl.value?.clientHeight || 0;
  if (areaHeight <= 0) {
    pinnedVideoHeight.value = clampPinnedVideoHeight(PINNED_VIDEO_DEFAULT_HEIGHT);
    if (shouldStickToBottom) {
      scrollMessagesToBottom();
    }
    return;
  }

  const targetVideoHeight = Math.floor(areaHeight * PINNED_SPLIT_RATIO) - PINNED_PANEL_OVERHEAD_ESTIMATE;
  pinnedVideoHeight.value = clampPinnedVideoHeight(targetVideoHeight);
  if (shouldStickToBottom) {
    scrollMessagesToBottom();
  }
}

function syncPinnedVideoToAvailableSpace() {
  if (!hasPinnedVideo.value) {
    return;
  }

  const shouldStickToBottom = isMessagesNearBottom();
  pinnedVideoHeight.value = clampPinnedVideoHeight(pinnedVideoHeight.value);
  if (shouldStickToBottom) {
    scrollMessagesToBottom();
  }
}

function handlePinnedResizeMove(event: MouseEvent) {
  if (!activePinnedResize.value) {
    return;
  }

  const deltaY = event.clientY - activePinnedResize.value.startY;
  pinnedVideoHeight.value = clampPinnedVideoHeight(activePinnedResize.value.startHeight + deltaY);
  if (stickToBottomWhileResizing.value) {
    scrollMessagesToBottom();
  }
}

function stopPinnedResize() {
  activePinnedResize.value = null;
  stickToBottomWhileResizing.value = false;
  window.removeEventListener('mousemove', handlePinnedResizeMove);
  window.removeEventListener('mouseup', stopPinnedResize);
}

function startPinnedResize(event: MouseEvent) {
  if (!hasPinnedVideo.value) {
    return;
  }

  stickToBottomWhileResizing.value = isMessagesNearBottom();

  activePinnedResize.value = {
    startY: event.clientY,
    startHeight: pinnedVideoHeight.value,
  };

  window.addEventListener('mousemove', handlePinnedResizeMove);
  window.addEventListener('mouseup', stopPinnedResize);
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
    const playerState = getPlayerState(key);
    if (!playerState.ready) {
      return;
    }

    if (
      typeof player.getCurrentTime !== 'function' ||
      typeof player.getDuration !== 'function' ||
      typeof player.getVolume !== 'function' ||
      typeof player.getPlayerState !== 'function'
    ) {
      return;
    }

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
      youtubePlayerVideoIds.delete(key);
      const { [key]: _removed, ...rest } = youtubePlayerStates.value;
      youtubePlayerStates.value = rest;
    }
  });

  activeEmbeds.forEach(({ key, videoId }) => {
    const existingVideoId = youtubePlayerVideoIds.get(key);
    if (youtubePlayers.has(key) && existingVideoId !== videoId) {
      const existingPlayer = youtubePlayers.get(key);
      existingPlayer?.destroy();
      youtubePlayers.delete(key);
      youtubePlayerVideoIds.delete(key);
      const { [key]: _removedState, ...restStates } = youtubePlayerStates.value;
      youtubePlayerStates.value = restStates;
    }

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
          const duration = Number(player.getDuration()) || 0;
          patchPlayerState(key, {
            ready: true,
            duration,
            volume: Number(player.getVolume()) || 70,
          });

          if (key === PINNED_YOUTUBE_KEY && restoredPinnedYouTubeTime !== null) {
            const seekToTime = Math.max(0, restoredPinnedYouTubeTime);
            seekYouTubePlayerTo(key, seekToTime);
            restoredPinnedYouTubeTime = null;
          }

          if (key === PINNED_YOUTUBE_KEY && shouldAutoplayPinnedOnReady.value) {
            shouldAutoplayPinnedOnReady.value = false;
            player.playVideo();
            patchPlayerState(key, { isPlaying: true });
          }
        },
        onStateChange: (event) => {
          if (key === PINNED_YOUTUBE_KEY && event.data === 0) {
            advancePinnedVideo();
            return;
          }

          patchPlayerState(key, {
            isPlaying: event.data === api.PlayerState.PLAYING,
          });
        },
      },
    });

    youtubePlayers.set(key, player);
    youtubePlayerVideoIds.set(key, videoId);
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
  youtubePlayerVideoIds.clear();
  youtubeContainers.clear();
  youtubeShells.clear();
  youtubeDetails.clear();
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

  if (details.open && isPinnedEmbedKey(key)) {
    details.open = false;
    return;
  }

  if (details.open) {
    return;
  }

  const player = youtubePlayers.get(key);
  if (!player) return;

  player.pauseVideo();
  patchPlayerState(key, { isPlaying: false });
}

function seekYouTubePlayerTo(key: string, seconds: number) {
  const player = youtubePlayers.get(key);
  if (!player) return;

  const state = getPlayerState(key);
  const target = Math.max(0, seconds);
  const clampedTarget = state.duration > 0 ? Math.min(target, state.duration) : target;

  player.seekTo(clampedTarget, true);
  patchPlayerState(key, { currentTime: clampedTarget });
}

function seekYouTubePlayer(key: string, event: Event) {
  const target = event.target as HTMLInputElement;
  const value = Math.max(0, Number(target.value) || 0);
  seekYouTubePlayerTo(key, value);
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

function syncPinnedVideoElementFromState() {
  const state = props.agentAmpPinnedVideo;
  const video = pinnedVideoElement.value;
  if (!state || !video) {
    return;
  }

  const targetTime = Number.isFinite(state.currentTime)
    ? Math.max(0, Math.min(state.currentTime, state.duration || video.duration || state.currentTime))
    : video.currentTime;

  if (Number.isFinite(targetTime) && Math.abs(video.currentTime - targetTime) > 0.5) {
    try {
      video.currentTime = targetTime;
    } catch {
      // Ignore seek failures until metadata is ready.
    }
  }

  if (state.playing) {
    void video.play().catch(() => {
      // Autoplay may be blocked, but video is muted so this is usually okay.
    });
  } else {
    video.pause();
  }
}

watch(
  () => [props.agentAmpPinnedVideo?.src, props.agentAmpPinnedVideo?.playing, props.agentAmpPinnedVideo?.currentTime],
  async () => {
    await nextTick();
    syncPinnedVideoElementFromState();
  },
  { immediate: true }
);

function formatYouTubeTime(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remSeconds = totalSeconds % 60;
  return `${minutes}:${remSeconds.toString().padStart(2, '0')}`;
}

function getYouTubeEmbedHeader(url: string): string {
  return youtubeTitleCache.value[url] || url;
}

function getTwitchEmbedHeader(url: string): string {
  if (twitchTitleCache.value[url]) {
    return twitchTitleCache.value[url];
  }

  const channel = getTwitchChannelName(url);
  if (channel) {
    return `Twitch: ${channel}`;
  }

  return url;
}

function extractRawHttpUrls(text: string): string[] {
  const regex = /https?:\/\/[^\s]+/gi;
  return Array.from(text.match(regex) ?? []);
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

async function ensureTwitchTitle(url: string): Promise<void> {
  if (twitchTitleCache.value[url] || twitchTitleRequests.has(url)) {
    return;
  }

  twitchTitleRequests.add(url);

  try {
    const channel = getTwitchChannelName(url);
    if (!channel) {
      return;
    }

    twitchTitleCache.value[url] = `Twitch: ${channel}`;
  } finally {
    twitchTitleRequests.delete(url);
  }
}

function stripHtmlTags(input: string): string {
  return input.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractHtmlTitle(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!titleMatch || !titleMatch[1]) {
    return '';
  }
  return stripHtmlTags(titleMatch[1]);
}

function extractTitleFromJinaMirror(text: string): string {
  const headerMatch = text.match(/^\s*Title:\s*(.+)$/im);
  if (headerMatch?.[1]) {
    return headerMatch[1].trim();
  }

  const markdownHeading = text.match(/^\s*#\s+(.+)$/m);
  if (markdownHeading?.[1]) {
    return markdownHeading[1].trim();
  }

  return '';
}

async function fetchExternalTitleViaJina(url: string): Promise<string> {
  const stripped = url.replace(/^https?:\/\//i, '');
  const mirrorUrl = `https://r.jina.ai/http://${stripped}`;
  const response = await fetch(mirrorUrl);
  if (!response.ok) {
    return '';
  }
  const content = await response.text();
  return extractTitleFromJinaMirror(content);
}

async function ensureExternalLinkTitle(url: string): Promise<void> {
  if (externalLinkTitleCache.value[url] || externalLinkTitleRequests.has(url)) {
    return;
  }

  externalLinkTitleRequests.add(url);

  try {
    let title = '';

    try {
      const response = await fetch(url);
      if (response.ok) {
        const html = await response.text();
        title = extractHtmlTitle(html);
      }
    } catch {
      // Ignore direct fetch failures (often CORS in webview).
    }

    if (!title) {
      title = await fetchExternalTitleViaJina(url);
    }

    if (title) {
      externalLinkTitleCache.value[url] = title;
    }
  } catch {
    // Keep URL fallback on metadata fetch failure.
  } finally {
    externalLinkTitleRequests.delete(url);
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

      const twitchUris = extractTwitchUrls(msg.message);
      twitchUris.forEach(uri => {
        if (getTwitchChannelName(uri)) {
          void ensureTwitchTitle(uri);
        }
      });

      const ytSet = new Set(extractYouTubeUrls(msg.message).map(normalizeUrlToken));
      const twitchSet = new Set(extractTwitchUrls(msg.message).map(normalizeUrlToken));
      const imgSet = new Set(extractImageUris(msg.message).map(normalizeUrlToken));
      const externalLinks = extractRawHttpUrls(msg.message)
        .map(normalizeUrlToken)
        .filter((url) => Boolean(url) && !ytSet.has(url) && !twitchSet.has(url) && !imgSet.has(url));

      externalLinks.forEach((url) => {
        void ensureExternalLinkTitle(url);
      });
    });

    updateRestoredPinnedSourceKey();
    void initializeYouTubePlayers();
  },
  { immediate: true }
);

watch([pinnedYouTubeEmbed, pinnedTwitchEmbed, pinnedVideoHeight], persistPinnedVideoState);

watch(
  () => props.messages.length,
  () => {
    updateRestoredPinnedSourceKey();
  },
  { immediate: true }
);

watch(
  () => props.activeLobbyId,
  () => {
    typingProgress.value = {};
    showJoinLobbyInput.value = false;
    joinLobbyInput.value = '';
  }
);

watch(
  () => props.mentionRequest,
  (request) => {
    if (!request || !props.isConnected) {
      return;
    }

    appendMentionToInput(request.username);
  }
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

  const twitchUris = extractTwitchUrls(message.message);
  twitchUris.forEach(uri => {
    text = text.replace(uri, '').trim();
  });

  // Remove CSS-like blocks from display text
  text = text.replace(/\.[\w-]+\s*\{[^}]+\}/g, '').trim();
  // Convert :emojiName: to emoji characters
  text = nodeEmoji.emojify(text);
  const progress = typingProgress.value[messageIndex] ?? text.length;
  return text.substring(0, progress);
}

type DisplayPart =
  | { type: 'text'; text: string }
  | { type: 'mention'; text: string }
  | { type: 'link'; text: string; url: string };

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeUrlToken(token: string): string {
  return token.replace(/[.,!?;:\]\)]+$/, '');
}

function pushTextWithMentions(parts: DisplayPart[], text: string, targetUsername: string) {
  if (!text) {
    return;
  }

  const mentionRegex = new RegExp(`@${escapeRegExp(targetUsername)}\\b`, 'gi');
  let lastIndex = 0;

  for (const match of text.matchAll(mentionRegex)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;

    if (start > lastIndex) {
      parts.push({ type: 'text', text: text.slice(lastIndex, start) });
    }

    parts.push({ type: 'mention', text: text.slice(start, end) });
    lastIndex = end;
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', text: text.slice(lastIndex) });
  }
}

function getDisplayedParts(messageIndex: number): DisplayPart[] {
  const text = getDisplayedText(messageIndex);
  const sourceMessage = props.messages[messageIndex];
  const targetUsername = props.username?.trim();

  if (!text || !targetUsername) {
    return [{ type: 'text', text }];
  }

  const excludedUrls = new Set([
    ...extractYouTubeUrls(sourceMessage?.message || '').map(normalizeUrlToken),
    ...extractTwitchUrls(sourceMessage?.message || '').map(normalizeUrlToken),
    ...extractImageUris(sourceMessage?.message || '').map(normalizeUrlToken),
  ]);

  const linkRegex = /https?:\/\/[^\s]+/gi;
  const parts: DisplayPart[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(linkRegex)) {
    const start = match.index ?? 0;
    const rawUrl = match[0];
    const normalizedUrl = normalizeUrlToken(rawUrl);
    const end = start + rawUrl.length;

    if (start > lastIndex) {
      pushTextWithMentions(parts, text.slice(lastIndex, start), targetUsername);
    }

    if (normalizedUrl && !excludedUrls.has(normalizedUrl)) {
      parts.push({ type: 'link', text: normalizedUrl, url: normalizedUrl });

      const trailingPunctuation = rawUrl.slice(normalizedUrl.length);
      if (trailingPunctuation) {
        pushTextWithMentions(parts, trailingPunctuation, targetUsername);
      }
    } else {
      pushTextWithMentions(parts, rawUrl, targetUsername);
    }

    lastIndex = end;
  }

  if (lastIndex < text.length) {
    pushTextWithMentions(parts, text.slice(lastIndex), targetUsername);
  }

  return parts.length > 0 ? parts : [{ type: 'text', text }];
}

function openExternalLink(url: string) {
  void openExternalLinkAsync(url);
}

function getExternalLinkLabel(part: { text: string; url: string }): string {
  return externalLinkTitleCache.value[part.url] || part.text;
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function getTauriOpener() {
  if (!isTauriRuntime()) {
    return null;
  }

  if (!tauriOpenerPromise) {
    tauriOpenerPromise = import('@tauri-apps/plugin-opener')
      .then((module) => module)
      .catch(() => {
        tauriOpenerPromise = null;
        return null;
      });
  }

  return tauriOpenerPromise;
}

async function openExternalLinkAsync(url: string) {
  try {
    const opener = await getTauriOpener();
    if (opener?.openUrl) {
      await opener.openUrl(url);
      return;
    }
  } catch {
    // Fall through to browser open fallback.
  }

  window.open(url, '_blank', 'noopener,noreferrer');
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

function getMessageTwitchUrls(messageIndex: number): string[] {
  const message = props.messages[messageIndex];
  if (!message) return [];
  return extractTwitchUrls(message.message);
}

function getMessageTwitchEmbeds(messageIndex: number): Array<{ url: string; channel: string | null }> {
  return getMessageTwitchUrls(messageIndex).map(url => ({
    url,
    channel: getTwitchChannelName(url),
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

function appendMentionToInput(targetUsername: string) {
  const username = targetUsername.trim();
  if (!username) {
    return;
  }

  const mentionText = `@${username} `;
  const needsSeparator = chatInput.value.length > 0 && !/\s$/.test(chatInput.value);
  chatInput.value = `${chatInput.value}${needsSeparator ? ' ' : ''}${mentionText}`;
  mentionSuggestions.value = [];
  emojiSuggestions.value = [];

  nextTick(() => {
    if (typeof window !== 'undefined') {
      window.focus();
    }

    const cursorPos = chatInput.value.length;
    chatInputEl.value?.focus();
    chatInputEl.value?.setSelectionRange(cursorPos, cursorPos);
  });
}

let typingTimeout: ReturnType<typeof setTimeout> | null = null;
function convertEmojisInInput() {
  const converted = nodeEmoji.emojify(chatInput.value);
  if (converted !== chatInput.value) {
    chatInput.value = converted;
  }
  updateInputSuggestions();
  // --- Presence typing event ---
  emit('typing', true);
  if (typingTimeout) clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => emit('typing', false), 2000);
}

function getMentionContext() {
  const input = chatInput.value;
  const cursorPos = chatInputEl.value?.selectionStart ?? input.length;
  const textUpToCursor = input.slice(0, cursorPos);
  const match = textUpToCursor.match(/(^|\s)@([\w]*)$/);

  if (!match) {
    return null;
  }

  const mentionStart = cursorPos - match[0].length + match[1].length;
  return {
    cursorPos,
    query: match[2] ?? '',
    mentionStart,
  };
}

function updateMentionSuggestions() {
  const mentionContext = getMentionContext();
  if (!mentionContext) {
    mentionSuggestions.value = [];
    mentionSelectedIndex.value = 0;
    return false;
  }

  const { query } = mentionContext;
  const normalizedQuery = query.toLowerCase();
  const allUsers = Object.values(props.users || {})
    .map((user) => user.username)
    .filter((name) => name && name !== props.username);

  const filtered = allUsers
    .filter((name) => normalizedQuery.length === 0 || name.toLowerCase().startsWith(normalizedQuery))
    .slice(0, 12);

  mentionSuggestions.value = filtered;
  mentionSelectedIndex.value = 0;
  return filtered.length > 0;
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

function updateInputSuggestions() {
  const hasMentionSuggestions = updateMentionSuggestions();
  if (hasMentionSuggestions) {
    emojiSuggestions.value = [];
    return;
  }

  mentionSuggestions.value = [];
  updateEmojiSuggestions();
}

function selectMentionSuggestion(username: string) {
  const mentionContext = getMentionContext();
  if (!mentionContext) {
    return;
  }

  const { cursorPos, mentionStart } = mentionContext;
  const input = chatInput.value;
  const beforeMention = input.slice(0, mentionStart);
  const afterMention = input.slice(cursorPos);
  chatInput.value = `${beforeMention}@${username} ${afterMention}`;
  mentionSuggestions.value = [];

  nextTick(() => {
    const newCursor = beforeMention.length + username.length + 2;
    chatInputEl.value?.setSelectionRange(newCursor, newCursor);
    chatInputEl.value?.focus();
  });
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
  const hasMentionSuggestions = mentionSuggestions.value.length > 0;
  const hasEmojiSuggestions = emojiSuggestions.value.length > 0;

  if (!hasMentionSuggestions && !hasEmojiSuggestions) {
    if (e.key === 'Enter') {
      sendMessage();
    }
    return;
  }

  const activeList = hasMentionSuggestions ? mentionSuggestions.value : emojiSuggestions.value;
  const activeIndex = hasMentionSuggestions ? mentionSelectedIndex : emojiSelectedIndex;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeIndex.value = (activeIndex.value + 1) % activeList.length;
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeIndex.value = (activeIndex.value - 1 + activeList.length) % activeList.length;
  } else if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault();
    if (hasMentionSuggestions) {
      selectMentionSuggestion(mentionSuggestions.value[mentionSelectedIndex.value]);
    } else {
      selectEmojiSuggestion(emojiSuggestions.value[emojiSelectedIndex.value]);
    }
  } else if (e.key === 'Escape') {
    emojiSuggestions.value = [];
    mentionSuggestions.value = [];
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

function handleWindowLayoutChanged() {
  resetPinnedSplitToHalf();
}

onMounted(() => {
  document.addEventListener('fullscreenchange', handleFullscreenChange);
  window.addEventListener('resize', syncPinnedVideoToAvailableSpace);
  window.addEventListener(WINDOW_LAYOUT_CHANGED_EVENT, handleWindowLayoutChanged);
  pinnedVideoHeight.value = clampPinnedVideoHeight(PINNED_VIDEO_DEFAULT_HEIGHT);
  void restorePersistedPinnedVideoState();

  if (typeof ResizeObserver !== 'undefined' && chatAreaEl.value) {
    chatAreaResizeObserver = new ResizeObserver(() => {
      syncPinnedVideoToAvailableSpace();
    });
    chatAreaResizeObserver.observe(chatAreaEl.value);
  }
});

onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', handleFullscreenChange);
  window.removeEventListener('resize', syncPinnedVideoToAvailableSpace);
  window.removeEventListener(WINDOW_LAYOUT_CHANGED_EVENT, handleWindowLayoutChanged);

  if (chatAreaResizeObserver) {
    chatAreaResizeObserver.disconnect();
    chatAreaResizeObserver = null;
  }

  stopPinnedResize();
  destroyAllYouTubePlayers();
});
</script>

<style scoped>
#chat-area {
  grid-area: chatarea;
  flex: 1;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--color-accent);
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

.lobby-tabs-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--color-accent-muted);
  background: var(--color-chat-surface-strong);
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  overflow: hidden;
}

.lobby-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
  flex: 1;
  min-width: 0;
}

.lobby-tabs::-webkit-scrollbar {
  height: 4px;
}

.lobby-tabs::-webkit-scrollbar-track {
  background: transparent;
}

.lobby-tabs::-webkit-scrollbar-thumb {
  background: rgba(57, 255, 20, 0);
  border-radius: 999px;
  transition: background 0.2s ease;
}

.lobby-tabs:hover::-webkit-scrollbar-thumb,
.lobby-tabs:focus-within::-webkit-scrollbar-thumb {
  background: rgba(57, 255, 20, 0.55);
}

.lobby-tabs:hover,
.lobby-tabs:focus-within {
  scrollbar-color: rgba(57, 255, 20, 0.55) transparent;
}

.lobby-tab {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: 1px solid var(--color-accent-muted);
  background: var(--color-chat-surface);
  color: var(--color-chat-text-muted);
  padding: 5px 8px;
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  white-space: nowrap;
  transition: border-color 0.16s ease, color 0.16s ease, background 0.16s ease;
  max-width: 180px;
  flex-shrink: 0;
}

.lobby-label {
  min-width: 0;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  color: inherit;
  font-size: 12px;
  line-height: 1;
  opacity: 0.75;
}

.tab-close:hover {
  opacity: 1;
  background: var(--color-chat-overlay);
}

.lobby-tab.active .tab-close:hover {
  background: var(--color-chat-surface);
}

.lobby-tab:hover {
  color: var(--color-accent);
  border-color: var(--color-accent);
}

.lobby-tab.active {
  color: var(--color-on-accent);
  border-color: var(--color-accent);
  background: var(--color-accent);
}

.lobby-tab.has-unread {
  color: var(--color-chat-warning);
  border-color: var(--color-chat-warning);
  animation: lobby-tab-flash 1.1s steps(2, end) infinite;
}

.tab-unread {
  min-width: 16px;
  height: 16px;
  border-radius: 999px;
  padding: 0 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0;
  background: var(--color-chat-warning);
  color: var(--color-chat-warning-contrast);
}

.lobby-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.lobby-join-toggle,
.lobby-join-confirm,
.lobby-join-cancel {
  border: 1px solid var(--color-accent-muted);
  background: transparent;
  color: var(--color-accent);
  font-family: inherit;
  text-transform: uppercase;
  font-size: 10px;
  letter-spacing: 0.5px;
  padding: 5px 8px;
  cursor: pointer;
}

.lobby-join-toggle:hover,
.lobby-join-confirm:hover,
.lobby-join-cancel:hover {
  border-color: var(--color-accent);
}

.lobby-join-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--color-accent-muted);
  background: var(--color-chat-surface-strong);
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.lobby-join-input {
  flex: 1;
  min-width: 120px;
  border: 1px solid var(--color-accent-muted);
  background: var(--color-chat-surface-strong);
  color: var(--color-accent);
  padding: 6px 8px;
  font-family: inherit;
  font-size: 12px;
  outline: none;
  text-transform: lowercase;
}

.lobby-join-input:focus {
  border-color: var(--color-accent);
}

.lobby-join-cancel {
  color: var(--color-chat-text-muted);
}

@keyframes lobby-tab-flash {
  0%,
  100% {
    box-shadow: 0 0 0 rgba(255, 211, 111, 0);
  }
  50% {
    box-shadow: 0 0 12px rgba(255, 211, 111, 0.5);
  }
}

#messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 20px;
  font-size: 16px;
  scrollbar-width: thin;
}

.input-bar {
  display: flex;
  align-items: stretch;
  flex-shrink: 0;
  border-top: 1px solid var(--color-accent);
  height: 36px;
  background: var(--color-chat-bg);
}

.input-bar:focus-within {
  z-index: 100;
}

#chat-msg {
  background: transparent;
  border: none;
  color: var(--color-accent);
  padding: 0 20px;
  flex: 1;
  height: 100%;
  font-family: inherit;
  font-size: 18px;
  outline: none;
}

#chat-msg:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.send-btn {
  background: var(--color-accent);
  color: var(--color-on-accent);
  border: none;
  padding: 0 30px;
  cursor: pointer;
  font-family: inherit;
  font-weight: bold;
  transition: all 0.2s;
  display: flex;
  align-items: center;
}

.send-btn:hover:not(:disabled) {
  filter: brightness(1.08);
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.msg {
  position: relative;
  margin-bottom: 12px;
  line-height: 1.5;
  border-left: 3px solid var(--color-accent-muted);
  padding: 12px 12px 12px 56px;
  max-width: min(78%, 100%);
}

.msg.self-msg {
  margin-left: auto;
  border-left: none;
  border-right: 3px solid var(--color-accent-muted);
  padding: 12px 56px 12px 12px;
  text-align: right;
}

.sender-avatar-wrap {
  position: absolute;
  top: 12px;
  left: 12px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.msg.self-msg .sender-avatar-wrap {
  left: auto;
  right: 12px;
}

.sender-avatar {
  width: 40px;
  height: 40px;
  border-radius: 0;
  object-fit: cover;
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.sender-avatar-sprite {
  width: 100%;
  height: 100%;
  border-radius: 0;
  background-repeat: no-repeat;
}

.message-body {
  display: block;
}

.sender {
  display: block;
  font-weight: bold;
  margin-bottom: 6px;
  text-shadow: 0 0 5px currentColor;
}

.system-msg {
  text-align: center;
  color: var(--color-chat-text-muted);
  font-size: 13px;
  margin: 15px 0;
  letter-spacing: 1px;
  font-weight: bold;
  background: linear-gradient(90deg, transparent, var(--color-accent-muted), transparent);
}

.sender {
  font-weight: bold;
  margin-right: 10px;
  text-shadow: 0 0 5px currentColor;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.sender-avatar {
  display: inline-block;
  width: auto;
  max-height: 40px;
  max-width: 40px;
  border-radius: 0;
  object-fit: contain;
}

.text {
  word-wrap: break-word;
  white-space: pre-wrap;
}

.mention-highlight {
  color: var(--color-on-accent);
  background: var(--color-accent);
  border-radius: 2px;
  padding: 0 3px;
  margin: 0 1px;
  box-shadow: 0 0 8px rgba(57, 255, 20, 0.45);
}

.chat-link {
  color: var(--color-chat-link);
  text-decoration: underline;
  text-underline-offset: 2px;
  word-break: break-all;
}

.chat-link:hover {
  color: var(--color-chat-link-hover);
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
  background: var(--color-chat-bg);
  border: 1px solid var(--color-accent);
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
  color: var(--color-chat-text);
  transition: background 0.1s;
}

.emoji-item:hover,
.emoji-item.active {
  background: rgba(57, 255, 20, 0.12);
  color: var(--color-accent);
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
  border: 1px solid var(--color-accent-muted);
  border-radius: 4px;
  background: var(--color-chat-surface);
  overflow: hidden;
}

.video-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  cursor: pointer;
  color: var(--color-chat-text);
  font-size: 12px;
  line-height: 1.2;
  user-select: none;
  border-bottom: 1px solid transparent;
}

.video-expandable[open] .video-header {
  border-bottom-color: var(--color-accent-muted);
}

.video-header::-webkit-details-marker {
  color: var(--color-accent);
}

.video-header-title {
  color: var(--color-chat-text);
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
  color: var(--color-chat-text-muted);
  font-size: 11px;
  letter-spacing: 0.3px;
}

.video-pin-btn {
  border: 1px solid var(--color-accent-muted);
  background: transparent;
  color: var(--color-chat-text-muted);
  font-family: inherit;
  font-size: 10px;
  letter-spacing: 0.4px;
  font-weight: 700;
  padding: 2px 6px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.video-pin-btn:hover {
  color: var(--color-accent);
  border-color: var(--color-accent);
}

.video-pin-btn[aria-pressed="true"] {
  color: var(--color-on-accent);
  background: var(--color-accent);
  border-color: var(--color-accent);
}

.video-header:hover .video-header-control {
  color: var(--color-accent);
}

.video-expandable[open] .video-header-control {
  color: var(--color-accent);
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
  border: 1px solid var(--color-accent-muted);
  border-radius: 4px;
  background: var(--color-chat-bg);
}

.video-player-shell {
  position: relative;
  width: 100%;
  max-width: 100%;
  border: 1px solid var(--color-accent-muted);
  border-top: none;
  border-radius: 0 0 4px 4px;
  background: var(--color-chat-surface);
  overflow: hidden;
}

.pinned-video-panel {
  position: relative;
  border-bottom: 1px solid var(--color-accent);
  background: var(--color-chat-surface-strong);
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.pinned-video-header {
  position: absolute;
  top: 10px;
  left: 14px;
  right: 14px;
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 8px;
  border-radius: 6px;
  background: transparent;
  transform: translateY(-10px) scale(0.985);
  filter: blur(3px);
  box-shadow: 0 0 0 rgba(74, 225, 255, 0);
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity 0.26s cubic-bezier(0.22, 1, 0.36, 1), visibility 0.26s linear, background 0.22s ease,
    transform 0.3s cubic-bezier(0.22, 1, 0.36, 1), filter 0.3s ease, box-shadow 0.24s ease;
  transition-delay: 0.03s;
}

.pinned-video-panel:hover .pinned-video-header,
.pinned-video-panel:focus-within .pinned-video-header {
  background: linear-gradient(180deg, rgba(10, 14, 28, 0.9), rgba(20, 8, 30, 0.62));
  transform: translateY(0) scale(1);
  filter: blur(0);
  box-shadow: 0 0 18px rgba(74, 225, 255, 0.16), 0 0 24px rgba(255, 77, 181, 0.1);
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
  transition-delay: 0s;
}

.pinned-video-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.pinned-video-nav-btn {
  min-width: 28px;
  padding-left: 0;
  padding-right: 0;
}

.pinned-video-title {
  color: var(--color-chat-text);
  font-size: 12px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pinned-video-shell {
  position: relative;
  width: 100%;
  max-width: 100%;
  height: var(--pinned-video-height);
}

.pinned-video-shell .youtube-player-host {
  height: 100%;
  min-height: 0;
  padding-top: 0;
  border-bottom: none;
}

.pinned-video-shell .pinned-video-frame {
  width: 100%;
  height: 100%;
  display: block;
  border: none;
  background: #000;
  object-fit: contain;
}

.pinned-video-shell .video-custom-controls {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 3;
  background: transparent;
  transform: translateY(12px) scale(0.992);
  filter: blur(3px);
  box-shadow: 0 0 0 rgba(255, 77, 181, 0);
  transition: opacity 0.26s cubic-bezier(0.22, 1, 0.36, 1), visibility 0.26s linear, background 0.24s ease,
    transform 0.3s cubic-bezier(0.22, 1, 0.36, 1), filter 0.3s ease, box-shadow 0.24s ease;
  transition-delay: 0s;
}

.pinned-video-shell:hover .video-custom-controls,
.pinned-video-shell:focus-within .video-custom-controls {
  background: linear-gradient(180deg, rgba(0, 0, 0, 0), rgba(24, 8, 36, 0.74) 35%, rgba(6, 16, 30, 0.9));
  transform: translateY(0) scale(1);
  filter: blur(0);
  box-shadow: 0 -10px 24px rgba(255, 77, 181, 0.12), 0 -6px 16px rgba(74, 225, 255, 0.1);
  transition-delay: 0.07s;
}

.pinned-video-shell .video-custom-controls {
  gap: calc(10px * var(--pinned-control-scale));
  padding: calc(8px * var(--pinned-control-scale)) calc(10px * var(--pinned-control-scale));
  font-size: calc(11px * var(--pinned-control-scale));
}

.pinned-video-shell .video-control-btn {
  font-size: calc(11px * var(--pinned-control-scale));
  padding: calc(4px * var(--pinned-control-scale)) calc(8px * var(--pinned-control-scale));
}

.pinned-video-shell .video-timecode {
  min-width: calc(76px * var(--pinned-control-scale));
}

.pinned-video-shell .video-volume {
  width: calc(82px * var(--pinned-control-scale));
}

.pinned-video-divider {
  height: 14px;
  background: var(--color-chat-surface-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: ns-resize;
}

.pinned-video-divider-grip {
  width: 64px;
  height: 6px;
  border: 1px solid var(--color-accent-muted);
  border-radius: 3px;
  background: repeating-linear-gradient(
    90deg,
    var(--color-accent-muted) 0,
    var(--color-accent-muted) 8px,
    var(--color-chat-border) 8px,
    var(--color-chat-border) 16px
  );
}

.youtube-player-host {
  position: relative;
  width: 100%;
  max-width: 100%;
  height: 0;
  padding-top: 56.25%;
  border-bottom: 1px solid var(--color-accent-muted);
  background: var(--color-chat-bg);
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

.pinned-video-shell .youtube-player-host :deep(iframe) {
  pointer-events: none;
}

.twitch-player-host {
  position: relative;
  width: 100%;
  max-width: 100%;
  height: 0;
  padding-top: 56.25%;
  border-bottom: 1px solid var(--color-accent-muted);
  background: var(--color-chat-bg);
  overflow: hidden;
}

.twitch-player-frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
  display: block;
}

.pinned-twitch-player-host {
  height: 100%;
  min-height: 0;
  padding-top: 0;
  border-bottom: none;
}

.video-fullscreen-exit {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 3;
  border: 1px solid var(--color-accent);
  background: var(--color-chat-surface-strong);
  color: var(--color-accent);
  font-family: inherit;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.4px;
  padding: 5px 10px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, opacity 0.2s;
}

.video-fullscreen-exit:hover {
  background: var(--color-accent);
  color: var(--color-on-accent);
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
  color: var(--color-chat-text);
  font-size: 11px;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity 0.16s ease, visibility 0.16s ease;
}

.video-player-shell:hover .video-custom-controls,
.video-player-shell:focus-within .video-custom-controls {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
}

.video-control-btn {
  border: 1px solid var(--color-accent);
  background: transparent;
  color: var(--color-accent);
  font-family: inherit;
  font-size: 11px;
  letter-spacing: 0.5px;
  font-weight: 700;
  padding: 4px 8px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, opacity 0.15s;
}

.video-control-btn:hover:not(:disabled) {
  background: var(--color-accent);
  color: var(--color-on-accent);
}

.video-control-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.video-timecode {
  color: var(--color-chat-text-muted);
  min-width: 76px;
  text-align: right;
  font-family: monospace;
}

.video-range {
  accent-color: var(--color-accent);
}

.video-progress {
  width: 100%;
}

.video-volume-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--color-chat-text-muted);
  font-weight: 700;
}

.video-volume {
  width: 82px;
}

.video-fallback {
  display: inline-block;
  margin-top: 4px;
  color: var(--color-chat-text-muted);
  font-size: 12px;
  font-family: monospace;
  word-break: break-all;
  padding: 4px;
  border: 1px dashed var(--color-accent-muted);
  border-radius: 2px;
  background: var(--color-chat-surface);
}

.image-container {
  position: relative;
  max-width: 300px;
}

.embedded-image {
  max-width: 100%;
  max-height: 300px;
  border: 1px solid var(--color-accent-muted);
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
  color: var(--color-chat-text-muted);
  font-size: 12px;
  font-family: monospace;
  word-break: break-all;
  padding: 4px;
  border: 1px dashed var(--color-accent-muted);
  border-radius: 2px;
  background: var(--color-chat-surface);
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

</style>
