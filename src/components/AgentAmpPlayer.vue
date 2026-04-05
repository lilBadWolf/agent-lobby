<template>
  <section class="agentamp-dock" :class="{ compact: isCompact, 'detached-window': props.detached }">
    <input
      ref="fileInputEl"
      class="agentamp-file-input"
      type="file"
      accept=".mp3,audio/mpeg"
      multiple
      @change="handleFileSelection"
    />

    <div
      class="agentamp-now-playing"
      @mouseenter="handleNowHover(true)"
      @mouseleave="handleNowHover(false)"
      @focusin="handleNowHover(true)"
      @focusout="handleNowFocusOut"
    >
      <div v-if="isCompact" class="agentamp-now-inline-controls agentamp-now-inline-row">
        <div class="agentamp-now-inline-title">
          <transition name="agentamp-now-cycle">
            <div :key="`${nowDisplayLabel}:${nowDisplayTrackName}`" class="agentamp-now-copy">
              <span class="agentamp-label" :class="nowDisplayLabelClass">{{ nowDisplayLabel }}</span>
              <span class="agentamp-track-name">{{ nowDisplayTrackName }}</span>
            </div>
          </transition>
        </div>
        <div class="agentamp-now-inline-btns">
          <button class="agentamp-btn transport-btn" type="button" :disabled="!hasTracks" data-tooltip="PREVIOUS" @click="playPrevious">&lt;&lt;</button>
          <button class="agentamp-btn transport-btn" type="button" :disabled="!hasTracks" :data-tooltip="isPlaying ? 'PAUSE' : 'PLAY'" @click="togglePlayback">
            {{ isPlaying ? '||' : '>' }}
          </button>
          <button class="agentamp-btn transport-btn" type="button" :disabled="!hasTracks" data-tooltip="STOP" @click="stopPlayback">[]</button>
          <button class="agentamp-btn transport-btn" type="button" :disabled="!canGoNext" data-tooltip="NEXT" @click="playNext">&gt;&gt;</button>
          <button
            class="agentamp-btn transport-btn"
            :class="`loop-mode-${loopMode}`"
            type="button"
            :disabled="!hasTracks"
            :data-tooltip="`LOOP: ${loopModeLabel}`"
            @click="cycleLoopMode"
          >
            {{ loopModeLabel }}
          </button>
          <button
            class="agentamp-btn transport-btn"
            :class="{ 'shuffle-active': isShuffle }"
            type="button"
            :disabled="!hasTracks"
            data-tooltip="SHUFFLE"
            @click="toggleShuffle"
          >
            ⌥
          </button>
          <button class="agentamp-icon-btn" type="button" data-tooltip="ADD" @click="openFilePicker">+</button>
        </div>
      </div>
      <div v-else class="agentamp-now-meta">
        <div class="agentamp-now-cycle-wrap">
          <transition name="agentamp-now-cycle">
            <div :key="`${nowDisplayLabel}:${nowDisplayTrackName}`" class="agentamp-now-copy">
              <span class="agentamp-label" :class="nowDisplayLabelClass">{{ nowDisplayLabel }}</span>
              <span class="agentamp-track-name">{{ nowDisplayTrackName }}</span>
            </div>
          </transition>
        </div>
      </div>
      <div class="agentamp-now-pinned-controls compact-toggle-pinned">
        <button
          class="agentamp-btn compact-toggle-btn agentamp-detached-toggle"
          type="button"
          :data-tooltip="props.detached ? 'DOCK AGENTAMP' : 'DETACH AGENTAMP'"
          @click="requestToggleDetached"
        >
          ⇄
        </button>
        <button
          class="agentamp-btn compact-toggle-btn agentamp-compact-toggle-spaced"
          type="button"
          :data-tooltip="isCompact ? 'EXPAND' : 'COMPACT'"
          @click="toggleCompactMode"
        >
          {{ compactToggleGlyph }}
        </button>
      </div>
    </div>
    <SpectrumAnalyzer
      v-show="!isCompact"
      :audioEl="audioEl"
      :enabled="props.enabled"
      :bar-count="props.spectrumBarCount"
      :fft-size="props.spectrumFftSize"
    />
    <div class="agentamp-controls">
      <button class="agentamp-btn transport-btn" type="button" :disabled="!hasTracks" data-tooltip="PREVIOUS" @click="playPrevious">&lt;&lt;</button>
      <button class="agentamp-btn transport-btn" type="button" :disabled="!hasTracks" :data-tooltip="isPlaying ? 'PAUSE' : 'PLAY'" @click="togglePlayback">
        {{ isPlaying ? '||' : '>' }}
      </button>
      <button class="agentamp-btn transport-btn" type="button" :disabled="!hasTracks" data-tooltip="STOP" @click="stopPlayback">[]</button>
      <button class="agentamp-btn transport-btn" type="button" :disabled="!canGoNext" data-tooltip="NEXT" @click="playNext">&gt;&gt;</button>
      <button class="agentamp-btn transport-btn" type="button" :disabled="!hasTracks" data-tooltip="CLEAR PLAYLIST" @click="clearPlaylist">X</button>
      <button class="agentamp-btn transport-btn" type="button" :disabled="!hasTracks" data-tooltip="SAVE PLAYLIST" @click="savePlaylistToFile">⤓</button>
      <div class="agentamp-seek-wrap">
        <span class="agentamp-timecode">{{ formatTime(currentTime) }}</span>
        <input
          class="agentamp-range agentamp-seek-range"
          type="range"
          min="0"
          :max="Math.max(duration, 1)"
          :value="currentTime"
          :disabled="!hasTracks"
          @input="seekTrack"
        />
        <span class="agentamp-timecode">{{ formatTime(duration) }}</span>
      </div>
      <label class="agentamp-volume-wrap">
        VOL
        <input
          class="agentamp-range"
          type="range"
          min="0"
          max="1"
          step="0.01"
          :value="volume"
          @input="setVolume"
        />
      </label>
      <button
        class="agentamp-btn transport-btn"
        :class="`loop-mode-${loopMode}`"
        type="button"
        :disabled="!hasTracks"
        :data-tooltip="`LOOP: ${loopModeLabel}`"
        @click="cycleLoopMode"
      >
        {{ loopModeLabel }}
      </button>
      <button
        class="agentamp-btn transport-btn"
        :class="{ 'shuffle-active': isShuffle }"
        type="button"
        :disabled="!hasTracks"
        data-tooltip="SHUFFLE"
        @click="toggleShuffle"
      >
        ⌥
      </button>
      <button
        v-if="!isCompact"
        :class="['agentamp-btn', 'transport-btn', 'agentamp-toggle-playlist-btn', { 'playlist-visible': showPlaylist }]"
        type="button"
        :data-tooltip="showPlaylist ? 'HIDE PLAYLIST' : 'SHOW PLAYLIST'"
        @click="showPlaylist = !showPlaylist"
      >
        <span v-if="showPlaylist">☰</span><span v-else>☰</span>
      </button>
      <button class="agentamp-icon-btn" type="button" data-tooltip="ADD" @click="openFilePicker">+</button>
    </div>

    <ul
      v-if="showPlaylist || isCompact"
      ref="playlistContainerEl"
      class="agentamp-playlist"
      role="listbox"
      :style="playlistStyle"
    >
      <li
        v-for="(track, index) in playlist"
        :key="track.id"
        class="agentamp-track-row"
        :class="{ active: index === currentIndex, 'drag-target': index === dragOverIndex }"
        draggable="true"
        @dragstart="handleDragStart(index, $event)"
        @dragover.prevent="handleDragOver(index, $event)"
        @drop.prevent="handleDrop(index, $event)"
        @dragend="handleDragEnd"
      >
        <button
          class="agentamp-track-btn"
          type="button"
          @dblclick="selectTrack(index)"
        >
          {{ index + 1 }}. {{ track.name }}
        </button>
        <span v-if="track.duration && track.duration > 0" class="agentamp-track-duration">
          {{ formatTrackDuration(track.duration) }}
        </span>
        <button
          class="agentamp-remove-btn"
          type="button"
          @click="removeTrack(index)"
        >
          X
        </button>
      </li>
      <li v-if="!playlist.length" class="agentamp-empty">LOAD MP3 FILES TO BUILD A PLAYLIST.</li>
    </ul>

    <audio
      ref="audioEl"
      crossorigin="anonymous"
      @loadedmetadata="handleLoadedMetadata"
      @timeupdate="handleTimeUpdate"
      @ended="handleTrackEnded"
      @play="isPlaying = true"
      @pause="isPlaying = false"
    ></audio>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue';
