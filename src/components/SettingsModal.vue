<template>
  <div v-if="showModal" id="settings-modal" @click="(e) => e.target === $el && handleClose()">
    <div class="modal-box">
      <div class="settings-content">
        <h3 style="margin-top: 0; border-bottom: 1px solid var(--color-accent)">CONFIG_SYS</h3>
        <div class="settings-tabs" role="tablist" aria-label="Settings Sections">
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'general' }"
            type="button"
            @click="activeTab = 'general'"
          >
            GENERAL
          </button>
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'agentamp' }"
            type="button"
            @click="activeTab = 'agentamp'"
          >
            AGENTAMP
          </button>
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'media' }"
            type="button"
            @click="activeTab = 'media'"
          >
            MEDIA
          </button>
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'slash' }"
            type="button"
            @click="activeTab = 'slash'"
          >
            SLASH
          </button>
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'help' }"
            type="button"
            @click="activeTab = 'help'"
          >
            HELP
          </button>
        </div>

        <div v-if="activeTab === 'general'" class="tab-panel">
          <div class="setting-row">
            <label>COLOR THEME</label>
            <button class="preview-btn" @click="openThemesFolder">📁</button>
            <select
              v-model="localConfig.theme"
              id="set-theme"
              @change="handleChange"
            >
              <option v-for="themeName in orderedThemes" :key="themeName" :value="themeName">
                {{ themeName }}
              </option>
            </select>
          </div>
          <div class="setting-row">
            <label>SCANLINES</label>
            <input
              v-model="localConfig.scanlines"
              type="checkbox"
              id="set-scanlines-toggle"
              @change="handleChange"
            />
          </div>
          <div class="setting-row">
            <label>JOIN/PART MESSAGES</label>
            <input
              v-model="localConfig.showJoinPartMessages"
              type="checkbox"
              id="set-join-part-toggle"
              @change="handleChange"
            />
          </div>
          <hr class="settings-divider" />
          <div class="setting-row">
            <label>DM ENABLED</label>
            <input
              v-model="localConfig.dmEnabled"
              type="checkbox"
              id="set-dm-toggle"
              @change="handleChange"
            />
          </div>
          <div class="setting-row">
            <div style="display: flex; align-items: center; gap: 8px;">
              <label>DM EFFECT</label>
              <button class="preview-btn" @click="previewEffect">🔭</button>
            </div>
            <select
              v-model="localConfig.dmChatEffect"
              id="set-dm-effect"
              @change="handleChange"
            >
              <option v-for="option in dmEffectOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </div>
          <div class="setting-row">
            <label>AUTO-AWAY</label>
            <select
              v-model.number="localConfig.autoAwayMinutes"
              id="set-auto-away"
              @change="handleChange"
            >
              <option :value="10">10M</option>
              <option :value="30">30M</option>
              <option :value="60">1HR</option>
              <option :value="0">OFF</option>
            </select>
          </div>
          <div class="setting-row">
            <label>UPDATE CHECK</label>
            <select
              v-model.number="localConfig.autoUpdatePulseMinutes"
              id="set-update-pulse"
              @change="handleChange"
            >
              <option :value="15">15M</option>
              <option :value="30">30M</option>
              <option :value="60">1HR</option>
              <option :value="120">2HR</option>
              <option :value="0">OFF</option>
            </select>
          </div>
        </div>
        <div v-if="activeTab === 'agentamp'" class="tab-panel media-panel">
          <div class="setting-row">
            <label>MEDIA SHARING</label>
            <input
              v-model="localConfig.mediaSharing"
              type="checkbox"
              id="set-media-sharing-toggle"
              @change="handleChange"
            />
          </div>
          <div class="setting-row">
            <label>AGENTAMP</label>
            <input
              v-model="localConfig.agentAmpEnabled"
              type="checkbox"
              id="set-agentamp-toggle"
              @change="handleChange"
            />
          </div>
          <div class="setting-row">
            <label>DETACH AGENTAMP</label>
            <input
              v-model="localConfig.agentAmpDetached"
              type="checkbox"
              id="set-agentamp-detach-toggle"
              :disabled="!localConfig.agentAmpEnabled"
              @change="handleChange"
            />
          </div>
          <hr class="settings-divider" />
          <div class="setting-row">
            <label>SPECTRUM BARS</label>
            <select
              v-model.number="localConfig.spectrumBarCount"
              id="set-spectrum-bars"
              :disabled="!localConfig.agentAmpEnabled"
              @change="handleChange"
            >
              <option :value="32">32 (LOW CPU)</option>
              <option :value="48">48</option>
              <option :value="64">64 (BALANCED)</option>
              <option :value="96">96</option>
              <option :value="128">128 (HIGH DETAIL)</option>
            </select>
          </div>
          <div class="setting-row">
            <label>SPECTRUM FFT</label>
            <select
              v-model.number="localConfig.spectrumFftSize"
              id="set-spectrum-fft"
              :disabled="!localConfig.agentAmpEnabled"
              @change="handleChange"
            >
              <option :value="1024">1024 (LOW LATENCY)</option>
              <option :value="2048">2048 (BALANCED)</option>
              <option :value="4096">4096</option>
              <option :value="8192">8192 (HIGH RESOLUTION)</option>
            </select>
          </div>
        </div>
        <div v-if="activeTab === 'media'" class="tab-panel media-panel">
          <div class="setting-row">
            <label>AUDIO ENABLED</label>
            <input
              v-model="localConfig.audioEnabled"
              type="checkbox"
              id="set-audio-toggle"
              @change="handleChange"
            />
          </div>
          <div class="setting-row">
            <label>MASTER VOL</label>
            <input
              v-model.number="localConfig.volume"
              type="range"
              id="set-volume"
              min="0"
              max="1"
              step="0.1"
              @change="handleChange"
            />
          </div>
          <div class="setting-row">
            <label>SOUNDPACK</label>
            <button class="preview-btn" @click="openSoundpacksFolder">📁</button>
            <select
              v-model="localConfig.soundpack"
              id="set-soundpack"
              @change="handleChange"
            >
              <option v-for="pack in availableSoundpacks" :key="pack" :value="pack">
                {{ pack }}
              </option>
            </select>
          </div>
          <hr class="settings-divider" />
          <div class="setting-row">
            <label>DM AUDIO OUT</label>
            <select
              v-model="localConfig.audioOutputDeviceId"
              id="set-audio-output"
              @change="handleChange"
            >
              <option value="">DEFAULT</option>
              <option v-for="device in audioOutputDevices" :key="device.deviceId" :value="device.deviceId">
                {{ device.label }}
              </option>
            </select>
          </div>
          <div class="setting-row">
            <label>DM AUDIO IN</label>
            <select
              v-model="localConfig.audioInputDeviceId"
              id="set-audio-input"
              @change="handleChange"
            >
              <option value="">DEFAULT</option>
              <option :value="NO_MIC_DEVICE_ID">NO MIC (RECEIVE ONLY)</option>
              <option v-for="device in audioInputDevices" :key="device.deviceId" :value="device.deviceId">
                {{ device.label }}
              </option>
            </select>
          </div>
          <div class="setting-row">
            <label>VIDEO</label>
            <select
              v-model="localConfig.videoInputDeviceId"
              id="set-video-input"
              @change="handleChange"
            >
              <option value="">DEFAULT</option>
              <option :value="NO_WEBCAM_DEVICE_ID">NO WEBCAM (AUDIO ONLY)</option>
              <option v-for="device in videoInputDevices" :key="device.deviceId" :value="device.deviceId">
                {{ device.label }}
              </option>
            </select>
          </div>
          <div class="setting-row preview-action-row">
            <button
              class="preview-toggle-btn"
              type="button"
              :disabled="localConfig.videoInputDeviceId === NO_WEBCAM_DEVICE_ID"
              @click="toggleVideoPreview"
            >
              {{ isVideoPreviewVisible ? 'HIDE PREVIEW' : 'SHOW PREVIEW' }}
            </button>
          </div>
          <div class="setting-row">
            <div v-if="isVideoPreviewVisible" class="video-preview-wrap">
              {{ previewCameraLabel }} {{ previewResolutionLabel }}
              <video ref="videoPreviewRef" class="video-preview" autoplay muted playsinline></video>
            </div>
          </div>
        </div>
        <div v-if="activeTab === 'help'" class="tab-panel help-panel">
          <div class="help-title">SLASH COMMANDS</div>
          <div class="help-row">
            <code>/away</code>
            <span>SET STATUS TO AWAY</span>
          </div>
          <div class="help-row">
            <code>/back</code>
            <span>SET STATUS TO ACTIVE</span>
          </div>
          <div class="help-row">
            <code>/settings</code>
            <span>OPEN SETTINGS MODAL</span>
          </div>
          <div class="help-row">
            <code>/quit</code>
            <span>DISCONNECT FROM LOBBY</span>
          </div>
          <div class="help-row">
            <code>/dm on</code>
            <span>ENABLE DIRECT MESSAGES</span>
          </div>
          <div class="help-row">
            <code>/dm off</code>
            <span>DISABLE DIRECT MESSAGES</span>
          </div>
          <div class="help-row">
            <code>/dm @username</code>
            <span>REQUEST DM WITH USER</span>
          </div>

          <div class="help-title">CHAT TIPS</div>
          <div class="help-row">
            <code>:emoji_name:</code>
            <span>TYPE EMOJI SHORTCODES</span>
          </div>
          <div class="help-row">
            <code>@username</code>
            <span>TYPE @ TO PICK A USER</span>
          </div>
        </div>

        <div v-if="activeTab === 'slash'" class="tab-panel slash-panel">
          <div class="help-title">CUSTOM SHORTCUTS</div>
          <div class="slash-note">
            <code>/SHORT</code> TO SEND REUSABLE MESSAGE.
          </div>

          <div
            v-for="(alias, index) in localConfig.customSlashCommands"
            :key="`alias-${index}`"
            class="slash-row"
          >
            <input
              :id="`set-slash-command-${index}`"
              class="slash-input"
              :class="{ invalid: isReservedSlashCommand(alias.command) }"
              :value="alias.command"
              type="text"
              placeholder="/mycode"
              @input="updateSlashCommand(index, $event)"
            />
            <input
              :id="`set-slash-text-${index}`"
              class="slash-input slash-text-input"
              :value="alias.text"
              type="text"
              placeholder="Reusable message text"
              @input="updateSlashText(index, $event)"
            />
            <button class="slash-remove-btn" type="button" @click="removeSlashCommand(index)">
              X
            </button>
          </div>

          <button id="set-slash-add" class="slash-add-btn" type="button" @click="addSlashCommand">
            + ADD SHORTCUT
          </button>
        </div>
      </div>
      <button v-if="activeTab === 'general'" class="clear-btn" @click="handleClearLog">CLEAR MSG LOG</button>
      <button class="close-btn" @click="handleClose">CLOSE</button>
    </div>
    <div v-if="showEffectPreview" class="effect-preview">
      <div ref="previewElement" class="preview-text"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import type { AudioConfig, SlashCommandAlias } from '../types/chat';
