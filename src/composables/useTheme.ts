import { ref, computed } from 'vue';
import { THEMES } from '../themes';
import { getPersistedValue, setPersistedValue } from './usePlatformStorage';

const DEFAULT_THEME = 'retro-terminal';
const DEFAULT_USER_COLORS = ['#39ff14', '#00ff00', '#00ffaa'];
const THEME_STORAGE_KEY = 'agent_theme';
const THEME_SYNC_CHANNEL = 'agent-lobby-theme-sync';
const availableThemes = Object.keys(THEMES);
const currentTheme = ref<string>(DEFAULT_THEME);
let hasInitializedTheme = false;
let hasHydratedTheme = false;
let themeHydrationPromise: Promise<void> | null = null;
let themeSyncChannel: BroadcastChannel | null = null;
let hasBoundThemeSyncListeners = false;

async function persistTheme(themeName: string) {
  await setPersistedValue(THEME_STORAGE_KEY, themeName);

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, themeName);
    } catch {
      // Ignore localStorage write failures.
    }
  }
}

function ensureThemeSyncChannel() {
  if (typeof BroadcastChannel === 'undefined') {
    return null;
  }

  if (!themeSyncChannel) {
    themeSyncChannel = new BroadcastChannel(THEME_SYNC_CHANNEL);
  }

  return themeSyncChannel;
}

function getThemeTokenValue(tokenName: string, fallback = ''): string {
  if (typeof window === 'undefined') {
    return fallback;
  }

  const root = document.documentElement;
  const value = getComputedStyle(root).getPropertyValue(tokenName).trim();
  return value || fallback;
}

function getThemeUserColors(): string[] {
  const rawPalette = getThemeTokenValue('--theme-user-colors', '');
  const parsedPalette = rawPalette
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  return parsedPalette.length > 0 ? parsedPalette : DEFAULT_USER_COLORS;
}

export function useTheme() {
  function applyTheme(themeName: string, options?: { persist?: boolean }) {
    const nextTheme = THEMES[themeName as keyof typeof THEMES] ? themeName : DEFAULT_THEME;

    const root = document.documentElement;
    root.setAttribute('data-theme', nextTheme);

    currentTheme.value = nextTheme;

    const shouldPersist = options?.persist ?? hasHydratedTheme;
    if (shouldPersist) {
      void persistTheme(nextTheme);
      ensureThemeSyncChannel()?.postMessage({ type: 'theme-changed', theme: nextTheme });
    }
  }

  if (!hasBoundThemeSyncListeners && typeof window !== 'undefined') {
    hasBoundThemeSyncListeners = true;

    const syncChannel = ensureThemeSyncChannel();
    if (syncChannel) {
      syncChannel.onmessage = (event: MessageEvent) => {
        const message = event.data as { type?: string; theme?: string };
        if (message?.type !== 'theme-changed' || typeof message.theme !== 'string') {
          return;
        }

        if (message.theme !== currentTheme.value) {
          applyTheme(message.theme, { persist: false });
        }
      };
    }

    window.addEventListener('storage', (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY || typeof event.newValue !== 'string') {
        return;
      }

      if (event.newValue !== currentTheme.value) {
        applyTheme(event.newValue, { persist: false });
      }
    });
  }

  const rootTheme = typeof document !== 'undefined'
    ? document.documentElement.getAttribute('data-theme')
    : null;

  if (!hasInitializedTheme || !rootTheme) {
    applyTheme(DEFAULT_THEME, { persist: false });
    hasInitializedTheme = true;
  }

  if (!themeHydrationPromise) {
    themeHydrationPromise = (async () => {
      try {
        const persistedTheme = await getPersistedValue<string>(THEME_STORAGE_KEY);
        if (typeof persistedTheme === 'string' && THEMES[persistedTheme as keyof typeof THEMES]) {
          if (currentTheme.value !== persistedTheme) {
            applyTheme(persistedTheme, { persist: false });
          }
        }
      } catch {
        // Ignore store read failures
      } finally {
        hasHydratedTheme = true;
      }
    })();
  }

  const getUserColor = computed(() => {
    return (str: string): string => {
      const palette = getThemeUserColors();
      if (palette.length === 0) return DEFAULT_USER_COLORS[0];

      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
      }
      const colorIndex = Math.abs(hash) % palette.length;
      return palette[colorIndex];
    };
  });

  return {
    currentTheme,
    availableThemes,
    applyTheme,
    getUserColor,
    getThemeUserColors,
    getThemeTokenValue,
  };
}
