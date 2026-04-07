<template>
  <section class="agentamp-dock" :class="{ compact: isCompact, 'detached-window': props.detached }">
    <input
      ref="fileInputEl"
      class="agentamp-file-input"
      type="file"
      accept=".mp3,.m4a,.mp4,.webm,.mov,audio/mpeg,audio/mp4,video/mp4,video/webm,video/quicktime"
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

    <div
      v-if="!props.detached && !isCompact && showPlaylist"
      class="agentamp-docked-resize-handle"
      role="separator"
      aria-label="Resize AgentAmp playlist"
      aria-orientation="horizontal"
      @mousedown.prevent="startDockedPlaylistResize"
    >
      <span class="agentamp-docked-resize-grip" aria-hidden="true"></span>
    </div>

    <ul
      v-if="showPlaylist || isCompact"
      ref="playlistContainerEl"
      class="agentamp-playlist"
      role="listbox"
      :style="playlistStyle"
    >
      <li v-if="playlist.length" class="agentamp-playlist-header" aria-hidden="true">
        <button class="agentamp-playlist-header-cell agentamp-playlist-header-order" type="button" @click="togglePlaylistSort('order')">
          #{{ getSortIndicator('order') }}
        </button>
        <button class="agentamp-playlist-header-cell agentamp-playlist-header-artist" type="button" @click="togglePlaylistSort('artist')">
          Artist{{ getSortIndicator('artist') }}
        </button>
        <button class="agentamp-playlist-header-cell agentamp-playlist-header-title" type="button" @click="togglePlaylistSort('title')">
          Title{{ getSortIndicator('title') }}
        </button>
        <button class="agentamp-playlist-header-cell agentamp-playlist-header-genre" type="button" @click="togglePlaylistSort('genre')">
          Genre{{ getSortIndicator('genre') }}
        </button>
        <button class="agentamp-playlist-header-cell" type="button" @click="togglePlaylistSort('duration')">
          Duration{{ getSortIndicator('duration') }}
        </button>
        <span class="agentamp-playlist-header-placeholder"></span>
      </li>
      <li
        v-for="item in playlistDisplay"
        :key="item.track.id"
        class="agentamp-track-row"
        :class="{ active: item.originalIndex === currentIndex, 'drag-target': item.originalIndex === dragOverIndex }"
        draggable="true"
        @dragstart="handleDragStart(item.originalIndex, $event)"
        @dragover.prevent="handleDragOver(item.originalIndex, $event)"
        @drop.prevent="handleDrop(item.originalIndex, $event)"
        @dragend="handleDragEnd"
        @mouseenter="transferTrackTooltip(item.originalIndex)"
        @mouseleave="hideTrackTooltip(item.originalIndex)"
      >
        <span class="agentamp-track-order">{{ item.track.order + 1 }}</span>
        <button
          :key="getTrackMetadataRenderKey(item.track)"
          class="agentamp-track-btn"
          :class="{ 'metadata-visible': item.originalIndex === visibleMetadataIndex }"
          type="button"
          @dblclick="handleTrackDblClick(item.originalIndex)"
          @contextmenu.prevent="handleTrackContextMenu(item.originalIndex, $event)"
          :data-tooltip="getTrackMetadataTooltip(item.track)"
        >
          <span class="agentamp-track-artist">{{ getTrackArtist(item.track) }}</span>
          <span class="agentamp-track-title">{{ getTrackTitle(item.track) }}</span>
        </button>
        <span class="agentamp-track-cell agentamp-track-genre">
          {{ item.track.genre || '—' }}
        </span>
        <span class="agentamp-track-duration">
          {{ item.track.duration && item.track.duration > 0 ? formatTrackDuration(item.track.duration) : '—' }}
        </span>
        <button
          class="agentamp-remove-btn"
          type="button"
          @click="removeTrack(item.originalIndex)"
        >
          X
        </button>
        <div
          v-if="item.originalIndex === visibleMetadataIndex"
          :class="['agentamp-track-tooltip-card', item.originalIndex === 0 ? 'agentamp-track-tooltip-card--first-row' : 'agentamp-track-tooltip-card--other-row']"
          @mouseenter="cancelMetadataTooltipHide"
          @mouseleave="hideTrackTooltip(item.originalIndex, $event)"
          @click.stop
        >
          <div class="agentamp-track-tooltip-copy">{{ getTrackMetadataTooltip(item.track) }}</div>
          <button
            v-if="isMetadataEditable(item.track)"
            class="agentamp-metadata-edit-link"
            type="button"
            @click.stop="openMetadataEditor(item.originalIndex)"
          >
            ✎
          </button>
        </div>
      </li>
      <li v-if="!playlist.length" class="agentamp-empty">LOAD MP3, M4A, MP4, WEBM, OR MOV FILES TO BUILD A PLAYLIST.</li>
    </ul>

    <div v-if="editingMetadataIndex !== null" class="agentamp-modal-backdrop" @click.self="closeMetadataEditor">
      <div class="agentamp-modal-card">
        <div class="agentamp-modal-header">
          <span>EDIT {{ editingMetadataFileName || 'TRACK METADATA' }}</span>
          <button class="agentamp-modal-close" type="button" @click="closeMetadataEditor">✕</button>
        </div>
        <form class="agentamp-modal-form" @submit.prevent="saveTrackMetadata">
          <label>
            ARTIST
            <input v-model="metadataEditorForm.artist" type="text" />
          </label>
          <label>
            TITLE
            <input v-model="metadataEditorForm.title" type="text" />
          </label>
          <label>
            ALBUM
            <input v-model="metadataEditorForm.album" type="text" />
          </label>
          <label>
            YEAR
            <input v-model="metadataEditorForm.year" type="text" />
          </label>
          <label>
            GENRE
            <div class="agentamp-genre-input-wrap">
              <input
                class="agentamp-genre-input"
                v-model="metadataEditorForm.genre"
                type="text"
                autocomplete="off"
                @focus="genreDropdownOpen = true"
                @input="genreDropdownOpen = true"
                @blur="closeGenreDropdown"
              />
              <div
                v-if="genreDropdownOpen && filteredGenreOptions.length"
                class="agentamp-genre-options"
              >
                <button
                  v-for="genre in filteredGenreOptions"
                  :key="genre"
                  type="button"
                  class="agentamp-genre-option"
                  @mousedown.prevent="selectGenreOption(genre)"
                >
                  {{ genre }}
                </button>
              </div>
            </div>
          </label>
          <div class="agentamp-modal-actions">
            <button type="button" class="agentamp-btn" @click="closeMetadataEditor">CANCEL</button>
            <button type="submit" class="agentamp-btn" :disabled="metadataEditorSaving">{{ metadataEditorSaving ? 'SAVING...' : 'SAVE' }}</button>
          </div>
          <p v-if="metadataEditorError" class="agentamp-modal-error">{{ metadataEditorError }}</p>
        </form>
      </div>
    </div>
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
import { invoke } from '@tauri-apps/api/core';
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
const DOCKED_MIN_TRACK_ROWS = 5;
const DOCKED_TRACK_ROW_HEIGHT = 34;
const DOCKED_TRACK_HEADER_HEIGHT = 34;
const DOCKED_TRACK_BREATHING_ROOM = 12;
const DOCKED_MAX_VIEWPORT_RATIO = 0.33;

type LoopMode = 'none' | 'all' | 'one';
type PlaylistSource = 'path' | 'dataUrl';

type PlaylistTrack = {
  id: string;
  name: string;
  source: PlaylistSource;
  location: string;
  order: number;
  duration?: number;
  artist?: string;
  title?: string;
  album?: string;
  year?: string;
  genre?: string;
  trackNumber?: string;
  mediaType?: 'audio' | 'video';
};

type PlaylistDisplayItem = {
  track: PlaylistTrack;
  originalIndex: number;
};

