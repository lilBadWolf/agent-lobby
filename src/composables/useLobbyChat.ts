import { ref, reactive, computed } from 'vue';
import type { UserPresence, ChatMessage, AudioConfig, NetworkConfig } from '../types/chat';
import mqtt from 'mqtt';

const users = reactive<Record<string, UserPresence>>({});

function getPublicAssetUrl(path: string): string {
  const baseUrl = new URL(import.meta.env.BASE_URL, window.location.href);
  return new URL(path.replace(/^\//, ''), baseUrl).toString();
}

export function useLobbyChat() {
  type PresencePreviewStatus = 'idle' | 'connecting' | 'checking-users' | 'cooldown' | 'ready' | 'error';
  const PRESENCE_PREVIEW_RETRY_DELAY_MS = 30000;
  const PRESENCE_PREVIEW_MAX_RETRIES = 5;

  // Config defaults
  const DEFAULT_MQTT_SERVER = `wss://broker.emqx.io:8084/mqtt`;
  const DEFAULT_LOBBY = `spy_terminal`;
  const sysMsg = `NETWORK LINK STABLE. ENCRYPTION ACTIVE.`;
  const partMsg = `'s SIGNAL TERMINATED`;
  const joinMsg = ` IS RECEIVING`;

  // Network config state
  const networkConfig = ref<NetworkConfig>({
    mqttServer: DEFAULT_MQTT_SERVER,
    defaultLobby: DEFAULT_LOBBY
  });

  // State
  let client: mqtt.MqttClient | null = null;
  let previewClient: mqtt.MqttClient | null = null;
  const username = ref<string>('');
  const roomId = ref<string>(networkConfig.value.defaultLobby);
  const messages = ref<ChatMessage[]>([]);
  
  const isConnected = ref(false);
  const authError = ref(false);
  const isPresencePreviewReady = ref(false);
  const presencePreviewStatus = ref<PresencePreviewStatus>('idle');
  const presencePreviewError = ref('');
  const presencePreviewRetryAttempt = ref(0);
  const presencePreviewCooldownSeconds = ref(0);

  let presencePreviewRetryTimer: ReturnType<typeof setTimeout> | null = null;
  let presencePreviewCooldownTimer: ReturnType<typeof setInterval> | null = null;

  let CHAT_TOPIC = '';
  let PRESENCE_TOPIC = '';
  let PRESENCE_OPTIONS: UserPresence | null = null;

  function getPresenceTopicPrefix(targetRoomId: string): string {
    return `${targetRoomId}_lobby/presence/`;
  }

  function clearUsers() {
    for (const key in users) {
      delete users[key];
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

  function handlePresenceMessage(topic: string, raw: string, { withAlerts }: { withAlerts: boolean }) {
    if (!topic.startsWith(PRESENCE_TOPIC)) {
      return;
    }

    const user = topic.split('/').pop()?.toUpperCase() || '';
    if (!user) {
      return;
    }

    if (raw === '') {
      if (users[user]) {
        if (withAlerts) {
          playAlert('part');
          addMessage('SYSTEM', `${user}${partMsg}`, true);
        }
        delete users[user];
      }
      return;
    }

    const parsed = JSON.parse(raw) as UserPresence;
    if (!users[user] && withAlerts) {
      playAlert('join');
      addMessage('SYSTEM', `${user}${joinMsg}`, true);
    }
    users[user] = parsed;
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

    // Auth screen collisions are checked against this preloaded snapshot.
    clearUsers();

    const previewRoom = roomId.value || networkConfig.value.defaultLobby;
    CHAT_TOPIC = `${previewRoom}_lobby/chat_global`;
    PRESENCE_TOPIC = getPresenceTopicPrefix(previewRoom);
    isPresencePreviewReady.value = false;
    presencePreviewStatus.value = 'connecting';
    presencePreviewError.value = '';
    presencePreviewCooldownSeconds.value = 0;

    previewClient = mqtt.connect(networkConfig.value.mqttServer, {
      reconnectPeriod: 0,
    });

    previewClient.on('connect', () => {
      presencePreviewStatus.value = 'checking-users';
      previewClient?.subscribe(PRESENCE_TOPIC + '#', { qos: 1 }, (err) => {
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
        handlePresenceMessage(topic, raw, { withAlerts: false });
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

  const config = ref<AudioConfig>({
    dmEnabled: true,
    audioEnabled: true,
    volume: 0.5,
    soundpack: 'default',
    theme: 'retro-terminal',
    dmChatEffect: 'matrix',
    audioInputDeviceId: '',
    audioOutputDeviceId: '',
    videoInputDeviceId: ''
  });

  const audio = ref<Record<string, HTMLAudioElement | Record<string, HTMLAudioElement>>>({});


  const isTyping = ref(false);

  function buildPresencePayload(): UserPresence {
    return {
      username: username.value,
      dmAvailable: config.value.dmEnabled,
      isTyping: isTyping.value,
    };
  }

  function setTyping(typing: boolean) {
    if (isTyping.value !== typing) {
      isTyping.value = typing;
      publishPresence();
    }
  }

  function publishPresence() {
    if (!client || !client.connected || !username.value || !PRESENCE_TOPIC) return;
    client.publish(
      PRESENCE_TOPIC + username.value,
      JSON.stringify(buildPresencePayload()),
      { retain: true }
    );
  }

  // Initialize audio
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

  // Apply audio settings
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

  // Update settings
  function updateSettings() {
    localStorage.setItem('agent_settings', JSON.stringify(config.value));
    applyAudioSettings();
    publishPresence();
  }

  // Play alert sound
  function playAlert(type: string) {
    if (config.value.audioEnabled && audio.value.alerts && (audio.value.alerts as any)[type]) {
      const alert = (audio.value.alerts as any)[type];
      alert.currentTime = 0;
      alert.play().catch(() => {});
    }
  }

  // Scrub HTML
  function scrub(html: string): string {
    const tmp = document.createElement('DIV');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  }

  // Get user color
  function getUserColor(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return `hsl(${Math.abs(hash % 360)}, 80%, 60%)`;
  }

  // Boot connection
  function boot(handle: string, customRoomId?: string) {
    if (!handle) return;

    if (users[handle]) {
      authError.value = true;
      return;
    }

    username.value = handle;
    authError.value = false;

    if (customRoomId) {
      roomId.value = customRoomId.toLowerCase().replace(/[^a-z0-9_]/g, '');
    }

    stopPresencePreview();

    CHAT_TOPIC = `${roomId.value}_lobby/chat_global`;
    PRESENCE_TOPIC = getPresenceTopicPrefix(roomId.value);
    PRESENCE_OPTIONS = buildPresencePayload();

    const options = {
      will: { topic: PRESENCE_TOPIC + username.value, payload: '', retain: true, qos: 1 as const }
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
      addMessage('SYSTEM', sysMsg, true);
      client!.subscribe(CHAT_TOPIC);
      client!.subscribe(PRESENCE_TOPIC + '#');
      client!.publish(PRESENCE_TOPIC + username.value, JSON.stringify(PRESENCE_OPTIONS), { retain: true });
    });

    client.on('message', (topic, payload) => {
      const raw = payload.toString();
      console.log(raw);
      if (topic.startsWith(PRESENCE_TOPIC)) {
        try {
          handlePresenceMessage(topic, raw, { withAlerts: true });
        } catch {
          // Ignore malformed presence payloads from third-party clients.
        }
        return;
      }
      if (topic === CHAT_TOPIC) {
        const data = JSON.parse(raw);
        if (data.u !== username.value) playAlert('message');
        addMessage(data.u, data.m);
      }
    });
  }

  // Add message
  function addMessage(user: string, message: string, isSystem = false) {
    messages.value.push({ user, message, isSystem });
  }

  // Clear messages
  function clearMessages() {
    messages.value = [];
  }

  // Send message
  function sendMessage(msg: string) {
    if (!msg || !client || !isConnected.value) return;
    const cleanMsg = scrub(msg);
    client.publish(CHAT_TOPIC, JSON.stringify({ u: username.value, m: cleanMsg }));
  }

  // Disconnect
  function disconnect() {
    if (client && isConnected.value) {
      client.publish(PRESENCE_TOPIC + username.value, '', { retain: true });
      client.end();
    }
    isConnected.value = false;
    playAlert('shutdown');
    resetUI();
  }

  // Reset UI
  function resetUI() {
    username.value = '';
    messages.value = [];
    clearUsers();
    client = null;
    startPresencePreview();
  }

  // Load network config
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
      } catch {
        // Invalid JSON, use defaults
      }
    }
  }

  // Save network config
  function setNetworkConfig(config: NetworkConfig) {
    networkConfig.value = config;
    roomId.value = config.defaultLobby;
    localStorage.setItem('agent_network_config', JSON.stringify(config));
    startPresencePreview();
  }

  // Load settings
  function loadSettings() {
    const saved = localStorage.getItem('agent_settings');
    if (saved) {
      config.value = JSON.parse(saved);
    }
  }

  // Try play ambience
  function tryPlayAmbience() {
    const numberStation = audio.value.numberStation as HTMLAudioElement;
    if (config.value.audioEnabled && numberStation) {
      numberStation.play().catch(() => {});
    }
  }

  // Change soundpack and reload audio
  function setSoundpack(newSoundpack: string) {
    config.value.soundpack = newSoundpack;
    initAudio();
    localStorage.setItem('agent_settings', JSON.stringify(config.value));
  }

  // Get available soundpacks using import.meta.glob
  let availableSoundpacks = ref<string[]>(['default']);

  async function loadAvailableSoundpacks() {
    try {
      const soundModules = import.meta.glob('/public/sounds/*/');
      const packs = Object.keys(soundModules)
        .map(path => path.replace('/public/sounds/', '').replace('/', ''))
        .filter(pack => pack.length > 0);
      if (packs.length > 0) {
        availableSoundpacks.value = packs;
      }
    } catch (e) {
      // Fallback to default if glob fails
      availableSoundpacks.value = ['default'];
    }
  }

  // Initialize on load
  loadNetworkConfig();
  loadSettings();
  loadAvailableSoundpacks();
  initAudio();
  startPresencePreview();

  const onlineAgentCount = computed(() =>
    Object.values(users).filter((u) => Boolean(u?.username)).length
  );

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
    users: users,
    onlineAgentCount,
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
    sendMessage,
    disconnect,
    updateSettings,
    tryPlayAmbience,
    playAlert,
    setNetworkConfig,
    setSoundpack,
    clearMessages,
    getMqttClient: () => client,
    getRoomId: () => roomId.value,
    setTyping,
    isTyping,
  };
}
