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
      <AgentAmpPlayer :enabled="true" :detached="true" />
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
const AGENTAMP_FORCE_CLOSE_CHANNEL = 'agent-lobby-agentamp-force-close';
let resizeObserver: ResizeObserver | null = null;
let mutationObserver: MutationObserver | null = null;
let lastDesiredContentInnerHeight = -1;
let userHasManualHeightOverride = false;
let windowResizeHandler: (() => void) | null = null;
let isApplyingProgrammaticResize = false;
let cleanupCloseRequestedListener: (() => void) | null = null;
let cleanupForceCloseListener: (() => void) | null = null;
let allowWindowClose = false;

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && typeof (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ === 'object';
}

const hasTauriWindow = isTauriRuntime();

function shouldAllowWindowClose(): boolean {
  return allowWindowClose;
}

async function applyPersistedTheme() {
  const persistedTheme = await getPersistedValue<string>(THEME_STORAGE_KEY);
  if (persistedTheme && typeof persistedTheme === 'string') {
    applyTheme(persistedTheme, { persist: false });
    return;
  }

  applyTheme('retro-terminal', { persist: false });
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
  const playlistHeight = Math.max(0, Math.min(availableHeight, resolvedNaturalPlaylistHeight));

  body.style.setProperty('--agentamp-detached-playlist-height', `${playlistHeight}px`);
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

function getDetachedContentHeight(body: HTMLElement, dock: HTMLElement, playlist: HTMLElement | null, isCompact: boolean): number {
  if (isCompact) {
    return Math.ceil(dock.getBoundingClientRect().height);
  }

  const naturalPlaylistHeight = playlist ? getPlaylistNaturalOuterHeight(playlist) : 0;
  const fixedContentHeight = dockFixedContentHeight(body, playlist);
  return fixedContentHeight + naturalPlaylistHeight;
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

  const titlebarHeight = 28;
  const isCompact = dock.classList.contains('compact');
  const naturalPlaylistHeight = playlist ? getPlaylistNaturalOuterHeight(playlist) : 0;
  const fixedContentHeight = dockFixedContentHeight(body, playlist);
  const contentHeight = getDetachedContentHeight(body, dock, playlist, isCompact);
  const minimumInnerHeight = isCompact ? 84 : 96;
  const heightOffset = isCompact ? 0 : 4;
  const targetInnerHeight = Math.max(minimumInnerHeight, titlebarHeight + contentHeight + heightOffset);
  const contentChanged = Math.abs(targetInnerHeight - lastDesiredContentInnerHeight) > 2;

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

  updateDetachedPlaylistViewport();
  void resizeWindowToContent();

  window.setTimeout(() => {
    updateDetachedPlaylistViewport();
    void resizeWindowToContent();
  }, 120);
});

onBeforeUnmount(() => {
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