type MetadataEditFields = {
  artist: string;
  title: string;
  album: string;
  year: string;
  genre: string;
  trackNumber: string;
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

const genreOptions = [
  'Blues',
  'Classic Rock',
  'Country',
  'Dance',
  'Disco',
  'Funk',
  'Grunge',
  'Hip-Hop',
  'Jazz',
  'Metal',
  'New Age',
  'Oldies',
  'Other',
  'Pop',
  'R&B',
  'Rap',
  'Reggae',
  'Rock',
  'Techno',
  'Industrial',
  'Alternative',
  'Ska',
  'Death Metal',
  'Pranks',
  'Soundtrack',
  'Euro-Techno',
  'Ambient',
  'Trip-Hop',
  'Vocal',
  'Jazz+Funk',
  'Fusion',
  'Trance',
  'Classical',
  'Instrumental',
  'Acid',
  'House',
  'Game',
  'Sound Clip',
  'Gospel',
  'Noise',
  'AlternRock',
  'Bass',
  'Soul',
  'Punk',
  'Space',
  'Meditative',
  'Instrumental Pop',
  'Instrumental Rock',
  'Ethnic',
  'Gothic',
  'Darkwave',
  'Techno-Industrial',
  'Electronic',
  'Pop-Folk',
  'Eurodance',
  'Dream',
  'Southern Rock',
  'Comedy',
  'Cult',
  'Gangsta',
  'Top 40',
  'Christian Rap',
  'Pop/Funk',
  'Jungle',
  'Native American',
  'Cabaret',
  'New Wave',
  'Psychedelic',
  'Rave',
  'Showtunes',
  'Trailer',
  'Lo-Fi',
  'Tribal',
  'Acid Punk',
  'Acid Jazz',
  'Polka',
  'Retro',
  'Musical',
  'Rock & Roll',
  'Hard Rock',
  'Folk',
  'Folk-Rock',
  'National Folk',
  'Swing',
  'Fast Fusion',
  'Bebop',
  'Latin',
  'Revival',
  'Celtic',
  'Bluegrass',
  'Avant-Garde',
  'Gothic Rock',
  'Progressive Rock',
  'Psychedelic Rock',
  'Symphonic Rock',
  'Slow Rock',
  'Big Band',
  'Chorus',
  'Easy Listening',
  'Acoustic',
  'Humour',
  'Speech',
  'Chanson',
  'Opera',
  'Chamber Music',
  'Sonata',
  'Symphony',
  'Booty Bass',
  'Primus',
  'Porn Groove',
  'Satire',
  'Slow Jam',
  'Club',
  'Tango',
  'Samba',
  'Folklore',
  'Ballad',
  'Power Ballad',
  'Rhythmic Soul',
  'Freestyle',
  'Duet',
  'Punk Rock',
  'Drum Solo',
  'Acapella',
  'Euro-House',
  'Dancehall',
  'Goa',
  'Drum & Bass',
  'Club-House',
  'Hardcore',
  'Terror',
  'Indie',
  'BritPop',
  'Negerpunk',
  'Polsk Punk',
  'Beat',
  'Christian Gangsta Rap',
  'Heavy Metal',
  'Black Metal',
  'Crossover',
  'Contemporary Christian',
  'Christian Rock',
  'Merengue',
  'Salsa',
  'Thrash Metal',
  'Anime',
  'Jpop',
  'Synthpop'
];

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
const visibleMetadataIndex = ref<number | null>(null);
let metadataTooltipHideTimer: number | null = null;
const editingMetadataIndex = ref<number | null>(null);
const metadataEditorForm = ref<MetadataEditFields>({
  artist: '',
  title: '',
  album: '',
  year: '',
  genre: '',
  trackNumber: '',
});
const metadataEditorSaving = ref(false);
const metadataEditorError = ref<string | null>(null);
const playlistSortField = ref<'order' | 'artist' | 'title' | 'genre' | 'duration' | null>(null);
const playlistSortDirection = ref<'asc' | 'desc'>('asc');
const dragFromIndex = ref<number | null>(null);
const dragOverIndex = ref<number | null>(null);
const fileInputEl = ref<HTMLInputElement | null>(null);
const audioEl = ref<HTMLAudioElement | null>(null);
const playlistContainerEl = ref<HTMLElement | null>(null);
const dockedPlaylistHeightOverride = ref<number | null>(null);
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
let activeDockedResize: { startY: number; startHeight: number } | null = null;

const currentTrack = computed(() => {
  if (currentIndex.value < 0 || currentIndex.value >= playlist.value.length) {
    return null;
  }

  return playlist.value[currentIndex.value];
});

const playlistDisplay = computed<PlaylistDisplayItem[]>(() => {
  return playlist.value.map((track, originalIndex) => ({ track, originalIndex }));
});

const editingMetadataFileName = computed(() => {
  if (editingMetadataIndex.value === null) {
    return '';
  }

  const track = playlist.value[editingMetadataIndex.value];
  if (!track) {
    return '';
  }

  return extractNameFromPath(track.location);
});

const genreFilter = computed(() => metadataEditorForm.value.genre.trim().toLowerCase());
const genreDropdownOpen = ref(false);
const filteredGenreOptions = computed(() => {
  if (!genreDropdownOpen.value) {
    return [];
  }

  const filter = genreFilter.value;
  if (!filter) {
    return genreOptions;
  }

  return genreOptions.filter((genre) => genre.toLowerCase().includes(filter));
});

function closeGenreDropdown() {
  window.setTimeout(() => {
    genreDropdownOpen.value = false;
  }, 120);
}

function selectGenreOption(genre: string) {
  metadataEditorForm.value.genre = genre;
  genreDropdownOpen.value = false;
}

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
  const trackCount = playlist.value.length;
  const visibleRows = Math.min(Math.max(trackCount, 1), 16);
  const rowHeight = DOCKED_TRACK_ROW_HEIGHT;
  const headerHeight = trackCount > 0 ? DOCKED_TRACK_HEADER_HEIGHT : 0;
  const breathingRoom = DOCKED_TRACK_BREATHING_ROOM;
  const naturalHeightPx = trackCount > 0
    ? (visibleRows * rowHeight) + headerHeight + breathingRoom
    : 140;

  if (props.detached && !isCompact.value) {
    return {
      height: 'auto',
      minHeight: 'var(--agentamp-detached-playlist-min-height, 216px)',
      maxHeight: 'var(--agentamp-detached-playlist-max-height, 999px)',
      overflowY: 'auto',
      flex: '0 0 auto',
    };
  }

  const viewportCapPx = typeof window !== 'undefined'
    ? Math.max(140, Math.floor(window.innerHeight * DOCKED_MAX_VIEWPORT_RATIO))
    : 320;
  const dockedMaxHeightPx = Math.min(naturalHeightPx, viewportCapPx);
  const minimumRows = Math.min(Math.max(trackCount, 1), DOCKED_MIN_TRACK_ROWS);
  const dockedMinHeightPx = trackCount > 0
    ? (minimumRows * DOCKED_TRACK_ROW_HEIGHT) + DOCKED_TRACK_HEADER_HEIGHT + DOCKED_TRACK_BREATHING_ROOM
    : 140;
  const resolvedHeightPx = dockedPlaylistHeightOverride.value === null
    ? dockedMaxHeightPx
    : Math.max(dockedMinHeightPx, Math.min(dockedPlaylistHeightOverride.value, dockedMaxHeightPx));

  return {
    height: `${resolvedHeightPx}px`,
    maxHeight: `${resolvedHeightPx}px`,
    overflowY: naturalHeightPx > resolvedHeightPx ? 'auto' : 'hidden',
  };
});

function getDockedPlaylistResizeBounds(): { min: number; max: number } {
  const trackCount = playlist.value.length;
  const visibleRows = Math.min(Math.max(trackCount, 1), 16);
  const naturalHeightPx = trackCount > 0
    ? (visibleRows * DOCKED_TRACK_ROW_HEIGHT) + DOCKED_TRACK_HEADER_HEIGHT + DOCKED_TRACK_BREATHING_ROOM
    : 140;
  const minimumRows = Math.min(Math.max(trackCount, 1), DOCKED_MIN_TRACK_ROWS);
  const minHeight = trackCount > 0
    ? (minimumRows * DOCKED_TRACK_ROW_HEIGHT) + DOCKED_TRACK_HEADER_HEIGHT + DOCKED_TRACK_BREATHING_ROOM
    : 140;
  const viewportCap = typeof window !== 'undefined'
    ? Math.max(140, Math.floor(window.innerHeight * DOCKED_MAX_VIEWPORT_RATIO))
    : 320;

  return {
    min: minHeight,
    max: Math.max(minHeight, Math.min(naturalHeightPx, viewportCap)),
  };
}

