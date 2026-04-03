<template>
  <section class="agentamp-dock" :class="{ compact: isCompact }" aria-label="agentAMP player">
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
          <span class="agentamp-label" :class="nowDisplayLabelClass">{{ nowDisplayLabel }}</span>
          <span class="agentamp-track-name">{{ nowDisplayTrackName }}</span>
        </div>
        <div class="agentamp-now-inline-btns">
          <button class="agentamp-btn transport-btn" type="button" :disabled="!hasTracks" title="Previous" aria-label="Previous" @click="playPrevious">&lt;&lt;</button>
          <button class="agentamp-btn transport-btn" type="button" :disabled="!hasTracks" :title="isPlaying ? 'Pause' : 'Play'" :aria-label="isPlaying ? 'Pause' : 'Play'" @click="togglePlayback">
            {{ isPlaying ? '||' : '>' }}
          </button>
          <button class="agentamp-btn transport-btn" type="button" :disabled="!hasTracks" title="Stop" aria-label="Stop" @click="stopPlayback">[]</button>
          <button class="agentamp-btn transport-btn" type="button" :disabled="!canGoNext" title="Next" aria-label="Next" @click="playNext">&gt;&gt;</button>
          <button
            class="agentamp-btn transport-btn"
            :class="`loop-mode-${loopMode}`"
            type="button"
            :disabled="!hasTracks"
            :title="`Loop mode: ${loopModeLabel}`"
            aria-label="Cycle loop mode"
            @click="cycleLoopMode"
          >
            {{ loopModeLabel }}
          </button>
          <button class="agentamp-icon-btn" type="button" title="Add MP3 files" aria-label="Add MP3 files" @click="openFilePicker">+</button>
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
      <button
        class="agentamp-btn compact-toggle-btn compact-toggle-pinned agentamp-compact-toggle-spaced"
        type="button"
        :title="isCompact ? 'Expand agentAMP' : 'Compact agentAMP'"
        :aria-label="isCompact ? 'Expand agentAMP' : 'Compact agentAMP'"
        @click="toggleCompactMode"
      >
        {{ compactToggleGlyph }}
      </button>
    </div>
    <div class="agentamp-controls">
      <button class="agentamp-btn transport-btn" type="button" :disabled="!hasTracks" title="Previous" aria-label="Previous" @click="playPrevious">&lt;&lt;</button>
      <button class="agentamp-btn transport-btn" type="button" :disabled="!hasTracks" :title="isPlaying ? 'Pause' : 'Play'" :aria-label="isPlaying ? 'Pause' : 'Play'" @click="togglePlayback">
        {{ isPlaying ? '||' : '>' }}
      </button>
      <button class="agentamp-btn transport-btn" type="button" :disabled="!hasTracks" title="Stop" aria-label="Stop" @click="stopPlayback">[]</button>
      <button class="agentamp-btn transport-btn" type="button" :disabled="!canGoNext" title="Next" aria-label="Next" @click="playNext">&gt;&gt;</button>
      <button class="agentamp-btn transport-btn" type="button" :disabled="!hasTracks" title="Clear playlist" aria-label="Clear playlist" @click="clearPlaylist">X</button>
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
        :title="`Loop mode: ${loopModeLabel}`"
        aria-label="Cycle loop mode"
        @click="cycleLoopMode"
      >
        {{ loopModeLabel }}
      </button>
      <button
        v-if="!isCompact"
        :class="['agentamp-btn', 'transport-btn', 'agentamp-toggle-playlist-btn', { 'playlist-visible': showPlaylist }]"
        type="button"
        :aria-pressed="showPlaylist"
        :title="showPlaylist ? 'Hide Playlist' : 'Show Playlist'"
        aria-label="Toggle playlist visibility"
        @click="showPlaylist = !showPlaylist"
      >
        <span v-if="showPlaylist">▲</span><span v-else>▼</span>
      </button>
      <button class="agentamp-icon-btn" type="button" title="Add MP3 files" aria-label="Add MP3 files" @click="openFilePicker">+</button>
    </div>

    <ul
      v-if="showPlaylist || isCompact"
      class="agentamp-playlist"
      role="listbox"
      aria-label="agentAMP playlist"
      :style="{
        maxHeight: (playlist.length > 0 ? (Math.min(playlist.length, 5) * 34) + 'px' : '140px'),
        overflowY: playlist.length > 5 ? 'auto' : 'hidden',
      }"
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
        <button
          class="agentamp-remove-btn"
          type="button"
          :aria-label="`Remove ${track.name}`"
          @click="removeTrack(index)"
        >
          X
        </button>
      </li>
      <li v-if="!playlist.length" class="agentamp-empty">LOAD MP3 FILES TO BUILD A PLAYLIST.</li>
    </ul>

    <audio
      ref="audioEl"
      @loadedmetadata="handleLoadedMetadata"
      @timeupdate="handleTimeUpdate"
      @ended="handleTrackEnded"
      @play="isPlaying = true"
      @pause="isPlaying = false"
    ></audio>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { getPersistedValue, setPersistedValue, removePersistedValue } from '../composables/usePlatformStorage';

