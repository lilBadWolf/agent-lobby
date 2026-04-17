import { ref, computed } from 'vue';
import { THEMES } from '../themes';
import { getPersistedValue, setPersistedValue } from './usePlatformStorage';

const DEFAULT_THEME = 'retro-terminal';
const DEFAULT_USER_COLORS = ['#39ff14', '#00ff00', '#00ffaa'];
const THEME_STORAGE_KEY = 'agent_theme';
const APP_SETTINGS_STORAGE_KEY = 'agent_app_settings';
const LEGACY_THEME_STORAGE_KEY = 'agent_settings';
const THEME_SYNC_CHANNEL = 'agent-lobby-theme-sync';
const BUILTIN_THEMES = Object.keys(THEMES);
const availableThemes = ref<string[]>([...BUILTIN_THEMES]);
const currentTheme = ref<string>(DEFAULT_THEME);
let hasHydratedTheme = false;
let themeHydrationPromise: Promise<void> | null = null;
let themeSyncChannel: BroadcastChannel | null = null;
let hasBoundThemeSyncListeners = false;
let customThemeLoadPromise: Promise<void> | null = null;
let tauriCoreModulePromise: Promise<typeof import('@tauri-apps/api/core') | null> | null = null;

interface CustomAssetEntry {
  name: string;
  path: string;
}

interface CustomAssetsResult {
  themes: CustomAssetEntry[];
  soundpacks: CustomAssetEntry[];
}

const customThemePathByName = new Map<string, string>();

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && typeof (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ === 'object';
}

function setAvailableThemes(themeNames: string[]) {
  const unique = Array.from(new Set(themeNames.filter((themeName) => typeof themeName === 'string' && themeName.trim())));
  const hasDefault = unique.includes(DEFAULT_THEME);
  const withoutDefault = unique.filter((themeName) => themeName !== DEFAULT_THEME).sort((a, b) => a.localeCompare(b));
  availableThemes.value = hasDefault ? [DEFAULT_THEME, ...withoutDefault] : [DEFAULT_THEME, ...withoutDefault];
}

async function getTauriCoreModule() {
  if (!isTauriRuntime()) {
    return null;
  }

  if (!tauriCoreModulePromise) {
    tauriCoreModulePromise = import('@tauri-apps/api/core').catch(() => null);
  }

  return tauriCoreModulePromise;
}

async function loadCustomThemes() {
  if (!isTauriRuntime()) {
    setAvailableThemes(BUILTIN_THEMES);
    return;
  }

  try {
    const tauriCore = await getTauriCoreModule();
    if (!tauriCore) {
      setAvailableThemes(BUILTIN_THEMES);
      return;
    }

    const assets = await tauriCore.invoke<CustomAssetsResult>('discover_custom_assets');
    const customThemes = Array.isArray(assets?.themes)
      ? assets.themes.filter((entry): entry is CustomAssetEntry => !!entry && typeof entry.name === 'string' && typeof entry.path === 'string')
      : [];

    customThemePathByName.clear();
    for (const entry of customThemes) {
      const name = entry.name.trim();
      const path = entry.path.trim();
      if (!name || !path) {
        continue;
      }
      customThemePathByName.set(name, path);
    }

    setAvailableThemes([...BUILTIN_THEMES, ...customThemePathByName.keys()]);

    const convertFileSrc = tauriCore.convertFileSrc;
    for (const [themeName, themePath] of customThemePathByName.entries()) {
      const styleId = `custom-theme-${themeName}`;
      if (document.getElementById(styleId)) {
        continue;
      }

      const link = document.createElement('link');
      link.id = styleId;
      link.rel = 'stylesheet';
      link.href = convertFileSrc(themePath);
      document.head.appendChild(link);
    }
  } catch {
    setAvailableThemes(BUILTIN_THEMES);
  }
}

function ensureCustomThemesLoaded() {
  if (!customThemeLoadPromise) {
    customThemeLoadPromise = loadCustomThemes();
  }

  return customThemeLoadPromise;
}

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

function parseLocalStorageValue<T>(rawValue: string): T {
  try {
    return JSON.parse(rawValue) as T;
  } catch {
    return rawValue as unknown as T;
  }
}