function handleDockedPlaylistResizeMove(event: MouseEvent) {
  if (!activeDockedResize) {
    return;
  }

  const deltaY = event.clientY - activeDockedResize.startY;
  const nextHeight = activeDockedResize.startHeight - deltaY;
  const bounds = getDockedPlaylistResizeBounds();
  dockedPlaylistHeightOverride.value = Math.max(bounds.min, Math.min(nextHeight, bounds.max));
}

function stopDockedPlaylistResize() {
  activeDockedResize = null;
  window.removeEventListener('mousemove', handleDockedPlaylistResizeMove);
  window.removeEventListener('mouseup', stopDockedPlaylistResize);
}

function startDockedPlaylistResize(event: MouseEvent) {
  const bounds = getDockedPlaylistResizeBounds();
  const currentHeight = playlistContainerEl.value
    ? Math.ceil(playlistContainerEl.value.getBoundingClientRect().height)
    : bounds.max;

  activeDockedResize = {
    startY: event.clientY,
    startHeight: Math.max(bounds.min, Math.min(currentHeight, bounds.max)),
  };

  window.addEventListener('mousemove', handleDockedPlaylistResizeMove);
  window.addEventListener('mouseup', stopDockedPlaylistResize);
}

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

function inferArtistTitle(track: PlaylistTrack): { artist?: string; title?: string } {
  if (track.artist && track.artist.trim() && track.title && track.title.trim()) {
    return { artist: track.artist.trim(), title: track.title.trim() };
  }

  const raw = track.name || '';
  const parts = raw.split(' - ');
  if (parts.length >= 2) {
    return {
      artist: parts[0].trim() || undefined,
      title: parts.slice(1).join(' - ').trim() || undefined,
    };
  }

  return { artist: track.artist?.trim(), title: track.title?.trim() };
}

function getTrackDisplayTitle(track: PlaylistTrack | null): string {
  if (!track) {
    return 'NO TRACK LOADED';
  }

  const inferred = inferArtistTitle(track);
  if (inferred.artist && inferred.title) {
    return `${inferred.artist} - ${inferred.title}`;
  }

  return track.name;
}

function getTrackArtist(track: PlaylistTrack): string {
  const inferred = inferArtistTitle(track);
  return inferred.artist || 'UNKNOWN ARTIST';
}

function getTrackTitle(track: PlaylistTrack): string {
  const inferred = inferArtistTitle(track);
  return inferred.title || track.name;
}

function getTrackMetadataTooltip(track: PlaylistTrack): string {
  const fields: string[] = [];
  const inferred = inferArtistTitle(track);

  if (inferred.artist) {
    fields.push(inferred.artist);
  }
  if (inferred.title) {
    fields.push(inferred.title);
  }

  if (track.album) {
    fields.push(track.album);
  }
  if (track.year) {
    fields.push(track.year);
  }

  if (!fields.length) {
    return 'No metadata available';
  }

  return fields.join(' - ');
}

function getTrackMetadataRenderKey(track: PlaylistTrack): string {
  return [
    track.id,
    track.artist ?? '',
    track.title ?? '',
    track.album ?? '',
    track.year ?? '',
    track.name,
  ].join('::');
}

function handleTrackContextMenu(index: number, event: MouseEvent) {
  event.preventDefault();
  visibleMetadataIndex.value = visibleMetadataIndex.value === index ? null : index;
}

function hideTrackTooltip(index: number, event?: MouseEvent) {
  if (visibleMetadataIndex.value !== index) {
    return;
  }

  if (event) {
    const currentTarget = event.currentTarget as HTMLElement | null;
    const relatedTarget = event.relatedTarget as Node | null;
    if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget)) {
      return;
    }
  }

  if (metadataTooltipHideTimer !== null) {
    window.clearTimeout(metadataTooltipHideTimer);
  }

  metadataTooltipHideTimer = window.setTimeout(() => {
    if (visibleMetadataIndex.value === index) {
      visibleMetadataIndex.value = null;
    }
    metadataTooltipHideTimer = null;
  }, 180);
}

function cancelMetadataTooltipHide() {
  if (metadataTooltipHideTimer !== null) {
    window.clearTimeout(metadataTooltipHideTimer);
    metadataTooltipHideTimer = null;
  }
}

function transferTrackTooltip(index: number) {
  if (visibleMetadataIndex.value === null || visibleMetadataIndex.value === index) {
    return;
  }

  if (metadataTooltipHideTimer !== null) {
    window.clearTimeout(metadataTooltipHideTimer);
    metadataTooltipHideTimer = null;
  }

  visibleMetadataIndex.value = index;
}

function handleTrackDblClick(index: number) {
  visibleMetadataIndex.value = null;
  selectTrack(index);
}

function isMetadataEditable(track: PlaylistTrack): boolean {
  if (track.source !== 'path' || !track.location.trim().length) {
    return false;
  }

  if (track.mediaType === 'video' || (track.mediaType === undefined && isVideoPath(track.location))) {
    return false;
  }

  return true;
}

function openMetadataEditor(index: number) {
  const track = playlist.value[index];
  if (!track) {
    return;
  }

  editingMetadataIndex.value = index;
  metadataEditorForm.value = {
    artist: track.artist ?? '',
    title: track.title ?? '',
    album: track.album ?? '',
    year: track.year ?? '',
    genre: track.genre ?? '',
    trackNumber: track.trackNumber ?? '',
  };
  metadataEditorError.value = null;
}

function closeMetadataEditor() {
  editingMetadataIndex.value = null;
  metadataEditorError.value = null;
}

