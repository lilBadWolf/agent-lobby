<template>
  <div class="agentamp-window-root">
    <div data-tauri-drag-region class="custom-titlebar">
      AGENT // AMP
      <button v-if="hasTauriWindow" class="minimize-btn" @click="minimize">—</button>
      <button v-if="hasTauriWindow" class="maximize-btn" @click="toggleMaximize">
        <span class="window-icon" :class="{ maximized: isMaximized }" aria-hidden="true"></span>
      </button>
      <button class="titlebar-close-btn" @click="handleClose">✕</button>
    </div>

    <div ref="agentAmpWindowBodyRef" class="agentamp-window-body">
      <AgentAmpPlayer
        :enabled="true"
        :detached="true"
        :spectrum-bar-count="spectrumBarCount"
        :spectrum-fft-size="spectrumFftSize"
        :spectrum-sensitivity="spectrumSensitivity"
        :spectrum-gradient-bars="spectrumGradientBars"
        :threshold-low="spectrumThresholdLow"
        :threshold-medium="spectrumThresholdMedium"
        :threshold-high="spectrumThresholdHigh"
        @toggle-detached="handleToggleDetached"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import AgentAmpPlayer from './components/AgentAmpPlayer.vue';
import { getPersistedValue } from './composables/usePlatformStorage';
import { useTheme } from './composables/useTheme';

const isMaximized = ref(false);
const agentAmpWindowBodyRef = ref<HTMLElement | null>(null);
const { applyTheme } = useTheme();
const THEME_STORAGE_KEY = 'agent_theme';
const AGENTAMP_ACTION_CHANNEL = 'agent-lobby-agentamp-action';
const AGENTAMP_FORCE_CLOSE_CHANNEL = 'agent-lobby-agentamp-force-close';
const SPECTRUM_BAR_COUNT_STORAGE_KEY = 'agent_spectrum_bar_count';
const SPECTRUM_FFT_SIZE_STORAGE_KEY = 'agent_spectrum_fft_size';
const SPECTRUM_SENSITIVITY_STORAGE_KEY = 'agent_spectrum_sensitivity';
const SPECTRUM_GRADIENT_BARS_STORAGE_KEY = 'agent_spectrum_gradient_bars';
const SPECTRUM_THRESHOLD_LOW_STORAGE_KEY = 'agent_spectrum_threshold_low';
const SPECTRUM_THRESHOLD_MEDIUM_STORAGE_KEY = 'agent_spectrum_threshold_medium';
const SPECTRUM_THRESHOLD_HIGH_STORAGE_KEY = 'agent_spectrum_threshold_high';
const spectrumBarCount = ref(64);
const spectrumFftSize = ref(2048);
const spectrumSensitivity = ref(1);
const spectrumGradientBars = ref(false);
const spectrumThresholdLow = ref(0.15);
const spectrumThresholdMedium = ref(0.3);
const spectrumThresholdHigh = ref(0.6);
let resizeObserver: ResizeObserver | null = null;
let mutationObserver: MutationObserver | null = null;
let lastDesiredContentInnerHeight = -1;
let userHasManualHeightOverride = false;
let windowResizeHandler: (() => void) | null = null;
let isApplyingProgrammaticResize = false;
let cleanupCloseRequestedListener: (() => void) | null = null;
let cleanupForceCloseListener: (() => void) | null = null;
let allowWindowClose = false;
let lastMinimumInnerHeight = 96;

const DETACHED_MIN_TRACK_ROWS = 5;
const DETACHED_AUTO_GROW_MAX_TRACK_ROWS = 10;
const DETACHED_TRACK_ROW_HEIGHT = 34;
const DETACHED_TRACK_HEADER_HEIGHT = 34;
const DETACHED_PLAYLIST_BREATHING_ROOM = 12;

function getDetachedPlaylistHeightForRows(rows: number): number {
  return (rows * DETACHED_TRACK_ROW_HEIGHT)
    + DETACHED_TRACK_HEADER_HEIGHT
    + DETACHED_PLAYLIST_BREATHING_ROOM;
}