import { getPersistedValue, setPersistedValue, removePersistedValue } from '../composables/usePlatformStorage';
import SpectrumAnalyzer from './SpectrumAnalyzer.vue';

type TauriDialogModule = typeof import('@tauri-apps/plugin-dialog');
type TauriFsModule = typeof import('@tauri-apps/plugin-fs');
type TauriPathModule = typeof import('@tauri-apps/api/path');

const PLAYER_STORAGE_KEY = 'agent_amp_state_v1';
const AGENTAMP_STATUS_CHANNEL = 'agent-lobby-agentamp-status';
const AGENTAMP_PLAYING_STORAGE_KEY = 'agent_agentamp_playing';
const AGENTAMP_TRANSITION_KEY = 'agent_agentamp_transition';
const AGENTAMP_STOP_CHANNEL = 'agent-lobby-agentamp-stop';

type LoopMode = 'none' | 'all' | 'one';
type PlaylistSource = 'path' | 'dataUrl';

type PlaylistTrack = {
  id: string;
  name: string;
  source: PlaylistSource;
  location: string;
  duration?: number;
};

type PersistedPlayerState = {
  playlist: PlaylistTrack[];
  currentIndex: number;
  nowPlayingTrackId?: string | null;
  currentTime?: number;
  loopMode: LoopMode;
  volume: number;
  compactMode?: boolean;
  showPlaylist?: boolean;
  shuffle?: boolean;
  persistedAt?: number;
};

type TransitionState = {
  wasPlaying?: boolean;
  timestamp?: number;
  playerState?: PersistedPlayerState;
};

const emit = defineEmits<{
  'toggle-detached': [];
}>();

const props = defineProps<{
  enabled: boolean;
  detached?: boolean;
  spectrumBarCount?: number;
  spectrumFftSize?: number;
}>();

function requestToggleDetached() {
  emit('toggle-detached');
}

const playlist = ref<PlaylistTrack[]>([]);
const currentIndex = ref(-1);
const isPlaying = ref(false);
const currentTime = ref(0);
const duration = ref(0);
const volume = ref(0.82);
const loopMode = ref<LoopMode>('none');
const isShuffle = ref(false);
const shuffleHistory = ref<number[]>([]);
const isCompact = ref(false);
const showPlaylist = ref(true);
const isNowHovered = ref(false);
const nowDisplayMode = ref<'now' | 'next' | 'then'>('now');
const dragFromIndex = ref<number | null>(null);
const dragOverIndex = ref<number | null>(null);
const fileInputEl = ref<HTMLInputElement | null>(null);
const audioEl = ref<HTMLAudioElement | null>(null);
const playlistContainerEl = ref<HTMLElement | null>(null);
let nowCycleInterval: ReturnType<typeof setInterval> | null = null;
let tauriDialogPromise: Promise<TauriDialogModule | null> | null = null;
let tauriConvertFileSrcPromise: Promise<((filePath: string) => string) | null> | null = null;
let tauriFsPromise: Promise<TauriFsModule | null> | null = null;
let tauriPathPromise: Promise<TauriPathModule | null> | null = null;
let pendingRestoreTime = 0;
let pendingAutoplay = false;
let lastPersistedPlaybackTime = -1;
let agentAmpStatusChannel: BroadcastChannel | null = null;
let agentAmpStopChannel: BroadcastChannel | null = null;

const currentTrack = computed(() => {
  if (currentIndex.value < 0 || currentIndex.value >= playlist.value.length) {
    return null;
  }

  return playlist.value[currentIndex.value];
});

const hasTracks = computed(() => playlist.value.length > 0);
const canGoNext = computed(() => {
  if (!playlist.value.length) {
    return false;
  }

  if (loopMode.value === 'none') {
    if (currentIndex.value < 0) {
      return true;
    }

    return currentIndex.value < playlist.value.length - 1;
  }

  return true;
});

function getUpcomingTrack(offset: number): PlaylistTrack | null {
  const total = playlist.value.length;
  if (!total || offset < 1) {
    return null;
  }

  if (currentIndex.value < 0) {
    const idx = offset - 1;
    return idx < total ? playlist.value[idx] : null;
  }

  if (isShuffle.value) {
    return null;
  }

  if (loopMode.value === 'none') {
    const idx = currentIndex.value + offset;
    return idx < total ? playlist.value[idx] : null;
  }

  return playlist.value[(currentIndex.value + offset) % total] ?? null;
}

const nextTrack = computed(() => {
  return getUpcomingTrack(1);
});

const thenTrack = computed(() => {
  return getUpcomingTrack(2);
});

const playlistStyle = computed<CSSProperties>(() => {
  const preferredHeight = playlist.value.length > 0 ? `${Math.min(playlist.value.length, 5) * 34}px` : '140px';

  if (props.detached && !isCompact.value) {
    return {
      height: 'var(--agentamp-detached-playlist-height, auto)',
      maxHeight: 'var(--agentamp-detached-playlist-max-height, 999px)',
      overflowY: 'auto',
      minHeight: 0,
      flex: '0 0 auto',
    };
  }

  return {
    maxHeight: preferredHeight,
    overflowY: playlist.value.length > 5 ? 'auto' : 'hidden',
  };
});

function scrollActiveTrackIntoView() {
  if (!playlistContainerEl.value) {
    return;
  }

  const activeTrack = playlistContainerEl.value.querySelector<HTMLElement>('.agentamp-track-row.active');
  if (!activeTrack) {
    return;
  }

  activeTrack.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
}

const cycleModes = computed<Array<'now' | 'next' | 'then'>>(() => {
  const modes: Array<'now' | 'next' | 'then'> = ['now'];
  if (isShuffle.value) {
    if (playlist.value.length > 1) {
      modes.push('next');
    }
    if (playlist.value.length > 2) {
      modes.push('then');
    }
    return modes;
  }
  if (nextTrack.value) {
    modes.push('next');
  }
  if (thenTrack.value) {
    modes.push('then');
  }
  return modes;
});

const loopModeLabel = computed(() => {
  if (loopMode.value === 'one') {
    return 'ONE';
  }

  if (loopMode.value === 'all') {
    return 'ALL';
  }

  return 'OFF';
});