import { useMessageAnimations } from '../composables/useMessageAnimations';
import { dmEffectOptions } from '../composables/messageEffectHelpers';
import { NO_WEBCAM_DEVICE_ID, NO_MIC_DEVICE_ID, useMediaDevices } from '../composables/useMediaDevices';

const DEFAULT_THEME = 'retro-terminal';

const RESERVED_SLASH_COMMANDS = new Set([
  '/away',
  '/back',
  '/settings',
  '/quit',
  '/dm',
  '/join',
  '/lobby',
]);

function normalizeSlashAliasCommand(value: string): string {
  const trimmed = (value || '').trim().toLowerCase();
  if (!trimmed) {
    return '';
  }

  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return /^\/[a-z0-9_-]+$/.test(withSlash) ? withSlash : '';
}

function sanitizeCustomSlashCommands(value: unknown): SlashCommandAlias[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const result: SlashCommandAlias[] = [];
  const seen = new Set<string>();

  for (const rawAlias of value) {
    if (!rawAlias || typeof rawAlias !== 'object') {
      continue;
    }

    const command = normalizeSlashAliasCommand(String((rawAlias as SlashCommandAlias).command || ''));
    const text = String((rawAlias as SlashCommandAlias).text || '').trim();

    if (!command || !text || RESERVED_SLASH_COMMANDS.has(command) || seen.has(command)) {
      continue;
    }

    seen.add(command);
    result.push({ command, text });
  }

  return result;
}

