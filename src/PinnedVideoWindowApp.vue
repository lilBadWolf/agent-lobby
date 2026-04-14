<template>
  <div class="pinned-video-window">
    <div class="pinned-video-bar" data-tauri-drag-region>
      <div class="pinned-video-title">{{ title }}</div>
      <button class="pinned-video-repin-btn" type="button" data-tauri-drag-region="false" @click="repin">REPIN</button>
    </div>
    <div class="pinned-video-content">
      <template v-if="sourceType === 'youtube' && videoId">
        <iframe
          class="pinned-video-frame"
          :src="youtubeEmbedUrl"
          sandbox="allow-scripts allow-same-origin allow-presentation"
          allow="autoplay; fullscreen; picture-in-picture"
          allowfullscreen
          referrerpolicy="strict-origin"
        ></iframe>
      </template>
      <template v-else-if="sourceType === 'twitch' && channel">
        <iframe
          class="pinned-video-frame"
          :src="twitchEmbedUrl"
          sandbox="allow-scripts allow-same-origin allow-presentation"
          allow="autoplay; fullscreen; picture-in-picture"
          allowfullscreen
          referrerpolicy="strict-origin"
        ></iframe>
      </template>
      <template v-else-if="sourceType === 'direct' && url">
        <video
          ref="directVideoElement"
          class="pinned-video-frame"
          :src="directVideoSrc"
          autoplay
          controls
          playsinline
          @loadedmetadata="syncDirectVideoTime"
        ></video>
      </template>
      <template v-else>
        <div class="pinned-video-empty">
          <p>Unsupported pinned video source.</p>
          <p>{{ url }}</p>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const params = new URLSearchParams(window.location.search);
const sourceType = (params.get('sourceType') as 'youtube' | 'twitch' | 'direct' | null) ?? null;
const url = params.get('url') ?? '';
const title = params.get('title') ?? 'Pinned Video';
const currentTime = Number(params.get('currentTime'));

function getYouTubeVideoId(input: string): string | null {
  try {
    const parsed = new URL(input);
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

    const segments = pathname.split('/').filter(Boolean);
    if (segments.length >= 2) {
      const [first, second] = segments;
      if ((first === 'shorts' || first === 'embed' || first === 'v' || first === 'live') && second.length === 11) {
        return second;
      }
    }

    return null;
  } catch {
    return null;
  }
}

function getTwitchChannelName(input: string): string | null {
  try {
    const parsed = new URL(input);
    const hostname = parsed.hostname.toLowerCase();
    if (!hostname.endsWith('twitch.tv')) {
      return null;
    }

    const segments = parsed.pathname.split('/').filter(Boolean);
    const channel = segments[0];
    if (!channel) {
      return null;
    }

    return channel;
  } catch {
    return null;
  }
}

const videoId = computed(() => {
  if (sourceType !== 'youtube') {
    return null;
  }
  return getYouTubeVideoId(url);
});

const directVideoSrc = computed(() => {
  if (sourceType !== 'direct' || !url) {
    return '';
  }

  const trimmed = url.trim();

  if (/^(https?:|file:|blob:|data:)/i.test(trimmed)) {
    return trimmed;
  }

  if (/^[a-zA-Z]:[\\/]/.test(trimmed)) {
    return `file:///${trimmed.replace(/\\/g, '/').replace(/^\/+/, '')}`;
  }

  const uncMatch = trimmed.match(/^([\\/]{2,})([^\\/]+)([\\/].*)$/);
  if (uncMatch) {
    const hostname = uncMatch[2];
    const path = uncMatch[3].replace(/\\/g, '/');
    return `file://${hostname}${path}`;
  }

  return trimmed;
});

const channel = computed(() => {
  if (sourceType !== 'twitch') {
    return null;
  }
  return getTwitchChannelName(url);
});

const directVideoElement = ref<HTMLVideoElement | null>(null);