function getDetachedMinimumPlaylistHeight(): number {
  return getDetachedPlaylistHeightForRows(DETACHED_MIN_TRACK_ROWS);
}

function getDetachedAutoGrowMaxPlaylistHeight(): number {
  return getDetachedPlaylistHeightForRows(DETACHED_AUTO_GROW_MAX_TRACK_ROWS);
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && typeof (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ === 'object';
}

const hasTauriWindow = isTauriRuntime();

function sendAgentAmpAction(action: 'dock') {
  const payload = { type: 'agentamp-action', action };

  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const channel = new BroadcastChannel(AGENTAMP_ACTION_CHANNEL);
      channel.postMessage(payload);
      channel.close();
    } catch {
      // Ignore channel failures.
    }
  }

  if (typeof window !== 'undefined' && window.opener && window.opener !== window) {
    try {
      window.opener.postMessage(payload, window.location.origin);
    } catch {
      // Ignore postMessage failures.
    }
  }
}

function handleToggleDetached() {
  sendAgentAmpAction('dock');
}

function shouldAllowWindowClose(): boolean {
  return allowWindowClose;
}

async function applyPersistedTheme() {
  const persistedTheme = await getPersistedValue<string>(THEME_STORAGE_KEY);
  if (persistedTheme && typeof persistedTheme === 'string') {
    applyTheme(persistedTheme, { persist: false });
    return;
  }

  //applyTheme('retro-terminal', { persist: false });
}

async function applyPersistedSpectrumSettings() {
  const [savedBarCount, savedFftSize, savedSensitivity, savedGradientBars, savedThresholdLow, savedThresholdMedium, savedThresholdHigh] = await Promise.all([
    getPersistedValue<number>(SPECTRUM_BAR_COUNT_STORAGE_KEY),
    getPersistedValue<number>(SPECTRUM_FFT_SIZE_STORAGE_KEY),
    getPersistedValue<number>(SPECTRUM_SENSITIVITY_STORAGE_KEY),
    getPersistedValue<boolean>(SPECTRUM_GRADIENT_BARS_STORAGE_KEY),
    getPersistedValue<number>(SPECTRUM_THRESHOLD_LOW_STORAGE_KEY),
    getPersistedValue<number>(SPECTRUM_THRESHOLD_MEDIUM_STORAGE_KEY),
    getPersistedValue<number>(SPECTRUM_THRESHOLD_HIGH_STORAGE_KEY),
  ]);

  if ([32, 48, 64, 96, 128].includes(savedBarCount ?? -1)) {
    spectrumBarCount.value = savedBarCount as number;
  }

  if ([1024, 2048, 4096, 8192].includes(savedFftSize ?? -1)) {
    spectrumFftSize.value = savedFftSize as number;
  }

  if (typeof savedSensitivity === 'number' && savedSensitivity >= 0.5 && savedSensitivity <= 2) {
    spectrumSensitivity.value = savedSensitivity;
  }

  if (typeof savedGradientBars === 'boolean') {
    spectrumGradientBars.value = savedGradientBars;
  }

  if (typeof savedThresholdLow === 'number' && savedThresholdLow >= 0 && savedThresholdLow <= 1) {
    spectrumThresholdLow.value = savedThresholdLow;
  }

  if (typeof savedThresholdMedium === 'number' && savedThresholdMedium >= 0 && savedThresholdMedium <= 1) {
    spectrumThresholdMedium.value = savedThresholdMedium;
  }

  if (typeof savedThresholdHigh === 'number' && savedThresholdHigh >= 0 && savedThresholdHigh <= 1) {
    spectrumThresholdHigh.value = savedThresholdHigh;
  }
}

