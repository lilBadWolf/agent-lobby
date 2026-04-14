<template>
  <div class="media-library-root">
    <div data-tauri-drag-region class="custom-titlebar">
      {{ titlebarLabel }}
      <button v-if="hasTauriWindow" class="rescan-btn" type="button" @click="scanAllFolders" :disabled="!folders.length || scanInProgress">⟳</button>
      <button v-if="hasTauriWindow" class="minimize-btn" @click="minimize">—</button>
      <button v-if="hasTauriWindow" class="maximize-btn" @click="toggleMaximize">
        <span class="window-icon" :class="{ maximized: isMaximized }" aria-hidden="true"></span>
      </button>
      <button class="titlebar-close-btn" @click="handleClose">✕</button>
    </div>

    <div class="media-library-body">
      <div class="media-library-tracks">
        <div class="media-library-search-row">
          <input
            class="media-library-search"
            type="text"
            v-model="searchQuery"
            placeholder="Search title, artist, album, genre, or filename"
          />
        </div>

        <div v-if="sortedTracks.length" class="media-library-track-actions">
          <button class="agentamp-btn compact" type="button" @click="toggleSelectAll">
            {{ allVisibleSelected ? 'DESELECT ALL' : 'SELECT ALL' }}
          </button>
          <button
            class="agentamp-btn compact"
            type="button"
            :disabled="selectedTrackIds.size === 0"
            @click="addSelectedTracksToPlaylist"
          >
            ADD SELECTED ({{ selectedTrackIds.size }})
          </button>
          <button
            class="agentamp-btn compact"
            type="button"
            @click="clearFiltersAndSelection"
          >
            CLEAR
          </button>
        </div>

        <div v-if="!filteredTracks.length" class="media-library-empty">
          No tracks found. Add a folder or rescan an existing folder.
        </div>

        <div v-if="sortedTracks.length" class="media-library-track-table-wrap">
          <table class="media-library-track-table">
            <thead>
              <tr>
                <th></th>
                <th
                  v-for="column in columns"
                  :key="column.key"
                  :class="['sortable', { dragTarget: dragTarget === column.key } ]"
                  :style="getColumnStyle(column.key)"
                  draggable="true"
                  @dragstart="startHeaderDrag(column.key, $event)"
                  @dragover.prevent="onHeaderDragOver(column.key, $event)"
                  @drop.prevent="dropHeader(column.key, $event)"
                  @click="column.sortable && toggleSort(column.key as MediaLibraryColumnKey)"
                >
                  {{ column.label }}{{ getSortIndicator(column.key as MediaLibraryColumnKey) }}
                  <span class="resize-handle" @mousedown.prevent="startColumnResize($event, column.key)"></span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="track in sortedTracks"
                :key="track.id"
                class="media-library-track-row"
                @dblclick="addTrackToPlaylist(track)"
                @contextmenu.prevent="openMetadataEditor(track)"
              >
                <td>
                  <input
                    type="checkbox"
                    :checked="selectedTrackIds.has(track.id)"
                    @change="toggleTrackSelection(track.id)"
                  />
                </td>
                <td v-for="column in columns" :key="column.key">
                  {{ getCellValue(track, column.key) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div v-if="editingMetadataTrack" class="media-library-modal-backdrop" @click.self="closeMetadataEditor">
      <div class="media-library-modal-card">
        <div class="media-library-modal-header">
          <span>EDIT {{ editingMetadataFileName() }}</span>
          <button class="media-library-modal-close" type="button" @click="closeMetadataEditor">✕</button>
        </div>
        <form class="media-library-modal-form" @submit.prevent="saveTrackMetadata">
          <label>
            ARTIST
            <input v-model="metadataEditorForm.artist" type="text" />
          </label>
          <label>
            TITLE
            <input v-model="metadataEditorForm.title" type="text" />
          </label>
          <label>
            YEAR
            <input v-model="metadataEditorForm.year" type="text" />
          </label>
          <template v-if="!isEditingLibraryVideoTrack">
            <label>
              ALBUM
              <input v-model="metadataEditorForm.album" type="text" />
            </label>
            <label>
              GENRE
              <input v-model="metadataEditorForm.genre" type="text" />
            </label>
            <label>
              TRACK #
              <input v-model="metadataEditorForm.trackNumber" type="text" />
            </label>
          </template>
          <div class="media-library-modal-actions">
            <button type="button" class="agentamp-btn compact" @click="closeMetadataEditor">CANCEL</button>
            <button type="submit" class="agentamp-btn compact" :disabled="metadataEditorSaving">
              {{ metadataEditorSaving ? 'SAVING...' : 'SAVE' }}
            </button>
          </div>
          <p v-if="metadataEditorError" class="media-library-modal-error">{{ metadataEditorError }}</p>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { useTheme } from './composables/useTheme';

interface MediaLibraryFolder {
  path: string;
  addedAt: number;
  lastScanAt?: number;
  trackCount?: number;
}

interface MediaLibraryTrack {
  id: string;
  path: string;
  name: string;
  folderPath: string;
  mediaType: 'audio' | 'video';
  artist?: string;
  title?: string;
  album?: string;
  year?: string;
  genre?: string;
  trackNumber?: string;
  duration?: number;
}

interface MediaLibraryState {
  folders: MediaLibraryFolder[];
  tracks: MediaLibraryTrack[];
}

interface MetadataEditFields {
  artist: string;
  title: string;
  album: string;
  year: string;
  genre: string;
  trackNumber: string;
}

interface MediaLibraryMetadataResult {
  artist?: string;
  title?: string;
  album?: string;
  year?: string;
  genre?: string;
  trackNumber?: string;
}

type MediaLibraryColumnKey = 'name' | 'artist' | 'album' | 'genre' | 'year' | 'mediaType';

const isTauriRuntime = () => typeof window !== 'undefined' && typeof (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ === 'object';
const hasTauriWindow = isTauriRuntime();
const isMaximized = ref(false);
const folders = ref<MediaLibraryFolder[]>([]);
const tracks = ref<MediaLibraryTrack[]>([]);
const selectedTrackIds = ref(new Set<string>());
const searchQuery = ref('');
const scanInProgress = ref(false);
const pendingScans = ref(0);
const libraryStatusMessage = ref('');
let scanProgressUnlisten: (() => void) | null = null;
let scanCompleteUnlisten: (() => void) | null = null;
const editingMetadataTrack = ref<MediaLibraryTrack | null>(null);
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
const isEditingLibraryVideoTrack = computed(() => {
  const track = editingMetadataTrack.value;
  return Boolean(track && (track.mediaType === 'video' || /\.(mp4|webm|mov)$/i.test(track.path)));
});
const sortField = ref<'name' | 'artist' | 'genre' | 'album' | 'year' | 'mediaType' | null>('name');
const sortDirection = ref<'asc' | 'desc'>('asc');

const { applyTheme } = useTheme();
const themeName = typeof document !== 'undefined'
  ? document.documentElement.getAttribute('data-theme') ?? 'retro-terminal'
  : 'retro-terminal';
applyTheme(themeName, { persist: false });

const filteredTracks = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) {
    return tracks.value;
  }

  return tracks.value.filter((track) => {
    return [
      track.name,
      track.title,
      track.artist,
      track.album,
      track.genre,
      track.mediaType,
      track.path,
    ]
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(query));
  });
});