const props = defineProps<{
  showModal: boolean;
  config: AudioConfig;
  availableSoundpacks: string[];
  availableThemes: string[];
}>();

const emit = defineEmits<{
  update: [config: AudioConfig];
  close: [];
  clearLog: [];
}>();

function normalizeConfig(config: AudioConfig): AudioConfig {
  const normalizedTheme = typeof config.theme === 'string' && config.theme.trim()
    ? config.theme
    : DEFAULT_THEME;

  return {
    ...config,
    theme: normalizedTheme,
    autoAwayMinutes: config.autoAwayMinutes ?? 10,
    autoUpdatePulseMinutes: config.autoUpdatePulseMinutes ?? 30,
    spectrumBarCount: config.spectrumBarCount ?? 64,
    spectrumFftSize: config.spectrumFftSize ?? 2048,
    agentAmpEnabled: config.agentAmpEnabled ?? false,
    mediaSharing: config.mediaSharing ?? true,
    agentAmpDetached: config.agentAmpDetached ?? false,
    scanlines: config.scanlines ?? true,
    customSlashCommands: sanitizeCustomSlashCommands(config.customSlashCommands),
  };
}

const orderedThemes = computed(() => {
  const uniqueThemes = Array.from(new Set(props.availableThemes ?? []));
  const nonLightThemes = uniqueThemes.filter((name) => !name.startsWith('light-') && name !== DEFAULT_THEME);
  const lightThemes = uniqueThemes.filter((name) => name.startsWith('light-'));
  const hasDefaultTheme = uniqueThemes.includes(DEFAULT_THEME);

  return [
    ...(hasDefaultTheme ? [DEFAULT_THEME] : []),
    ...nonLightThemes,
    ...lightThemes,
  ];
});

