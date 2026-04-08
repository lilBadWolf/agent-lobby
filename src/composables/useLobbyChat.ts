import { ref, reactive, computed, watch } from 'vue';
import type { ActiveMedia, UserPresence, ChatMessage, AudioConfig, NetworkConfig, SlashCommandAlias } from '../types/chat';
import mqtt from 'mqtt';
import { getPersistedValue, setPersistedValue } from './usePlatformStorage';

interface CustomAssetEntry {
  name: string;
  path: string;
}

interface CustomAssetsResult {
  themes: CustomAssetEntry[];
  soundpacks: CustomAssetEntry[];
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && typeof (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ === 'object';
}

const RESERVED_SLASH_COMMANDS = new Set([
  '/away',
  '/back',
  '/settings',
  '/quit',
  '/dm',
  '/join',
  '/lobby',
]);

const AUDIO_CONFIG_STORAGE_KEYS = {
  audioEnabled: 'agent_audio_enabled',
  volume: 'agent_volume',
  autoAwayMinutes: 'agent_auto_away_minutes',
  autoUpdatePulseMinutes: 'agent_auto_update_pulse_minutes',
  spectrumBarCount: 'agent_spectrum_bar_count',
  spectrumFftSize: 'agent_spectrum_fft_size',
  dmEnabled: 'agent_dm_enabled',
  mediaSharing: 'agent_media_sharing',
  agentAmpEnabled: 'agent_agent_amp_enabled',
  agentAmpDetached: 'agent_agent_amp_detached',
  scanlines: 'agent_scanlines',
  soundpack: 'agent_soundpack',
  theme: 'agent_theme',
  dmChatEffect: 'agent_dm_chat_effect',
  showJoinPartMessages: 'agent_show_join_part_messages',
  audioInputDeviceId: 'agent_audio_input_device_id',
  audioOutputDeviceId: 'agent_audio_output_device_id',
  videoInputDeviceId: 'agent_video_input_device_id',
  customSlashCommands: 'agent_custom_slash_commands',
} as const;

const DEFAULT_AUDIO_CONFIG: AudioConfig = {
  dmEnabled: true,
  mediaSharing: true,
  agentAmpEnabled: false,
  agentAmpDetached: false,
  scanlines: true,
  audioEnabled: true,
  volume: 0.5,
  autoAwayMinutes: 10,
  autoUpdatePulseMinutes: 30,
  spectrumBarCount: 64,
  spectrumFftSize: 2048,
  soundpack: 'default',
  theme: 'retro-terminal',
  dmChatEffect: 'codex',
  showJoinPartMessages: true,
  audioInputDeviceId: '',
  audioOutputDeviceId: '',
  videoInputDeviceId: '',
  customSlashCommands: [],
};

function normalizeThemeName(theme: unknown): string {
  if (typeof theme !== 'string') {
    return DEFAULT_AUDIO_CONFIG.theme;
  }

  const trimmedTheme = theme.trim();
  return trimmedTheme || DEFAULT_AUDIO_CONFIG.theme;
}

const PRESENCE_HEARTBEAT_INTERVAL_MS = 30000;

let activeAutoAwayListenerCleanup: (() => void) | null = null;
let presenceHeartbeatTimer: ReturnType<typeof setInterval> | null = null;

function normalizeAudioConfig(savedConfig?: Partial<AudioConfig> | null): AudioConfig {
  const normalized = {
    ...DEFAULT_AUDIO_CONFIG,
    ...(savedConfig || {}),
  };

  normalized.theme = normalizeThemeName((savedConfig as Partial<AudioConfig> | null)?.theme ?? normalized.theme);

  normalized.customSlashCommands = sanitizeCustomSlashCommands((savedConfig as Partial<AudioConfig> | null)?.customSlashCommands);

  if (typeof normalized.mediaSharing !== 'boolean') {
    normalized.mediaSharing = DEFAULT_AUDIO_CONFIG.mediaSharing;
  }

  if (typeof normalized.agentAmpEnabled !== 'boolean') {
    normalized.agentAmpEnabled = DEFAULT_AUDIO_CONFIG.agentAmpEnabled;
  }

  if (typeof normalized.agentAmpDetached !== 'boolean') {
    normalized.agentAmpDetached = DEFAULT_AUDIO_CONFIG.agentAmpDetached;
  }

  if (typeof normalized.scanlines !== 'boolean') {
    normalized.scanlines = DEFAULT_AUDIO_CONFIG.scanlines;
  }

  if (![0, 10, 30, 60].includes(normalized.autoAwayMinutes ?? 10)) {
    normalized.autoAwayMinutes = 10;
  }

  if (![0, 15, 30, 60, 120].includes(normalized.autoUpdatePulseMinutes ?? 30)) {
    normalized.autoUpdatePulseMinutes = 30;
  }

  if (![32, 48, 64, 96, 128].includes(normalized.spectrumBarCount ?? 64)) {
    normalized.spectrumBarCount = DEFAULT_AUDIO_CONFIG.spectrumBarCount;
  }

  if (![1024, 2048, 4096, 8192].includes(normalized.spectrumFftSize ?? 2048)) {
    normalized.spectrumFftSize = DEFAULT_AUDIO_CONFIG.spectrumFftSize;
  }

  if (typeof normalized.showJoinPartMessages !== 'boolean') {
    normalized.showJoinPartMessages = DEFAULT_AUDIO_CONFIG.showJoinPartMessages;
  }

  return normalized;
}

async function persistAudioConfig(nextConfig: AudioConfig): Promise<void> {
  await Promise.all([
    setPersistedValue(AUDIO_CONFIG_STORAGE_KEYS.audioEnabled, nextConfig.audioEnabled),
    setPersistedValue(AUDIO_CONFIG_STORAGE_KEYS.volume, nextConfig.volume),
    setPersistedValue(AUDIO_CONFIG_STORAGE_KEYS.autoAwayMinutes, nextConfig.autoAwayMinutes ?? DEFAULT_AUDIO_CONFIG.autoAwayMinutes),
    setPersistedValue(AUDIO_CONFIG_STORAGE_KEYS.autoUpdatePulseMinutes, nextConfig.autoUpdatePulseMinutes ?? DEFAULT_AUDIO_CONFIG.autoUpdatePulseMinutes),
    setPersistedValue(AUDIO_CONFIG_STORAGE_KEYS.spectrumBarCount, nextConfig.spectrumBarCount ?? DEFAULT_AUDIO_CONFIG.spectrumBarCount),
    setPersistedValue(AUDIO_CONFIG_STORAGE_KEYS.spectrumFftSize, nextConfig.spectrumFftSize ?? DEFAULT_AUDIO_CONFIG.spectrumFftSize),
    setPersistedValue(AUDIO_CONFIG_STORAGE_KEYS.dmEnabled, nextConfig.dmEnabled),
    setPersistedValue(AUDIO_CONFIG_STORAGE_KEYS.mediaSharing, nextConfig.mediaSharing),
    setPersistedValue(AUDIO_CONFIG_STORAGE_KEYS.agentAmpEnabled, nextConfig.agentAmpEnabled),
    setPersistedValue(AUDIO_CONFIG_STORAGE_KEYS.agentAmpDetached, nextConfig.agentAmpDetached ?? DEFAULT_AUDIO_CONFIG.agentAmpDetached),
    setPersistedValue(AUDIO_CONFIG_STORAGE_KEYS.scanlines, nextConfig.scanlines ?? DEFAULT_AUDIO_CONFIG.scanlines),
    setPersistedValue(AUDIO_CONFIG_STORAGE_KEYS.soundpack, nextConfig.soundpack),
    setPersistedValue(AUDIO_CONFIG_STORAGE_KEYS.theme, nextConfig.theme),
    setPersistedValue(AUDIO_CONFIG_STORAGE_KEYS.dmChatEffect, nextConfig.dmChatEffect),
    setPersistedValue(AUDIO_CONFIG_STORAGE_KEYS.showJoinPartMessages, nextConfig.showJoinPartMessages ?? DEFAULT_AUDIO_CONFIG.showJoinPartMessages),
    setPersistedValue(AUDIO_CONFIG_STORAGE_KEYS.audioInputDeviceId, nextConfig.audioInputDeviceId),
    setPersistedValue(AUDIO_CONFIG_STORAGE_KEYS.audioOutputDeviceId, nextConfig.audioOutputDeviceId),
    setPersistedValue(AUDIO_CONFIG_STORAGE_KEYS.videoInputDeviceId, nextConfig.videoInputDeviceId),
    setPersistedValue(AUDIO_CONFIG_STORAGE_KEYS.customSlashCommands, nextConfig.customSlashCommands ?? []),
  ]);
}

async function loadPersistedAudioConfig(): Promise<Partial<AudioConfig> | null> {
  const [
    audioEnabled,
    volume,
    autoAwayMinutes,
    autoUpdatePulseMinutes,
    spectrumBarCount,
    spectrumFftSize,
    dmEnabled,
    mediaSharing,
    agentAmpEnabled,
    agentAmpDetached,
    scanlines,
    soundpack,
    theme,
    dmChatEffect,
    showJoinPartMessages,
    audioInputDeviceId,
    audioOutputDeviceId,
    videoInputDeviceId,
    customSlashCommands,
  ] = await Promise.all([
    getPersistedValue<boolean>(AUDIO_CONFIG_STORAGE_KEYS.audioEnabled),
    getPersistedValue<number>(AUDIO_CONFIG_STORAGE_KEYS.volume),
    getPersistedValue<number>(AUDIO_CONFIG_STORAGE_KEYS.autoAwayMinutes),
    getPersistedValue<number>(AUDIO_CONFIG_STORAGE_KEYS.autoUpdatePulseMinutes),
    getPersistedValue<number>(AUDIO_CONFIG_STORAGE_KEYS.spectrumBarCount),
    getPersistedValue<number>(AUDIO_CONFIG_STORAGE_KEYS.spectrumFftSize),
    getPersistedValue<boolean>(AUDIO_CONFIG_STORAGE_KEYS.dmEnabled),
    getPersistedValue<boolean>(AUDIO_CONFIG_STORAGE_KEYS.mediaSharing),
    getPersistedValue<boolean>(AUDIO_CONFIG_STORAGE_KEYS.agentAmpEnabled),
    getPersistedValue<boolean>(AUDIO_CONFIG_STORAGE_KEYS.agentAmpDetached),
    getPersistedValue<boolean>(AUDIO_CONFIG_STORAGE_KEYS.scanlines),
    getPersistedValue<string>(AUDIO_CONFIG_STORAGE_KEYS.soundpack),
    getPersistedValue<string>(AUDIO_CONFIG_STORAGE_KEYS.theme),
    getPersistedValue<AudioConfig['dmChatEffect']>(AUDIO_CONFIG_STORAGE_KEYS.dmChatEffect),
    getPersistedValue<boolean>(AUDIO_CONFIG_STORAGE_KEYS.showJoinPartMessages),
    getPersistedValue<string>(AUDIO_CONFIG_STORAGE_KEYS.audioInputDeviceId),
    getPersistedValue<string>(AUDIO_CONFIG_STORAGE_KEYS.audioOutputDeviceId),
    getPersistedValue<string>(AUDIO_CONFIG_STORAGE_KEYS.videoInputDeviceId),
    getPersistedValue<SlashCommandAlias[]>(AUDIO_CONFIG_STORAGE_KEYS.customSlashCommands),
  ]);

  const saved: Partial<AudioConfig> = {};

  if (typeof audioEnabled === 'boolean') saved.audioEnabled = audioEnabled;
  if (typeof volume === 'number') saved.volume = volume;
  if (typeof autoAwayMinutes === 'number') saved.autoAwayMinutes = autoAwayMinutes;
  if (typeof autoUpdatePulseMinutes === 'number') saved.autoUpdatePulseMinutes = autoUpdatePulseMinutes;
  if (typeof spectrumBarCount === 'number') saved.spectrumBarCount = spectrumBarCount;
  if (typeof spectrumFftSize === 'number') saved.spectrumFftSize = spectrumFftSize;
  if (typeof dmEnabled === 'boolean') saved.dmEnabled = dmEnabled;
  if (typeof mediaSharing === 'boolean') saved.mediaSharing = mediaSharing;
  if (typeof agentAmpEnabled === 'boolean') {
    saved.agentAmpEnabled = agentAmpEnabled;
  }
  if (typeof agentAmpDetached === 'boolean') {
    saved.agentAmpDetached = agentAmpDetached;
  }
  if (typeof scanlines === 'boolean') {
    saved.scanlines = scanlines;
  }
  if (typeof soundpack === 'string') saved.soundpack = soundpack;
  if (typeof theme === 'string') saved.theme = theme;
  if (
    dmChatEffect === 'none' ||
    dmChatEffect === 'codex' ||
    dmChatEffect === 'glitch' ||
    dmChatEffect === 'flames' ||
    dmChatEffect === 'rust' ||
    dmChatEffect === 'pacman' ||
    dmChatEffect === 'mspacman' ||
    dmChatEffect === 'starmap' ||
    dmChatEffect === 'bubbles' ||
    dmChatEffect === 'smoke' ||
    dmChatEffect === 'inferno'
  ) {
    saved.dmChatEffect = dmChatEffect;
  }
  if (typeof showJoinPartMessages === 'boolean') saved.showJoinPartMessages = showJoinPartMessages;
  if (typeof audioInputDeviceId === 'string') saved.audioInputDeviceId = audioInputDeviceId;
  if (typeof audioOutputDeviceId === 'string') saved.audioOutputDeviceId = audioOutputDeviceId;
  if (typeof videoInputDeviceId === 'string') saved.videoInputDeviceId = videoInputDeviceId;
  if (customSlashCommands !== undefined) saved.customSlashCommands = sanitizeCustomSlashCommands(customSlashCommands);

  return Object.keys(saved).length > 0 ? saved : null;
}

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

function getPublicAssetUrl(path: string): string {
  const baseUrl = new URL(import.meta.env.BASE_URL, window.location.href);
  return new URL(path.replace(/^\//, ''), baseUrl).toString();
}

export function useLobbyChat() {
  type PresencePreviewStatus = 'idle' | 'connecting' | 'checking-users' | 'cooldown' | 'ready' | 'error';
  type JoinLobbyResult =
    | { ok: true; lobbyId: string }
    | { ok: false; reason: 'invalid' | 'duplicate' | 'disconnected' | 'username-taken' };
  type LeaveLobbyResult =
    | { ok: true; lobbyId: string }
    | { ok: false; reason: 'default' | 'missing' | 'last-lobby' | 'disconnected' };

  const PRESENCE_PREVIEW_RETRY_DELAY_MS = 30000;
  const PRESENCE_PREVIEW_MAX_RETRIES = 5;
  const LOBBY_JOIN_PRESENCE_PROBE_MS = 1200;

  const DEFAULT_MQTT_SERVER = 'wss://broker.emqx.io:8084/mqtt';
  const DEFAULT_LOBBY = 'spy_terminal';
  const sysMsg = 'NETWORK LINK STABLE. ENCRYPTION ACTIVE.';
  const partMsg = "'s SIGNAL TERMINATED";
  const joinMsg = ' IS RECEIVING';

  const networkConfig = ref<NetworkConfig>({
    mqttServer: DEFAULT_MQTT_SERVER,
    defaultLobby: DEFAULT_LOBBY
  });

  let client: mqtt.MqttClient | null = null;
  let previewClient: mqtt.MqttClient | null = null;
  const username = ref<string>('');
  const roomId = ref<string>(networkConfig.value.defaultLobby);
  const activeLobbyId = ref<string>(networkConfig.value.defaultLobby);
  const joinedLobbies = ref<string[]>([]);

  const messages = ref<ChatMessage[]>([]);
  const users = reactive<Record<string, UserPresence>>({});
  const previewUsers = reactive<Record<string, UserPresence>>({});

  const lobbyMessages = reactive<Record<string, ChatMessage[]>>({});
  const lobbyUsers = reactive<Record<string, Record<string, UserPresence>>>({});
  const lobbyUnread = reactive<Record<string, number>>({});
  const lobbyTyping = reactive<Record<string, boolean>>({});

  const isConnected = ref(false);
  const authError = ref(false);
  const isPresencePreviewReady = ref(false);
  const presencePreviewStatus = ref<PresencePreviewStatus>('idle');
  const presencePreviewError = ref('');
  const presencePreviewRetryAttempt = ref(0);
  const presencePreviewCooldownSeconds = ref(0);

  let presencePreviewRetryTimer: ReturnType<typeof setTimeout> | null = null;
  let presencePreviewCooldownTimer: ReturnType<typeof setInterval> | null = null;

  const config = ref<AudioConfig>(normalizeAudioConfig());
  const audio = ref<Record<string, HTMLAudioElement | Record<string, HTMLAudioElement>>>({});
  const customSoundpackPathByName = ref<Record<string, string>>({});
  let tauriCoreModulePromise: Promise<typeof import('@tauri-apps/api/core') | null> | null = null;
  let tauriConvertFileSrc: ((filePath: string) => string) | null = null;

  const isAway = ref(false);
  let awaySource: 'auto' | 'manual' | null = null;
  let autoAwayTimer: ReturnType<typeof setTimeout> | null = null;

  function normalizeLobbyId(rawLobbyId: string): string {
    return rawLobbyId.toLowerCase().replace(/[^a-z0-9_]/g, '');
  }

  function getChatTopic(targetRoomId: string): string {
    return `${targetRoomId}_lobby/chat_global`;
  }

  function getPresenceTopicPrefix(targetRoomId: string): string {
    return `${targetRoomId}_lobby/presence/`;
  }

  function parseRoomFromChatTopic(topic: string): string | null {
    const match = topic.match(/^([^/]+)_lobby\/chat_global$/);
    return match?.[1] || null;
  }

  function parsePresenceTopic(topic: string): { room: string; user: string } | null {
    const match = topic.match(/^([^/]+)_lobby\/presence\/([^/]+)$/);
    if (!match) {
      return null;
    }

    return {
      room: match[1],
      user: match[2].toUpperCase(),
    };
  }

  function clearUserRecord(target: Record<string, UserPresence>) {
    for (const key in target) {
      delete target[key];
    }
  }

  function clearMessagesRecord(target: Record<string, ChatMessage[]>) {
    for (const key in target) {
      delete target[key];
    }
  }

  function clearLobbyUsersRecord(target: Record<string, Record<string, UserPresence>>) {
    for (const key in target) {
      delete target[key];
    }
  }

  function clearUnreadRecord(target: Record<string, number>) {
    for (const key in target) {
      delete target[key];
    }
  }

  function clearTypingRecord(target: Record<string, boolean>) {
    for (const key in target) {
      delete target[key];
    }
  }

  function ensureLobbyState(targetRoomId: string) {
    if (!lobbyMessages[targetRoomId]) {
      lobbyMessages[targetRoomId] = [];
    }

    if (!lobbyUsers[targetRoomId]) {
      lobbyUsers[targetRoomId] = {};
    }

    if (typeof lobbyUnread[targetRoomId] !== 'number') {
      lobbyUnread[targetRoomId] = 0;
    }

    if (typeof lobbyTyping[targetRoomId] !== 'boolean') {
      lobbyTyping[targetRoomId] = false;
    }
  }

  function clearUsers() {
    clearUserRecord(users);
  }

  function syncActiveLobbyView() {
    ensureLobbyState(activeLobbyId.value);
    messages.value = lobbyMessages[activeLobbyId.value];

    clearUsers();
    Object.assign(users, lobbyUsers[activeLobbyId.value]);
  }

  function subscribeToLobby(targetRoomId: string) {
    if (!client) {
      return;
    }

    client.subscribe(getChatTopic(targetRoomId));
    client.subscribe(`${getPresenceTopicPrefix(targetRoomId)}#`);
  }

  const activeMedia = ref<ActiveMedia | null>(null);

  function buildPresencePayload(targetRoomId: string): UserPresence {
    const payload: UserPresence = {
      username: username.value,
      dmAvailable: config.value.dmEnabled && !isAway.value,
      isTyping: lobbyTyping[targetRoomId] || false,
      isAway: isAway.value,
      mediaSharing: config.value.mediaSharing,
    };

    if (config.value.mediaSharing && activeMedia.value) {
      payload.activeMedia = activeMedia.value;
    }

    return payload;
  }

  function publishPresenceForLobby(targetRoomId: string) {
    if (!client || !client.connected || !username.value) {
      return;
    }

    ensureLobbyState(targetRoomId);

    client.publish(
      `${getPresenceTopicPrefix(targetRoomId)}${username.value}`,
      JSON.stringify(buildPresencePayload(targetRoomId)),
      { retain: true }
    );
  }

  function publishPresence() {
    if (!client || !client.connected || !username.value) return;

    joinedLobbies.value.forEach((lobbyId) => {
      publishPresenceForLobby(lobbyId);
    });
  }

  function setActiveMedia(next: ActiveMedia | null) {
    activeMedia.value = next;
    if (isConnected.value) {
      publishPresence();
    }
  }

  function startPresenceHeartbeat() {
    stopPresenceHeartbeat();
    if (!isConnected.value || !client) {
      return;
    }

    presenceHeartbeatTimer = setInterval(() => {
      publishPresence();
    }, PRESENCE_HEARTBEAT_INTERVAL_MS);
  }

  function stopPresenceHeartbeat() {
    if (!presenceHeartbeatTimer) {
      return;
    }

    clearInterval(presenceHeartbeatTimer);
    presenceHeartbeatTimer = null;
  }

  async function probeLobbyHandleAvailability(targetRoomId: string, handle: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const normalizedHandle = handle.trim().toUpperCase();
      if (!normalizedHandle) {
        resolve(false);
        return;
      }

      const probeClient = mqtt.connect(networkConfig.value.mqttServer, {
        reconnectPeriod: 0,
      });

      let isResolved = false;
      let isHandleTaken = false;

      const finish = (available: boolean) => {
        if (isResolved) {
          return;
        }

        isResolved = true;
        clearTimeout(probeTimer);
        probeClient.removeAllListeners();
        probeClient.end(true);
        resolve(available);
      };

      const probeTimer = setTimeout(() => {
        finish(!isHandleTaken);
      }, LOBBY_JOIN_PRESENCE_PROBE_MS);

      probeClient.on('connect', () => {
        probeClient.subscribe(`${getPresenceTopicPrefix(targetRoomId)}#`, { qos: 1 }, (err) => {
          if (err) {
            finish(false);
          }
        });
      });

      probeClient.on('message', (topic, payload) => {
        const parsedTopic = parsePresenceTopic(topic);
        if (!parsedTopic || parsedTopic.room !== targetRoomId) {
          return;
        }

        if (payload.toString() === '') {
          return;
        }

        if (parsedTopic.user === normalizedHandle) {
          isHandleTaken = true;
          finish(false);
        }
      });

      probeClient.on('error', () => {
        finish(false);
      });

      probeClient.on('close', () => {
        if (!isResolved) {
          finish(!isHandleTaken);
        }
      });
    });
  }

  function addMessageToLobby(
    targetRoomId: string,
    user: string,
    message: string,
    isSystem = false,
    incrementUnread = false
  ) {
    ensureLobbyState(targetRoomId);
    lobbyMessages[targetRoomId].push({ user, message, isSystem });

    if (incrementUnread && targetRoomId !== activeLobbyId.value) {
      lobbyUnread[targetRoomId] = (lobbyUnread[targetRoomId] || 0) + 1;
    }

    if (targetRoomId === activeLobbyId.value) {
      syncActiveLobbyView();
    }
  }

  function addMessage(user: string, message: string, isSystem = false) {
    addMessageToLobby(activeLobbyId.value, user, message, isSystem);
  }

  function addSystemMessage(message: string) {
    addMessage('SYSTEM', message, true);
  }

  function handlePresenceMessage(topic: string, raw: string, { withAlerts }: { withAlerts: boolean }) {
    const parsedTopic = parsePresenceTopic(topic);
    if (!parsedTopic) {
      return;
    }

    const targetRoomId = parsedTopic.room;
    const user = parsedTopic.user;

    if (!joinedLobbies.value.includes(targetRoomId)) {
      return;
    }

    ensureLobbyState(targetRoomId);
    const roomUsers = lobbyUsers[targetRoomId];

    if (raw === '') {
      if (roomUsers[user]) {
        if (withAlerts) {
          playAlert('part');
          if (config.value.showJoinPartMessages) {
            addMessageToLobby(targetRoomId, 'SYSTEM', `${user}${partMsg}`, true);
          }
        }
        delete roomUsers[user];
        if (targetRoomId === activeLobbyId.value) {
          delete users[user];
        }
      }
      return;
    }

    const parsed = JSON.parse(raw) as UserPresence;
    if (!roomUsers[user] && withAlerts) {
      playAlert('join');
      if (config.value.showJoinPartMessages) {
        addMessageToLobby(targetRoomId, 'SYSTEM', `${user}${joinMsg}`, true);
      }
    }

    roomUsers[user] = parsed;
    if (targetRoomId === activeLobbyId.value) {
      users[user] = parsed;
    }
  }

  function clearPresencePreviewRetryTimers() {
    if (presencePreviewRetryTimer) {
      clearTimeout(presencePreviewRetryTimer);
      presencePreviewRetryTimer = null;
    }

    if (presencePreviewCooldownTimer) {
      clearInterval(presencePreviewCooldownTimer);
      presencePreviewCooldownTimer = null;
    }
  }

  function closePresencePreviewClient() {
    if (!previewClient) {
      return;
    }

    previewClient.removeAllListeners();
    previewClient.end(true);
    previewClient = null;
  }

  function stopPresencePreview() {
    clearPresencePreviewRetryTimers();
    closePresencePreviewClient();
    isPresencePreviewReady.value = false;
    presencePreviewStatus.value = 'idle';
    presencePreviewError.value = '';
    presencePreviewRetryAttempt.value = 0;
    presencePreviewCooldownSeconds.value = 0;
  }

  function schedulePresencePreviewRetry(reason: string) {
    if (isConnected.value) {
      return;
    }

    clearPresencePreviewRetryTimers();
    closePresencePreviewClient();

    isPresencePreviewReady.value = false;

    if (presencePreviewRetryAttempt.value >= PRESENCE_PREVIEW_MAX_RETRIES) {
      presencePreviewStatus.value = 'error';
      presencePreviewError.value = reason;
      presencePreviewCooldownSeconds.value = 0;
      return;
    }

    presencePreviewRetryAttempt.value += 1;
    presencePreviewStatus.value = 'cooldown';
    presencePreviewError.value = reason;
    presencePreviewCooldownSeconds.value = Math.floor(PRESENCE_PREVIEW_RETRY_DELAY_MS / 1000);

    presencePreviewCooldownTimer = setInterval(() => {
      presencePreviewCooldownSeconds.value = Math.max(0, presencePreviewCooldownSeconds.value - 1);
    }, 1000);

    presencePreviewRetryTimer = setTimeout(() => {
      clearPresencePreviewRetryTimers();
      void startPresencePreview({ isRetryAttempt: true });
    }, PRESENCE_PREVIEW_RETRY_DELAY_MS);
  }

  async function startPresencePreview({ isRetryAttempt = false }: { isRetryAttempt?: boolean } = {}) {
    if (isConnected.value) {
      return;
    }

    clearPresencePreviewRetryTimers();
    closePresencePreviewClient();

    if (!isRetryAttempt) {
      presencePreviewRetryAttempt.value = 0;
    }

    clearUserRecord(previewUsers);

    const previewRoom = roomId.value || networkConfig.value.defaultLobby;
    const previewPresenceTopic = getPresenceTopicPrefix(previewRoom);
    isPresencePreviewReady.value = false;
    presencePreviewStatus.value = 'connecting';
    presencePreviewError.value = '';
    presencePreviewCooldownSeconds.value = 0;

    previewClient = mqtt.connect(networkConfig.value.mqttServer, {
      reconnectPeriod: 0,
    });

    previewClient.on('connect', () => {
      presencePreviewStatus.value = 'checking-users';
      previewClient?.subscribe(previewPresenceTopic + '#', { qos: 1 }, (err) => {
        if (err) {
          schedulePresencePreviewRetry(err.message || 'Failed to subscribe to presence topic');
          return;
        }

        isPresencePreviewReady.value = true;
        presencePreviewStatus.value = 'ready';
        presencePreviewRetryAttempt.value = 0;
      });
    });

    previewClient.on('message', (topic, payload) => {
      const raw = payload.toString();
      try {
        const parsedTopic = parsePresenceTopic(topic);
        if (!parsedTopic || parsedTopic.room !== previewRoom) {
          return;
        }

        if (raw === '') {
          delete previewUsers[parsedTopic.user];
          return;
        }

        previewUsers[parsedTopic.user] = JSON.parse(raw) as UserPresence;
      } catch {
        // Ignore malformed presence payloads from third-party clients.
      }
    });

    previewClient.on('error', (err) => {
      schedulePresencePreviewRetry(err.message || 'Unable to reach MQTT server');
    });

    previewClient.on('close', () => {
      if (!isConnected.value && presencePreviewStatus.value !== 'cooldown' && presencePreviewStatus.value !== 'error') {
        schedulePresencePreviewRetry('Connection closed by server');
      }
    });
  }

  function clearAutoAwayTimer() {
    if (autoAwayTimer) {
      clearTimeout(autoAwayTimer);
      autoAwayTimer = null;
    }
  }

  function getAutoAwayDelayMs(): number {
    return (config.value.autoAwayMinutes ?? 0) * 60 * 1000;
  }

  function scheduleAutoAwayTimer() {
    const delayMs = getAutoAwayDelayMs();
    if (!isConnected.value || isAway.value || delayMs <= 0 || activeMedia.value) {
      clearAutoAwayTimer();
      return;
    }

    clearAutoAwayTimer();
    autoAwayTimer = setTimeout(() => {
      autoAwayTimer = null;
      setAway(true, 'auto');
    }, delayMs);
  }

  watch(
    () => activeMedia.value,
    (nextActiveMedia) => {
      if (nextActiveMedia) {
        clearAutoAwayTimer();
        return;
      }

      if (typeof document !== 'undefined' && !document.hasFocus() && isConnected.value && !isAway.value && getAutoAwayDelayMs() > 0) {
        scheduleAutoAwayTimer();
      }
    }
  );

  function setTyping(typing: boolean) {
    ensureLobbyState(activeLobbyId.value);
    const previousTyping = lobbyTyping[activeLobbyId.value] || false;
    if (previousTyping !== typing) {
      lobbyTyping[activeLobbyId.value] = typing;
      publishPresenceForLobby(activeLobbyId.value);
    }
  }

  function setAway(away: boolean, source: 'auto' | 'manual' | 'system' = 'system') {
    if (away) {
      clearAutoAwayTimer();
    }

    awaySource = away
      ? source === 'manual'
        ? 'manual'
        : source === 'auto'
          ? 'auto'
          : awaySource
      : null;

    if (isAway.value !== away) {
      isAway.value = away;
      publishPresence();
    }
  }

  function toggleAway() {
    if (!isAway.value) {
      setAway(true, 'manual');
      return;
    }

    setAway(false, 'manual');
  }

  function initAudio() {
    const soundpack = config.value.soundpack;

    const getSoundUrl = (fileName: string): string => {
      const customBasePath = customSoundpackPathByName.value[soundpack];
      if (!customBasePath) {
        return getPublicAssetUrl(`sounds/${soundpack}/${fileName}`);
      }

      if (!tauriConvertFileSrc) {
        return getPublicAssetUrl(`sounds/default/${fileName}`);
      }

      return toAssetAudioUrl(customBasePath, fileName, tauriConvertFileSrc);
    };

    audio.value.numberStation = new Audio(getSoundUrl('signal-station.mp3'));
    (audio.value.numberStation as HTMLAudioElement).loop = true;
    audio.value.alerts = {
      startup: new Audio(getSoundUrl('startup-sound.mp3')),
      system: new Audio(getSoundUrl('system-sound.mp3')),
      join: new Audio(getSoundUrl('join-sound.mp3')),
      part: new Audio(getSoundUrl('part-sound.mp3')),
      message: new Audio(getSoundUrl('message-sound.mp3')),
      shutdown: new Audio(getSoundUrl('shutdown-sound.mp3'))
    };
    applyAudioSettings();
  }

  function applyAudioSettings() {
    const vol = config.value.audioEnabled ? config.value.volume : 0;
    const numberStation = audio.value.numberStation as HTMLAudioElement;
    const wombatStation = audio.value.wombatStation as HTMLAudioElement;
    if (numberStation) numberStation.volume = vol;
    if (wombatStation) wombatStation.volume = vol;
    if (audio.value.alerts) {
      Object.values(audio.value.alerts).forEach((s: any) => {
        if (s && s.volume !== undefined) s.volume = vol;
      });
    }
  }

  async function updateSettings() {
    config.value = normalizeAudioConfig(config.value);

    try {
      await persistAudioConfig(config.value);
    } catch {
      // ignore storage errors
    }

    applyAudioSettings();
    publishPresence();
  }

  function playAlert(type: string) {
    if (config.value.audioEnabled && audio.value.alerts && (audio.value.alerts as any)[type]) {
      const alert = (audio.value.alerts as any)[type];
      alert.currentTime = 0;
      alert.play().catch(() => {});
    }
  }

  function scrub(html: string): string {
    const tmp = document.createElement('DIV');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  }

  function boot(handle: string, customRoomId?: string) {
    if (!handle) return;

    if (previewUsers[handle]) {
      authError.value = true;
      return;
    }

    username.value = handle;
    authError.value = false;

    const normalizedCustomLobbyId = customRoomId ? normalizeLobbyId(customRoomId) : '';
    const initialLobbyId = normalizedCustomLobbyId || networkConfig.value.defaultLobby;

    roomId.value = initialLobbyId;
    activeLobbyId.value = initialLobbyId;
    joinedLobbies.value = [initialLobbyId];
    clearMessagesRecord(lobbyMessages);
    clearLobbyUsersRecord(lobbyUsers);
    clearUnreadRecord(lobbyUnread);
    ensureLobbyState(initialLobbyId);
    syncActiveLobbyView();

    stopPresencePreview();

    const options = {
      will: {
        topic: `${getPresenceTopicPrefix(initialLobbyId)}${username.value}`,
        payload: '',
        retain: true,
        qos: 1 as const
      }
    };

    client = mqtt.connect(networkConfig.value.mqttServer, options);

    client.on('connect', () => {
      const numberStation = audio.value.numberStation as HTMLAudioElement;
      if (numberStation) {
        numberStation.pause();
        numberStation.currentTime = 0;
      }
      isConnected.value = true;
      playAlert('startup');
      addMessageToLobby(activeLobbyId.value, 'SYSTEM', sysMsg, true);

      joinedLobbies.value.forEach((lobbyId) => {
        subscribeToLobby(lobbyId);
        publishPresenceForLobby(lobbyId);
      });

      startPresenceHeartbeat();
    });

    client.on('close', () => {
      stopPresenceHeartbeat();
    });

    client.on('message', (topic, payload) => {
      const raw = payload.toString();

      if (topic.includes('_lobby/presence/')) {
        try {
          handlePresenceMessage(topic, raw, { withAlerts: true });
        } catch {
          // Ignore malformed presence payloads from third-party clients.
        }
        return;
      }

      const targetRoomId = parseRoomFromChatTopic(topic);
      if (targetRoomId && joinedLobbies.value.includes(targetRoomId)) {
        const data = JSON.parse(raw);
        const isInbound = data.u !== username.value;

        if (isInbound) {
          playAlert('message');
        }

        addMessageToLobby(targetRoomId, data.u, data.m, false, isInbound);
      }
    });
  }

  function clearMessages() {
    ensureLobbyState(activeLobbyId.value);
    lobbyMessages[activeLobbyId.value] = [];
    syncActiveLobbyView();
  }

  function sendMessage(msg: string) {
    if (!msg || !client || !isConnected.value) return;
    const cleanMsg = scrub(msg);
    const trimmed = cleanMsg.trim();
    const normalized = trimmed.toLowerCase();

    if (normalized === '/away') {
      setAway(true, 'manual');
      return;
    }

    if (normalized === '/back') {
      setAway(false);
      return;
    }

    let outboundMessage = cleanMsg;
    if (/^\/\S+$/.test(trimmed) && !RESERVED_SLASH_COMMANDS.has(normalized)) {
      const aliases = config.value.customSlashCommands ?? [];
      const matchingAlias = aliases.find((alias) => alias.command === normalized);
      if (matchingAlias) {
        outboundMessage = matchingAlias.text;
      }
    }

    if (isAway.value) {
      setAway(false, 'system');
    }

    client.publish(getChatTopic(activeLobbyId.value), JSON.stringify({ u: username.value, m: outboundMessage }));
  }

  function switchLobby(targetLobbyId: string): boolean {
    const normalizedLobbyId = normalizeLobbyId(targetLobbyId);
    if (!normalizedLobbyId || !joinedLobbies.value.includes(normalizedLobbyId)) {
      return false;
    }

    const previousLobbyId = activeLobbyId.value;
    if (previousLobbyId && previousLobbyId !== normalizedLobbyId && lobbyTyping[previousLobbyId]) {
      lobbyTyping[previousLobbyId] = false;
      publishPresenceForLobby(previousLobbyId);
    }

    activeLobbyId.value = normalizedLobbyId;
    roomId.value = normalizedLobbyId;
    lobbyUnread[normalizedLobbyId] = 0;
    syncActiveLobbyView();
    return true;
  }

  async function joinLobby(rawLobbyId: string): Promise<JoinLobbyResult> {
    const normalizedLobbyId = normalizeLobbyId(rawLobbyId);
    if (!normalizedLobbyId) {
      return { ok: false, reason: 'invalid' };
    }

    if (!isConnected.value || !client) {
      return { ok: false, reason: 'disconnected' };
    }

    if (joinedLobbies.value.includes(normalizedLobbyId)) {
      return { ok: false, reason: 'duplicate' };
    }

    const isHandleAvailable = await probeLobbyHandleAvailability(normalizedLobbyId, username.value);
    if (!isHandleAvailable) {
      return { ok: false, reason: 'username-taken' };
    }

    ensureLobbyState(normalizedLobbyId);
    joinedLobbies.value = [...joinedLobbies.value, normalizedLobbyId];
    subscribeToLobby(normalizedLobbyId);
    publishPresenceForLobby(normalizedLobbyId);
    switchLobby(normalizedLobbyId);
    return { ok: true, lobbyId: normalizedLobbyId };
  }

  function leaveLobby(rawLobbyId: string): LeaveLobbyResult {
    const normalizedLobbyId = normalizeLobbyId(rawLobbyId);
    const normalizedDefaultLobby = normalizeLobbyId(networkConfig.value.defaultLobby);

    if (!isConnected.value || !client) {
      return { ok: false, reason: 'disconnected' };
    }

    if (!joinedLobbies.value.includes(normalizedLobbyId)) {
      return { ok: false, reason: 'missing' };
    }

    if (normalizedLobbyId === normalizedDefaultLobby) {
      return { ok: false, reason: 'default' };
    }

    if (joinedLobbies.value.length <= 1) {
      return { ok: false, reason: 'last-lobby' };
    }

    client.unsubscribe(getChatTopic(normalizedLobbyId));
    client.unsubscribe(`${getPresenceTopicPrefix(normalizedLobbyId)}#`);
    client.publish(`${getPresenceTopicPrefix(normalizedLobbyId)}${username.value}`, '', { retain: true });

    joinedLobbies.value = joinedLobbies.value.filter((lobbyId) => lobbyId !== normalizedLobbyId);
    delete lobbyMessages[normalizedLobbyId];
    delete lobbyUsers[normalizedLobbyId];
    delete lobbyUnread[normalizedLobbyId];
    delete lobbyTyping[normalizedLobbyId];

    if (activeLobbyId.value === normalizedLobbyId) {
      const fallbackLobby = joinedLobbies.value.includes(normalizedDefaultLobby)
        ? normalizedDefaultLobby
        : joinedLobbies.value[0];
      if (fallbackLobby) {
        switchLobby(fallbackLobby);
      }
    }

    return { ok: true, lobbyId: normalizedLobbyId };
  }

  function disconnect() {
    clearAutoAwayTimer();
    stopPresenceHeartbeat();
    if (client && isConnected.value) {
      joinedLobbies.value.forEach((lobbyId) => {
        client!.publish(`${getPresenceTopicPrefix(lobbyId)}${username.value}`, '', { retain: true });
      });
      client.end();
    }
    isConnected.value = false;
    playAlert('shutdown');
    resetUI();
  }

  function resetUI() {
    stopPresenceHeartbeat();
    username.value = '';
    messages.value = [];
    joinedLobbies.value = [];
    activeLobbyId.value = networkConfig.value.defaultLobby;
    roomId.value = networkConfig.value.defaultLobby;
    isAway.value = false;
    awaySource = null;
    clearAutoAwayTimer();
    clearUsers();
    clearUserRecord(previewUsers);
    clearMessagesRecord(lobbyMessages);
    clearLobbyUsersRecord(lobbyUsers);
    clearUnreadRecord(lobbyUnread);
    clearTypingRecord(lobbyTyping);
    client = null;
    startPresencePreview();
  }

  async function loadNetworkConfig() {
    try {
      const saved = await getPersistedValue<NetworkConfig>('agent_network_config');
      if (saved?.mqttServer || saved?.defaultLobby) {
        networkConfig.value = {
          mqttServer: saved.mqttServer || DEFAULT_MQTT_SERVER,
          defaultLobby: saved.defaultLobby || DEFAULT_LOBBY,
        };
        roomId.value = networkConfig.value.defaultLobby;
        activeLobbyId.value = networkConfig.value.defaultLobby;
      }
    } catch {
      // ignore storage errors
    }
  }

  function setNetworkConfig(config: NetworkConfig) {
    networkConfig.value = config;
    roomId.value = config.defaultLobby;
    activeLobbyId.value = config.defaultLobby;
    void setPersistedValue('agent_network_config', config);
    startPresencePreview();
  }

  async function loadSettings() {
    try {
      const saved = await loadPersistedAudioConfig();
      config.value = normalizeAudioConfig(saved);
      return;
    } catch {
      // ignore storage errors
    }

    config.value = normalizeAudioConfig();
  }

  function tryPlayAmbience() {
    const numberStation = audio.value.numberStation as HTMLAudioElement;
    if (config.value.audioEnabled && numberStation) {
      numberStation.play().catch(() => {});
    }
  }

  function setSoundpack(newSoundpack: string) {
    config.value.soundpack = newSoundpack;
    initAudio();
    updateSettings();
  }

  const availableSoundpacks = ref<string[]>(['default']);

  function setAvailableSoundpackList(soundpackNames: string[]) {
    const unique = Array.from(new Set(soundpackNames.filter((name) => typeof name === 'string' && name.trim())));
    const sortedOthers = unique.filter((name) => name !== 'default').sort((a, b) => a.localeCompare(b));
    availableSoundpacks.value = ['default', ...sortedOthers];
  }

  async function getTauriCoreModule() {
    if (!isTauriRuntime()) {
      return null;
    }

    if (!tauriCoreModulePromise) {
      tauriCoreModulePromise = import('@tauri-apps/api/core').catch(() => null);
    }

    const tauriCore = await tauriCoreModulePromise;
    tauriConvertFileSrc = tauriCore?.convertFileSrc ?? null;
    return tauriCore;
  }

  function toAssetAudioUrl(basePath: string, fileName: string, convertFileSrc: (filePath: string) => string): string {
    const normalizedBase = basePath.replace(/[\\/]+$/, '');
    return convertFileSrc(`${normalizedBase}/${fileName}`);
  }

  async function loadAvailableSoundpacks() {
    const builtinPacks: string[] = ['default'];

    try {
      const soundModules = import.meta.glob('/public/sounds/*/');
      const packs = Object.keys(soundModules)
        .map(path => path.replace('/public/sounds/', '').replace('/', ''))
        .filter(pack => pack.length > 0);

      if (packs.length > 0) {
        builtinPacks.push(...packs);
      }
    } catch {
      // Keep default only.
    }

    const customSoundpacks: string[] = [];
    customSoundpackPathByName.value = {};

    try {
      const tauriCore = await getTauriCoreModule();
      if (tauriCore) {
        const assets = await tauriCore.invoke<CustomAssetsResult>('discover_custom_assets');
        const discovered = Array.isArray(assets?.soundpacks)
          ? assets.soundpacks.filter((entry): entry is CustomAssetEntry => !!entry && typeof entry.name === 'string' && typeof entry.path === 'string')
          : [];

        for (const pack of discovered) {
          const packName = pack.name.trim();
          const packPath = pack.path.trim();
          if (!packName || !packPath) {
            continue;
          }

          customSoundpacks.push(packName);
          customSoundpackPathByName.value[packName] = packPath;
        }
      }
    } catch {
      customSoundpackPathByName.value = {};
    }

    setAvailableSoundpackList([...builtinPacks, ...customSoundpacks]);

    if (!availableSoundpacks.value.includes(config.value.soundpack)) {
      config.value.soundpack = 'default';
    }
  }

  (async () => {
    await loadNetworkConfig();
    await loadSettings();
    await loadAvailableSoundpacks();
    initAudio();
    startPresencePreview();
  })();

  if (typeof window !== 'undefined') {
    activeAutoAwayListenerCleanup?.();

    const handleWindowBlur = () => {
      scheduleAutoAwayTimer();
    };

    const handleWindowFocus = () => {
      clearAutoAwayTimer();

      if (isAway.value && awaySource === 'auto') {
        setAway(false, 'system');
      }
    };

    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);

    activeAutoAwayListenerCleanup = () => {
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      clearAutoAwayTimer();
    };
  }