const sortedTracks = computed(() => {
  const rows = filteredTracks.value.map((track, index) => ({ track, index }));
  if (!sortField.value) {
    return rows.map((entry) => entry.track);
  }

  return rows.sort((a, b) => {
    const getValue = (track: MediaLibraryTrack) => {
      if (sortField.value === 'name') {
        return (track.title || track.name || '').toLowerCase();
      }
      if (sortField.value === 'artist') {
        return (track.artist || '').toLowerCase();
      }
      if (sortField.value === 'genre') {
        return (track.genre || '').toLowerCase();
      }
      if (sortField.value === 'album') {
        return (track.album || '').toLowerCase();
      }
      if (sortField.value === 'year') {
        return (track.year || '').toLowerCase();
      }
      if (sortField.value === 'mediaType') {
        return (track.mediaType || '').toLowerCase();
      }
      return '';
    };

    const fallbackValue = (track: MediaLibraryTrack) => {
      return (track.title || track.name || track.path || track.id || '').toLowerCase();
    };

    const left = getValue(a.track);
    const right = getValue(b.track);
    if (left < right) {
      return sortDirection.value === 'asc' ? -1 : 1;
    }
    if (left > right) {
      return sortDirection.value === 'asc' ? 1 : -1;
    }

    const leftFallback = fallbackValue(a.track);
    const rightFallback = fallbackValue(b.track);
    if (leftFallback < rightFallback) {
      return sortDirection.value === 'asc' ? -1 : 1;
    }
    if (leftFallback > rightFallback) {
      return sortDirection.value === 'asc' ? 1 : -1;
    }

    return a.index - b.index;
  }).map((entry) => entry.track);
});