const localConfig = ref<AudioConfig>(normalizeConfig(props.config));
const activeTab = ref<'general' | 'dm' | 'media' | 'agentamp' | 'help' | 'slash'>('general');
const hasInitializedMediaForOpen = ref(false);
const showEffectPreview = ref(false);
const previewElement = ref<HTMLElement>();
const videoPreviewRef = ref<HTMLVideoElement>();
const isVideoPreviewVisible = ref(false);
const previewCameraLabel = ref('UNKNOWN');
const previewResolutionLabel = ref('N/A');
let previewStream: MediaStream | null = null;
const { playAnimation } = useMessageAnimations();

const { audioInputDevices, audioOutputDevices, videoInputDevices, requestMediaPermission } = useMediaDevices();

watch(
  () => props.showModal,
  (isOpen) => {
    if (isOpen) {
      activeTab.value = 'general';
      hasInitializedMediaForOpen.value = false;
    }
  }
);

watch(
  () => [props.showModal, activeTab.value] as const,
  async ([isOpen, tab]) => {
    if (!isOpen || tab !== 'media' || hasInitializedMediaForOpen.value) {
      return;
    }

    hasInitializedMediaForOpen.value = true;

    // Only initialize media permissions/devices once user opens the Media tab.
    const includeVideo = localConfig.value.videoInputDeviceId !== NO_WEBCAM_DEVICE_ID;
    const includeAudio = localConfig.value.audioInputDeviceId !== NO_MIC_DEVICE_ID;
    const hasVideoDevices = await requestMediaPermission(includeVideo, includeAudio);

    // Auto-default no-webcam when no camera found and user hasn't chosen yet.
    if (!hasVideoDevices && localConfig.value.videoInputDeviceId === '') {
      localConfig.value.videoInputDeviceId = NO_WEBCAM_DEVICE_ID;
      emit('update', { ...localConfig.value });
    }

    // Auto-default no-mic when no audio input found and user hasn't chosen yet.
    const hasAudioDevices = audioInputDevices.value.length > 0;
    if (!hasAudioDevices && localConfig.value.audioInputDeviceId === '') {
      localConfig.value.audioInputDeviceId = NO_MIC_DEVICE_ID;
      emit('update', { ...localConfig.value });
    }
  }
);

watch(
  () => props.config,
  (newConfig) => {
    localConfig.value = normalizeConfig(newConfig);
  }
);

watch(
  () => props.availableSoundpacks,
  (newPacks) => {
    // Ensure the selected soundpack is in the available list
    if (newPacks.length > 0 && !newPacks.includes(localConfig.value.soundpack)) {
      localConfig.value.soundpack = newPacks[0];
    }
  },
  { immediate: true }
);