function handleStorageUpdate(event: StorageEvent) {
  if (!event.key) {
    return;
  }

  if (event.key === SPECTRUM_BAR_COUNT_STORAGE_KEY) {
    const nextValue = event.newValue ? Number(JSON.parse(event.newValue)) : NaN;
    if ([32, 48, 64, 96, 128].includes(nextValue)) {
      spectrumBarCount.value = nextValue;
    }
    return;
  }

  if (event.key === SPECTRUM_FFT_SIZE_STORAGE_KEY) {
    const nextValue = event.newValue ? Number(JSON.parse(event.newValue)) : NaN;
    if ([1024, 2048, 4096, 8192].includes(nextValue)) {
      spectrumFftSize.value = nextValue;
    }
    return;
  }

  if (event.key === SPECTRUM_SENSITIVITY_STORAGE_KEY) {
    const nextValue = event.newValue ? Number(JSON.parse(event.newValue)) : NaN;
    if (nextValue >= 0.5 && nextValue <= 2) {
      spectrumSensitivity.value = nextValue;
    }
    return;
  }

  if (event.key === SPECTRUM_GRADIENT_BARS_STORAGE_KEY) {
    const nextValue = event.newValue ? JSON.parse(event.newValue) : null;
    if (typeof nextValue === 'boolean') {
      spectrumGradientBars.value = nextValue;
    }
    return;
  }

  if (event.key === SPECTRUM_THRESHOLD_LOW_STORAGE_KEY) {
    const nextValue = event.newValue ? Number(JSON.parse(event.newValue)) : NaN;
    if (nextValue >= 0 && nextValue <= 1) {
      spectrumThresholdLow.value = nextValue;
    }
    return;
  }

  if (event.key === SPECTRUM_THRESHOLD_MEDIUM_STORAGE_KEY) {
    const nextValue = event.newValue ? Number(JSON.parse(event.newValue)) : NaN;
    if (nextValue >= 0 && nextValue <= 1) {
      spectrumThresholdMedium.value = nextValue;
    }
    return;
  }

  if (event.key === SPECTRUM_THRESHOLD_HIGH_STORAGE_KEY) {
    const nextValue = event.newValue ? Number(JSON.parse(event.newValue)) : NaN;
    if (nextValue >= 0 && nextValue <= 1) {
      spectrumThresholdHigh.value = nextValue;
    }
    return;
  }

  if (event.key === THEME_STORAGE_KEY) {
    const nextTheme = event.newValue ? JSON.parse(event.newValue) : event.newValue;
    if (typeof nextTheme === 'string' && nextTheme.trim()) {
      applyTheme(nextTheme, { persist: false });
    }
  }
}

function updateDetachedPlaylistViewport(fixedContentHeight?: number, naturalPlaylistHeight?: number) {
  const body = agentAmpWindowBodyRef.value;
  if (!body) {
    return;
  }

  const playlist = body.querySelector('.agentamp-playlist') as HTMLElement | null;
  if (!playlist || window.getComputedStyle(playlist).display === 'none') {
    body.style.removeProperty('--agentamp-detached-playlist-height');
    body.style.removeProperty('--agentamp-detached-playlist-max-height');
    return;
  }

  const resolvedFixedContentHeight = fixedContentHeight ?? Math.max(0, dockFixedContentHeight(body, playlist));
  const resolvedNaturalPlaylistHeight = naturalPlaylistHeight ?? getPlaylistNaturalOuterHeight(playlist);
  const titlebarHeight = 28;
  const availableHeight = Math.max(96, Math.floor(window.innerHeight - titlebarHeight - resolvedFixedContentHeight - 2));
  const minimumPlaylistHeight = getDetachedMinimumPlaylistHeight();
  const autoGrowMaxPlaylistHeight = getDetachedAutoGrowMaxPlaylistHeight();
  const desiredPlaylistHeight = Math.max(
    minimumPlaylistHeight,
    Math.min(resolvedNaturalPlaylistHeight, autoGrowMaxPlaylistHeight)
  );
  const playlistHeight = Math.max(0, Math.min(availableHeight, desiredPlaylistHeight));

  body.style.setProperty('--agentamp-detached-playlist-height', `${playlistHeight}px`);
  body.style.setProperty('--agentamp-detached-playlist-min-height', `${Math.min(minimumPlaylistHeight, availableHeight)}px`);
  body.style.setProperty('--agentamp-detached-playlist-max-height', `${availableHeight}px`);
}