const allVisibleSelected = computed(() => {
  return sortedTracks.value.length > 0 && sortedTracks.value.every((track) => selectedTrackIds.value.has(track.id));
});

const trackCount = computed(() => tracks.value.length);
const titlebarLabel = computed(() => {
  return scanInProgress.value
    ? `MEDIA // LIBRARY - ${trackCount.value} - SCANNING...`
    : `MEDIA // LIBRARY - ${trackCount.value}`;
});

const columns = ref([
  { key: 'name', label: 'Title', sortable: true },
  { key: 'artist', label: 'Artist', sortable: true },
  { key: 'album', label: 'Album', sortable: true },
  { key: 'genre', label: 'Genre', sortable: true },
  { key: 'year', label: 'Year', sortable: true },
  { key: 'mediaType', label: 'Type', sortable: true },
]);

const columnWidths = ref<Record<string, number>>({});
const draggingColumn = ref<string | null>(null);
const dragTarget = ref<string | null>(null);
const resizingColumn = ref<string | null>(null);
let resizeStartX = 0;
let resizeStartWidth = 0;

function getColumnStyle(key: string) {
  const width = columnWidths.value[key];
  return width ? { width: `${width}px` } : {};
}

function getCellValue(track: MediaLibraryTrack, key: string) {
  if (key === 'name') {
    return track.title || track.name || '—';
  }
  if (key === 'year') {
    return normalizeYearValue(track.year) ?? track.year ?? '—';
  }
  return track[key as keyof MediaLibraryTrack] ?? '—';
}

function isMetadataEditable(track: MediaLibraryTrack): boolean {
  return Boolean(track.path && track.path.trim().length);
}