watch(
  () => props.availableThemes,
  (nextThemes) => {
    if (!Array.isArray(nextThemes) || nextThemes.length === 0) {
      localConfig.value.theme = DEFAULT_THEME;
      return;
    }

    if (!nextThemes.includes(localConfig.value.theme)) {
      localConfig.value.theme = nextThemes.includes(DEFAULT_THEME)
        ? DEFAULT_THEME
        : nextThemes[0];
    }
  },
  { immediate: true }
);

function handleClose() {
  stopVideoPreview();
  emit('close');
}

function handleChange() {
  emit('update', {
    ...localConfig.value,
    customSlashCommands: sanitizeCustomSlashCommands(localConfig.value.customSlashCommands),
  });
}

function emitSlashCommandsIfChanged() {
  const nextAliases = sanitizeCustomSlashCommands(localConfig.value.customSlashCommands);
  const currentAliases = sanitizeCustomSlashCommands(props.config.customSlashCommands);

  if (JSON.stringify(nextAliases) === JSON.stringify(currentAliases)) {
    return;
  }

  emit('update', {
    ...localConfig.value,
    customSlashCommands: nextAliases,
  });
}

function isReservedSlashCommand(command: string): boolean {
  return RESERVED_SLASH_COMMANDS.has((command || '').trim().toLowerCase());
}

function addSlashCommand() {
  const existingAliases = localConfig.value.customSlashCommands ?? [];
  localConfig.value.customSlashCommands = [
    ...existingAliases,
    { command: '', text: '' },
  ];
}

function removeSlashCommand(index: number) {
  const existingAliases = localConfig.value.customSlashCommands ?? [];
  localConfig.value.customSlashCommands = existingAliases.filter((_, idx) => idx !== index);
  emitSlashCommandsIfChanged();
}

function updateSlashCommand(index: number, event: Event) {
  const commandValue = (event.target as HTMLInputElement | null)?.value ?? '';
  const nextCommand = normalizeSlashAliasCommand(commandValue);
  const next = [...(localConfig.value.customSlashCommands ?? [])];
  const current = next[index];
  if (!current) {
    return;
  }

  next[index] = {
    ...current,
    command: nextCommand,
  };
  localConfig.value.customSlashCommands = next;
  emitSlashCommandsIfChanged();
}

function updateSlashText(index: number, event: Event) {
  const textValue = (event.target as HTMLInputElement | null)?.value ?? '';
  const next = [...(localConfig.value.customSlashCommands ?? [])];
  const current = next[index];
  if (!current) {
    return;
  }

  next[index] = {
    ...current,
    text: textValue,
  };
  localConfig.value.customSlashCommands = next;
  emitSlashCommandsIfChanged();
}

function handleClearLog() {
  emit('clearLog');
}

async function previewEffect() {
  showEffectPreview.value = true;
  await nextTick(); // Wait for DOM to render
  if (previewElement.value) {
    previewElement.value.innerHTML = '';
    const effectName = dmEffectOptions.find((option) => option.value === localConfig.value.dmChatEffect)?.label ?? localConfig.value.dmChatEffect.toUpperCase();
    await playAnimation(localConfig.value.dmChatEffect as any, effectName, previewElement.value);
    setTimeout(() => {
      showEffectPreview.value = false;
    }, 300);
  }
}

async function startVideoPreview() {
  if (localConfig.value.videoInputDeviceId === NO_WEBCAM_DEVICE_ID) {
    return;
  }

  stopVideoPreview();

  const videoConstraints: MediaTrackConstraints | boolean = localConfig.value.videoInputDeviceId
    ? { deviceId: { ideal: localConfig.value.videoInputDeviceId } }
    : true;

  const stream = await navigator.mediaDevices.getUserMedia({
    video: videoConstraints,
    audio: false,
  });

  previewStream = stream;
  isVideoPreviewVisible.value = true;

  await nextTick();
  if (videoPreviewRef.value) {
    videoPreviewRef.value.srcObject = stream;
    await videoPreviewRef.value.play().catch(() => {});

    const settings = stream.getVideoTracks()[0]?.getSettings();
    const width = settings?.width;
    const height = settings?.height;
    previewResolutionLabel.value = width && height ? `${width}x${height}` : 'N/A';
    previewCameraLabel.value = stream.getVideoTracks()[0]?.label || 'UNKNOWN';
  }
}