const nowDisplayLabel = computed(() => {
  if (isShuffle.value && nowDisplayMode.value === 'next') {
    return 'NEXT:';
  }

  if (isShuffle.value && nowDisplayMode.value === 'then') {
    return 'THEN:';
  }

  if (nowDisplayMode.value === 'next' && nextTrack.value && nextTrack.value !== currentTrack.value) {
    return 'NEXT:';
  }

  if (nowDisplayMode.value === 'then' && thenTrack.value && thenTrack.value !== currentTrack.value) {
    return 'THEN:';
  }

  return 'NOW:';
});

const nowDisplayTrackName = computed(() => {
  if (isShuffle.value && (nowDisplayMode.value === 'next' || nowDisplayMode.value === 'then')) {
    return 'SHUFFLE';
  }

  if (loopMode.value === 'one' && (nowDisplayMode.value === 'next' || nowDisplayMode.value === 'then')) {
    return currentTrack.value?.name || 'NO TRACK LOADED';
  }

  if (nowDisplayMode.value === 'next' && nextTrack.value && nextTrack.value !== currentTrack.value) {
    return nextTrack.value.name;
  }

  if (nowDisplayMode.value === 'then' && thenTrack.value && thenTrack.value !== currentTrack.value) {
    return thenTrack.value.name;
  }

  return currentTrack.value?.name || 'NO TRACK LOADED';
});

const nowDisplayLabelClass = computed(() => {
  if (nowDisplayMode.value === 'next') {
    return 'label-next';
  }

  if (nowDisplayMode.value === 'then') {
    return 'label-then';
  }

  return 'label-now';
});

const compactToggleGlyph = computed(() => (isCompact.value ? '︾' : '︽'));

watch(audioEl, (element) => {
  if (!element) {
    return;
  }

  element.volume = volume.value;
});

watch(volume, (nextVolume) => {
  if (audioEl.value) {
    audioEl.value.volume = nextVolume;
  }
});

watch(
  [playlist, currentIndex, loopMode, isShuffle, volume, isCompact, showPlaylist],
  () => {
    void persistPlayerState();
  },
  { deep: true }
);

watch(showPlaylist, async (visible) => {
  if (!visible) {
    return;
  }

  await nextTick();
  scrollActiveTrackIntoView();
});

watch([isCompact, isNowHovered, playlist, currentIndex], () => {
  restartNowCycle();
}, { deep: true });

watch(
  () => props.enabled,
  (enabled) => {
    if (enabled) {
      return;
    }

    audioEl.value?.pause();
    isPlaying.value = false;
  }
);

watch([isPlaying, currentTrack], () => {
  publishPlaybackState();
});

function publishPlaybackState() {
  const playing = Boolean(isPlaying.value && currentTrack.value);

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(AGENTAMP_PLAYING_STORAGE_KEY, playing ? '1' : '0');
    } catch {
      // Ignore localStorage write failures.
    }
  }

  if (typeof BroadcastChannel !== 'undefined') {
    if (!agentAmpStatusChannel) {
      agentAmpStatusChannel = new BroadcastChannel(AGENTAMP_STATUS_CHANNEL);
    }

    agentAmpStatusChannel.postMessage({ type: 'playback-state', playing });
  }
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function getTauriDialogOpen() {
  if (!isTauriRuntime()) {
    return null;
  }

  if (!tauriDialogPromise) {
    tauriDialogPromise = import('@tauri-apps/plugin-dialog')
      .catch(() => null);
  }

  const dialog = await tauriDialogPromise;
  return dialog?.open ?? null;
}

async function getTauriDialogSave() {
  if (!isTauriRuntime()) {
    return null;
  }

  if (!tauriDialogPromise) {
    tauriDialogPromise = import('@tauri-apps/plugin-dialog')
      .catch(() => null);
  }

  const dialog = await tauriDialogPromise;
  return dialog?.save ?? null;
}

async function getTauriConvertFileSrc() {
  if (!isTauriRuntime()) {
    return null;
  }

  if (!tauriConvertFileSrcPromise) {
    tauriConvertFileSrcPromise = import('@tauri-apps/api/core')
      .then((mod) => mod.convertFileSrc)
      .catch(() => null);
  }

  return tauriConvertFileSrcPromise;
}

async function getTauriFs() {
  if (!isTauriRuntime()) {
    return null;
  }

  if (!tauriFsPromise) {
    tauriFsPromise = import('@tauri-apps/plugin-fs')
      .catch(() => null);
  }

  return tauriFsPromise;
}

async function getTauriPath() {
  if (!isTauriRuntime()) {
    return null;
  }

  if (!tauriPathPromise) {
    tauriPathPromise = import('@tauri-apps/api/path')
      .catch(() => null);
  }

  return tauriPathPromise;
}

function extractNameFromPath(path: string): string {
  const segments = path.split(/[\\/]/).filter(Boolean);
  const filename = segments[segments.length - 1] ?? path;
  return filename.replace(/\.mp3$/i, '');
}

async function addTracksFromPaths(paths: string[]) {
  const normalized = paths
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && /\.mp3$/i.test(entry));

  if (!normalized.length) {
    return;
  }

  const nextTracks: PlaylistTrack[] = normalized.map((path, index) => ({
    id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    name: extractNameFromPath(path),
    source: 'path',
    location: path,
  }));

  playlist.value = [...playlist.value, ...nextTracks];

  if (currentIndex.value < 0) {
    currentIndex.value = 0;
    loadCurrentTrack(false);
  }

  void loadPlaylistMetadata(nextTracks);
  await persistPlayerState();
}

async function loadTrackMetadata(track: PlaylistTrack): Promise<void> {
  if (typeof track.duration === 'number' && track.duration > 0) {
    return;
  }

  const metadataAudio = document.createElement('audio');
  metadataAudio.preload = 'metadata';

  if (track.source === 'path') {
    const convertFileSrc = await getTauriConvertFileSrc();
    if (!convertFileSrc) {
      return;
    }

    metadataAudio.src = convertFileSrc(track.location);
  } else {
    metadataAudio.src = track.location;
  }

  await new Promise<void>((resolve) => {
    const cleanup = () => {
      metadataAudio.removeEventListener('loadedmetadata', onLoadedMetadata);
      metadataAudio.removeEventListener('error', onError);
      resolve();
    };

    const onLoadedMetadata = () => {
      const trackDuration = Number.isFinite(metadataAudio.duration) ? metadataAudio.duration : 0;
      if (trackDuration > 0) {
        track.duration = trackDuration;
      }
      cleanup();
    };

    const onError = () => {
      cleanup();
    };

    metadataAudio.addEventListener('loadedmetadata', onLoadedMetadata);
    metadataAudio.addEventListener('error', onError);
    metadataAudio.load();
  });
}

async function loadPlaylistMetadata(tracks: PlaylistTrack[]) {
  for (const track of tracks) {
    await loadTrackMetadata(track);
  }
}

function isPlaylistPath(path: string): boolean {
  return /\.(m3u8?|pls)$/i.test(path);
}

function isAbsolutePath(path: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(path) || /^\\\\/.test(path) || path.startsWith('/');
}

function parsePlaylistEntries(content: string): string[] {
  const entries: string[] = [];
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const plsMatch = line.match(/^File\d+\s*=\s*(.+)$/i);
    if (plsMatch?.[1]) {
      entries.push(plsMatch[1].trim());
      continue;
    }

    entries.push(line);
  }

  return entries.filter((entry) => /\.mp3(\?|$)/i.test(entry));
}