function editingMetadataFileName(): string {
  const track = editingMetadataTrack.value;
  if (!track) {
    return 'TRACK METADATA';
  }

  const path = track.path?.trim() || track.name?.trim();
  if (!path) {
    return 'TRACK METADATA';
  }

  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

async function openMetadataEditor(track: MediaLibraryTrack) {
  if (!isMetadataEditable(track)) {
    return;
  }

  await loadLibraryTrackMetadata(track);

  editingMetadataTrack.value = track;
  metadataEditorForm.value = {
    artist: track.artist ?? '',
    title: track.title ?? '',
    album: track.album ?? '',
    year: normalizeYearValue(track.year) ?? '',
    genre: track.genre ?? '',
    trackNumber: track.trackNumber ?? '',
  };
  metadataEditorError.value = null;
}

async function loadLibraryTrackMetadata(track: MediaLibraryTrack) {
  try {
    const normalizedPath = normalizeTrackFsPath(track.path);
    const metadata = await invoke<MediaLibraryMetadataResult | null>('read_agentamp_metadata', { path: normalizedPath });
    if (!metadata) {
      return;
    }

    if (!track.artist?.trim() && metadata.artist) {
      track.artist = metadata.artist;
    }
      if (metadata.title) {
      track.title = metadata.title;
    }
    if (metadata.album) {
      track.album = metadata.album;
    }
    if (metadata.year) {
      track.year = normalizeYearValue(metadata.year) ?? metadata.year;
    }
    if (metadata.genre) {
      track.genre = metadata.genre;
    }
    if (metadata.trackNumber) {
      track.trackNumber = metadata.trackNumber;
    }
  } catch (error) {
    console.warn('Failed to load library track metadata:', error);
  }
}

function closeMetadataEditor() {
  editingMetadataTrack.value = null;
  metadataEditorError.value = null;
}

function normalizeMetadataValue(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function normalizeYearValue(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed.length) {
    return undefined;
  }

  const matched = trimmed.match(/^(\d{4})/);
  return matched ? matched[1] : trimmed;
}

async function writeTrackMetadataToFile(track: MediaLibraryTrack, metadata: MetadataEditFields): Promise<void> {
  const path = normalizeTrackFsPath(track.path);
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

function normalizeTrackFsPath(path: string): string {
  let normalized = path.trim();
  if (normalized.startsWith('file:///')) {
    return normalized.slice('file:///'.length);
  }
  if (normalized.startsWith('file://localhost/')) {
    return normalized.slice('file://localhost/'.length);
  }
  if (normalized.startsWith('file://')) {
    return normalized.slice('file://'.length);
  }
  return normalized;
}

async function saveTrackMetadata() {
  const track = editingMetadataTrack.value;
  if (!track) {
    return;
  }

  if (!isMetadataEditable(track)) {
    metadataEditorError.value = 'Cannot edit metadata for this track.';
    return;
  }

  metadataEditorSaving.value = true;
  metadataEditorError.value = null;

  try {
    await writeTrackMetadataToFile(track, metadataEditorForm.value);

    track.artist = normalizeMetadataValue(metadataEditorForm.value.artist) ?? track.artist;
    track.title = normalizeMetadataValue(metadataEditorForm.value.title) ?? track.title;
    track.album = normalizeMetadataValue(metadataEditorForm.value.album) ?? track.album;
    track.year = normalizeMetadataValue(metadataEditorForm.value.year) ?? track.year;
    track.genre = normalizeMetadataValue(metadataEditorForm.value.genre) ?? track.genre;
    track.trackNumber = normalizeMetadataValue(metadataEditorForm.value.trackNumber) ?? track.trackNumber;

    tracks.value = [...tracks.value];
    closeMetadataEditor();
  } catch (error) {
    metadataEditorError.value = 'Unable to save metadata. Please try again.';
    console.error('Failed to save metadata:', error);
  } finally {
    metadataEditorSaving.value = false;
  }
}

function startHeaderDrag(key: string, event: DragEvent) {
  draggingColumn.value = key;
  event.dataTransfer?.setData('text/plain', key);
  event.dataTransfer?.setDragImage(new Image(), 0, 0);
}

function onHeaderDragOver(key: string, event: DragEvent) {
  event.preventDefault();
  if (draggingColumn.value && draggingColumn.value !== key) {
    dragTarget.value = key;
  }
}

function dropHeader(key: string, event: DragEvent) {
  event.preventDefault();
  const source = draggingColumn.value;
  dragTarget.value = null;
  draggingColumn.value = null;
  if (!source || source === key) {
    return;
  }

  const sourceIndex = columns.value.findIndex((column) => column.key === source);
  const targetIndex = columns.value.findIndex((column) => column.key === key);
  if (sourceIndex === -1 || targetIndex === -1) {
    return;
  }

  const next = [...columns.value];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  columns.value = next;
}

function startColumnResize(event: MouseEvent, key: string) {
  resizingColumn.value = key;
  resizeStartX = event.clientX;
  const targetElement = event.currentTarget as HTMLElement;
  resizeStartWidth = columnWidths.value[key] ?? (targetElement.parentElement?.getBoundingClientRect().width ?? 120);
  window.addEventListener('mousemove', handleColumnResizeMove);
  window.addEventListener('mouseup', stopColumnResize);
}

function handleColumnResizeMove(event: MouseEvent) {
  if (!resizingColumn.value) {
    return;
  }
  const nextWidth = Math.max(80, resizeStartWidth + event.clientX - resizeStartX);
  columnWidths.value = {
    ...columnWidths.value,
    [resizingColumn.value]: nextWidth,
  };
}

function stopColumnResize() {
  if (!resizingColumn.value) {
    return;
  }
  resizingColumn.value = null;
  window.removeEventListener('mousemove', handleColumnResizeMove);
  window.removeEventListener('mouseup', stopColumnResize);
}

function toggleSort(field: 'name' | 'artist' | 'genre' | 'album' | 'year' | 'mediaType') {
  if (sortField.value === field) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
    return;
  }

  sortField.value = field;
  sortDirection.value = 'asc';
}

function getSortIndicator(field: 'name' | 'artist' | 'genre' | 'album' | 'year' | 'mediaType') {
  if (sortField.value !== field) {
    return '';
  }
  return sortDirection.value === 'asc' ? ' ▲' : ' ▼';
}

async function loadLibraryState() {
  try {
    const state = await invoke<MediaLibraryState>('load_media_library_state');
    if (state && typeof state === 'object') {
      folders.value = state.folders ?? [];
      tracks.value = state.tracks ?? [];
      selectedTrackIds.value = new Set<string>();
    }
  } catch (error) {
    console.error('Failed to load media library state:', error);
  }
}

async function scanAllFolders() {
  if (!folders.value.length) {
    return;
  }

  pendingScans.value = folders.value.length;
  scanInProgress.value = true;
  libraryStatusMessage.value = `Rescanning ${folders.value.length} folder(s)...`;

  for (const folder of folders.value) {
    try {
      await invoke('scan_media_library_folder', { folderPath: folder.path });
    } catch (error) {
      console.error('Failed to rescan folder:', folder.path, error);
    }
  }
}


async function addSelectedTracksToPlaylist() {
  if (!selectedTrackIds.value.size) {
    return;
  }

  const selected = tracks.value.filter((track) => selectedTrackIds.value.has(track.id));
  if (!selected.length) {
    return;
  }

  try {
    await invoke('library_add_tracks_to_playlist', {
      tracks: selected.map((track) => ({
        path: track.path,
        artist: track.artist,
        title: track.title,
        album: track.album,
        year: track.year,
        genre: track.genre,
        mediaType: track.mediaType,
      })),
    });
    console.log(`Added ${selected.length} track${selected.length === 1 ? '' : 's'} to the playlist.`);
  } catch (error) {
    console.error('Failed to add tracks to playlist:', error);
  }
}

function toggleTrackSelection(trackId: string) {
  const next = new Set(selectedTrackIds.value);
  if (next.has(trackId)) {
    next.delete(trackId);
  } else {
    next.add(trackId);
  }
  selectedTrackIds.value = next;
}

function clearFiltersAndSelection() {
  searchQuery.value = '';
  selectedTrackIds.value = new Set<string>();
}

function toggleSelectAll() {
  if (allVisibleSelected.value) {
    selectedTrackIds.value = new Set<string>();
    return;
  }

  selectedTrackIds.value = new Set(sortedTracks.value.map((track) => track.id));
}

async function addTrackToPlaylist(track: MediaLibraryTrack) {
  try {
    await invoke('library_add_tracks_to_playlist', {
      tracks: [
        {
          path: track.path,
          artist: track.artist,
          title: track.title,
          album: track.album,
          year: track.year,
          genre: track.genre,
          mediaType: track.mediaType,
        },
      ],
    });
  } catch (error) {
    console.error('Failed to add track to playlist:', error);
  }
}

function handleClose() {
  if (!hasTauriWindow) {
    window.close();
    return;
  }

  import('@tauri-apps/api/webviewWindow')
    .then(async ({ getCurrentWebviewWindow }) => {
      await getCurrentWebviewWindow().close();
    })
    .catch(async () => {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().close();
    });
}

async function minimize() {
  if (!hasTauriWindow) {
    return;
  }

  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow().minimize();
}

async function toggleMaximize() {
  if (!hasTauriWindow) {
    return;
  }

  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const appWindow = getCurrentWindow();
  const maximized = await appWindow.isMaximized();

  if (maximized) {
    await appWindow.unmaximize();
  } else {
    await appWindow.maximize();
  }

  isMaximized.value = !maximized;
}

onMounted(async () => {
  if (hasTauriWindow) {
    const eventModule = await import('@tauri-apps/api/event').catch(() => null);
    if (eventModule?.listen) {
      scanProgressUnlisten = await eventModule.listen('media-library-scan-progress', (event) => {
        const payload = event.payload as { folderPath: string; scannedFiles: number; matchedFiles: number; currentPath: string };
        libraryStatusMessage.value = `Scanning ${payload.currentPath} (${payload.matchedFiles} tracks found)`;
      });

      scanCompleteUnlisten = await eventModule.listen('media-library-scan-complete', async (event) => {
        const payload = event.payload as { folderPath: string; scannedFiles: number; matchedFiles: number };
        pendingScans.value = Math.max(0, pendingScans.value - 1);
        libraryStatusMessage.value = `Finished scanning ${payload.folderPath}: ${payload.matchedFiles} tracks found.`;
        await loadLibraryState();
        if (pendingScans.value === 0) {
          scanInProgress.value = false;
        }
      });
    }
  }

  await loadLibraryState();

  if (hasTauriWindow) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window').catch(() => ({ getCurrentWindow: null }));
    if (getCurrentWindow) {
      try {
        isMaximized.value = await getCurrentWindow().isMaximized();
      } catch {
        isMaximized.value = false;
      }
    }
  }
});

