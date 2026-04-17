<template>
  <div v-if="showModal" id="profile-settings-modal" @click="(e) => e.target === $el && handleClose()">
    <div class="modal-box">
      <h3>PROFILE SETTINGS</h3>
      <div class="settings-panel">
        <div class="avatar-tab-bar">
          <button
            type="button"
            :class="['avatar-tab', { active: activeTab === 'included' }]"
            @click="activeTab = 'included'"
          >
            Included
          </button>
          <button
            type="button"
            :class="['avatar-tab', { active: activeTab === 'custom' }]"
            @click="activeTab = 'custom'"
          >
            Custom URL
          </button>
        </div>

        <div class="avatar-settings-panel">
          <div v-if="activeTab === 'included'" class="included-avatar-panel">
            <div class="pack-selection-row" v-if="avatarPacks.length > 1">
              <div class="pack-nav-row">
                <button
                  type="button"
                  class="pack-nav-button"
                  @click="prevPack"
                  :disabled="avatarPacks.length <= 1"
                  aria-label="Previous pack"
                >
                  ‹
                </button>
                <div class="pack-title">{{ activePack?.label }}</div>
                <button
                  type="button"
                  class="pack-nav-button"
                  @click="nextPack"
                  :disabled="avatarPacks.length <= 1"
                  aria-label="Next pack"
                >
                  ›
                </button>
              </div>
            </div>

            <div class="avatar-grid">
              <button
                v-for="index in 9"
                :key="index"
                type="button"
                class="avatar-grid-cell"
                :class="{ selected: activePack?.src && selectedAvatarIndex === index - 1 }"
                @click="selectBuiltInAvatar(index - 1)"
              >
                <div
                  v-if="activePack?.src"
                  class="avatar-grid-sprite"
                  :style="{
                    backgroundImage: `url(${activePack.src})`,
                    backgroundSize: '300% 300%',
                    backgroundPosition: getAvatarObjectPosition(index - 1),
                  }"
                  aria-hidden="true"
                />
              </button>
            </div>

            <div class="setting-note">
              Pick a built-in avatar from the selected pack. This will be shared with other users in the lobby.
            </div>
          </div>

          <div v-else class="custom-avatar-panel">
            <div class="avatar-preview-panel">
              <div class="avatar-preview-frame">
                <div
                  v-if="customAvatarPreview?.type === 'pack'"
                  class="avatar-preview-sprite"
                  :style="{
                    backgroundImage: `url(${customAvatarPreview.src})`,
                    backgroundSize: '300% 300%',
                    backgroundPosition: getAvatarObjectPosition(customAvatarPreview.avatarIndex),
                  }"
                  aria-hidden="true"
                />
                <img
                  v-else-if="customAvatarPreview?.type === 'image'"
                  :src="customAvatarPreview.src"
                  alt="Custom avatar preview"
                  class="avatar-preview-image"
                />
                <div v-else class="avatar-preview-placeholder">
                  Enter a valid avatar URL to preview.
                </div>
              </div>
            </div>
            <div class="setting-row">
              <label>AVATAR URL</label>
              <input
                v-model="localConfig.avatarUrl"
                type="url"
                id="set-profile-avatar-url"
                placeholder="https://example.com/avatar.png"
                @input="handleCustomAvatarInput"
              />
            </div>
            <div class="setting-note">
              Enter your own avatar URL to override the included packs.
            </div>
          </div>
        </div>

        <div class="setting-row">
          <label>TAGLINE</label>
          <input
            v-model="localConfig.tagline"
            type="text"
            id="set-profile-tagline"
            placeholder="AGENT ON THE MOVE"
            @change="handleChange"
          />
        </div>
        <div class="setting-row page-field-row">
          <label>PAGE</label>
          <input
            v-model="localConfig.pageText"
            type="text"
            id="set-profile-page-text"
            placeholder="Link text"
            @change="handleChange"
          />
          <input
            v-model="localConfig.pageUrl"
            type="url"
            id="set-profile-page-url"
            placeholder="https://example.com"
            @change="handleChange"
          />
        </div>
        <div class="setting-row">
          <label>MEDIA SHARING</label>
          <input
            v-model="localConfig.mediaSharing"
            type="checkbox"
            id="set-profile-media-sharing"
            @change="handleChange"
          />
        </div>
        <div class="setting-note">
          Allow other agents to see your audio/video presence in the lobby.
        </div>
      </div>
      <button class="close-btn" type="button" @click="handleClose">CLOSE</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { AudioConfig } from '../types/chat';
