const themePresetModules = import.meta.glob('./presets/*.css', { eager: true });

function toThemeKey(path: string): string {
  const fileName = path.split('/').pop() ?? '';
  return fileName.replace(/\.css$/i, '');
}

function toThemeLabel(themeKey: string): string {
  return themeKey
    .split('-')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

const discoveredThemeKeys = Object.keys(themePresetModules)
  .map(toThemeKey)
  .filter(Boolean)
  .sort();

export const THEMES = Object.freeze(
  Object.fromEntries(
    discoveredThemeKeys.map((themeKey) => [themeKey, { key: themeKey, name: toThemeLabel(themeKey) }])
  )
);

export const THEME_KEYS = Object.freeze(discoveredThemeKeys);

export type ThemeKey = keyof typeof THEMES;