onBeforeUnmount(() => {
  scanProgressUnlisten?.();
  scanProgressUnlisten = null;
  scanCompleteUnlisten?.();
  scanCompleteUnlisten = null;
});
</script>

<style scoped>
.media-library-root {
  min-height: 100vh;
  background: var(--color-background);
  color: var(--color-text);
}

.media-library-body {
  padding: 10px;
  display: flex;
  flex-direction: column;
  height: calc(100vh - 32px);
  overflow: hidden;
}

.media-library-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
  margin-bottom: 8px;
}

.media-library-search-row {
  margin-bottom: 8px;
}

.media-library-folders,
.media-library-tracks {
  margin-bottom: 12px;
}

.media-library-tracks {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}

.media-library-track-table-wrap {
  overflow: auto;
  flex: 1 1 0;
  min-height: 0;
}

.media-library-track-table th.sortable {
  cursor: pointer;
  user-select: none;
}

.media-library-subtitle {
  margin: 4px 0 0;
  color: var(--color-muted);
  font-size: 0.95rem;
}

.media-library-action-group {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.media-library-search-row {
  margin-bottom: 8px;
}

.media-library-search {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--color-agentamp-track-row-border);
  background: var(--color-agentamp-bg);
  color: var(--color-text-primary);
  font-size: 0.95rem;
  border-radius: 4px;
}