import {
  buildPackAvatarUrl,
  findAvatarPackSelection,
  getAvatarObjectPosition,
  getAvatarPacks,
} from '../composables/useAvatarPacks';

const props = defineProps<{
  showModal: boolean;
  config: AudioConfig;
}>();

const emit = defineEmits<{
  update: [Partial<AudioConfig>];
  close: [];
}>();

const avatarPacks = getAvatarPacks();
const activeTab = ref('included');
const activePackId = ref(avatarPacks[0]?.id ?? '');

const localConfig = ref({
  avatarUrl: '',
  tagline: '',
  pageText: '',
  pageUrl: '',
  mediaSharing: true,
});

function syncLocalConfig() {
  localConfig.value = {
    avatarUrl: typeof props.config.avatarUrl === 'string' ? props.config.avatarUrl.trim() : '',
    tagline: typeof props.config.tagline === 'string' ? props.config.tagline.trim() : '',
    pageText: typeof props.config.pageText === 'string' ? props.config.pageText.trim() : '',
    pageUrl: typeof props.config.pageUrl === 'string' ? props.config.pageUrl.trim() : '',
    mediaSharing: props.config.mediaSharing ?? true,
  };

  const selection = findAvatarPackSelection(localConfig.value.avatarUrl);
  if (selection) {
    activePackId.value = selection.pack.id;
    if (activeTab.value !== 'custom') {
      activeTab.value = 'included';
    }
  } else {
    activeTab.value = 'custom';
  }
}

watch(
  () => props.config,
  syncLocalConfig,
  { immediate: true }
);

watch(
  () => props.showModal,
  (value) => {
    if (value) {
      syncLocalConfig();
    }
  }
);

const activePack = computed(() => avatarPacks.find((entry) => entry.id === activePackId.value) ?? avatarPacks[0]);

const activePackIndex = computed(() => avatarPacks.findIndex((entry) => entry.id === activePackId.value));

function prevPack() {
  if (avatarPacks.length <= 1 || activePackIndex.value < 0) {
    return;
  }
  const nextIndex = (activePackIndex.value - 1 + avatarPacks.length) % avatarPacks.length;
  activePackId.value = avatarPacks[nextIndex].id;
}

function nextPack() {
  if (avatarPacks.length <= 1 || activePackIndex.value < 0) {
    return;
  }
  const nextIndex = (activePackIndex.value + 1) % avatarPacks.length;
  activePackId.value = avatarPacks[nextIndex].id;
}

const selectedAvatarIndex = computed<number | null>(() => {
  const selection = findAvatarPackSelection(localConfig.value.avatarUrl);
  return selection ? selection.avatarIndex : null;
});

function selectBuiltInAvatar(index: number) {
  if (!activePack.value) {
    return;
  }

  localConfig.value.avatarUrl = buildPackAvatarUrl(activePack.value.id, index);
  activeTab.value = 'custom';
  handleChange();
}

const customAvatarPreview = computed(() => {
  const url = typeof localConfig.value.avatarUrl === 'string' ? localConfig.value.avatarUrl.trim() : '';
  if (!url) {
    return null;
  }

  const packSelection = findAvatarPackSelection(url);
  if (packSelection) {
    return {
      type: 'pack' as const,
      src: packSelection.pack.src,
      avatarIndex: packSelection.avatarIndex,
    };
  }

  try {
    const parsed = new URL(url);
    if (!/^https?:$/i.test(parsed.protocol)) {
      return null;
    }
    return {
      type: 'image' as const,
      src: parsed.toString(),
    };
  } catch {
    return null;
  }
});