function normalizeMetadataValue(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

async function saveTrackMetadata() {
  if (editingMetadataIndex.value === null) {
    return;
  }

  const track = playlist.value[editingMetadataIndex.value];
  if (!track) {
    closeMetadataEditor();
    return;
  }

  const updated: MetadataEditFields = {
    artist: normalizeMetadataValue(metadataEditorForm.value.artist) ?? '',
    title: normalizeMetadataValue(metadataEditorForm.value.title) ?? '',
    album: normalizeMetadataValue(metadataEditorForm.value.album) ?? '',
    year: normalizeMetadataValue(metadataEditorForm.value.year) ?? '',
    genre: normalizeMetadataValue(metadataEditorForm.value.genre) ?? '',
    trackNumber: normalizeMetadataValue(metadataEditorForm.value.trackNumber) ?? '',
  };

  if (!isMetadataEditable(track)) {
    metadataEditorError.value = 'Cannot save metadata for this track source.';
    return;
  }

  metadataEditorSaving.value = true;
  metadataEditorError.value = null;

  try {
    await writeTrackMetadataToFile(track, updated);
    track.artist = updated.artist ?? track.artist;
    track.title = updated.title ?? track.title;
    track.album = updated.album ?? track.album;
    track.year = updated.year ?? track.year;
    track.genre = updated.genre ?? track.genre;
    track.trackNumber = updated.trackNumber ?? track.trackNumber;

    playlist.value = [...playlist.value];
    closeMetadataEditor();
  } catch (error) {
    metadataEditorError.value = 'Unable to save metadata. Please try again.';
    console.error('Failed to save metadata:', error);
  } finally {
    metadataEditorSaving.value = false;
  }
}

function normalizeTrackFsPath(path: string): string {
  let normalized = path.trim();

  if (path.startsWith('file://localhost/')) {
    normalized = path.slice('file://localhost/'.length);
  } else if (path.startsWith('file:///')) {
    normalized = path.slice('file:///'.length);
  } else if (path.startsWith('file://')) {
    normalized = path.slice('file://'.length);
  }

  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    // Keep original value when the path is not URI-encoded.
  }

  if (normalized.startsWith('//')) {
    return normalized.replace(/\//g, '\\');
  }

  return normalized.replace(/\\/g, '/');
}

async function writeTrackMetadataToFile(track: PlaylistTrack, metadata: MetadataEditFields): Promise<void> {
  if (track.source !== 'path') {
    throw new Error('Unable to save metadata for non-path track source');
  }

  const path = normalizeTrackFsPath(track.location);
  await invoke('save_agentamp_metadata', {
    path,
    metadata: {
      artist: metadata.artist || null,
      title: metadata.title || null,
      album: metadata.album || null,
      year: metadata.year || null,
      genre: metadata.genre || null,
      trackNumber: metadata.trackNumber || null,
    },
  });
}

function refreshPlaylistOrder() {
  playlist.value.forEach((track, index) => {
    track.order = index;
  });
}

function getSortIndicator(field: 'order' | 'artist' | 'title' | 'genre' | 'duration'): string {
  if (playlistSortField.value !== field) {
    return '';
  }

  return playlistSortDirection.value === 'asc' ? ' ▲' : ' ▼';
}

function getPlaylistSortValue(track: PlaylistTrack, field: 'order' | 'artist' | 'title' | 'genre' | 'duration'): string | number {
  if (field === 'artist' || field === 'title') {
    const inferred = inferArtistTitle(track);
    return (field === 'artist' ? inferred.artist : inferred.title) ?? '';
  }

  if (field === 'genre') {
    return track.genre ?? '';
  }

  if (field === 'duration') {
    return typeof track.duration === 'number' ? track.duration : 0;
  }

  return track.order;
}

function applyPlaylistSort(field: 'order' | 'artist' | 'title' | 'genre' | 'duration') {
  const currentTrackId = currentTrack.value?.id;
  playlist.value.sort((a, b) => {
    const aValue = getPlaylistSortValue(a, field);
    const bValue = getPlaylistSortValue(b, field);

    if (aValue === bValue) {
      return a.order - b.order;
    }

    if (typeof aValue === 'number' || typeof bValue === 'number') {
      return playlistSortDirection.value === 'asc'
        ? Number(aValue) - Number(bValue)
        : Number(bValue) - Number(aValue);
    }

    return playlistSortDirection.value === 'asc'
      ? String(aValue).localeCompare(String(bValue))
      : String(bValue).localeCompare(String(aValue));
  });

  if (currentTrackId) {
    const newIndex = playlist.value.findIndex((track) => track.id === currentTrackId);
    if (newIndex >= 0) {
      currentIndex.value = newIndex;
    }
  }
}

function togglePlaylistSort(field: 'order' | 'artist' | 'title' | 'genre' | 'duration') {
  if (playlistSortField.value !== field) {
    playlistSortField.value = field;
    playlistSortDirection.value = 'asc';
    applyPlaylistSort(field);
    return;
  }

  if (playlistSortDirection.value === 'asc') {
    playlistSortDirection.value = 'desc';
    applyPlaylistSort(field);
    return;
  }

  playlistSortField.value = null;
  playlistSortDirection.value = 'asc';
  playlist.value.sort((a, b) => a.order - b.order);

  if (currentTrack.value) {
    const currentTrackId = currentTrack.value.id;
    const newIndex = playlist.value.findIndex((track) => track.id === currentTrackId);
    if (newIndex >= 0) {
      currentIndex.value = newIndex;
    }
  }
}

const nowDisplayTrackName = computed(() => {
  if (isShuffle.value && (nowDisplayMode.value === 'next' || nowDisplayMode.value === 'then')) {
    return 'SHUFFLE';
  }

  if (loopMode.value === 'one' && (nowDisplayMode.value === 'next' || nowDisplayMode.value === 'then')) {
    return getTrackDisplayTitle(currentTrack.value);
  }

  if (nowDisplayMode.value === 'next' && nextTrack.value && nextTrack.value !== currentTrack.value) {
    return getTrackDisplayTitle(nextTrack.value);
  }

  if (nowDisplayMode.value === 'then' && thenTrack.value && thenTrack.value !== currentTrack.value) {
    return getTrackDisplayTitle(thenTrack.value);
  }

  return getTrackDisplayTitle(currentTrack.value);
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
    dockedPlaylistHeightOverride.value = null;
    return;
  }

  await nextTick();
  scrollActiveTrackIntoView();
});

watch([isCompact, isNowHovered, playlist, currentIndex], () => {
  restartNowCycle();
}, { deep: true });

watch(
  [playlist, showPlaylist, isCompact, () => props.detached],
  () => {
    if (props.detached || isCompact.value || !showPlaylist.value || dockedPlaylistHeightOverride.value === null) {
      return;
    }

    const bounds = getDockedPlaylistResizeBounds();
    dockedPlaylistHeightOverride.value = Math.max(bounds.min, Math.min(dockedPlaylistHeightOverride.value, bounds.max));
  },
  { deep: true }
);

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

watch([isPlaying, currentTrack, currentTime, duration], async () => {
  updateMediaSessionMetadata();
  updateMediaSessionPlaybackState();
  publishPlaybackState();
  publishAgentAmpMediaState();
  await publishAgentAmpVideoState();
});

function ensureAgentAmpStatusChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') {
    return null;
  }

  if (!agentAmpStatusChannel) {
    agentAmpStatusChannel = new BroadcastChannel(AGENTAMP_STATUS_CHANNEL);
  }

  return agentAmpStatusChannel;
}

function publishPlaybackState() {
  const playing = Boolean(isPlaying.value && currentTrack.value);

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(AGENTAMP_PLAYING_STORAGE_KEY, playing ? '1' : '0');
    } catch {
      // Ignore localStorage write failures.
    }
  }

  const channel = ensureAgentAmpStatusChannel();
  if (!channel) {
    return;
  }

  channel.postMessage({ type: 'playback-state', playing });
}

function updateMediaSessionMetadata() {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
    return;
  }

  const track = currentTrack.value;
  if (!track) {
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: 'AgentAmp' });
    } catch {
      // Ignore unsupported metadata.
    }
    return;
  }

  const inferred = inferArtistTitle(track);
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: inferred.title || track.name,
      artist: inferred.artist,
      album: track.album,
    });
  } catch {
    // Ignore unsupported metadata.
  }
}

function updateMediaSessionPlaybackState() {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
    return;
  }

  try {
    navigator.mediaSession.playbackState = isPlaying.value ? 'playing' : 'paused';
  } catch {
    // Ignore unsupported playback state.
  }
}

function initializeMediaSession() {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
    return;
  }

  try {
    navigator.mediaSession.setActionHandler('play', () => {
      if (audioEl.value?.paused ?? true) {
        togglePlayback();
      }
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      if (!(audioEl.value?.paused ?? true)) {
        togglePlayback();
      }
    });
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      playPrevious();
    });
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      playNext();
    });
    navigator.mediaSession.setActionHandler('stop', () => {
      stopPlayback();
    });
  } catch {
    // Ignore unsupported action handlers.
  }
}

function clearMediaSessionHandlers() {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
    return;
  }

  try {
    navigator.mediaSession.setActionHandler('play', null);
    navigator.mediaSession.setActionHandler('pause', null);
    navigator.mediaSession.setActionHandler('previoustrack', null);
    navigator.mediaSession.setActionHandler('nexttrack', null);
    navigator.mediaSession.setActionHandler('stop', null);
  } catch {
    // Ignore unsupported action handlers.
  }
}

function handleMediaKeyEvent(event: KeyboardEvent) {
  switch (event.code) {
    case 'MediaPlayPause':
      event.preventDefault();
      togglePlayback();
      break;
    case 'MediaPlay':
      event.preventDefault();
      if (audioEl.value?.paused ?? true) {
        togglePlayback();
      }
      break;
    case 'MediaPause':
      event.preventDefault();
      if (!(audioEl.value?.paused ?? true)) {
        togglePlayback();
      }
      break;
    case 'MediaTrackNext':
      event.preventDefault();
      playNext();
      break;
    case 'MediaTrackPrevious':
      event.preventDefault();
      playPrevious();
      break;
    case 'MediaStop':
      event.preventDefault();
      stopPlayback();
      break;
    default:
      return;
  }
}