.media-library-status {
  margin-bottom: 12px;
  color: var(--color-accent);
}

.media-library-folders,
.media-library-tracks {
  margin-bottom: 12px;
}

.media-library-section-title {
  font-size: 0.9rem;
  letter-spacing: 1px;
  margin-bottom: 8px;
  color: var(--color-accent);
}

.media-library-empty {
  padding: 18px;
  border: 1px dashed var(--color-accent-muted);
  color: var(--color-muted);
}

.media-library-folder-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.media-library-folder-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: var(--color-surface);
  border: 1px solid var(--color-accent-muted);
}

.media-library-folder-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.media-library-track-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.media-library-track-actions .agentamp-btn {
  background: var(--color-agentamp-button-bg);
  border: 1px solid var(--color-agentamp-button-border);
  color: var(--color-agentamp-button-text);
  font-family: inherit;
  text-transform: uppercase;
  font-size: 0.85rem;
  padding: 6px 10px;
  cursor: pointer;
}

.media-library-track-actions .agentamp-btn.compact {
  min-width: 0;
  height: 28px;
  border-radius: 4px;
}

.media-library-track-actions .agentamp-btn:hover:not(:disabled) {
  background: var(--color-agentamp-button-hover-bg);
  color: var(--color-agentamp-button-hover-text);
}