function handleCustomAvatarInput() {
  activeTab.value = 'custom';
  handleChange();
}

function handleChange() {
  emit('update', {
    avatarUrl: localConfig.value.avatarUrl,
    tagline: localConfig.value.tagline,
    pageText: localConfig.value.pageText,
    pageUrl: localConfig.value.pageUrl,
    mediaSharing: localConfig.value.mediaSharing,
  });
}

function handleClose() {
  emit('close');
}
</script>

<style scoped>
#profile-settings-modal {
  position: fixed;
  inset: 0;
  background: rgba(8, 10, 18, 0.75);
  z-index: 1005;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.modal-box {
  width: min(520px, calc(100vw - 32px));
  background: var(--color-sidebar-bg);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  box-shadow: 0 22px 48px rgba(0, 0, 0, 0.35);
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

h3 {
  margin: 0;
  color: var(--color-accent);
}

.settings-panel {
  display: grid;
  gap: 14px;
}

.avatar-tab-bar {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.avatar-tab {
  border-radius: 999px;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.04);
  color: var(--color-text-primary);
  font-weight: 700;
  cursor: pointer;
}

.avatar-tab.active {
  color: var(--color-bg);
  border-color: transparent;
}

.avatar-settings-panel {
  display: grid;
  gap: 14px;
}

.pack-selection-row {
  display: grid;
  gap: 8px;
}

.pack-nav-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.pack-nav-button {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 1px solid var(--color-accent-muted);
  background: rgba(255, 255, 255, 0.04);
  color: var(--color-text-primary);
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.pack-nav-button:hover:not(:disabled) {
  border-color: var(--color-accent);
  background: rgba(120, 138, 255, 0.14);
}

.pack-nav-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.pack-title {
  flex: 1;
  text-align: center;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-primary);
}

.avatar-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.avatar-grid-cell {
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  overflow: hidden;
  padding: 0;
  min-height: 0;
  position: relative;
  aspect-ratio: 1;
  background: rgba(255, 255, 255, 0.02);
  cursor: pointer;
}

.avatar-grid-cell.selected {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 2px rgba(120, 138, 255, 0.2);
}

.avatar-grid-sprite {
  width: 100%;
  height: 100%;
  border-radius: 16px;
  background-repeat: no-repeat;
}

.avatar-preview-panel {
  display: grid;
  gap: 8px;
  justify-items: center;
}

.avatar-preview-frame {
  width: 100%;
  max-width: 140px;
  aspect-ratio: 1;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 16px;
  overflow: hidden;
  display: grid;
  place-items: center;
}

.avatar-preview-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.avatar-preview-sprite {
  width: 100%;
  height: 100%;
  background-repeat: no-repeat;
}

.avatar-preview-placeholder {
  color: var(--color-text-secondary);
  font-size: 12px;
  padding: 8px;
  text-align: center;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.setting-row label {
  font-size: 12px;
  font-weight: bold;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-text-primary);
}

.page-field-row {
  gap: 8px;
}

.page-field-row label {
  flex: 0 0 auto;
}

.page-field-row input[type='text'] {
  flex: 1 0 36%;
  min-width: 0;
}

.page-field-row input[type='url'] {
  flex: 1 0 64%;
  min-width: 0;
}

.setting-row input[type='url'],
.setting-row input[type='text'] {
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.04);
  color: var(--color-text-primary);
}

.setting-row input[type='checkbox'] {
  width: 18px;
  height: 18px;
}

.setting-note {
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.4;
}

.close-btn {
  background: transparent;
  border: 1px solid var(--color-accent);
  color: var(--color-accent);
  border-radius: 999px;
  padding: 10px;
  cursor: pointer;
  width: 100%;
  font-weight: bold;
  text-transform: uppercase;
}

.close-btn:hover {
  background: rgba(120, 138, 255, 0.12);
}
</style>
