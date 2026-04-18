<template>
  <div class="theme-editor-window">
    <div class="theme-editor-window-header">
      <div class="theme-switcher-group">
        <button
          type="button"
          class="theme-switch-btn"
          @click="goToPreviousTheme"
          :disabled="customThemes.length <= 1"
          aria-label="Previous theme"
        >
          ‹
        </button>

        <div class="theme-switcher-current">
          <div class="theme-switcher-name">{{ selectedThemeName }}</div>
        </div>

        <button
          type="button"
          class="theme-switch-btn"
          @click="goToNextTheme"
          :disabled="customThemes.length <= 1"
          aria-label="Next theme"
        >
          ›
        </button>
      </div>

      <div class="theme-header-center">
        <label class="theme-scanline-toggle">
          <input type="checkbox" v-model="showScanlines" />
          <span>Show scanlines</span>
        </label>
      </div>

      <div class="theme-save-row header-row">
        <input
          type="text"
          v-model="saveThemeName"
          placeholder="Enter theme name"
          class="theme-save-input"
        />
        <button type="button" class="theme-save-btn" @click="saveEditedTheme">Save</button>
        <button type="button" class="theme-save-btn secondary" @click="resetPreview">Reset</button>
      </div>
    </div>

    <template v-if="isLoadingThemes">
      <div class="theme-editor-empty-state">Loading application themes…</div>
    </template>

    <template v-else-if="!selectedThemeName">
      <div class="theme-editor-empty-state">
        No application themes found.
        Add a theme file to the application theme folder and reopen the editor.
      </div>
    </template>

    <template v-else>
      <ThemeEditorPreview
        ref="editorRef"
        :theme-name="selectedThemeName"
        :theme-source="selectedThemeSource"
        :show-scanlines="showScanlines"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { THEMES } from './themes';
import { useTheme } from './composables/useTheme';
import ThemeEditorPreview from './components/ThemeEditorPreview.vue';

const { availableThemes, refreshCustomThemes } = useTheme();
const selectedThemeName = ref('');
const selectedThemeSource = ref('');
const saveThemeName = ref('');
const showScanlines = ref(false);
const editorRef = ref<InstanceType<typeof ThemeEditorPreview> | null>(null);
const isLoadingThemes = ref(true);

const customThemes = computed(() => {
  const builtinThemeNames = new Set(Object.keys(THEMES));
  return availableThemes.value.filter((themeName) => !builtinThemeNames.has(themeName));
});

const currentThemeIndex = computed(() => {
  const index = customThemes.value.indexOf(selectedThemeName.value);
  return index >= 0 ? index : 0;
});

const previousTheme = computed(() => {
  if (customThemes.value.length === 0) return undefined;
  const index = currentThemeIndex.value;
  const nextIndex = (index - 1 + customThemes.value.length) % customThemes.value.length;
  return customThemes.value[nextIndex];
});

const nextTheme = computed(() => {
  if (customThemes.value.length === 0) return undefined;
  const index = currentThemeIndex.value;
  const nextIndex = (index + 1) % customThemes.value.length;
  return customThemes.value[nextIndex];
});

const previouslySelectedTheme = ref('');

async function loadThemeSource(themeName: string) {
  if (!themeName) {
    selectedThemeSource.value = '';
    return;
  }

  try {
    const source = await invoke<string>('get_theme_source', { themeName });
    selectedThemeSource.value = source;
  } catch {
    selectedThemeSource.value = '';
  }
}

function goToPreviousTheme() {
  if (!previousTheme.value) return;
  selectedThemeName.value = previousTheme.value;
}

function goToNextTheme() {
  if (!nextTheme.value) return;
  selectedThemeName.value = nextTheme.value;
}