function stopVideoPreview() {
  if (videoPreviewRef.value) {
    videoPreviewRef.value.srcObject = null;
  }

  if (previewStream) {
    previewStream.getTracks().forEach((track) => track.stop());
    previewStream = null;
  }

  previewCameraLabel.value = 'UNKNOWN';
  previewResolutionLabel.value = 'N/A';

  isVideoPreviewVisible.value = false;
}

async function toggleVideoPreview() {
  if (isVideoPreviewVisible.value) {
    stopVideoPreview();
    return;
  }

  try {
    await startVideoPreview();
  } catch (error) {
    console.error('Failed to start video preview:', error);
    stopVideoPreview();
  }
}

async function openThemesFolder() {
  try {
    await invoke('open_themes_folder');
  } catch (error) {
    console.error('Failed to open themes folder:', error);
  }
}

async function openSoundpacksFolder() {
  try {
    await invoke('open_soundpacks_folder');
  } catch (error) {
    console.error('Failed to open soundpacks folder:', error);
  }
}

watch(
  () => localConfig.value.videoInputDeviceId,
  async () => {
    if (!isVideoPreviewVisible.value) {
      return;
    }

    try {
      await startVideoPreview();
    } catch (error) {
      console.error('Failed to refresh video preview:', error);
      stopVideoPreview();
    }
  }
);

watch(
  () => props.showModal,
  (isOpen) => {
    if (!isOpen) {
      stopVideoPreview();
    }
  }
);

watch(
  () => activeTab.value,
  (tab) => {
    if (tab !== 'media') {
      stopVideoPreview();
    }
  }
);

</script>

<style scoped>
#settings-modal {
  position: fixed;
  inset: 0;
  background: var(--color-settings-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 400;
}

.modal-box {
  width: min(460px, 92vw);
  border: 2px solid var(--color-accent);
  background: var(--color-settings-surface);
  padding: 20px;
  text-align: left;
  height: min(80vh, 620px);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  padding-right: 10px;
  margin-bottom: 10px;
}

