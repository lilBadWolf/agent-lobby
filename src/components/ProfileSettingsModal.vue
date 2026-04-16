<template>
  <div v-if="showModal" id="profile-settings-modal" @click="(e) => e.target === $el && handleClose()">
    <div class="modal-box">
      <h3>PROFILE SETTINGS</h3>
      <div class="settings-panel">
        <div class="setting-row">
          <label>AVATAR URL</label>
          <input
            v-model="localConfig.avatarUrl"
            type="url"
            id="set-profile-avatar-url"
            placeholder="https://example.com/avatar.png"
            @change="handleChange"
          />
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
import { ref, watch } from 'vue';
import type { AudioConfig } from '../types/chat';

const props = defineProps<{
  showModal: boolean;
  config: AudioConfig;
}>();

const emit = defineEmits<{
  update: [Partial<AudioConfig>];
  close: [];
}>();

const localConfig = ref({
  avatarUrl: '',
  tagline: '',
  mediaSharing: true,
});

function syncLocalConfig() {
  localConfig.value = {
    avatarUrl: typeof props.config.avatarUrl === 'string' ? props.config.avatarUrl.trim() : '',
    tagline: typeof props.config.tagline === 'string' ? props.config.tagline.trim() : '',
    mediaSharing: props.config.mediaSharing ?? true,
  };
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

function handleChange() {
  emit('update', {
    avatarUrl: localConfig.value.avatarUrl,
    tagline: localConfig.value.tagline,
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
  width: min(420px, calc(100vw - 32px));
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
