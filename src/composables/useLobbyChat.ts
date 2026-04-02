import { ref, reactive, computed, watch } from 'vue';
import type { UserPresence, ChatMessage, AudioConfig, NetworkConfig } from '../types/chat';
import mqtt from 'mqtt';

const DEFAULT_AUDIO_CONFIG: AudioConfig = {
  dmEnabled: true,
  audioEnabled: true,
  volume: 0.5,
  autoAwayMinutes: 10,
  autoUpdatePulseMinutes: 30,
  soundpack: 'default',
  theme: 'retro-terminal',
  dmChatEffect: 'matrix',
  audioInputDeviceId: '',
  audioOutputDeviceId: '',
  videoInputDeviceId: ''
};

let activeAutoAwayListenerCleanup: (() => void) | null = null;

function normalizeAudioConfig(savedConfig?: Partial<AudioConfig> | null): AudioConfig {
  const normalized = {
    ...DEFAULT_AUDIO_CONFIG,
    ...(savedConfig || {}),
  };

  if (![0, 10, 30, 60].includes(normalized.autoAwayMinutes ?? 10)) {
    normalized.autoAwayMinutes = 10;
  }

  if (![0, 15, 30, 60, 120].includes(normalized.autoUpdatePulseMinutes ?? 30)) {
    normalized.autoUpdatePulseMinutes = 30;
  }

  return normalized;
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

  function buildPresencePayload(targetRoomId: string): UserPresence {
    return {
      username: username.value,
      dmAvailable: config.value.dmEnabled && !isAway.value,
      isTyping: lobbyTyping[targetRoomId] || false,
      isAway: isAway.value,
    };
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
          addMessageToLobby(targetRoomId, 'SYSTEM', `${user}${partMsg}`, true);
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
      addMessageToLobby(targetRoomId, 'SYSTEM', `${user}${joinMsg}`, true);
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
    if (!isConnected.value || isAway.value || delayMs <= 0) {
      clearAutoAwayTimer();
      return;
    }

    clearAutoAwayTimer();
    autoAwayTimer = setTimeout(() => {
      autoAwayTimer = null;
      setAway(true, 'auto');
    }, delayMs);
  }

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
    audio.value.numberStation = new Audio(getPublicAssetUrl(`sounds/${soundpack}/signal-station.mp3`));
    (audio.value.numberStation as HTMLAudioElement).loop = true;
    audio.value.alerts = {
      startup: new Audio(getPublicAssetUrl(`sounds/${soundpack}/startup-sound.mp3`)),
      system: new Audio(getPublicAssetUrl(`sounds/${soundpack}/system-sound.mp3`)),
      join: new Audio(getPublicAssetUrl(`sounds/${soundpack}/join-sound.mp3`)),
      part: new Audio(getPublicAssetUrl(`sounds/${soundpack}/part-sound.mp3`)),
      message: new Audio(getPublicAssetUrl(`sounds/${soundpack}/message-sound.mp3`)),
      shutdown: new Audio(getPublicAssetUrl(`sounds/${soundpack}/shutdown-sound.mp3`))
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

  function updateSettings() {
    localStorage.setItem('agent_settings', JSON.stringify(config.value));
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

  function getUserColor(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return `hsl(${Math.abs(hash % 360)}, 80%, 60%)`;
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
    const normalized = cleanMsg.trim().toLowerCase();

    if (normalized === '/away') {
      setAway(true, 'manual');
      return;
    }

    if (normalized === '/back') {
      setAway(false);
      return;
    }

    if (isAway.value) {
      setAway(false, 'system');
    }

    client.publish(getChatTopic(activeLobbyId.value), JSON.stringify({ u: username.value, m: cleanMsg }));
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

  function loadNetworkConfig() {
    const saved = localStorage.getItem('agent_network_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        networkConfig.value = {
          mqttServer: parsed.mqttServer || DEFAULT_MQTT_SERVER,
          defaultLobby: parsed.defaultLobby || DEFAULT_LOBBY
        };
        roomId.value = networkConfig.value.defaultLobby;
        activeLobbyId.value = networkConfig.value.defaultLobby;
      } catch {
        // Invalid JSON, use defaults
      }
    }
  }

  function setNetworkConfig(config: NetworkConfig) {
    networkConfig.value = config;
    roomId.value = config.defaultLobby;
    activeLobbyId.value = config.defaultLobby;
    localStorage.setItem('agent_network_config', JSON.stringify(config));
    startPresencePreview();
  }

  function loadSettings() {
    const saved = localStorage.getItem('agent_settings');
    if (saved) {
      try {
        config.value = normalizeAudioConfig(JSON.parse(saved));
      } catch {
        config.value = normalizeAudioConfig();
      }
    }
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
    localStorage.setItem('agent_settings', JSON.stringify(config.value));
  }

  const availableSoundpacks = ref<string[]>(['default']);

  async function loadAvailableSoundpacks() {
    try {
      const soundModules = import.meta.glob('/public/sounds/*/');
      const packs = Object.keys(soundModules)
        .map(path => path.replace('/public/sounds/', '').replace('/', ''))
        .filter(pack => pack.length > 0);
      if (packs.length > 0) {
        availableSoundpacks.value = packs;
      }
    } catch {
      availableSoundpacks.value = ['default'];
    }
  }

  loadNetworkConfig();
  loadSettings();
  loadAvailableSoundpacks();
  initAudio();
  startPresencePreview();

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
    getUserColor,
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
  };
}