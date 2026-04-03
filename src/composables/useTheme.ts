import { ref, watch, computed } from 'vue';
import { THEMES } from '../themes';

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

export function useTheme() {
  // Load theme from app settings first, then fallback to legacy theme storage key.
  const savedTheme = getInitialTheme();
  const currentTheme = ref<string>(savedTheme);
  const availableThemes = Object.keys(THEMES);

  function applyTheme(themeName: string) {
    const theme = THEMES[themeName as keyof typeof THEMES];
    if (!theme) return;

    const root = document.documentElement;
    root.style.setProperty('--neon-green', theme.colors.neonGreen);
    root.style.setProperty('--dark-bg', theme.colors.darkBg);
    root.style.setProperty('--dim-green', theme.colors.dimGreen);
    root.style.setProperty('--alert-red', theme.colors.alertRed);
    root.style.setProperty('--text-white', theme.colors.textWhite);
    root.style.setProperty('--system-dim', theme.colors.systemDim);

    currentTheme.value = themeName;
    localStorage.setItem('agent_theme', themeName);
    persistThemeInAgentSettings(themeName);
  }

  const getUserColor = computed(() => {
    return (str: string): string => {
      const theme = THEMES[currentTheme.value as keyof typeof THEMES];
      if (!theme) return '#39ff14';

      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
      }
      const colorIndex = Math.abs(hash) % theme.userColors.length;
      return theme.userColors[colorIndex];
    };
  });

  watch(currentTheme, (newTheme) => {
    applyTheme(newTheme);
  }, { immediate: true });

  return {
    currentTheme,
    availableThemes,
    applyTheme,
    getUserColor,
  };
}