function dockFixedContentHeight(body: HTMLElement, playlist: HTMLElement | null): number {
  const dock = body.querySelector('.agentamp-dock') as HTMLElement | null;
  if (!dock) {
    return 0;
  }

  const visiblePlaylistHeight = playlist ? Math.ceil(playlist.getBoundingClientRect().height) : 0;
  return Math.max(0, Math.ceil(dock.scrollHeight) - visiblePlaylistHeight);
}

function getPlaylistNaturalOuterHeight(playlist: HTMLElement): number {
  const borderHeight = Math.max(0, playlist.offsetHeight - playlist.clientHeight);
  return Math.ceil(playlist.scrollHeight + borderHeight);
}

async function resizeWindowToContent() {
  if (isMaximized.value) {
    return;
  }

  const body = agentAmpWindowBodyRef.value;
  if (!body) {
    return;
  }

  const dock = body.querySelector('.agentamp-dock') as HTMLElement | null;
  if (!dock) {
    return;
  }

  const playlist = body.querySelector('.agentamp-playlist') as HTMLElement | null;
  const hasVisiblePlaylist = Boolean(playlist && window.getComputedStyle(playlist).display !== 'none');

  const titlebarHeight = 28;
  const isCompact = dock.classList.contains('compact');
  const naturalPlaylistHeight = playlist ? getPlaylistNaturalOuterHeight(playlist) : 0;
  const fixedContentHeight = dockFixedContentHeight(body, playlist);
  const cappedNaturalPlaylistHeight = Math.min(
    naturalPlaylistHeight,
    getDetachedAutoGrowMaxPlaylistHeight()
  );
  const contentHeight = isCompact
    ? Math.ceil(dock.getBoundingClientRect().height)
    : fixedContentHeight + (hasVisiblePlaylist ? cappedNaturalPlaylistHeight : 0);
  const minimumInnerHeight = isCompact ? 84 : 96;
  const heightOffset = isCompact ? 0 : 4;
  const minimumPlaylistHeight = getDetachedMinimumPlaylistHeight();
  const minimumDetachedInnerHeight = (isCompact || !hasVisiblePlaylist)
    ? minimumInnerHeight
    : Math.max(minimumInnerHeight, titlebarHeight + fixedContentHeight + minimumPlaylistHeight + heightOffset);
  const targetInnerHeight = Math.max(minimumDetachedInnerHeight, titlebarHeight + contentHeight + heightOffset);
  const contentChanged = Math.abs(targetInnerHeight - lastDesiredContentInnerHeight) > 2;
  lastMinimumInnerHeight = minimumDetachedInnerHeight;

  updateDetachedPlaylistViewport(fixedContentHeight, naturalPlaylistHeight);

  if (hasTauriWindow) {
    const [{ getCurrentWindow }, { LogicalSize }] = await Promise.all([
      import('@tauri-apps/api/window'),
      import('@tauri-apps/api/dpi'),
    ]);

    const appWindow = getCurrentWindow();
    const currentSize = await appWindow.innerSize();

    const shouldResizeToContent = contentChanged || (!userHasManualHeightOverride && Math.abs(currentSize.height - targetInnerHeight) > 2);

    if (shouldResizeToContent) {
      isApplyingProgrammaticResize = true;
      await appWindow.setSize(new LogicalSize(currentSize.width, targetInnerHeight));
      userHasManualHeightOverride = false;
      window.setTimeout(() => {
        isApplyingProgrammaticResize = false;
      }, 80);
    }

    lastDesiredContentInnerHeight = targetInnerHeight;
    return;
  }

  const chromeHeight = window.outerHeight - window.innerHeight;
  const targetOuterHeight = targetInnerHeight + Math.max(chromeHeight, 0);

  const shouldResizeToContent = contentChanged || (!userHasManualHeightOverride && Math.abs(window.innerHeight - targetInnerHeight) > 2);

  if (shouldResizeToContent) {
    isApplyingProgrammaticResize = true;
    window.resizeTo(window.outerWidth, targetOuterHeight);
    userHasManualHeightOverride = false;
    window.setTimeout(() => {
      isApplyingProgrammaticResize = false;
    }, 80);
  }

  lastDesiredContentInnerHeight = targetInnerHeight;
}

