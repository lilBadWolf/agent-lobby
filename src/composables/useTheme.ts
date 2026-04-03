import { ref, computed } from 'vue';
import { THEMES } from '../themes';

const DEFAULT_THEME = 'retro-terminal';
const DEFAULT_USER_COLORS = ['#39ff14', '#00ff00', '#00ffaa'];
const availableThemes = Object.keys(THEMES);
const currentTheme = ref<string>(DEFAULT_THEME);
let hasInitializedTheme = false;

function getInitialTheme(): string {
  try {
    const savedSettings = localStorage.getItem('agent_settings');
    if (savedSettings) {
      const parsed = JSON.parse(savedSettings) as { theme?: string };
      if (typeof parsed.theme === 'string' && parsed.theme.trim()) {
        return parsed.theme;
      }
    }
  } catch {
    // Ignore malformed saved settings and continue fallback resolution.
  }

  return localStorage.getItem('agent_theme') || 'retro-terminal';
}

function persistThemeInAgentSettings(themeName: string) {
  try {
    const savedSettings = localStorage.getItem('agent_settings');
    const parsed = savedSettings ? JSON.parse(savedSettings) as Record<string, unknown> : {};
    const nextSettings = {
      ...parsed,
      theme: themeName,
    };

    localStorage.setItem('agent_settings', JSON.stringify(nextSettings));
  } catch {
    // Ignore malformed settings payloads in storage.
  }
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
  function applyTheme(themeName: string) {
    const nextTheme = THEMES[themeName as keyof typeof THEMES] ? themeName : DEFAULT_THEME;

    const root = document.documentElement;
    root.setAttribute('data-theme', nextTheme);

    currentTheme.value = nextTheme;
    localStorage.setItem('agent_theme', nextTheme);
    persistThemeInAgentSettings(nextTheme);
  }

  const rootTheme = typeof document !== 'undefined'
    ? document.documentElement.getAttribute('data-theme')
    : null;

  if (!hasInitializedTheme || !rootTheme) {
    // Load theme from app settings first, then fallback to legacy theme storage key.
    const savedTheme = getInitialTheme();
    const initialTheme = THEMES[savedTheme as keyof typeof THEMES] ? savedTheme : DEFAULT_THEME;
    applyTheme(initialTheme);
    hasInitializedTheme = true;
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