.media-library-track-actions .agentamp-btn:disabled {
  background: var(--color-agentamp-button-muted-bg);
  border-color: var(--color-agentamp-button-muted-border);
  color: var(--color-agentamp-button-muted-text);
  cursor: not-allowed;
}

.media-library-track-table-wrap {
  overflow-x: auto;
  overflow-y: auto;
  flex: 1 1 0;
  min-height: 0;
}

.media-library-track-table {
  width: 100%;
  border-collapse: collapse;
}

.media-library-track-table th,
.media-library-track-table td {
  padding: 8px 10px;
  border: 1px solid var(--color-agentamp-track-row-border);
  text-align: left;
  white-space: nowrap;
}

.media-library-track-table th {
  position: sticky;
  top: 0;
  background: var(--color-agentamp-bg);
  z-index: 1;
  user-select: none;
}

.media-library-track-table th.sortable {
  cursor: grab;
}

.media-library-track-table th.sortable:hover {
  cursor: move;
}

.media-library-track-table th .resize-handle {
  position: absolute;
  right: 0;
  top: 0;
  width: 10px;
  height: 100%;
  cursor: col-resize;
}

.media-library-track-table th.dragTarget {
  outline: 2px dashed var(--color-accent);
}

.media-library-track-row {
  user-select: none;
}

.media-library-track-row:nth-child(even) {
  background: rgba(255, 255, 255, 0.02);
}

.media-library-track-row:hover {
  cursor: copy;
  background: var(--color-agentamp-track-hover-bg);
}

.media-library-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20;
}

.media-library-modal-card {
  width: min(520px, calc(100% - 40px));
  background: var(--color-agentamp-bg);
  border: 1px solid var(--color-agentamp-border);
  box-shadow: 0 0 32px rgba(0, 0, 0, 0.25);
  padding: 18px;
  border-radius: 10px;
}

.media-library-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
  color: var(--color-text-primary);
}

.media-library-modal-close {
  border: none;
  background: transparent;
  color: var(--color-text-primary);
  font-size: 18px;
  cursor: pointer;
}

.media-library-modal-form {
  display: grid;
  gap: 10px;
}

.media-library-modal-form label {
  display: grid;
  gap: 4px;
  color: var(--color-text-secondary);
  font-size: 0.78rem;
}

.media-library-modal-form input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--color-agentamp-track-row-border);
  background: var(--color-agentamp-bg);
  color: var(--color-text-primary);
  border-radius: 6px;
}

.media-library-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 6px;
}

.media-library-modal-actions .agentamp-btn {
  background: var(--color-agentamp-button-bg);
  border: 1px solid var(--color-agentamp-button-border);
  color: var(--color-agentamp-button-text);
}

.media-library-modal-actions .agentamp-btn:hover:not(:disabled) {
  background: var(--color-agentamp-button-hover-bg);
  color: var(--color-agentamp-button-hover-text);
}

.media-library-modal-error {
  color: #ff6b6b;
  margin-top: 8px;
}

.custom-titlebar {
  width: 100%;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  background: #111;
  color: var(--color-accent);
  user-select: none;
}

.minimize-btn,
.maximize-btn,
.titlebar-close-btn,
.rescan-btn {
  position: absolute;
  right: 0;
  width: 42px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--color-accent);
  cursor: pointer;
}

.maximize-btn {
  right: 42px;
}

.minimize-btn {
  right: 84px;
}

.rescan-btn {
  right: 126px;
}

.titlebar-close-btn {
  right: 0;
}
</style>