async function enforceWindowHeightBounds() {
  if (isApplyingProgrammaticResize || isMaximized.value || lastDesiredContentInnerHeight <= 0) {
    return;
  }

  const currentInnerHeight = window.innerHeight;
  const clampedInnerHeight = Math.max(
    lastMinimumInnerHeight,
    Math.min(currentInnerHeight, lastDesiredContentInnerHeight)
  );

  if (Math.abs(clampedInnerHeight - currentInnerHeight) <= 2) {
    return;
  }

  if (hasTauriWindow) {
    const [{ getCurrentWindow }, { LogicalSize }] = await Promise.all([
      import('@tauri-apps/api/window'),
      import('@tauri-apps/api/dpi'),
    ]);

    const appWindow = getCurrentWindow();
    const currentSize = await appWindow.innerSize();
    isApplyingProgrammaticResize = true;
    await appWindow.setSize(new LogicalSize(currentSize.width, clampedInnerHeight));
    window.setTimeout(() => {
      isApplyingProgrammaticResize = false;
    }, 80);
    return;
  }

  const chromeHeight = window.outerHeight - window.innerHeight;
  const targetOuterHeight = clampedInnerHeight + Math.max(chromeHeight, 0);
  isApplyingProgrammaticResize = true;
  window.resizeTo(window.outerWidth, targetOuterHeight);
  window.setTimeout(() => {
    isApplyingProgrammaticResize = false;
  }, 80);
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

  if (isMaximized.value) {
    await appWindow.unmaximize();
  } else {
    await appWindow.maximize();
  }

  isMaximized.value = !isMaximized.value;

  if (!isMaximized.value) {
    await nextTick();
    await resizeWindowToContent();
  }
}

async function handleClose() {
  if (isTauriRuntime()) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');

    try {
      await getCurrentWindow().hide();
      return;
    } catch (error) {
      console.debug('Unable to hide detached AgentAmp window, closing instead:', error);
    }

    allowWindowClose = true;
    const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    await getCurrentWebviewWindow().close();
    return;
  }

  window.close();
}

onMounted(async () => {
  await applyPersistedTheme();
  await applyPersistedSpectrumSettings();
  await nextTick();

  if (hasTauriWindow) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    cleanupCloseRequestedListener = await getCurrentWindow().onCloseRequested(async (event) => {
      if (shouldAllowWindowClose()) {
        allowWindowClose = false;
        return;
      }

      event.preventDefault();

      try {
        await getCurrentWindow().hide();
      } catch (error) {
        console.debug('Unable to hide detached AgentAmp window on close request:', error);
        allowWindowClose = true;
        await getCurrentWindow().close();
      }
    });

    // Listen for force-close signal from main app
    const forceCloseChannel = new BroadcastChannel(AGENTAMP_FORCE_CLOSE_CHANNEL);
    forceCloseChannel.onmessage = async (event) => {
      if (event.data === 'force-close') {
        allowWindowClose = true;
        try {
          const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
          await getCurrentWebviewWindow().close();
        } catch (error) {
          // Ignore close errors
        }
      }
    };
    cleanupForceCloseListener = () => {
      forceCloseChannel.close();
    };
  }

  const body = agentAmpWindowBodyRef.value;
  if (body && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      updateDetachedPlaylistViewport();
      void resizeWindowToContent();
    });

    resizeObserver.observe(body);

    const dock = body.querySelector('.agentamp-dock') as HTMLElement | null;
    if (dock) {
      resizeObserver.observe(dock);
    }
  }

  if (body && typeof MutationObserver !== 'undefined') {
    mutationObserver = new MutationObserver(() => {
      updateDetachedPlaylistViewport();
      void resizeWindowToContent();
    });

    mutationObserver.observe(body, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ['class', 'style'],
    });
  }

  windowResizeHandler = () => {
    void enforceWindowHeightBounds();

    if (!isApplyingProgrammaticResize && lastDesiredContentInnerHeight > 0) {
      const currentInnerHeight = window.innerHeight;
      if (Math.abs(currentInnerHeight - lastDesiredContentInnerHeight) > 12) {
        userHasManualHeightOverride = true;
      } else if (Math.abs(currentInnerHeight - lastDesiredContentInnerHeight) <= 6) {
        userHasManualHeightOverride = false;
      }
    }

    updateDetachedPlaylistViewport();
  };
  window.addEventListener('resize', windowResizeHandler);
  window.addEventListener('storage', handleStorageUpdate);

  updateDetachedPlaylistViewport();
  void resizeWindowToContent();

  window.setTimeout(() => {
    updateDetachedPlaylistViewport();
    void resizeWindowToContent();
  }, 120);
});