function getCurrentCssContent() {
  const themeName = saveThemeName.value.trim() || selectedThemeName.value;
  const cssContent = editorRef.value?.cssSnippet || `:root[data-theme='${themeName}'] {}`;
  const rootSelectorRegex = /^:root\[data-theme=(?:'[^']*'|"[^"]*")\]/m;
  if (!rootSelectorRegex.test(cssContent)) {
    return `:root[data-theme='${themeName}'] {}`;
  }
  return cssContent.replace(rootSelectorRegex, `:root[data-theme='${themeName}']`);
}

function resetPreview() {
  editorRef.value?.resetThemeValues();
}

async function saveEditedTheme() {
  const themeName = saveThemeName.value.trim() || selectedThemeName.value;
  const overwrite = themeName === selectedThemeName.value;
  try {
    await invoke('save_custom_theme', { themeName, cssContent: getCurrentCssContent(), overwrite });
    await refreshCustomThemes();
    alert(`Theme '${themeName}' saved to the application theme folder`);
  } catch (error) {
    console.error(error);
    alert(`Unable to save theme: ${String(error)}`);
  }
}


watch(selectedThemeName, (themeName, previousThemeName) => {
  loadThemeSource(themeName);
  if (!saveThemeName.value || saveThemeName.value === previousThemeName) {
    saveThemeName.value = themeName;
  }
  previouslySelectedTheme.value = themeName;
});

watch(customThemes, (themes) => {
  if (!themes.length) {
    selectedThemeName.value = '';
    saveThemeName.value = '';
    selectedThemeSource.value = '';
    isLoadingThemes.value = false;
    return;
  }

  if (!themes.includes(selectedThemeName.value)) {
    selectedThemeName.value = themes[0];
  }

  isLoadingThemes.value = false;
});

onMounted(async () => {
  isLoadingThemes.value = true;
  await refreshCustomThemes().catch(() => undefined);
  if (customThemes.value.length > 0) {
    selectedThemeName.value = customThemes.value[0];
  }
  await loadThemeSource(selectedThemeName.value);
  isLoadingThemes.value = false;
});
</script>

<style scoped>
.theme-editor-window {
  min-height: 100vh;
  max-height: 100vh;
  padding: 18px;
  background: var(--color-settings-overlay);
  color: var(--color-text-primary);
  overflow: hidden;
}

.theme-editor-window .theme-editor-shell {
  max-height: calc(100vh - 118px);
  overflow-y: auto;
}

.theme-editor-window-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--color-settings-divider);
}

.theme-switcher-group {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 1px solid var(--color-chat-border);
  border-radius: 999px;
  background: var(--color-chat-surface);
}

.theme-header-center {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 220px;
}

.theme-scanline-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--color-chat-border);
  border-radius: 999px;
  background: var(--color-chat-surface);
  color: var(--color-text-secondary);
  font-size: 0.85rem;
  cursor: pointer;
}

.theme-scanline-toggle input {
  width: 14px;
  height: 14px;
  accent-color: var(--color-accent);
}

.theme-save-row.header-row {
  justify-content: flex-end;
}

.theme-switch-btn {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  border: 1px solid var(--color-accent-muted);
  background: rgba(255, 255, 255, 0.04);
  color: var(--color-text-primary);
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.theme-switch-btn:hover:not(:disabled) {
  border-color: var(--color-accent);
  background: rgba(120, 138, 255, 0.14);
}

.theme-switch-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.theme-switcher-current {
  display: grid;
  gap: 4px;
  text-align: center;
  min-width: 260px;
  max-width: 300px;
}

.theme-switcher-name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.theme-switcher-label {
  font-size: 0.72rem;
  color: var(--color-text-secondary);
}

.theme-switcher-name {
  font-size: 0.9rem;
  font-weight: 700;
}

.theme-editor-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.theme-save-row {
  display: flex;
  gap: 10px;
  align-items: center;
}

.theme-save-input {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--color-chat-border);
  background: var(--color-bg-base);
  color: var(--color-text-primary);
  padding: 10px 12px;
}

.theme-save-btn {
  border: 1px solid var(--color-chat-border);
  background: var(--color-chat-surface);
  color: var(--color-text-primary);
  padding: 10px 14px;
  cursor: pointer;
}

.theme-save-btn.secondary {
  background: var(--color-chat-bg);
}

.theme-save-hint {
  font-size: 0.78rem;
  color: var(--color-text-secondary);
}

.theme-editor-empty-state {
  min-height: calc(100vh - 200px);
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--color-text-secondary);
  background: var(--color-chat-surface);
  border: 1px solid var(--color-chat-border);
  padding: 24px;
  border-radius: 12px;
  line-height: 1.5;
}
</style>
