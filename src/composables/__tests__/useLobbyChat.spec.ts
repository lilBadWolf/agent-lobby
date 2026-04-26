import { beforeEach, describe, expect, it, vi } from 'vitest';

class MockAudio {
  static instances: MockAudio[] = [];
  paused = true;
  volume = 1;
  currentTime = 0;
  loop = false;
  pause = vi.fn();
  play = vi.fn().mockResolvedValue(undefined);
  constructor(public src: string) {
    MockAudio.instances.push(this);
  }
}

type Handler = (...args: any[]) => void;

function createMockClient() {
  const handlers = new Map<string, Handler[]>();
  return {
    connected: true,
    on: vi.fn((event: string, cb: Handler) => {
      const existing = handlers.get(event) || [];
      existing.push(cb);
      handlers.set(event, existing);
    }),
    subscribe: vi.fn((_topic: string, _optsOrCb?: any, maybeCb?: any) => {
      const cb = typeof _optsOrCb === 'function' ? _optsOrCb : maybeCb;
      if (cb) cb(undefined);
    }),
    publish: vi.fn(),
    end: vi.fn(),
    removeAllListeners: vi.fn(() => handlers.clear()),
    emit(event: string, ...args: any[]) {
      (handlers.get(event) || []).forEach((cb) => cb(...args));
    },
  };
}

const { clients, connectMock } = vi.hoisted(() => {
  const hoistedClients: Array<ReturnType<typeof createMockClient>> = [];
  const hoistedConnect = vi.fn(() => {
    const c = createMockClient();
    hoistedClients.push(c);
    return c;
  });

  return {
    clients: hoistedClients,
    connectMock: hoistedConnect,
  };
});

vi.mock('mqtt', () => ({
  default: {
    connect: connectMock,
  },
}));

import { useLobbyChat } from '../useLobbyChat';