const youtubeEmbedUrl = computed(() => {
  if (!videoId.value) {
    return '';
  }

  const embedUrl = new URL(`https://www.youtube.com/embed/${videoId.value}`);
  embedUrl.searchParams.set('autoplay', '1');
  embedUrl.searchParams.set('controls', '1');
  embedUrl.searchParams.set('rel', '0');
  embedUrl.searchParams.set('modestbranding', '1');
  if (Number.isFinite(currentTime) && currentTime > 0) {
    embedUrl.searchParams.set('start', String(Math.floor(currentTime)));
  }
  return embedUrl.toString();
});

function syncDirectVideoTime() {
  if (!directVideoElement.value || !Number.isFinite(currentTime) || currentTime <= 0) {
    return;
  }

  try {
    if (directVideoElement.value.duration > 0) {
      directVideoElement.value.currentTime = Math.min(currentTime, directVideoElement.value.duration);
    }
  } catch {
    // Ignore if the browser refuses to seek.
  }
}

onMounted(() => {
  if (sourceType === 'direct' && directVideoElement.value && Number.isFinite(currentTime) && currentTime > 0) {
    if (directVideoElement.value.readyState >= 1) {
      syncDirectVideoTime();
    }
  }
});

const twitchEmbedUrl = computed(() => {
  if (!channel.value) {
    return '';
  }

  const embedUrl = new URL('https://player.twitch.tv/');
  embedUrl.searchParams.set('channel', channel.value);
  embedUrl.searchParams.set('autoplay', 'true');
  embedUrl.searchParams.set('muted', 'false');
  if (typeof window !== 'undefined' && window.location.hostname) {
    embedUrl.searchParams.set('parent', window.location.hostname);
  }
  return embedUrl.toString();
});

let pinnedVideoActionChannel: BroadcastChannel | null = null;

function repin() {
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      pinnedVideoActionChannel = new BroadcastChannel('agent-lobby-pinned-video-action');
      pinnedVideoActionChannel.postMessage({ type: 'pinned-video-action', action: 'repin' });
    } catch {
      // Ignore.
    } finally {
      pinnedVideoActionChannel?.close();
      pinnedVideoActionChannel = null;
    }
  } else if (window.opener && window.location.origin) {
    try {
      window.opener.postMessage({ type: 'pinned-video-action', action: 'repin' }, window.location.origin);
    } catch {
      // Ignore.
    }
  }

  window.close();
}

onBeforeUnmount(() => {
  if (pinnedVideoActionChannel) {
    pinnedVideoActionChannel.close();
    pinnedVideoActionChannel = null;
  }
});
</script>

<style scoped>
.pinned-video-window {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: var(--color-bg-base);
  color: var(--color-text-primary);
  font-family: inherit;
}

.pinned-video-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 14px;
  background: var(--color-chat-surface-strong);
  border-bottom: 1px solid var(--color-chat-border);
}

.pinned-video-bar[data-tauri-drag-region] {
  -webkit-app-region: drag;
}

.pinned-video-title {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pinned-video-repin-btn {
  border: 1px solid var(--color-accent);
  background: var(--color-agentamp-button-bg);
  color: var(--color-agentamp-button-text);
  font-family: inherit;
  text-transform: uppercase;
  font-size: 11px;
  padding: 4px 10px;
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.pinned-video-repin-btn:hover {
  background: var(--color-agentamp-button-hover-bg);
  color: var(--color-agentamp-button-hover-text);
}

.pinned-video-content {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
}

.pinned-video-frame {
  width: 100%;
  height: 100%;
  min-height: 0;
  border: 1px solid var(--color-chat-border);
  background: var(--color-video-container-bg);
}

.pinned-video-empty {
  width: 100%;
  padding: 24px;
  border: 1px solid var(--color-chat-border);
  background: var(--color-chat-surface);
  color: var(--color-chat-text);
  text-align: center;
  font-size: 12px;
  line-height: 1.5;
}
</style>