.setting-row {
  margin: 20px 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.settings-tabs {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}

.tab-btn {
  background: transparent;
  border: 1px solid var(--color-accent);
  color: var(--color-accent);
  font-family: inherit;
  font-size: 11px;
  letter-spacing: 1px;
  padding: 8px 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn:hover {
  box-shadow: 0 0 8px var(--color-accent);
}

.tab-btn.active {
  background: var(--color-accent);
  color: var(--color-on-accent);
}

.tab-panel {
  margin-top: 8px;
}

.settings-divider {
  border: 0;
  border-top: 1px solid var(--color-settings-divider);
  margin: 10px 0 4px;
}

.media-panel .setting-row {
  align-items: center;
}

.media-panel .setting-row label {
  flex: 0 0 92px;
}

.media-panel .setting-row select {
  flex: 1;
  min-width: 0;
  max-width: 100%;
  width: 100%;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}

.help-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.help-title {
  margin: 8px 0 4px;
  font-size: 12px;
  letter-spacing: 1px;
  color: var(--color-accent);
  text-transform: uppercase;
}

.help-row {
  display: grid;
  grid-template-columns: 110px 1fr;
  align-items: center;
  gap: 10px;
  font-size: 11px;
  color: var(--color-text-primary);
}

.help-row code {
  color: var(--color-accent);
  background: var(--color-settings-code-bg);
  border: 1px solid var(--color-settings-code-border);
  padding: 2px 6px;
  font-family: inherit;
  font-size: 11px;
  border-radius: 2px;
}

.slash-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.slash-note {
  font-size: 11px;
  color: var(--color-text-primary);
  opacity: 0.9;
}

.slash-note code {
  color: var(--color-accent);
  background: var(--color-settings-code-bg);
  border: 1px solid var(--color-settings-code-border);
  padding: 1px 5px;
  font-family: inherit;
  font-size: 11px;
  border-radius: 2px;
}

.slash-row {
  display: grid;
  grid-template-columns: 100px 1fr auto;
  align-items: center;
  gap: 8px;
}

.slash-input {
  width: 100%;
}

.slash-text-input {
  min-width: 0;
}

.slash-input.invalid {
  border-color: var(--color-danger);
  color: var(--color-danger);
}

.slash-add-btn,
.slash-remove-btn {
  background: transparent;
  border: 1px solid var(--color-accent);
  color: var(--color-accent);
  font-family: inherit;
  font-size: 11px;
  text-transform: uppercase;
  cursor: pointer;
}

.slash-add-btn {
  padding: 7px 10px;
  width: 100%;
}

.slash-remove-btn {
  width: 26px;
  height: 26px;
  padding: 0;
}

.slash-add-btn:hover,
.slash-remove-btn:hover {
  background: var(--color-accent);
  color: var(--color-on-accent);
}

input[type='range'] {
  accent-color: var(--color-accent);
  cursor: pointer;
}

input[type='checkbox'] {
  cursor: pointer;
  width: 20px;
  height: 20px;
}

select {
  background: var(--color-settings-surface);
  color: var(--color-accent);
  border: 1px solid var(--color-accent);
  padding: 5px 8px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
}

select option {
  background: var(--color-settings-surface);
  color: var(--color-accent);
}

.clear-btn {
  width: 100%;
  padding: 12px;
  background: transparent;
  border: 2px solid var(--color-danger);
  color: var(--color-danger);
  font-family: inherit;
  font-weight: bold;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 10px;
}

.clear-btn:hover {
  background: var(--color-danger);
  color: var(--color-on-danger);
  box-shadow: 0 0 15px var(--color-danger);
}

.close-btn {
  width: 100%;
  padding: 15px;
  background: transparent;
  border: 2px solid var(--color-accent);
  color: var(--color-accent);
  font-family: inherit;
  font-weight: bold;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s;
  text-transform: uppercase;
  letter-spacing: 2px;
}

.close-btn:hover {
  background: var(--color-accent);
  color: var(--color-on-accent);
  box-shadow: 0 0 15px var(--color-accent);
}

h3 {
  color: var(--color-accent);
  text-transform: uppercase;
  letter-spacing: 1px;
}

label {
  text-transform: uppercase;
  font-size: 12px;
  letter-spacing: 1px;
}

.preview-btn {
  background: none;
  border: none;
  color: var(--color-accent);
  cursor: pointer;
  font-size: 16px;
  opacity: 0.6;
  transition: opacity 0.2s;
  padding: 2px;
}

.preview-btn:hover {
  opacity: 1;
}

.preview-toggle-btn {
  margin-top: 8px;
  width: 100%;
  display: block;
  padding: 8px 10px;
  background: transparent;
  border: 1px solid var(--color-accent);
  color: var(--color-accent);
  font-family: inherit;
  font-size: 11px;
  font-weight: bold;
  letter-spacing: 0.8px;
  cursor: pointer;
  text-transform: uppercase;
}

.preview-toggle-btn:hover:not(:disabled) {
  background: var(--color-accent);
  color: var(--color-on-accent);
  box-shadow: 0 0 10px var(--color-settings-accent-glow);
}

.preview-toggle-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.media-panel .setting-row.preview-action-row {
  justify-content: stretch;
}

.video-preview-wrap {
  margin-top: 10px;
  border: 1px solid var(--color-accent);
  background: var(--color-settings-video-preview-bg);
  width: min(100%, 360px);
  aspect-ratio: 16 / 9;
  overflow: hidden;
}

.video-preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform: scaleX(-1);
}

.video-preview-meta {
  margin-top: 8px;
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 11px;
  letter-spacing: 0.7px;
  color: var(--color-accent);
  text-transform: uppercase;
}

.effect-preview {
  position: fixed;
  inset: 0;
  background: var(--color-settings-effect-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 401;
  pointer-events: none;
}

.preview-text {
  font-size: 48px;
  font-weight: bold;
  text-transform: uppercase;
  font-family: 'Courier New', Courier, monospace;
  letter-spacing: 3px;
  text-align: center;
  color: var(--color-accent);
  min-height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.folder-btn {
  background: transparent;
  border: 1px solid var(--color-accent);
  color: var(--color-accent);
  padding: 6px 10px;
  font-family: inherit;
  font-size: 11px;
  letter-spacing: 0.8px;
  cursor: pointer;
  transition: all 0.2s;
  text-transform: uppercase;
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  flex-shrink: 0;
}

.folder-btn:hover {
  background: var(--color-accent);
  color: var(--color-on-accent);
  box-shadow: 0 0 10px var(--color-settings-accent-glow);
}
</style>