async function resolvePlaylistEntryPath(entry: string, playlistPath: string): Promise<string | null> {
  if (!entry) {
    return null;
  }

  if (isAbsolutePath(entry)) {
    return entry;
  }

  const pathApi = await getTauriPath();
  if (!pathApi) {
    return null;
  }

  try {
    const playlistDir = await pathApi.dirname(playlistPath);
    return await pathApi.join(playlistDir, entry);
  } catch {
    return null;
  }
}

async function addTracksFromPlaylistFile(playlistPath: string) {
  const fsApi = await getTauriFs();
  if (!fsApi) {
    return;
  }

  try {
    const content = await fsApi.readTextFile(playlistPath);
    const entries = parsePlaylistEntries(content);
    if (!entries.length) {
      return;
    }

    const resolvedEntries = await Promise.all(
      entries.map((entry) => resolvePlaylistEntryPath(entry, playlistPath))
    );

    const tracks = resolvedEntries.filter((entry): entry is string => Boolean(entry));
    if (!tracks.length) {
      return;
    }

    await addTracksFromPaths(tracks);
  } catch {
    // Ignore malformed or unreadable playlist files.
  }
}

function serializePlaylistAsM3u(): string {
  const lines = ['#EXTM3U'];

  for (const track of playlist.value) {
    if (track.source !== 'path') {
      continue;
    }

    lines.push(`#EXTINF:-1,${track.name}`);
    lines.push(track.location);
  }

  return `${lines.join('\n')}\n`;
}

function triggerTextDownload(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
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

async function savePlaylistToFile() {
  if (!playlist.value.length) {
    return;
  }

  const content = serializePlaylistAsM3u();

  if (!isTauriRuntime()) {
    triggerTextDownload(content, 'agentamp-playlist.m3u', 'audio/x-mpegurl');
    return;
  }

  const dialogSave = await getTauriDialogSave();
  if (!dialogSave) {
    return;
  }

  const targetPath = await dialogSave({
    defaultPath: 'agentamp-playlist.m3u',
    filters: [{ name: 'M3U Playlist', extensions: ['m3u'] }],
  });

  if (!targetPath) {
    return;
  }

  const fsApi = await getTauriFs();
  if (!fsApi) {
    return;
  }

  try {
    await fsApi.writeTextFile(targetPath, content);
  } catch {
    // Ignore save failures.
  }
}

async function openFilePicker() {
  if (isTauriRuntime()) {
    const dialogOpen = await getTauriDialogOpen();
    if (!dialogOpen) {
      return;
    }

    const selection = await dialogOpen({
      multiple: true,
      filters: [
        { name: 'Audio and Playlists', extensions: ['mp3', 'm3u', 'm3u8', 'pls'] },
        { name: 'MP3 Audio', extensions: ['mp3'] },
        { name: 'Playlists', extensions: ['m3u', 'm3u8', 'pls'] },
      ],
    });

    if (!selection) {
      return;
    }

    const selectedPaths = Array.isArray(selection) ? selection : [selection];
    const audioPaths = selectedPaths.filter((path) => !isPlaylistPath(path));
    const playlistPaths = selectedPaths.filter((path) => isPlaylistPath(path));

    if (audioPaths.length) {
      await addTracksFromPaths(audioPaths);
    }

    for (const playlistPath of playlistPaths) {
      await addTracksFromPlaylistFile(playlistPath);
    }

    return;
  }

  fileInputEl.value?.click();
}

async function handleFileSelection(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []).filter((file) => {
    if (file.type === 'audio/mpeg') {
      return true;
    }

    return file.name.toLowerCase().endsWith('.mp3');
  });

  if (!files.length) {
    input.value = '';
    return;
  }

  const nextTracks = await Promise.all(
    files.map(async (file, index) => ({
      id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
      name: file.name.replace(/\.mp3$/i, ''),
      source: 'dataUrl' as const,
      location: await readFileAsDataUrl(file),
    }))
  );

  playlist.value = [...playlist.value, ...nextTracks];

  if (currentIndex.value < 0) {
    currentIndex.value = 0;
    loadCurrentTrack(false);
  }

  void loadPlaylistMetadata(nextTracks);
  await persistPlayerState();

  input.value = '';
}

function loadCurrentTrack(autoplay: boolean, resumeTime = 0) {
  const player = audioEl.value;
  const track = currentTrack.value;
  if (!player || !track) {
    return;
  }

  pendingRestoreTime = Number.isFinite(resumeTime) && resumeTime > 0 ? resumeTime : 0;

  pendingAutoplay = autoplay;

  if (track.source === 'path') {
    player.crossOrigin = 'anonymous';
    void getTauriConvertFileSrc().then((convertFileSrc) => {
      if (!convertFileSrc) {
        return;
      }

      player.src = convertFileSrc(track.location);
      player.currentTime = 0;
      currentTime.value = pendingRestoreTime;
      duration.value = 0;
    });
    return;
  }

  player.src = track.location;
  player.currentTime = 0;
  currentTime.value = pendingRestoreTime;
  duration.value = 0;
}

function togglePlayback() {
  const player = audioEl.value;
  if (!player) {
    return;
  }

  if (!currentTrack.value && playlist.value.length > 0) {
    currentIndex.value = 0;
    loadCurrentTrack(false);
  }

  if (player.paused) {
    void player.play().catch(() => {
      isPlaying.value = false;
    });
  } else {
    player.pause();
  }
}

function stopPlayback() {
  const player = audioEl.value;
  if (!player) {
    return;
  }

  player.pause();
  player.currentTime = 0;
  currentTime.value = 0;
}

function pickShuffleIndex(): number {
  const total = playlist.value.length;
  if (total <= 1) {
    return 0;
  }

  let next: number;
  do {
    next = Math.floor(Math.random() * total);
  } while (next === currentIndex.value);

  return next;
}

function playNext() {
  if (!playlist.value.length) {
    return;
  }

  if (loopMode.value === 'one') {
    restartCurrentTrack();
    return;
  }

  if (isShuffle.value) {
    if (currentIndex.value >= 0) {
      shuffleHistory.value.push(currentIndex.value);
    }
    currentIndex.value = pickShuffleIndex();
    loadCurrentTrack(true);
    return;
  }

  if (loopMode.value === 'none') {
    if (currentIndex.value < 0) {
      currentIndex.value = 0;
      loadCurrentTrack(true);
      return;
    }

    if (currentIndex.value >= playlist.value.length - 1) {
      return;
    }

    currentIndex.value += 1;
    loadCurrentTrack(true);
    return;
  }

  currentIndex.value = (currentIndex.value + 1 + playlist.value.length) % playlist.value.length;
  loadCurrentTrack(true);
}

function playPrevious() {
  if (!playlist.value.length) {
    return;
  }

  if (loopMode.value === 'one') {
    restartCurrentTrack();
    return;
  }

  if (isShuffle.value) {
    const prev = shuffleHistory.value.pop();
    if (prev !== undefined) {
      currentIndex.value = prev;
      loadCurrentTrack(true);
    } else {
      restartCurrentTrack();
    }
    return;
  }

  if (loopMode.value === 'none') {
    if (currentIndex.value <= 0) {
      restartCurrentTrack();
      return;
    }

    currentIndex.value -= 1;
    loadCurrentTrack(true);
    return;
  }

  currentIndex.value = (currentIndex.value - 1 + playlist.value.length) % playlist.value.length;
  loadCurrentTrack(true);
}