  watch(
    () => config.value.autoAwayMinutes ?? 0,
    (autoAwayMinutes) => {
      if (autoAwayMinutes <= 0) {
        clearAutoAwayTimer();
        return;
      }

      if (typeof document !== 'undefined' && !document.hasFocus() && isConnected.value && !isAway.value) {
        scheduleAutoAwayTimer();
      }
    }
  );

  watch(isConnected, (connected) => {
    if (!connected) {
      clearAutoAwayTimer();
      return;
    }

    if (typeof document !== 'undefined' && !document.hasFocus() && !isAway.value) {
      scheduleAutoAwayTimer();
    }
  });

  const onlineAgentCount = computed(() =>
    Object.values(isConnected.value ? users : previewUsers).filter((u) => Boolean(u?.username)).length
  );

  const lobbyTabs = computed(() => joinedLobbies.value.map((lobbyId) => ({
    id: lobbyId,
    label: lobbyId === normalizeLobbyId(networkConfig.value.defaultLobby) ? 'MAIN' : lobbyId,
    unreadCount: lobbyUnread[lobbyId] || 0,
    isDefault: lobbyId === normalizeLobbyId(networkConfig.value.defaultLobby),
  })));

  const presencePreviewStatusMessage = computed(() => {
    if (presencePreviewStatus.value === 'error') {
      return `CONNECTION ERROR: ${presencePreviewError.value || 'Unable to reach MQTT server'} (MAX RETRIES REACHED)`;
    }
    if (presencePreviewStatus.value === 'cooldown') {
      return `CONNECTION ERROR. RETRY ${presencePreviewRetryAttempt.value}/${PRESENCE_PREVIEW_MAX_RETRIES} IN ${presencePreviewCooldownSeconds.value}s`;
    }
    if (presencePreviewStatus.value === 'connecting') {
      return 'CONNECTING TO SERVER...';
    }
    if (presencePreviewStatus.value === 'checking-users') {
      return 'CHECKING ONLINE USERS...';
    }
    if (presencePreviewStatus.value === 'ready') {
      return `${onlineAgentCount.value} AGENTS ONLINE`;
    }
    return 'READY TO CONNECT';
  });

  return {
    username: computed(() => username.value),
    messages: computed(() => messages.value),
    users,
    onlineAgentCount,
    activeLobbyId: computed(() => activeLobbyId.value),
    joinedLobbies: computed(() => joinedLobbies.value),
    lobbyTabs,
    isPresencePreviewReady: computed(() => isPresencePreviewReady.value),
    presencePreviewStatus: computed(() => presencePreviewStatus.value),
    presencePreviewStatusMessage,
    isConnected: computed(() => isConnected.value),
    authError: computed(() => authError.value),
    config,
    networkConfig: computed(() => networkConfig.value),
    availableSoundpacks,
    boot,
    joinLobby,
    leaveLobby,
    switchLobby,
    sendMessage,
    disconnect,
    updateSettings,
    tryPlayAmbience,
    playAlert,
    setNetworkConfig,
    setSoundpack,
    clearMessages,
    addSystemMessage,
    getMqttClient: () => client,
    getRoomId: () => activeLobbyId.value,
    setTyping,
    setAway,
    toggleAway,
    isTyping: computed(() => lobbyTyping[activeLobbyId.value] || false),
    isAway,
    setActiveMedia,
  };
}