import { beforeEach, describe, expect, it } from 'vitest';
import { useTheme } from '../useTheme';

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('prefers theme from agent_settings over legacy key', () => {
    localStorage.setItem('agent_theme', 'light-blue');
    localStorage.setItem('agent_settings', JSON.stringify({ theme: 'soft-pink' }));

    const { currentTheme } = useTheme();

    expect(currentTheme.value).toBe('soft-pink');
    expect(localStorage.getItem('agent_theme')).toBe('soft-pink');
  });

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
    expect(localStorage.getItem('agent_settings')).toContain('"theme":"light-blue"');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light-blue');
    expect(getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim()).toBe('#0066cc');
  });

  it('returns deterministic user colors for same input', () => {
    const { getUserColor, applyTheme } = useTheme();
    applyTheme('retro-terminal');

    const first = getUserColor.value('ALPHA');
    const second = getUserColor.value('ALPHA');

    expect(first).toBe(second);
  });

  it('applies initial theme variables immediately', () => {
    localStorage.setItem('agent_settings', JSON.stringify({ theme: 'light-blue' }));

    useTheme();

    expect(document.documentElement.getAttribute('data-theme')).toBe('light-blue');
    expect(getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim()).toBe('#0066cc');
  });

  it('prefers theme from agent_app_settings when present', () => {
    localStorage.setItem('agent_app_settings', JSON.stringify({ theme: 'soft-pink' }));

    const { currentTheme } = useTheme();

    expect(currentTheme.value).toBe('soft-pink');
    expect(document.documentElement.getAttribute('data-theme')).toBe('soft-pink');
  });
});