describe('useLobbyChat', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.useRealTimers();
    clients.length = 0;
    MockAudio.instances.length = 0;
    vi.stubGlobal('Audio', MockAudio as any);
    localStorage.clear();
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  });

  it('boots, connects, sends message, and disconnects cleanly', () => {
    const chat = useLobbyChat();

    chat.boot('ALPHA', 'Ops-Room!*');

    // First connect call is preview client, second is active client.
    const activeClient = clients[1];
    expect(activeClient).toBeTruthy();

    activeClient.emit('connect');

    expect(chat.isConnected.value).toBe(true);
    expect(chat.getRoomId()).toBe('opsroom');
    expect(chat.messages.value.some((m) => m.isSystem)).toBe(true);

    chat.sendMessage('hello world');
    expect(activeClient.publish).toHaveBeenCalledWith(
      'opsroom_v2/chat_global',
      expect.stringContaining('hello world')
    );

    chat.disconnect();

    expect(activeClient.end).toHaveBeenCalled();
    expect(chat.isConnected.value).toBe(false);
    expect(chat.username.value).toBe('');
  });

  it('handles away/back slash commands without publishing to chat topic', () => {
    const chat = useLobbyChat();

    chat.boot('BRAVO', 'intel');
    const activeClient = clients[1];
    activeClient.emit('connect');

    const callsBefore = activeClient.publish.mock.calls.length;

    chat.sendMessage('/away');
    expect(chat.isAway.value).toBe(true);

    chat.sendMessage('/back');
    expect(chat.isAway.value).toBe(false);

    const publishedChatCalls = activeClient.publish.mock.calls.filter((c: any[]) => c[0] === 'intel_v2/chat_global');
    expect(publishedChatCalls.length).toBe(0);
    expect(activeClient.publish.mock.calls.length).toBeGreaterThanOrEqual(callsBefore);
  });

  it('prevents boot when handle already exists in presence snapshot', () => {
    const chat = useLobbyChat();
    const previewClient = clients[0];

    previewClient.emit('connect');
    previewClient.emit(
      'message',
      'agent_lobby_v2/presence/ALPHA',
      {
        toString: () => JSON.stringify({
          username: 'ALPHA',
          dmAvailable: true,
          isTyping: false,
          isAway: false,
        }),
      }
    );

    chat.boot('ALPHA');

    expect(chat.authError.value).toBe(true);
    expect(clients.length).toBe(1);
  });

  it('persists network/audio settings and plays ambience', () => {
    const chat = useLobbyChat();

    chat.setNetworkConfig({
      mqttServer: 'wss://example.test/mqtt',
      defaultLobby: 'ops_room',
    });

    expect(chat.getRoomId()).toBe('ops_room');
    expect(localStorage.getItem('agent_network_config')).toContain('ops_room');

    chat.config.value.audioEnabled = true;
    chat.config.value.volume = 0.7;
    chat.config.value.customSlashCommands = [{ command: '/sig', text: 'copy/paste me' }];
    chat.updateSettings();

    expect(localStorage.getItem('agent_settings')).toContain('"volume":0.7');
    expect(localStorage.getItem('agent_settings')).toContain('"customSlashCommands"');
  });

  it('retries presence preview on error with cooldown state', () => {
    vi.useFakeTimers();
    const chat = useLobbyChat();

    const previewClient = clients[0];
    previewClient.emit('error', new Error('preview down'));

    expect(chat.presencePreviewStatus.value).toBe('cooldown');
    expect(chat.presencePreviewStatusMessage.value).toContain('RETRY 1/5');

    vi.advanceTimersByTime(30000);
    expect(clients.length).toBeGreaterThanOrEqual(2);
    vi.useRealTimers();
  });

  it('publishes presence updates for typing and away state changes', () => {
    const chat = useLobbyChat();

    chat.boot('CHARLIE', 'intel');
    const activeClient = clients[1];
    activeClient.emit('connect');

    activeClient.publish.mockClear();

    chat.setTyping(true);
    chat.setTyping(true); // no-op branch when unchanged
    chat.setTyping(false);
    chat.setAway(true);
    chat.toggleAway();

    const presenceCalls = activeClient.publish.mock.calls.filter((c: any[]) =>
      String(c[0]).startsWith('intel_v2/presence/')
    );
    expect(presenceCalls.length).toBe(4);
  });

  it('scrubs html and clears away state before publishing message', () => {
    const chat = useLobbyChat();

    chat.boot('DELTA', 'intel');
    const activeClient = clients[1];
    activeClient.emit('connect');
    activeClient.publish.mockClear();

    chat.setAway(true);
    chat.sendMessage('<b>Hello</b> <i>team</i>');

    expect(chat.isAway.value).toBe(false);

    const chatCall = activeClient.publish.mock.calls.find((c: any[]) => c[0] === 'intel_v2/chat_global');
    expect(chatCall).toBeTruthy();
    const payload = chatCall?.[1] as string;
    expect(payload).toContain('Hello team');
    expect(payload).not.toContain('<b>');
  });

  it('ignores malformed presence payloads from preview and active clients', () => {
    const chat = useLobbyChat();

    const previewClient = clients[0];
    previewClient.emit('connect');
    previewClient.emit('message', 'agent_lobby_v2/presence/BAD', {
      toString: () => '{not-json',
    });

    chat.boot('ECHO', 'intel');
    const activeClient = clients[1];
    activeClient.emit('connect');
    activeClient.emit('message', 'intel_lobby/presence/BAD', {
      toString: () => '{still-not-json',
    });

    expect(chat.authError.value).toBe(false);
    expect(chat.isConnected.value).toBe(true);
  });

  it('reinitializes audio objects when soundpack changes', () => {
    const chat = useLobbyChat();
    const before = MockAudio.instances.length;

    chat.setSoundpack('alt');

    expect(chat.config.value.soundpack).toBe('alt');
    expect(MockAudio.instances.length).toBeGreaterThan(before);
    expect(localStorage.getItem('agent_settings')).toContain('"soundpack":"alt"');
  });

  it('stops active audio before loading new soundpack assets', () => {
    const chat = useLobbyChat();
    const oldNumberStation = MockAudio.instances[0];
    oldNumberStation.paused = false;

    chat.setSoundpack('alt');

    expect(oldNumberStation.pause).toHaveBeenCalled();
    expect(oldNumberStation.currentTime).toBe(0);
    expect(chat.config.value.soundpack).toBe('alt');
  });

  it('loads saved network config and settings on initialization', () => {
    localStorage.setItem('agent_network_config', JSON.stringify({
      mqttServer: 'wss://saved-broker.example/mqtt',
      defaultLobby: 'saved_room',
    }));
    localStorage.setItem('agent_settings', JSON.stringify({
      dmEnabled: false,
      audioEnabled: false,
      volume: 0.2,
      soundpack: 'default',
      theme: 'light-blue',
      dmChatEffect: 'glitch',
      audioInputDeviceId: 'mic-x',
      audioOutputDeviceId: 'spk-y',
      videoInputDeviceId: 'cam-z',
      customSlashCommands: [
        { command: '/status', text: 'all green' },
        { command: '/away', text: 'blocked builtin' },
      ],
    }));

    const chat = useLobbyChat();

    expect(chat.getRoomId()).toBe('saved_room');
    expect(chat.networkConfig.value.mqttServer).toBe('wss://saved-broker.example/mqtt');
    expect(chat.config.value.theme).toBe('light-blue');
    expect(chat.config.value.dmEnabled).toBe(false);
    expect(chat.config.value.dmChatEffect).toBe('glitch');
    expect(chat.config.value.customSlashCommands).toEqual([{ command: '/status', text: 'all green' }]);
    expect(chat.config.value.autoAwayMinutes).toBe(10);
    expect(chat.config.value.autoUpdatePulseMinutes).toBe(30);
  });

  it('expands custom slash aliases and keeps built-ins guarded', () => {
    const chat = useLobbyChat();

    chat.boot('INDIA', 'intel');
    const activeClient = clients[1];
    activeClient.emit('connect');

    chat.config.value.customSlashCommands = [
      { command: '/sig', text: 'status green' },
      { command: '/away', text: 'must never override away' },
    ];

    chat.sendMessage('/sig');

    const aliasCall = activeClient.publish.mock.calls.find((c: any[]) => c[0] === 'intel_lobby/chat_global');
    expect(aliasCall?.[1]).toContain('status green');

    activeClient.publish.mockClear();
    chat.sendMessage('/away');
    expect(chat.isAway.value).toBe(true);
    const chatCallsAfterAway = activeClient.publish.mock.calls.filter((c: any[]) => c[0] === 'intel_lobby/chat_global');
    expect(chatCallsAfterAway.length).toBe(0);
  });

  it('starts auto-away on blur and cancels it on focus', () => {
    vi.useFakeTimers();
    const hasFocusSpy = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    const chat = useLobbyChat();

    chat.boot('FOXTROT', 'intel');
    const activeClient = clients[1];
    activeClient.emit('connect');

    chat.config.value.autoAwayMinutes = 10;
    chat.updateSettings();

    hasFocusSpy.mockReturnValue(false);
    window.dispatchEvent(new Event('blur'));

    vi.advanceTimersByTime(10 * 60 * 1000 - 1);
    expect(chat.isAway.value).toBe(false);

    window.dispatchEvent(new Event('focus'));
    hasFocusSpy.mockReturnValue(true);
    vi.advanceTimersByTime(1);
    expect(chat.isAway.value).toBe(false);

    hasFocusSpy.mockReturnValue(false);
    window.dispatchEvent(new Event('blur'));
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(chat.isAway.value).toBe(true);

    vi.useRealTimers();
  });

  it('does not auto-away while active media is playing or pinned', () => {
    vi.useFakeTimers();
    const hasFocusSpy = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    const chat = useLobbyChat();

    chat.boot('HOTEL', 'intel');
    const activeClient = clients[1];
    activeClient.emit('connect');

    chat.config.value.autoAwayMinutes = 10;
    chat.updateSettings();

    chat.setActiveMedia({
      label: 'Pinned watch',
      url: 'https://example.test/video',
      mediaType: 'video',
    });

    hasFocusSpy.mockReturnValue(false);
    window.dispatchEvent(new Event('blur'));

    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(chat.isAway.value).toBe(false);

    chat.setActiveMedia(null);
    vi.advanceTimersByTime(1);

    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(chat.isAway.value).toBe(true);

    vi.useRealTimers();
  });

  it('returns from auto-away when app regains focus', () => {
    vi.useFakeTimers();
    const hasFocusSpy = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    const chat = useLobbyChat();

    chat.boot('GOLF', 'intel');
    const activeClient = clients[1];
    activeClient.emit('connect');

    chat.config.value.autoAwayMinutes = 10;
    chat.updateSettings();

    hasFocusSpy.mockReturnValue(false);
    window.dispatchEvent(new Event('blur'));
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(chat.isAway.value).toBe(true);

    hasFocusSpy.mockReturnValue(true);
    window.dispatchEvent(new Event('focus'));
    expect(chat.isAway.value).toBe(false);

    vi.useRealTimers();
  });

  it('keeps manual away state when app regains focus', () => {
    vi.useFakeTimers();
    const hasFocusSpy = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    const chat = useLobbyChat();

    chat.boot('HOTEL', 'intel');
    const activeClient = clients[1];
    activeClient.emit('connect');

    chat.setAway(true, 'manual');
    expect(chat.isAway.value).toBe(true);

    hasFocusSpy.mockReturnValue(true);
    window.dispatchEvent(new Event('focus'));
    expect(chat.isAway.value).toBe(true);

    vi.useRealTimers();
  });

  it('enters terminal presence preview error state after max retries', () => {
    vi.useFakeTimers();
    const chat = useLobbyChat();

    // Exhaust retry budget: five cooldown retries, then one final error.
    for (let i = 0; i < 5; i++) {
      const currentPreviewClient = clients[clients.length - 1];
      currentPreviewClient.emit('error', new Error(`preview failure ${i + 1}`));
      vi.advanceTimersByTime(30000);
    }

    const lastPreviewClient = clients[clients.length - 1];
    lastPreviewClient.emit('error', new Error('preview terminal failure'));

    expect(chat.presencePreviewStatus.value).toBe('error');
    expect(chat.presencePreviewStatusMessage.value).toContain('MAX RETRIES REACHED');
    vi.useRealTimers();
  });
});
