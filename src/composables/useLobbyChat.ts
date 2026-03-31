import { ref, reactive, computed } from 'vue';
import mqtt from 'mqtt';

export interface UserPresence {
  username: string;
  dmAvailable: boolean;
  isTyping?: boolean;
}

export interface ChatMessage {
  user: string;
  message: string;
  isSystem?: boolean;
  effect?: string;
  duration?: number;
  messageId?: string;
}

export interface AudioConfig {
  audioEnabled: boolean;
  volume: number;
  dmEnabled: boolean;
  soundpack: string;
  theme: string;
  dmChatEffect: 'none' | 'matrix' | 'glitch' | 'flames';
  audioInputDeviceId: string;
  audioOutputDeviceId: string;
  videoInputDeviceId: string;
}

export interface NetworkConfig {
  mqttServer: string;
  defaultLobby: string;
}

const users = reactive<Record<string, UserPresence>>({});

export function useLobbyChat() {
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
  const username = ref<string>('');
  const roomId = ref<string>(networkConfig.value.defaultLobby);
  const messages = ref<ChatMessage[]>([]);
  
  const isConnected = ref(false);
  const authError = ref(false);

  let CHAT_TOPIC = '';
  let PRESENCE_TOPIC = '';
  let PRESENCE_OPTIONS: UserPresence | null = null;

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
    audio.value.numberStation = new Audio(`/sounds/${soundpack}/signal-station.mp3`);
    (audio.value.numberStation as HTMLAudioElement).loop = true;
    audio.value.alerts = {
      startup: new Audio(`/sounds/${soundpack}/startup-sound.mp3`),
      system: new Audio(`/sounds/${soundpack}/system-sound.mp3`),
      join: new Audio(`/sounds/${soundpack}/join-sound.mp3`),
      part: new Audio(`/sounds/${soundpack}/part-sound.mp3`),
      message: new Audio(`/sounds/${soundpack}/message-sound.mp3`),
      shutdown: new Audio(`/sounds/${soundpack}/shutdown-sound.mp3`)
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

    CHAT_TOPIC = `${roomId.value}_lobby/chat_global`;
    PRESENCE_TOPIC = `${roomId.value}_lobby/presence/`;
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
        const user = topic.split('/').pop()?.toUpperCase() || '';
        if (raw === '') {
          if (users[user]) {
            playAlert('part');
            addMessage('SYSTEM', `${user}${partMsg}`, true);
            delete users[user];
          }
        } else {
          if (!users[user]) {
            playAlert('join');
            addMessage('SYSTEM', `${user}${joinMsg}`, true);
            users[user] = JSON.parse(raw) as UserPresence;
          }
          else {
            users[user] = JSON.parse(raw) as UserPresence;
          }
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
    for (const key in users) {
      delete users[key];
    }
    client = null;
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

  return {
    username: computed(() => username.value),
    messages: computed(() => messages.value),
    users: users,
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