export function resolvePersistedThemeSync(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (raw !== null) {
      const parsed = parseLocalStorageValue<string>(raw);
      if (typeof parsed === 'string' && parsed.trim()) {
        return parsed;
      }
    }
  } catch {
    // Ignore
  }

  try {
    const legacyRaw = window.localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw) as { theme?: unknown };
      if (legacy && typeof legacy.theme === 'string' && legacy.theme.trim()) {
        return legacy.theme;
      }
    }
  } catch {
    // Ignore
  }

  try {
    const appSettingsRaw = window.localStorage.getItem(APP_SETTINGS_STORAGE_KEY);
    if (appSettingsRaw) {
      const appSettings = parseLocalStorageValue<Record<string, unknown>>(appSettingsRaw);
      if (appSettings && typeof appSettings.theme === 'string' && appSettings.theme.trim()) {
        return appSettings.theme;
      }
    }
  } catch {
    // Ignore
  }

  return undefined;
}

export async function resolvePersistedTheme(): Promise<string | undefined> {
  const persistedTheme = await getPersistedValue<string>(THEME_STORAGE_KEY);
  if (typeof persistedTheme === 'string' && persistedTheme.trim()) {
    return persistedTheme;
  }

  const syncTheme = resolvePersistedThemeSync();
  if (syncTheme) {
    return syncTheme;
  }

  if (typeof window !== 'undefined') {
    try {
      const legacyRaw = window.localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
      if (legacyRaw) {
        const legacy = JSON.parse(legacyRaw) as { theme?: unknown };
        if (legacy && typeof legacy.theme === 'string' && legacy.theme.trim()) {
          return legacy.theme;
        }
      }
    } catch {
      // Ignore
    }

    try {
      const appSettingsRaw = window.localStorage.getItem(APP_SETTINGS_STORAGE_KEY);
      if (appSettingsRaw) {
        const appSettings = parseLocalStorageValue<Record<string, unknown>>(appSettingsRaw);
        if (appSettings && typeof appSettings.theme === 'string' && appSettings.theme.trim()) {
          return appSettings.theme;
        }
      }
    } catch {
      // Ignore
    }
  }

  try {
    const legacyStore = await getPersistedValue<Record<string, unknown>>(LEGACY_THEME_STORAGE_KEY);
    if (legacyStore && typeof legacyStore.theme === 'string' && legacyStore.theme.trim()) {
      return legacyStore.theme;
    }
  } catch {
    // Ignore
  }

  try {
    const appSettingsStore = await getPersistedValue<Record<string, unknown>>(APP_SETTINGS_STORAGE_KEY);
    if (appSettingsStore && typeof appSettingsStore.theme === 'string' && appSettingsStore.theme.trim()) {
      return appSettingsStore.theme;
    }
  } catch {
    // Ignore
  }

  return undefined;
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
    const nextTheme = availableThemes.value.includes(themeName) ? themeName : DEFAULT_THEME;

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

      const parsedTheme = parseLocalStorageValue<string>(event.newValue);
      if (typeof parsedTheme !== 'string' || !parsedTheme.trim()) {
        return;
      }

      if (parsedTheme !== currentTheme.value) {
        applyTheme(parsedTheme, { persist: false });
      }
    });
  }

  const rootTheme = typeof document !== 'undefined'
    ? document.documentElement.getAttribute('data-theme')
    : null;

  if (typeof document !== 'undefined' && rootTheme) {
    currentTheme.value = rootTheme;
  }

  if (!themeHydrationPromise) {
    themeHydrationPromise = (async () => {
      try {
        await ensureCustomThemesLoaded();

        const persistedTheme = await resolvePersistedTheme();
        const currentDataTheme = typeof document !== 'undefined'
          ? document.documentElement.getAttribute('data-theme')
          : null;
        const fallbackTheme = currentDataTheme && availableThemes.value.includes(currentDataTheme)
          ? currentDataTheme
          : DEFAULT_THEME;
        const nextTheme = typeof persistedTheme === 'string' && availableThemes.value.includes(persistedTheme)
          ? persistedTheme
          : fallbackTheme;

        if (currentTheme.value !== nextTheme) {
          applyTheme(nextTheme, { persist: false });
        }
      } catch {
        // Ignore store read failures
      } finally {
        hasHydratedTheme = true;
      }
    })();
  }

  void ensureCustomThemesLoaded();

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
