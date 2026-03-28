import { ref, watch } from 'vue';
import { THEMES } from '../themes';

export function useTheme() {
  // Load saved theme from localStorage, default to 'retro-terminal'
  const savedTheme = localStorage.getItem('agent_theme') || 'retro-terminal';
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
  }

  function getUserColor(str: string): string {
    const theme = THEMES[currentTheme.value as keyof typeof THEMES];
    if (!theme) return '#39ff14';

    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colorIndex = Math.abs(hash) % theme.userColors.length;
    return theme.userColors[colorIndex];
  }

  watch(currentTheme, (newTheme) => {
    applyTheme(newTheme);
  });

  return {
    currentTheme,
    availableThemes,
    applyTheme,
    getUserColor,
  };
}