onBeforeUnmount(() => {
  window.removeEventListener('storage', handleStorageUpdate);
  if (cleanupCloseRequestedListener) {
    cleanupCloseRequestedListener();
    cleanupCloseRequestedListener = null;
  }

  if (cleanupForceCloseListener) {
    cleanupForceCloseListener();
    cleanupForceCloseListener = null;
  }

  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }

  if (mutationObserver) {
    mutationObserver.disconnect();
    mutationObserver = null;
  }

  if (windowResizeHandler) {
    window.removeEventListener('resize', windowResizeHandler);
    windowResizeHandler = null;
  }
});
</script>

<style scoped>
.agentamp-window-root {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--color-bg-base);
  color: var(--color-accent);
  display: flex;
  flex-direction: column;
}

.custom-titlebar {
  width: 100%;
  height: 28px;
  padding: 0 92px 0 18px;
  box-sizing: border-box;
  background: var(--color-dmwindow-titlebar-bg);
  border-bottom: 1px solid var(--color-dmwindow-titlebar-border);
  display: flex;
  justify-content: flex-start;
  align-items: center;
  user-select: none;
  z-index: 1000;
  position: relative;
  font-size: 11px;
  letter-spacing: 1.6px;
  text-transform: uppercase;
  text-shadow: var(--color-dmwindow-titlebar-text-shadow);
}

.minimize-btn,
.maximize-btn {
  position: absolute;
  top: 4px;
  background: none;
  border: 1px solid var(--color-dmwindow-button-border);
  color: var(--color-accent);
  font-size: 12px;
  cursor: pointer;
  opacity: 0.8;
  transition: opacity 0.2s, background 0.2s, border-color 0.2s;
  width: 22px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.minimize-btn {
  right: 66px;
}

.maximize-btn {
  right: 38px;
}

.minimize-btn:hover,
.maximize-btn:hover {
  opacity: 1;
  background: var(--color-dmwindow-button-hover-bg);
  border-color: var(--color-dmwindow-button-hover-border);
}

.window-icon {
  display: block;
  position: relative;
  width: 10px;
  height: 8px;
  border: 1.5px solid currentColor;
  box-sizing: border-box;
}

.window-icon.maximized::before {
  content: '';
  position: absolute;
  width: 10px;
  height: 8px;
  border: 1.5px solid currentColor;
  top: -4px;
  left: 2px;
  box-sizing: border-box;
  background: transparent;
}

.titlebar-close-btn {
  position: absolute;
  top: 4px;
  right: 10px;
  background: none;
  border: 1px solid var(--color-dmwindow-close-border);
  color: var(--color-danger);
  font-size: 12px;
  cursor: pointer;
  opacity: 0.82;
  transition: opacity 0.2s, background 0.2s, border-color 0.2s;
  width: 22px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.titlebar-close-btn:hover {
  opacity: 1;
  background: var(--color-dmwindow-close-hover-bg);
  border-color: var(--color-dmwindow-close-hover-border);
}

.agentamp-window-body {
  flex: 1;
  min-height: 0;
  display: block;
  overflow: hidden;
}

.agentamp-window-body :deep(.agentamp-dock) {
  border-top: none;
  min-height: unset;
  width: 100%;
}
</style>