function restartCurrentTrack() {
  const player = audioEl.value;
  if (!player) {
    return;
  }

  player.currentTime = 0;
  currentTime.value = 0;

  if (!player.paused) {
    void player.play().catch(() => {
      isPlaying.value = false;
    });
  }
}

function seekTrack(event: Event) {
  const target = event.target as HTMLInputElement;
  const nextTime = Number(target.value) || 0;
  currentTime.value = nextTime;

  if (audioEl.value) {
    audioEl.value.currentTime = nextTime;
  }
}

function setVolume(event: Event) {
  const target = event.target as HTMLInputElement;
  const nextVolume = Math.max(0, Math.min(1, Number(target.value) || 0));
  volume.value = nextVolume;

  if (audioEl.value) {
    audioEl.value.volume = nextVolume;
  }
}

function selectTrack(index: number) {
  if (index < 0 || index >= playlist.value.length) {
    return;
  }

  currentIndex.value = index;
  loadCurrentTrack(true);
}

function removeTrack(index: number) {
  const targetTrack = playlist.value[index];
  if (!targetTrack) {
    return;
  }

  playlist.value.splice(index, 1);

  if (!playlist.value.length) {
    currentIndex.value = -1;
    stopPlayback();
    if (audioEl.value) {
      audioEl.value.removeAttribute('src');
      audioEl.value.load();
    }
    return;
  }

  if (index < currentIndex.value) {
    currentIndex.value -= 1;
    return;
  }

  if (index === currentIndex.value) {
    currentIndex.value = Math.min(currentIndex.value, playlist.value.length - 1);
    loadCurrentTrack(true);
  }
}

function handleDragStart(index: number, event: DragEvent) {
  dragFromIndex.value = index;
  dragOverIndex.value = index;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
  }
}

function handleDragOver(index: number, event: DragEvent) {
  event.dataTransfer!.dropEffect = 'move';
  dragOverIndex.value = index;
}

function handleDrop(index: number, event: DragEvent) {
  const sourceIndex = dragFromIndex.value ?? Number(event.dataTransfer?.getData('text/plain'));
  if (!Number.isInteger(sourceIndex)) {
    handleDragEnd();
    return;
  }

  moveTrack(sourceIndex, index);
  handleDragEnd();
}

function handleDragEnd() {
  dragFromIndex.value = null;
  dragOverIndex.value = null;
}

function moveTrack(fromIndex: number, toIndex: number) {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= playlist.value.length ||
    toIndex >= playlist.value.length ||
    fromIndex === toIndex
  ) {
    return;
  }

  const [movedTrack] = playlist.value.splice(fromIndex, 1);
  playlist.value.splice(toIndex, 0, movedTrack);

  if (currentIndex.value === fromIndex) {
    currentIndex.value = toIndex;
    return;
  }

  if (fromIndex < currentIndex.value && toIndex >= currentIndex.value) {
    currentIndex.value -= 1;
    return;
  }

  if (fromIndex > currentIndex.value && toIndex <= currentIndex.value) {
    currentIndex.value += 1;
  }
}

function clearPlaylist() {
  playlist.value = [];
  currentIndex.value = -1;
  currentTime.value = 0;
  duration.value = 0;
  shuffleHistory.value = [];
  pendingRestoreTime = 0;
  lastPersistedPlaybackTime = -1;

  if (audioEl.value) {
    audioEl.value.pause();
    audioEl.value.removeAttribute('src');
    audioEl.value.load();
  }
}

function handleLoadedMetadata() {
  const player = audioEl.value;
  if (!player) {
    return;
  }

  duration.value = Number.isFinite(player.duration) ? player.duration : 0;

  if (pendingRestoreTime > 0) {
    const maxDuration = Number.isFinite(player.duration) ? player.duration : pendingRestoreTime;
    const seekTo = Math.max(0, Math.min(pendingRestoreTime, maxDuration));
    player.currentTime = seekTo;
    currentTime.value = seekTo;
    pendingRestoreTime = 0;
  }

  if (currentTrack.value && Number.isFinite(duration.value) && duration.value > 0) {
    currentTrack.value.duration = duration.value;
  }

  if (pendingAutoplay) {
    pendingAutoplay = false;
    void player.play().catch(() => {
      isPlaying.value = false;
    });
  }
}

function formatTrackDuration(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return '';
  }

  return formatTime(value);
}

function handleTimeUpdate() {
  const player = audioEl.value;
  if (!player) {
    return;
  }

  currentTime.value = Number.isFinite(player.currentTime) ? player.currentTime : 0;

  if (Math.abs(currentTime.value - lastPersistedPlaybackTime) >= 2) {
    lastPersistedPlaybackTime = currentTime.value;
    void persistPlayerState();
  }
}

function handleTrackEnded() {
  const trackCount = playlist.value.length;
  if (!trackCount) {
    stopPlayback();
    return;
  }

  if (loopMode.value === 'one') {
    const player = audioEl.value;
    if (!player) {
      return;
    }

    player.currentTime = 0;
    void player.play().catch(() => {
      isPlaying.value = false;
    });
    return;
  }

  const isLastTrack = currentIndex.value >= trackCount - 1;
  if (isLastTrack && loopMode.value === 'none' && !isShuffle.value) {
    stopPlayback();
    return;
  }

  playNext();
}

function cycleLoopMode() {
  if (loopMode.value === 'none') {
    loopMode.value = 'all';
    return;
  }

  if (loopMode.value === 'all') {
    loopMode.value = 'one';
    return;
  }

  loopMode.value = 'none';
}

function toggleShuffle() {
  isShuffle.value = !isShuffle.value;
}

function toggleCompactMode() {
  isCompact.value = !isCompact.value;
}

function handleNowHover(hovered: boolean) {
  isNowHovered.value = hovered;
}

function handleNowFocusOut(event: FocusEvent) {
  const currentTarget = event.currentTarget as HTMLElement | null;
  const relatedTarget = event.relatedTarget as Node | null;
  if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget)) {
    return;
  }

  isNowHovered.value = false;
}

function restartNowCycle() {
  if (nowCycleInterval) {
    clearInterval(nowCycleInterval);
    nowCycleInterval = null;
  }

  nowDisplayMode.value = 'now';

  const modes = cycleModes.value;
  const canCycle = !isNowHovered.value && modes.length > 1;
  if (!canCycle) {
    return;
  }

  nowCycleInterval = setInterval(() => {
    const currentModeIndex = modes.indexOf(nowDisplayMode.value);
    const nextModeIndex = currentModeIndex < 0 ? 0 : (currentModeIndex + 1) % modes.length;
    nowDisplayMode.value = modes[nextModeIndex];
  }, 3800);
}

function flushPlayerStateOnShutdown() {
  void persistPlayerState();
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Unable to encode file'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('Unable to encode file'));
    reader.readAsDataURL(file);
  });
}