async function publishAgentAmpMediaState() {
  const channel = ensureAgentAmpStatusChannel();
  if (!channel) {
    return;
  }

  const track = currentTrack.value;
  if (!track || !isPlaying.value) {
    channel.postMessage({ type: 'agentamp-media-state', activeMedia: null });
    return;
  }

  const inferred = inferArtistTitle(track);
  const label = inferred.artist && inferred.title
    ? `${inferred.artist} - ${inferred.title}`
    : track.name;
  const actualMediaType = track.mediaType ?? getTrackMediaType(track.location);

  channel.postMessage({
    type: 'agentamp-media-state',
    activeMedia: {
      label,
      mediaType: actualMediaType,
    },
  });
}

async function publishAgentAmpVideoState() {
  const channel = ensureAgentAmpStatusChannel();
  if (!channel) {
    return;
  }

  const track = currentTrack.value;
  if (!track || track.mediaType !== 'video') {
    channel.postMessage({ type: 'agentamp-video-state', track: null });
    return;
  }

  let sourceUrl: string | null = track.location;
  if (track.source === 'path' && isTauriRuntime()) {
    try {
      const convertFileSrc = await getTauriConvertFileSrc();
      if (!convertFileSrc) {
        console.warn('[AgentAmp] publishAgentAmpVideoState convertFileSrc unavailable', track.location);
        sourceUrl = null;
      } else {
        sourceUrl = convertFileSrc(normalizeTrackFsPath(track.location));
      }
    } catch (error) {
      console.warn('[AgentAmp] publishAgentAmpVideoState failed to convert path', track.location, error);
      sourceUrl = null;
    }
  }

  if (!sourceUrl) {
    channel.postMessage({ type: 'agentamp-video-state', track: null });
    return;
  }

  channel.postMessage({
    type: 'agentamp-video-state',
    playing: Boolean(isPlaying.value),
    track: {
      id: track.id,
      name: track.name,
      source: track.source,
      location: sourceUrl,
      mediaType: 'video',
    },
    currentTime: Number.isFinite(audioEl.value?.currentTime) ? audioEl.value?.currentTime ?? 0 : currentTime.value,
    duration: Number.isFinite(duration.value) ? duration.value : 0,
  });
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
  return filename.replace(/\.(mp3|m4a|mp4|webm|mov)$/i, '');
}

function isSupportedAudioPath(path: string): boolean {
  return /\.(mp3|m4a)$/i.test(path);
}

function isVideoPath(path: string): boolean {
  return /\.(mp4|webm|mov)$/i.test(path);
}

function getTrackMediaType(path: string): 'audio' | 'video' {
  return isVideoPath(path) ? 'video' : 'audio';
}

function isSupportedMediaPath(path: string): boolean {
  return isSupportedAudioPath(path) || isVideoPath(path);
}

function getMediaTypeFromFile(file: File): 'audio' | 'video' {
  if (file.type.startsWith('video/') || isVideoPath(file.name)) {
    return 'video';
  }
  return 'audio';
}

function getTrackBlobMimeType(track: PlaylistTrack): string {
  const explicitMimeType = getTrackMimeType(track);
  if (explicitMimeType) {
    return explicitMimeType;
  }

  const mediaType = track.mediaType !== undefined
    ? track.mediaType
    : (isVideoPath(track.location) ? 'video' : 'audio');
  const lowerPath = track.location.toLowerCase();

  if (lowerPath.endsWith('.webm')) {
    return mediaType === 'video' ? 'video/webm' : 'audio/webm';
  }

  if (lowerPath.endsWith('.mov')) {
    return 'video/quicktime';
  }

  if (lowerPath.endsWith('.mp4')) {
    return mediaType === 'video' ? 'video/mp4' : 'audio/mp4';
  }

  return mediaType === 'video' ? 'video/mp4' : 'audio/mpeg';
}