const PLAYER_STORAGE_KEY = 'agent_amp_state_v1';

type LoopMode = 'none' | 'all' | 'one';
type PlaylistSource = 'path' | 'dataUrl';

type PlaylistTrack = {
  id: string;
  name: string;
  source: PlaylistSource;
  location: string;
};

type PersistedPlayerState = {
  playlist: PlaylistTrack[];
  currentIndex: number;
  loopMode: LoopMode;
  volume: number;
  compactMode?: boolean;
};

const props = defineProps<{
  enabled: boolean;
}>();

const playlist = ref<PlaylistTrack[]>([]);
const currentIndex = ref(-1);
const isPlaying = ref(false);
const currentTime = ref(0);
const duration = ref(0);
const volume = ref(0.82);
const loopMode = ref<LoopMode>('none');
const isCompact = ref(false);
const showPlaylist = ref(true);
const isNowHovered = ref(false);
const nowDisplayMode = ref<'now' | 'next' | 'then'>('now');
const dragFromIndex = ref<number | null>(null);
const dragOverIndex = ref<number | null>(null);
const fileInputEl = ref<HTMLInputElement | null>(null);
const audioEl = ref<HTMLAudioElement | null>(null);
let nowCycleInterval: ReturnType<typeof setInterval> | null = null;
let tauriDialogOpenPromise: Promise<any | null> | null = null;
let tauriConvertFileSrcPromise: Promise<((filePath: string) => string) | null> | null = null;

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

const cycleModes = computed<Array<'now' | 'next' | 'then'>>(() => {
  const modes: Array<'now' | 'next' | 'then'> = ['now'];
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

  return 'NONE';
});

const nowDisplayLabel = computed(() => {
  if (isCompact.value && nowDisplayMode.value === 'next' && nextTrack.value && nextTrack.value !== currentTrack.value) {
    return 'NEXT:';
  }

  if (isCompact.value && nowDisplayMode.value === 'then' && thenTrack.value && thenTrack.value !== currentTrack.value) {
    return 'THEN:';
  }

  return 'NOW:';
});