function readLocalPlayerState(): Partial<PersistedPlayerState> | null {
  try {
    const raw = localStorage.getItem(PLAYER_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as Partial<PersistedPlayerState>;
  } catch {
    return null;
  }
}

function resolveRestoredState(
  fromStore: Partial<PersistedPlayerState> | null,
  fromLocal: Partial<PersistedPlayerState> | null
): Partial<PersistedPlayerState> | null {
  if (fromStore && !fromLocal) {
    return fromStore;
  }

  if (!fromStore && fromLocal) {
    return fromLocal;
  }

  if (!fromStore && !fromLocal) {
    return null;
  }

  const storeTs = Number(fromStore?.persistedAt);
  const localTs = Number(fromLocal?.persistedAt);
  const hasStoreTs = Number.isFinite(storeTs);
  const hasLocalTs = Number.isFinite(localTs);

  if (hasStoreTs && hasLocalTs) {
    return localTs >= storeTs ? fromLocal : fromStore;
  }

  if (hasLocalTs) {
    return fromLocal;
  }

  if (hasStoreTs) {
    return fromStore;
  }

  // Legacy snapshots may not have timestamps; prefer local as the most immediate source.
  return fromLocal;
}

function readLocalTransitionState(): TransitionState | null {
  try {
    const raw = localStorage.getItem(AGENTAMP_TRANSITION_KEY);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as TransitionState;
  } catch {
    return null;
  }
}

function resolveTransitionState(
  fromStore: TransitionState | null,
  fromLocal: TransitionState | null
): TransitionState | null {
  if (fromStore && !fromLocal) {
    return fromStore;
  }

  if (!fromStore && fromLocal) {
    return fromLocal;
  }

  if (!fromStore && !fromLocal) {
    return null;
  }

  const storeTs = Number(fromStore?.timestamp);
  const localTs = Number(fromLocal?.timestamp);
  const hasStoreTs = Number.isFinite(storeTs);
  const hasLocalTs = Number.isFinite(localTs);

  if (hasStoreTs && hasLocalTs) {
    return localTs >= storeTs ? fromLocal : fromStore;
  }

  return fromLocal ?? fromStore;
}

function buildPersistedPlayerStateSnapshot(): PersistedPlayerState {
  const liveCurrentTime = Number.isFinite(audioEl.value?.currentTime)
    ? (audioEl.value?.currentTime ?? 0)
    : currentTime.value;

  return {
    playlist: [...playlist.value],
    currentIndex: currentIndex.value,
    nowPlayingTrackId: currentTrack.value?.id ?? null,
    currentTime: Math.max(0, liveCurrentTime),
    loopMode: loopMode.value,
    volume: volume.value,
    compactMode: isCompact.value,
    showPlaylist: showPlaylist.value,
    shuffle: isShuffle.value,
    persistedAt: Date.now(),
  };
}

function writeTransitionState(state: TransitionState) {
  try {
    localStorage.setItem(AGENTAMP_TRANSITION_KEY, JSON.stringify(state));
  } catch {
    // Ignore
  }

  void setPersistedValue(AGENTAMP_TRANSITION_KEY, state);
}

async function persistPlayerState() {
  try {
    const serialized = buildPersistedPlayerStateSnapshot();

    localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(serialized));
    await setPersistedValue(PLAYER_STORAGE_KEY, serialized);
  } catch {
    // Ignore storage quota/persistence failures.
  }
}

async function restorePlayerState() {
  let parsed: Partial<PersistedPlayerState> | null = null;
  let storeState: Partial<PersistedPlayerState> | null = null;
  let shouldAutoplay = false;
  let hasFreshTransition = false;

  try {
    const storedTransition = await getPersistedValue<TransitionState>(AGENTAMP_TRANSITION_KEY);
    const localTransition = readLocalTransitionState();
    const transition = resolveTransitionState(storedTransition ?? null, localTransition);

    if (transition) {
      const age = Date.now() - (transition.timestamp ?? 0);
      const isFresh = Number.isFinite(age) && age >= 0 && age < 10_000;

      if (isFresh) {
        hasFreshTransition = true;
        shouldAutoplay = transition.wasPlaying === true;
        if (transition.playerState) {
          parsed = transition.playerState;
        }
      }
    }

    // Consume the transition key once this instance has started restoring.
    void removePersistedValue(AGENTAMP_TRANSITION_KEY);
    localStorage.removeItem(AGENTAMP_TRANSITION_KEY);
  } catch {
    // Ignore
  }

  if (!parsed) {
    if (hasFreshTransition) {
      // During detach/dock handoff, never fall back to older snapshots.
      return;
    }

    try {
      const persisted = await getPersistedValue<Partial<PersistedPlayerState>>(PLAYER_STORAGE_KEY);
      if (persisted) {
        storeState = persisted;
      }
    } catch {
      storeState = null;
    }

    const localState = readLocalPlayerState();
    parsed = resolveRestoredState(storeState, localState);
  }

  if (!parsed) {
    return;
  }

  try {
    const restoredTracks = Array.isArray(parsed.playlist)
      ? parsed.playlist
          .map((track): PlaylistTrack | null => {
            if (!track || typeof track.id !== 'string' || typeof track.name !== 'string') {
              return null;
            }

            if (track.source === 'path' && typeof track.location === 'string') {
              return { id: track.id, name: track.name, source: 'path', location: track.location };
            }

            // Migration from old dataUrl-only shape.
            if (typeof (track as { dataUrl?: unknown }).dataUrl === 'string') {
              const legacyTrack = track as unknown as { id: string; name: string; dataUrl: string };
              return {
                id: legacyTrack.id,
                name: legacyTrack.name,
                source: 'dataUrl',
                location: legacyTrack.dataUrl,
              };
            }

            if (track.source === 'dataUrl' && typeof track.location === 'string') {
              return { id: track.id, name: track.name, source: 'dataUrl', location: track.location };
            }

            return null;
          })
          .filter((track): track is PlaylistTrack => Boolean(track))
      : [];

    playlist.value = restoredTracks;

    const persistedTrackId = typeof parsed.nowPlayingTrackId === 'string' ? parsed.nowPlayingTrackId : null;
    const persistedIndex = Number(parsed.currentIndex ?? 0);
    const trackIndexById = persistedTrackId
      ? restoredTracks.findIndex((track) => track.id === persistedTrackId)
      : -1;

    const resolvedIndex = trackIndexById >= 0
      ? trackIndexById
      : Math.max(0, Math.min(persistedIndex, restoredTracks.length - 1));

    currentIndex.value = restoredTracks.length > 0 ? resolvedIndex : -1;

    const persistedCurrentTime = Number(parsed.currentTime);
    currentTime.value = Number.isFinite(persistedCurrentTime) && persistedCurrentTime > 0
      ? persistedCurrentTime
      : 0;

    const parsedLoopMode = parsed.loopMode;
    loopMode.value = parsedLoopMode === 'all' || parsedLoopMode === 'one' ? parsedLoopMode : 'none';

    const parsedVolume = Number(parsed.volume);
    if (Number.isFinite(parsedVolume)) {
      volume.value = Math.max(0, Math.min(1, parsedVolume));
    }

    isCompact.value = Boolean(parsed.compactMode);
    if (typeof parsed.showPlaylist === 'boolean') {
      showPlaylist.value = parsed.showPlaylist;
    }
    isShuffle.value = Boolean(parsed.shuffle);

    if (currentIndex.value >= 0) {
      loadCurrentTrack(shouldAutoplay, currentTime.value);
    }

    if (playlist.value.length > 0) {
      void loadPlaylistMetadata(playlist.value);
    }
  } catch {
    localStorage.removeItem(PLAYER_STORAGE_KEY);
    void removePersistedValue(PLAYER_STORAGE_KEY);
  }
}

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0:00';
  }

  const whole = Math.floor(value);
  const minutes = Math.floor(whole / 60);
  const seconds = whole % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

