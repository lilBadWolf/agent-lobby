import { describe, expect, it } from 'vitest';
import { useTheme } from '../useTheme';

describe('useTheme', () => {
  it('loads saved theme from localStorage', () => {
    localStorage.setItem('agent_theme', 'light-blue');

    const { currentTheme, availableThemes } = useTheme();

    expect(currentTheme.value).toBe('light-blue');
    expect(availableThemes).toContain('retro-terminal');
  });

  it('applies theme variables and persists selected theme', () => {
    const { applyTheme, currentTheme } = useTheme();

    applyTheme('light-blue');

    expect(currentTheme.value).toBe('light-blue');
    expect(localStorage.getItem('agent_theme')).toBe('light-blue');
    expect(document.documentElement.style.getPropertyValue('--neon-green')).toBe('#0066cc');
  });

  it('returns deterministic user colors for same input', () => {
    const { getUserColor, applyTheme } = useTheme();
    applyTheme('retro-terminal');

    const first = getUserColor.value('ALPHA');
    const second = getUserColor.value('ALPHA');

    expect(first).toBe(second);
  });
});