const nowDisplayTrackName = computed(() => {
  if (isCompact.value && nowDisplayMode.value === 'next' && nextTrack.value && nextTrack.value !== currentTrack.value) {
    return nextTrack.value.name;
  }

  if (isCompact.value && nowDisplayMode.value === 'then' && thenTrack.value && thenTrack.value !== currentTrack.value) {
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

const compactToggleGlyph = computed(() => (isCompact.value ? '>>' : '<<'));

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
  [playlist, currentIndex, loopMode, volume, isCompact],
  () => {
    void persistPlayerState();
  },
  { deep: true }
);

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

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function getTauriDialogOpen() {
  if (!isTauriRuntime()) {
    return null;
  }

  if (!tauriDialogOpenPromise) {
    tauriDialogOpenPromise = import('@tauri-apps/plugin-dialog')
      .then((mod) => mod.open)
      .catch(() => null);
  }

  return tauriDialogOpenPromise;
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

  await persistPlayerState();
}

async function openFilePicker() {
  if (isTauriRuntime()) {
    const dialogOpen = await getTauriDialogOpen();
    if (!dialogOpen) {
      return;
    }

    const selection = await dialogOpen({
      multiple: true,
      filters: [{ name: 'MP3 Audio', extensions: ['mp3'] }],
    });

    if (!selection) {
      return;
    }

    const selectedPaths = Array.isArray(selection) ? selection : [selection];
    await addTracksFromPaths(selectedPaths);
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

  await persistPlayerState();

  input.value = '';
}

function loadCurrentTrack(autoplay: boolean) {
  const player = audioEl.value;
  const track = currentTrack.value;
  if (!player || !track) {
    return;
  }

  if (track.source === 'path') {
    void getTauriConvertFileSrc().then((convertFileSrc) => {
      if (!convertFileSrc) {
        return;
      }

      player.src = convertFileSrc(track.location);
      player.currentTime = 0;
      currentTime.value = 0;
      duration.value = 0;

      if (autoplay) {
        void player.play().catch(() => {
          isPlaying.value = false;
        });
      }
    });
    return;
  }

  player.src = track.location;
  player.currentTime = 0;
  currentTime.value = 0;
  duration.value = 0;

  if (autoplay) {
    void player.play().catch(() => {
      isPlaying.value = false;
    });
  }
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

function playNext() {
  if (!playlist.value.length) {
    return;
  }

  if (loopMode.value === 'one') {
    restartCurrentTrack();
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
}

function handleTimeUpdate() {
  const player = audioEl.value;
  if (!player) {
    return;
  }

  currentTime.value = Number.isFinite(player.currentTime) ? player.currentTime : 0;
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
  if (isLastTrack && loopMode.value === 'none') {
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

function toggleCompactMode() {
  isCompact.value = !isCompact.value;
}

function handleNowHover(hovered: boolean) {
  if (!isCompact.value) {
    return;
  }

  isNowHovered.value = hovered;
}

function handleNowFocusOut(event: FocusEvent) {
  if (!isCompact.value) {
    return;
  }

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
  const canCycle = isCompact.value && !isNowHovered.value && modes.length > 1;
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

async function persistPlayerState() {
  try {
    const serialized: PersistedPlayerState = {
      playlist: playlist.value,
      currentIndex: currentIndex.value,
      loopMode: loopMode.value,
      volume: volume.value,
      compactMode: isCompact.value,
    };

    localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(serialized));
    await setPersistedValue(PLAYER_STORAGE_KEY, serialized);
  } catch {
    // Ignore storage quota/persistence failures.
  }
}

async function restorePlayerState() {
  let parsed: Partial<PersistedPlayerState> | null = null;

  try {
    const persisted = await getPersistedValue<Partial<PersistedPlayerState>>(PLAYER_STORAGE_KEY);
    if (persisted) {
      parsed = persisted;
    }
  } catch {
    parsed = null;
  }

  if (!parsed) {
    try {
      const raw = localStorage.getItem(PLAYER_STORAGE_KEY);
      if (!raw) {
        return;
      }
      parsed = JSON.parse(raw) as Partial<PersistedPlayerState>;
    } catch {
      parsed = null;
    }
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
    currentIndex.value =
      restoredTracks.length > 0
        ? Math.max(0, Math.min(Number(parsed.currentIndex ?? 0), restoredTracks.length - 1))
        : -1;

    const parsedLoopMode = parsed.loopMode;
    loopMode.value = parsedLoopMode === 'all' || parsedLoopMode === 'one' ? parsedLoopMode : 'none';

    const parsedVolume = Number(parsed.volume);
    if (Number.isFinite(parsedVolume)) {
      volume.value = Math.max(0, Math.min(1, parsedVolume));
    }

    isCompact.value = Boolean(parsed.compactMode);

    if (currentIndex.value >= 0) {
      loadCurrentTrack(false);
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
  restorePlayerState();
  restartNowCycle();
});

onBeforeUnmount(() => {
  window.removeEventListener('pagehide', flushPlayerStateOnShutdown);
  window.removeEventListener('beforeunload', flushPlayerStateOnShutdown);
  flushPlayerStateOnShutdown();

  if (nowCycleInterval) {
    clearInterval(nowCycleInterval);
    nowCycleInterval = null;
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
  padding: 6px 36px 6px 8px;
  display: block;
  min-height: 30px;
  position: relative;
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
  gap: 6px;
  min-width: 0;
  flex: 1;
}

.agentamp-timecode {
  width: 36px;
  text-align: center;
  flex: 0 0 36px;
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
  margin-left: 16px !important;
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