onMounted(() => {
  window.addEventListener('pagehide', flushPlayerStateOnShutdown);
  window.addEventListener('beforeunload', flushPlayerStateOnShutdown);

  // When detached, listen for a stop-for-transition signal from the main app
  // so audio stops immediately before the docked player starts playing.
  if (props.detached && typeof BroadcastChannel !== 'undefined') {
    agentAmpStopChannel = new BroadcastChannel(AGENTAMP_STOP_CHANNEL);
    agentAmpStopChannel.onmessage = (event) => {
      if (event.data === 'stop-for-transition') {
        // Write handoff state immediately so the docked instance can restore
        // from live detached state before this window is actually closed.
        writeTransitionState({
          wasPlaying: isPlaying.value,
          timestamp: Date.now(),
          playerState: buildPersistedPlayerStateSnapshot(),
        });

        audioEl.value?.pause();
        isPlaying.value = false;
      }
    };
  }

  restorePlayerState();
  restartNowCycle();
  publishPlaybackState();
});

onBeforeUnmount(() => {
  window.removeEventListener('pagehide', flushPlayerStateOnShutdown);
  window.removeEventListener('beforeunload', flushPlayerStateOnShutdown);

  agentAmpStopChannel?.close();
  agentAmpStopChannel = null;

  // Write a full handoff payload so the next player instance restores exact live state.
  writeTransitionState({
    wasPlaying: isPlaying.value,
    timestamp: Date.now(),
    playerState: buildPersistedPlayerStateSnapshot(),
  });

  isPlaying.value = false;
  publishPlaybackState();
  flushPlayerStateOnShutdown();

  if (nowCycleInterval) {
    clearInterval(nowCycleInterval);
    nowCycleInterval = null;
  }

  if (agentAmpStatusChannel) {
    agentAmpStatusChannel.close();
    agentAmpStatusChannel = null;
  }
});
</script>

<style scoped>
.agentamp-dock {
  border-top: 1px solid var(--color-agentamp-border);
  background: var(--color-agentamp-bg);
  padding: 10px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 180px;
  position: relative;
  overflow: visible;
}

.agentamp-controls {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 6px;
}

.agentamp-btn {
  background: transparent;
  border: 1px solid var(--color-agentamp-button-border);
  color: var(--color-accent);
  font-family: inherit;
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 0.8px;
  padding: 5px 8px;
  cursor: pointer;
}

.agentamp-icon-btn {
  width: 24px;
  height: 24px;
  min-width: 24px;
  padding: 0;
  border: 1px solid var(--color-accent);
  background: transparent;
  color: var(--color-accent);
  font-family: inherit;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}

.agentamp-icon-btn:hover {
  background: var(--color-accent);
  color: var(--color-on-accent);
}

.agentamp-btn:hover:not(:disabled) {
  background: var(--color-accent);
  color: var(--color-on-accent);
}

.agentamp-controls [data-tooltip],
.agentamp-now-playing [data-tooltip] {
  position: relative;
}

.agentamp-now-playing .compact-toggle-pinned {
  position: absolute;
  top: 50%;
  right: 8px;
  transform: translateY(-50%);
  display: inline-flex;
  gap: 4px;
  align-items: center;
  justify-content: center;
}

.agentamp-controls [data-tooltip]::after,
.agentamp-now-playing [data-tooltip]::after {
  content: attr(data-tooltip);
  position: absolute;
  left: 50%;
  bottom: calc(100% + 7px);
  transform: translateX(-50%) translateY(2px);
  border: 1px solid var(--color-accent);
  background: var(--color-chat-surface-strong);
  color: var(--color-chat-text);
  text-transform: uppercase;
  font-size: 10px;
  letter-spacing: 0.55px;
  white-space: nowrap;
  padding: 3px 7px;
  border-radius: 2px;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  z-index: 22;
  box-shadow: 0 0 10px var(--color-accent-muted);
  transition: opacity 0.16s ease, transform 0.16s ease, visibility 0.16s ease;
}

.agentamp-controls [data-tooltip]::before,
.agentamp-now-playing [data-tooltip]::before {
  content: '';
  position: absolute;
  left: 50%;
  bottom: calc(100% + 2px);
  transform: translateX(-50%);
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 5px solid var(--color-accent);
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  z-index: 21;
  transition: opacity 0.16s ease, visibility 0.16s ease;
}

.agentamp-controls [data-tooltip]:hover:not(:disabled)::after,
.agentamp-controls [data-tooltip]:focus-visible:not(:disabled)::after,
.agentamp-now-playing [data-tooltip]:hover:not(:disabled)::after,
.agentamp-now-playing [data-tooltip]:focus-visible:not(:disabled)::after {
  opacity: 1;
  visibility: visible;
  transform: translateX(-50%) translateY(0);
}

.agentamp-controls [data-tooltip]:hover:not(:disabled)::before,
.agentamp-controls [data-tooltip]:focus-visible:not(:disabled)::before,
.agentamp-now-playing [data-tooltip]:hover:not(:disabled)::before,
.agentamp-now-playing [data-tooltip]:focus-visible:not(:disabled)::before {
  opacity: 1;
  visibility: visible;
}

.transport-btn {
  min-width: 34px;
  height: 24px;
  padding: 0 6px;
  border-color: var(--color-agentamp-button-border);
  background: var(--color-agentamp-button-bg);
  color: var(--color-agentamp-button-text);
  text-transform: none;
  letter-spacing: 0;
  font-size: 10px;
  font-weight: 700;
}

.transport-btn:hover:not(:disabled) {
  background: var(--color-agentamp-button-hover-bg);
  color: var(--color-agentamp-button-hover-text);
}

.transport-btn:active:not(:disabled) {
  transform: translateY(1px);
  box-shadow: var(--color-agentamp-button-active-shadow);
}

.loop-mode-none {
  border-color: var(--color-agentamp-button-muted-border);
  background: var(--color-agentamp-button-muted-bg);
  color: var(--color-agentamp-button-muted-text);
}

.loop-mode-none:hover:not(:disabled) {
  background: var(--color-agentamp-button-muted-hover-bg);
  color: var(--color-agentamp-button-muted-hover-text);
}

.shuffle-active {
  border-color: var(--color-accent);
  color: var(--color-on-accent);
  background: var(--color-accent);
}

.shuffle-active:hover:not(:disabled) {
  filter: brightness(1.1);
  background: var(--color-accent);
  color: var(--color-on-accent);
}

.agentamp-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.compact-toggle-btn,
.compact-controls-toggle {
  margin-left: 4px;
  font-size: 10px;
  min-width: 22px;
  padding: 4px 6px;
  letter-spacing: 0.6px;
}

.agentamp-file-input {
  display: none;
}

.agentamp-now-playing {
  border: 1px solid var(--color-agentamp-panel-border);
  background: var(--color-agentamp-panel-bg);
  padding: 6px 92px 6px 8px;
  display: block;
  min-height: 30px;
  position: relative;
  z-index: 2;
}

.agentamp-now-meta,
.agentamp-now-inline-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.agentamp-now-meta {
  justify-content: space-between;
}

.agentamp-now-copy {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  width: 100%;
}

.agentamp-now-cycle-wrap {
  position: relative;
  min-width: 0;
  flex: 1;
}