async function addTracksFromPaths(paths: string[]) {
  const normalized = paths
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && isSupportedMediaPath(entry));

  if (!normalized.length) {
    return;
  }

  const nextTracks: PlaylistTrack[] = normalized.map((path, index) => ({
    id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    name: extractNameFromPath(path),
    source: 'path',
    location: path,
    order: playlist.value.length + index,
    duration: undefined,
    artist: undefined,
    title: undefined,
    album: undefined,
    year: undefined,
    genre: undefined,
    trackNumber: undefined,
    mediaType: getTrackMediaType(path),
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
  if (
    typeof track.duration === 'number' && track.duration > 0 &&
    typeof track.artist === 'string' && track.artist.trim() &&
    typeof track.title === 'string' && track.title.trim()
  ) {
    return;
  }

  const isVideoTrack = track.mediaType === 'video' || (track.mediaType === undefined && isVideoPath(track.location));

  const sourceUrl = await (async () => {
    if (track.source === 'path') {
      const convertFileSrc = await getTauriConvertFileSrc();
      const normalizedPath = normalizeTrackFsPath(track.location);
      return convertFileSrc ? convertFileSrc(normalizedPath) : null;
    }

    return track.location;
  })();

  if (!sourceUrl) {
    return;
  }

  let metadataSourceUrl: string | null = null;
  let bytes: Uint8Array | null = null;
  let arrayBuffer: ArrayBuffer | null = null;

  try {
    const response = await fetch(sourceUrl, { cache: 'no-store' });
    if (!response.ok) {
      return;
    }

    arrayBuffer = await response.arrayBuffer();
    bytes = new Uint8Array(arrayBuffer);
    const isM4a = isM4aTrack(track);
    const metadata = !isVideoTrack
      ? (isM4a ? parseMp4Metadata(bytes) : parseMp3Metadata(bytes))
      : null;

    if (metadata) {
      const reactiveTrack = playlist.value.find((entry) => entry.id === track.id) ?? track;

      console.log(
        `[AgentAmp] metadata found for ${track.name}: artist=${metadata.artist ?? 'missing'}, title=${metadata.title ?? 'missing'}, album=${metadata.album ?? 'missing'}, year=${metadata.year ?? 'missing'}, genre=${metadata.genre ?? 'missing'}, trackNumber=${metadata.trackNumber ?? 'missing'}`
      );

      if (metadata.artist) {
        reactiveTrack.artist = metadata.artist;
      }
      if (metadata.title) {
        reactiveTrack.title = metadata.title;
      }
      if (metadata.album) {
        reactiveTrack.album = metadata.album;
      }
      if (metadata.year) {
        reactiveTrack.year = metadata.year;
      }
      if (metadata.genre) {
        reactiveTrack.genre = metadata.genre;
      }
      if (metadata.trackNumber) {
        reactiveTrack.trackNumber = metadata.trackNumber;
      }
    } else {
      console.log(`[AgentAmp] no metadata found for ${track.name}`);
    }

    if (!track.duration || track.duration <= 0) {
      const blobType = getTrackBlobMimeType(track);
      metadataSourceUrl = arrayBuffer ? URL.createObjectURL(new Blob([arrayBuffer], { type: blobType })) : null;
    }
  } catch (error) {
    console.log(`[AgentAmp] failed to read metadata for ${track.name}`, error);
  }

  if (track.duration && track.duration > 0) {
    return;
  }

  const metadataElement = isVideoTrack ? document.createElement('video') : document.createElement('audio');

  metadataElement.preload = 'metadata';
  metadataElement.src = metadataSourceUrl ?? sourceUrl ?? track.location;

  await new Promise<void>((resolve) => {
    const cleanup = () => {
      metadataElement.removeEventListener('loadedmetadata', onLoadedMetadata);
      metadataElement.removeEventListener('error', onError);
      if (metadataSourceUrl) {
        URL.revokeObjectURL(metadataSourceUrl);
      }
      resolve();
    };

    const onLoadedMetadata = () => {
      const trackDuration = Number.isFinite(metadataElement.duration) ? metadataElement.duration : 0;
      if (trackDuration > 0) {
        track.duration = trackDuration;
        playlist.value = [...playlist.value];
        console.log(`[AgentAmp] duration loaded for ${track.name}: ${formatTime(trackDuration)}`);
      }
      cleanup();
    };

    const onError = () => {
      cleanup();
    };

    metadataElement.addEventListener('loadedmetadata', onLoadedMetadata);
    metadataElement.addEventListener('error', onError);
    metadataElement.load();
  });

  await nextTick();
}

function decodeTextFrame(data: Uint8Array): string {
  const encoding = data[0];
  const payload = data.slice(1);

  switch (encoding) {
    case 0:
      return decodeLatin1(payload);
    case 1:
      return decodeUtf16(payload, true);
    case 2:
      return decodeUtf16(payload, false);
    case 3:
      return new TextDecoder('utf-8').decode(payload).replace(/\u0000.*$/, '').trim();
    default:
      return new TextDecoder('utf-8').decode(payload).replace(/\u0000.*$/, '').trim();
  }
}

function decodeLatin1(data: Uint8Array): string {
  return String.fromCharCode(...Array.from(data)).replace(/\u0000.*$/, '').trim();
}

function decodeUtf16(data: Uint8Array, littleEndian: boolean): string {
  try {
    const decoder = new TextDecoder(littleEndian ? 'utf-16le' : 'utf-16be');
    return decoder.decode(data).replace(/\u0000.*$/, '').trim();
  } catch {
    return '';
  }
}

function readSyncSafeInteger(bytes: Uint8Array): number {
  return ((bytes[0] & 0x7f) << 21) |
    ((bytes[1] & 0x7f) << 14) |
    ((bytes[2] & 0x7f) << 7) |
    (bytes[3] & 0x7f);
}

function parseId3v2(data: Uint8Array): { artist?: string; title?: string; album?: string; year?: string; genre?: string; trackNumber?: string } | null {
  if (data.length < 10 || String.fromCharCode(...data.slice(0, 3)) !== 'ID3') {
    return null;
  }

  const version = data[3];
  const flags = data[5];
  const tagSize = readSyncSafeInteger(data.slice(6, 10));
  let offset = 10;

  if (flags & 0x40) {
    if (data.length >= 14) {
      const extSize = readSyncSafeInteger(data.slice(10, 14));
      offset += extSize + 4;
    }
  }

  const end = Math.min(offset + tagSize, data.length);
  let artist: string | undefined;
  let albumArtist: string | undefined;
  let title: string | undefined;
  let album: string | undefined;
  let year: string | undefined;
  let genre: string | undefined;
  let trackNumber: string | undefined;

  while (true) {
    const headerSize = version === 2 ? 6 : 10;
    if (offset + headerSize > end) {
      break;
    }

    const frameId = version === 2
      ? String.fromCharCode(...data.slice(offset, offset + 3))
      : String.fromCharCode(...data.slice(offset, offset + 4));

    let frameSize = 0;
    if (version === 2) {
      frameSize = (data[offset + 3] << 16) | (data[offset + 4] << 8) | data[offset + 5];
    } else if (version === 3) {
      frameSize = (data[offset + 4] << 24) |
        (data[offset + 5] << 16) |
        (data[offset + 6] << 8) |
        data[offset + 7];
    } else {
      frameSize = readSyncSafeInteger(data.slice(offset + 4, offset + 8));
    }

    if (frameSize <= 0 || offset + headerSize + frameSize > data.length) {
      break;
    }

    const frameData = data.slice(offset + headerSize, offset + headerSize + frameSize);

    if (frameId === 'TPE1' || frameId === 'TP1' || frameId === 'TPE') {
      artist = decodeTextFrame(frameData);
    }

    if (frameId === 'TPE2' || frameId === 'TP2') {
      albumArtist = decodeTextFrame(frameData);
    }

    if (frameId === 'TIT2' || frameId === 'TT2' || frameId === 'TT1') {
      title = decodeTextFrame(frameData);
    }

    if (frameId === 'TALB' || frameId === 'TAL') {
      album = decodeTextFrame(frameData);
    }

    if (frameId === 'TDRC' || frameId === 'TYER') {
      year = decodeTextFrame(frameData);
    }

    if (frameId === 'TCON' || frameId === 'TCO') {
      genre = decodeTextFrame(frameData);
    }

    if (frameId === 'TRCK' || frameId === 'TRK') {
      trackNumber = decodeTextFrame(frameData);
    }

    offset += headerSize + frameSize;
  }

  return { artist: artist || albumArtist, title, album, year, genre, trackNumber };
}

function parseId3v1(data: Uint8Array): { artist?: string; title?: string; album?: string; year?: string; genre?: string } | null {
  if (data.length < 128) {
    return null;
  }

  const tagOffset = data.length - 128;
  if (String.fromCharCode(...data.slice(tagOffset, tagOffset + 3)) !== 'TAG') {
    return null;
  }

  const title = decodeLatin1(data.slice(tagOffset + 3, tagOffset + 33));
  const artist = decodeLatin1(data.slice(tagOffset + 33, tagOffset + 63));
  const album = decodeLatin1(data.slice(tagOffset + 63, tagOffset + 93));
  const year = decodeLatin1(data.slice(tagOffset + 93, tagOffset + 97));
  const genreByte = data[tagOffset + 127];

  return {
    artist: artist || undefined,
    title: title || undefined,
    album: album || undefined,
    year: year || undefined,
    genre: genreByte >= 0 ? String(genreByte) : undefined,
  };
}

function parseMp4Metadata(data: Uint8Array): { artist?: string; title?: string; album?: string; year?: string; genre?: string; trackNumber?: string } | null {
  function readAtomHeader(offset: number) {
    if (offset + 8 > data.length) {
      return null;
    }
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const size = view.getUint32(offset, false);
    const type = String.fromCharCode(
      data[offset + 4],
      data[offset + 5],
      data[offset + 6],
      data[offset + 7]
    );
    return { size, type };
  }

  function readStringAtomPayload(atomOffset: number): string | null {
    const header = readAtomHeader(atomOffset);
    if (!header || header.type !== 'data') {
      return null;
    }

    const dataOffset = atomOffset + 8 + 8;
    if (dataOffset > data.length) {
      return null;
    }

    const payload = data.subarray(dataOffset, atomOffset + header.size);
    try {
      return new TextDecoder('utf-8').decode(payload).replace(/\u0000.*$/, '').trim();
    } catch {
      return null;
    }
  }

  function readTrackNumberAtom(atomOffset: number): string | null {
    const header = readAtomHeader(atomOffset);
    if (!header || header.type !== 'data') {
      return null;
    }

    const dataOffset = atomOffset + 8 + 8;
    if (dataOffset + 2 > data.length) {
      return null;
    }

    const view = new DataView(data.buffer, data.byteOffset + dataOffset, 2);
    const trackNum = view.getUint16(0, false);
    return trackNum > 0 ? String(trackNum) : null;
  }

  const atomStack: Array<{ offset: number; type: string; size: number }> = [];
  let offset = 0;
  const result: { artist?: string; title?: string; album?: string; year?: string; genre?: string; trackNumber?: string } = {};

  while (offset + 8 <= data.length) {
    const header = readAtomHeader(offset);
    if (!header || header.size < 8) {
      break;
    }

    if (header.type === 'moov' || header.type === 'udta' || header.type === 'meta' || header.type === 'ilst') {
      atomStack.push({ offset, type: header.type, size: header.size });
      if (header.type === 'meta') {
        offset += 8 + 4;
        continue;
      }
      offset += 8;
      continue;
    }

    if (atomStack.length > 0 && atomStack[atomStack.length - 1].type === 'ilst') {
      const atomType = header.type;

      if (atomType === '©nam') {
        const value = readStringAtomPayload(offset + 8);
        if (value) {
          result.title = value;
        }
      } else if (atomType === '©ART') {
        const value = readStringAtomPayload(offset + 8);
        if (value) {
          result.artist = value;
        }
      } else if (atomType === '©alb') {
        const value = readStringAtomPayload(offset + 8);
        if (value) {
          result.album = value;
        }
      } else if (atomType === '©day' || atomType === '©too') {
        const value = readStringAtomPayload(offset + 8);
        if (value) {
          result.year = value;
        }
      } else if (atomType === '©gen') {
        const value = readStringAtomPayload(offset + 8);
        if (value) {
          result.genre = value;
        }
      } else if (atomType === 'trkn') {
        const value = readTrackNumberAtom(offset + 8);
        if (value) {
          result.trackNumber = value;
        }
      }
    }

    offset += header.size;
  }

  if (Object.keys(result).length === 0) {
    return null;
  }

  return result;
}

function parseMp3Metadata(data: Uint8Array): { artist?: string; title?: string; album?: string; year?: string; genre?: string; trackNumber?: string } | null {
  const parsed = parseId3v2(data);
  if (parsed && (parsed.artist || parsed.title || parsed.album || parsed.year || parsed.genre || parsed.trackNumber)) {
    return parsed;
  }

  return parseId3v1(data);
}

async function loadPlaylistMetadata(tracks: PlaylistTrack[]) {
  for (const track of tracks) {
    await loadTrackMetadata(track);
  }
}

function isPlaylistPath(path: string): boolean {
  return /\.(m3u8?|pls)$/i.test(path);
}

function getTrackMimeType(track: PlaylistTrack): string | null {
  if (track.source === 'path') {
    const match = track.location.match(/\.(mp3|m4a)(?:[?#].*)?$/i);
    if (!match) {
      return null;
    }
    return match[1].toLowerCase() === 'm4a' ? 'audio/mp4' : 'audio/mpeg';
  }

  if (track.source === 'dataUrl' && track.location.startsWith('data:')) {
    const match = track.location.match(/^data:([^;]+);/i);
    return match?.[1] ?? null;
  }

  return null;
}

function isM4aTrack(track: PlaylistTrack): boolean {
  const mimeType = getTrackMimeType(track);
  return mimeType === 'audio/mp4' || mimeType === 'audio/x-m4a' || track.location.toLowerCase().endsWith('.m4a');
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

  return entries.filter((entry) => /\.(mp3|m4a)(\?|$)/i.test(entry));
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
        { name: 'Audio and Video Files', extensions: ['mp3', 'm4a', 'mp4', 'webm', 'mov'] },
        { name: 'Audio Files', extensions: ['mp3', 'm4a'] },
        { name: 'Video Files', extensions: ['mp4', 'webm', 'mov'] },
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
    if (
      file.type === 'audio/mpeg' ||
      file.type === 'audio/mp4' ||
      file.type === 'audio/x-m4a' ||
      file.type === 'video/mp4' ||
      file.type === 'video/webm' ||
      file.type === 'video/quicktime'
    ) {
      return true;
    }

    const lowerName = file.name.toLowerCase();
    return (
      lowerName.endsWith('.mp3') ||
      lowerName.endsWith('.m4a') ||
      lowerName.endsWith('.mp4') ||
      lowerName.endsWith('.webm') ||
      lowerName.endsWith('.mov')
    );
  });

  if (!files.length) {
    input.value = '';
    return;
  }

  const nextTracks = await Promise.all(
    files.map(async (file, index) => ({
      id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
      name: file.name.replace(/\.(mp3|m4a|mp4|webm|mov)$/i, ''),
      source: 'dataUrl' as const,
      location: await readFileAsDataUrl(file),
      order: playlist.value.length + index,
      duration: undefined,
      artist: undefined,
      title: undefined,
      album: undefined,
      year: undefined,
      genre: undefined,
      trackNumber: undefined,
      mediaType: getMediaTypeFromFile(file),
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
        console.warn('[AgentAmp] convertFileSrc unavailable for path track', track.location);
        player.src = track.location;
        player.currentTime = 0;
        currentTime.value = pendingRestoreTime;
        duration.value = 0;
        return;
      }

      const converted = convertFileSrc(normalizeTrackFsPath(track.location));
      player.src = converted;
      console.debug('[AgentAmp] path track src set', track.location, player.src);
      player.currentTime = 0;
      currentTime.value = pendingRestoreTime;
      duration.value = 0;
    }).catch((error) => {
      console.error('[AgentAmp] failed to convert path src', track.location, error);
      player.src = track.location;
      player.currentTime = 0;
      currentTime.value = pendingRestoreTime;
      duration.value = 0;
    });
    return;
  }

  player.src = track.location;
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
    console.debug('[AgentAmp] play requested', player.src, currentTrack.value?.location, currentTrack.value?.mediaType);
    void player.play().catch((error) => {
      console.error('[AgentAmp] player.play() failed', error, player.src, currentTrack.value?.location, currentTrack.value?.mediaType);
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
  refreshPlaylistOrder();

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

  if (playlistSortField.value !== null) {
    playlistSortField.value = null;
    playlistSortDirection.value = 'asc';
  }

  refreshPlaylistOrder();

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
          .map((track, index): PlaylistTrack | null => {
            if (!track || typeof track.id !== 'string' || typeof track.name !== 'string') {
              return null;
            }

            const location = typeof track.location === 'string' ? track.location : '';
            const base = {
              id: track.id,
              name: track.name,
              source: track.source === 'path' ? 'path' : 'dataUrl',
              location,
              order: typeof track.order === 'number' ? track.order : index,
              duration: typeof track.duration === 'number' ? track.duration : undefined,
              artist: typeof track.artist === 'string' ? track.artist : undefined,
              title: typeof track.title === 'string' ? track.title : undefined,
              album: typeof track.album === 'string' ? track.album : undefined,
              year: typeof track.year === 'string' ? track.year : undefined,
              genre: typeof track.genre === 'string' ? track.genre : undefined,
              trackNumber: typeof track.trackNumber === 'string' ? track.trackNumber : undefined,
              mediaType: getTrackMediaType(location),
            } as PlaylistTrack;

            if (track.source === 'path' && typeof track.location === 'string') {
              return base;
            }

            // Migration from old dataUrl-only shape.
            if (typeof (track as { dataUrl?: unknown }).dataUrl === 'string') {
              const legacyTrack = track as unknown as { id: string; name: string; dataUrl: string };
              return {
                ...base,
                source: 'dataUrl',
                location: legacyTrack.dataUrl,
              };
            }

            if (track.source === 'dataUrl' && typeof track.location === 'string') {
              return base;
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

  // Listen for a stop-for-transition signal from the main app so audio
  // stops immediately when another pinned source takes priority.
  if (typeof BroadcastChannel !== 'undefined') {
    agentAmpStopChannel = new BroadcastChannel(AGENTAMP_STOP_CHANNEL);
    agentAmpStopChannel.onmessage = (event) => {
      if (event.data === 'stop-for-transition') {
        if (props.detached) {
          // Write handoff state immediately so the docked instance can restore
          // from live detached state before this window is actually closed.
          writeTransitionState({
            wasPlaying: isPlaying.value,
            timestamp: Date.now(),
            playerState: buildPersistedPlayerStateSnapshot(),
          });
        }

        audioEl.value?.pause();
        isPlaying.value = false;
      }
    };
  }

  restorePlayerState();
  restartNowCycle();
  updateMediaSessionMetadata();
  updateMediaSessionPlaybackState();
  publishPlaybackState();
  window.addEventListener('keydown', handleMediaKeyEvent);
  initializeMediaSession();
});

onBeforeUnmount(() => {
  stopDockedPlaylistResize();
  window.removeEventListener('keydown', handleMediaKeyEvent);
  clearMediaSessionHandlers();

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
  font-size: 12px;
  line-height: 1.3;
  letter-spacing: 0.55px;
  white-space: nowrap;
  padding: 4px 8px;
  text-align: center;
  min-width: 0;
  max-width: 280px;
  border-radius: 2px;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  z-index: 22;
  box-shadow: 0 0 10px var(--color-accent-muted);
  transition: opacity 0.16s ease, transform 0.16s ease, visibility 0.16s ease;
}

.agentamp-playlist .agentamp-track-btn[data-tooltip]::after {
  content: attr(data-tooltip);
  position: absolute;
  left: 50%;
  bottom: calc(100% + 7px);
  transform: translateX(-50%) translateY(2px);
  border: 1px solid var(--color-accent);
  background: var(--color-chat-surface-strong);
  color: var(--color-chat-text);
  font-size: 12px;
  line-height: 1.3;
  letter-spacing: 0.55px;
  white-space: pre-line;
  padding: 4px 8px;
  text-align: center;
  min-width: 260px;
  max-width: min(420px, calc(100vw - 48px));
  border-radius: 2px;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  z-index: 22;
  box-shadow: 0 0 10px var(--color-accent-muted);
  transition: opacity 0.16s ease, transform 0.16s ease, visibility 0.16s ease;
}

.agentamp-track-btn.metadata-visible[data-tooltip]::after,
.agentamp-track-btn.metadata-visible[data-tooltip]::before {
  display: none;
}

.agentamp-track-btn[data-tooltip]::after {
  text-transform: none;
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

.agentamp-playlist .agentamp-track-btn[data-tooltip]::before {
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
.agentamp-now-playing [data-tooltip]:focus-visible:not(:disabled)::after,
.agentamp-track-btn.metadata-visible[data-tooltip]::after {
  opacity: 1;
  visibility: visible;
  transform: translateX(-50%) translateY(0);
}

.agentamp-controls [data-tooltip]:hover:not(:disabled)::before,
.agentamp-controls [data-tooltip]:focus-visible:not(:disabled)::before,
.agentamp-now-playing [data-tooltip]:hover:not(:disabled)::before,
.agentamp-now-playing [data-tooltip]:focus-visible:not(:disabled)::before,
.agentamp-track-btn.metadata-visible[data-tooltip]::before {
  opacity: 1;
  visibility: visible;
}

.agentamp-playlist-header + .agentamp-track-row .agentamp-track-btn[data-tooltip]::after,
.agentamp-track-row:first-child:not(.agentamp-playlist-header) .agentamp-track-btn[data-tooltip]::after {
  bottom: auto;
  top: calc(100% + 7px);
  transform: translateX(-50%) translateY(-2px);
}

.agentamp-track-tooltip-card {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 30;
  min-width: 220px;
  max-width: 280px;
  background: var(--color-chat-surface-strong);
  border: 1px solid var(--color-accent);
  border-radius: 3px;
  padding: 8px 10px;
  box-shadow: 0 0 14px rgba(0, 0, 0, 0.2);
  color: var(--color-chat-text);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  white-space: nowrap;
  text-align: center;
}

.agentamp-track-tooltip-card--first-row {
  top: 100%;
}

.agentamp-track-tooltip-card--other-row {
  top: 0;
}

.agentamp-track-tooltip-copy {
  flex: 1 1 auto;
  font-size: 11px;
  line-height: 1.4;
  margin-bottom: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agentamp-metadata-edit-link {
  flex: 0 0 auto;
}

.agentamp-metadata-edit-link {
  background: transparent;
  border: none;
  color: var(--color-accent);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  text-transform: uppercase;
  padding: 0;
}

.agentamp-metadata-edit-link:hover {
  text-decoration: underline;
}

.agentamp-playlist-header + .agentamp-track-row .agentamp-track-btn[data-tooltip]::before,
.agentamp-track-row:first-child:not(.agentamp-playlist-header) .agentamp-track-btn[data-tooltip]::before {
  bottom: auto;
  top: calc(100% + 2px);
  border-top: none;
  border-bottom: 5px solid var(--color-accent);
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

.agentamp-docked-resize-handle {
  height: 14px;
  border: 1px solid var(--color-agentamp-panel-border);
  border-bottom: none;
  background: var(--color-agentamp-panel-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: ns-resize;
}

.agentamp-docked-resize-grip {
  width: 64px;
  height: 6px;
  border: 1px solid var(--color-agentamp-button-muted-border);
  border-radius: 3px;
  background: repeating-linear-gradient(
    90deg,
    var(--color-agentamp-button-muted-text) 0,
    var(--color-agentamp-button-muted-text) 8px,
    transparent 8px,
    transparent 16px
  );
  opacity: 0.6;
}

.agentamp-docked-resize-handle:hover .agentamp-docked-resize-grip {
  border-color: var(--color-accent);
  opacity: 0.9;
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

.agentamp-track-row,
.agentamp-playlist-header {
  display: grid;
  grid-template-columns: 32px minmax(0,1.2fr) minmax(0,2.4fr) minmax(0,0.6fr) auto auto;
  align-items: center;
  gap: 6px;
}

.agentamp-track-row {
  position: relative;
}

.agentamp-playlist-header {
  padding: 8px 8px;
  border-bottom: 1px solid var(--color-agentamp-track-row-border);
  background: rgba(255, 255, 255, 0.02);
  color: var(--color-text-secondary);
  font-size: 11px;
}

.agentamp-playlist-header-cell {
  background: transparent;
  border: none;
  color: inherit;
  font-family: inherit;
  font-size: inherit;
  text-align: left;
  cursor: pointer;
  padding: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.agentamp-playlist-header-order {
  justify-self: start;
}

.agentamp-playlist-header-genre {
  justify-self: center;
}

.agentamp-track-order {
  color: var(--color-text-secondary);
  font-size: 11px;
  padding: 7px 8px;
  white-space: nowrap;
  min-width: 0;
  grid-column: 1 / 2;
}

.agentamp-playlist-header-cell:hover {
  color: var(--color-text-primary);
}

.agentamp-playlist-header-placeholder {
  width: 22px;
}

.agentamp-track-row {
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
  overflow: visible;
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  grid-column: 2 / span 2;
}

.agentamp-track-artist,
.agentamp-track-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agentamp-track-artist {
  flex: 1 0 35%;
  color: var(--color-text-secondary);
}

.agentamp-track-title {
  flex: 1 0 65%;
}

.agentamp-track-cell.agentamp-track-genre {
  color: var(--color-text-secondary);
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  max-width: 80px;
  grid-column: 4;
  justify-self: center;
  text-align: center;
}

.agentamp-track-duration {
  grid-column: 5;
  color: var(--color-text-secondary);
  font-size: 11px;
  margin: 0 6px;
  white-space: nowrap;
  flex: 0 0 auto;
  min-width: 0;
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

.agentamp-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 100;
}

.agentamp-modal-card {
  background: rgba(0, 0, 0, 0.92);
  border: 1px solid var(--color-agentamp-border);
  border-radius: 8px;
  box-shadow: 0 0 32px rgba(0, 0, 0, 0.25);
  width: min(420px, calc(100vw - 32px));
  max-width: 100%;
  min-height: min(420px, calc(100vh - 32px));
  max-height: min(90vh, calc(100vh - 32px));
  overflow: visible;
  position: relative;
}

.agentamp-modal-form {
  display: grid;
  gap: 10px;
  padding: 16px;
  max-height: calc(90vh - 120px);
  overflow: visible;
}

.agentamp-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--color-agentamp-track-row-border);
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.agentamp-modal-close {
  background: transparent;
  border: none;
  color: var(--color-text-primary);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
}

.agentamp-modal-form {
  display: grid;
  gap: 10px;
  padding: 16px;
}

.agentamp-modal-form label {
  display: grid;
  gap: 4px;
  font-size: 11px;
  color: var(--color-text-secondary);
}

.agentamp-modal-form input {
  width: 100%;
  border: 1px solid var(--color-agentamp-track-row-border);
  background: var(--color-agentamp-bg);
  color: var(--color-text-primary);
  padding: 8px 10px;
  border-radius: 4px;
  font-size: 12px;
}

.agentamp-genre-input-wrap {
  position: relative;
}

.agentamp-genre-input {
  appearance: none;
  -webkit-appearance: none;
  background-color: var(--color-agentamp-bg);
  border-color: var(--color-agentamp-track-row-border);
  color: inherit;
  padding-right: 36px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
}

.agentamp-genre-input:focus {
  outline: none;
  box-shadow: 0 0 0 2px var(--color-accent);
}

.agentamp-genre-options {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  max-height: 220px;
  border: 1px solid var(--color-agentamp-track-row-border);
  border-radius: 6px;
  background: var(--color-agentamp-bg);
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.16);
  overflow-x: hidden;
  overflow-y: auto;
  z-index: 150;
}

.agentamp-genre-input-wrap {
  position: relative;
  z-index: 1;
}

.agentamp-genre-option {
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  color: var(--color-text-primary);
  padding: 10px 12px;
  cursor: pointer;
  font-size: 12px;
}

.agentamp-genre-option:hover,
.agentamp-genre-option:focus {
  background: var(--color-agentamp-track-hover-bg);
}

.agentamp-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 8px;
}

.agentamp-modal-error {
  margin: 0;
  color: var(--color-danger);
  font-size: 11px;
}
</style>