.agentamp-now-inline-controls.agentamp-now-inline-row {
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.agentamp-now-inline-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1 1 0%;
  overflow: hidden;
}
.agentamp-now-inline-btns {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  min-width: 220px;
}

.compact-toggle-pinned {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 4;
}

.agentamp-label {
  color: var(--color-accent);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.6px;
}

.agentamp-label.label-now {
  color: var(--color-accent);
}

.agentamp-label.label-next {
  color: var(--color-agentamp-label-next);
}

.agentamp-label.label-then {
  color: var(--color-agentamp-label-then);
}

.agentamp-track-name {
  color: var(--color-text-primary);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.agentamp-seek-wrap {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.agentamp-timecode {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  min-width: 42px;
  padding: 0 4px;
  text-align: center;
  flex: 0 0 auto;
}

.agentamp-seek-range {
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
}

.agentamp-volume-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
}

.agentamp-range {
  accent-color: var(--color-accent);
  cursor: pointer;
}

.agentamp-playlist {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--color-agentamp-panel-border);
  background: var(--color-agentamp-panel-bg);
  transition: max-height 0.25s cubic-bezier(.4,1.6,.6,1), box-shadow 0.18s;
  box-shadow: var(--color-agentamp-playlist-shadow);
}

.agentamp-dock.detached-window .agentamp-playlist {
  transition: box-shadow 0.18s;
}

.agentamp-toggle-playlist-btn {
  min-width: 28px;
  height: 24px;
  padding: 0 6px;
  border-color: var(--color-agentamp-button-muted-border);
  background: var(--color-agentamp-button-muted-bg);
  color: var(--color-agentamp-button-muted-text);
  font-size: 15px;
  font-weight: 700;
  margin: 0 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.18s, background 0.18s, color 0.18s;
}
.agentamp-toggle-playlist-btn.playlist-visible {
  border-color: var(--color-agentamp-button-border);
  background: var(--color-agentamp-button-bg);
  color: var(--color-agentamp-button-text);
}
.agentamp-toggle-playlist-btn.playlist-visible:hover:not(:disabled) {
  background: var(--color-agentamp-button-hover-bg);
  color: var(--color-agentamp-button-hover-text);
}
.agentamp-toggle-playlist-btn:active:not(:disabled) {
  transform: translateY(1px);
  box-shadow: var(--color-agentamp-button-active-shadow);
}


/* Remove min-height and let content dictate height for full mode */
.agentamp-dock:not(.compact) {
  min-height: unset;
  padding-bottom: 8px;
}

.agentamp-playlist-fade-enter-active,
.agentamp-playlist-fade-leave-active {
  transition: opacity 0.18s cubic-bezier(.4,1.6,.6,1);
}
.agentamp-playlist-fade-enter-from,
.agentamp-playlist-fade-leave-to {
  opacity: 0;
}

.agentamp-track-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  border-bottom: 1px solid var(--color-agentamp-track-row-border);
  cursor: grab;
}

.agentamp-track-row:last-child {
  border-bottom: none;
}

.agentamp-track-row:active {
  cursor: grabbing;
}

.agentamp-track-row.active {
  background: transparent;
}

.agentamp-track-row:hover {
  background: var(--color-agentamp-track-hover-bg);
}

.agentamp-track-row.drag-target {
  outline: 1px dashed var(--color-agentamp-drag-outline);
  outline-offset: -1px;
}

.agentamp-track-btn {
  background: transparent;
  border: none;
  color: var(--color-text-primary);
  font-family: inherit;
  text-align: left;
  font-size: 11px;
  padding: 7px 8px;
  width: 100%;
  cursor: pointer;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.agentamp-track-duration {
  color: var(--color-text-secondary);
  font-size: 11px;
  margin: 0 6px;
  white-space: nowrap;
  flex: 0 0 auto;
}

.agentamp-track-btn:hover {
  color: var(--color-text-primary);
}

.agentamp-track-row.active .agentamp-track-btn {
  color: var(--color-accent);
  text-shadow: 0 0 6px var(--color-agentamp-track-active-glow);
}

.agentamp-remove-btn {
  background: transparent;
  border: 1px solid transparent;
  color: var(--color-danger);
  font-family: inherit;
  font-size: 11px;
  width: 22px;
  height: 22px;
  cursor: pointer;
  margin-right: 6px;
}

.agentamp-remove-btn:hover {
  border-color: var(--color-danger);
}

.agentamp-empty {
  padding: 10px 8px;
  color: var(--color-text-secondary);
  font-size: 11px;
}

.agentamp-dock.compact {
  min-height: 58px;
  padding: 8px 10px;
}

.agentamp-dock.compact.detached-window {
  padding-top: 8px;
}

.agentamp-dock.compact .agentamp-playlist {
  display: none;
}

.agentamp-dock.compact .agentamp-controls {
  display: none;
}

.agentamp-now-cycle-enter-active,
.agentamp-now-cycle-leave-active {
  transition: opacity 1.05s ease-in-out;
  will-change: opacity;
}

.agentamp-now-cycle-enter-from,
.agentamp-now-cycle-leave-to {
  opacity: 0;
}

.agentamp-now-cycle-leave-active {
  position: absolute;
  inset: 0;
}

.agentamp-compact-toggle-spaced {
  margin-left: 4px !important;
}

.agentamp-detached-toggle {
  margin-left: 4px;
}

.agentamp-dock.detached-window:not(.compact) .agentamp-now-playing .compact-toggle-pinned[data-tooltip]::after {
  top: 50%;
  bottom: auto;
  left: auto;
  right: calc(100% + 8px);
  transform: translateY(-50%) translateX(2px);
}

.agentamp-dock.detached-window:not(.compact) .agentamp-now-playing .compact-toggle-pinned[data-tooltip]::before {
  top: 50%;
  bottom: auto;
  left: auto;
  right: calc(100% + 3px);
  transform: translateY(-50%);
  border-top: 5px solid transparent;
  border-bottom: 5px solid transparent;
  border-left: 5px solid var(--color-accent);
  border-right: none;
}

.agentamp-dock.detached-window:not(.compact) .agentamp-now-playing .compact-toggle-pinned[data-tooltip]:hover:not(:disabled)::after,
.agentamp-dock.detached-window:not(.compact) .agentamp-now-playing .compact-toggle-pinned[data-tooltip]:focus-visible:not(:disabled)::after {
  transform: translateY(-50%) translateX(0);
}

.agentamp-dock.detached-window.compact .agentamp-now-playing [data-tooltip]::after {
  top: calc(100% + 7px);
  bottom: auto;
  transform: translateX(-50%) translateY(-2px);
}

.agentamp-dock.detached-window.compact .agentamp-now-playing [data-tooltip]::before {
  top: calc(100% + 2px);
  bottom: auto;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-bottom: 5px solid var(--color-accent);
  border-top: none;
}

.agentamp-dock.detached-window.compact .agentamp-now-playing [data-tooltip]:hover:not(:disabled)::after,
.agentamp-dock.detached-window.compact .agentamp-now-playing [data-tooltip]:focus-visible:not(:disabled)::after {
  transform: translateX(-50%) translateY(0);
}

@media (max-width: 820px) {
  .agentamp-controls {
    flex-wrap: wrap;
  }

  .agentamp-seek-wrap {
    min-width: 0;
    width: 100%;
  }
}
</style>
