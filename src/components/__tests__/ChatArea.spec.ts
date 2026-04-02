import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import ChatArea from '../ChatArea.vue';
import * as tauriOpener from '@tauri-apps/plugin-opener';

vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));

describe('ChatArea', () => {
  const setupYouTubeMock = () => {
    let playerState = 0;
    let currentTime = 12;
    let duration = 125;
    let volume = 70;

    const player = {
      playVideo: vi.fn(() => {
        playerState = 1;
      }),
      pauseVideo: vi.fn(() => {
        playerState = 0;
      }),
      seekTo: vi.fn((seconds: number) => {
        currentTime = seconds;
      }),
      setVolume: vi.fn((nextVolume: number) => {
        volume = nextVolume;
      }),
      getCurrentTime: vi.fn(() => currentTime),
      getDuration: vi.fn(() => duration),
      getVolume: vi.fn(() => volume),
      getPlayerState: vi.fn(() => playerState),
      destroy: vi.fn(),
    };

    const Player = vi.fn(function (this: unknown, _element: HTMLElement, options: any) {
      setTimeout(() => {
        options?.events?.onReady?.();
      }, 0);
      return player;
    });

    (window as any).YT = {
      Player,
      PlayerState: {
        PLAYING: 1,
      },
    };

    return { player };
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
      text: async () => '',
    }));
    vi.spyOn(window, 'open').mockImplementation(() => null);
    vi.spyOn(window, 'focus').mockImplementation(() => undefined);
  });

  afterEach(() => {
    delete (window as any).YT;
    delete (window as any).onYouTubeIframeAPIReady;
    delete (window as any).__TAURI_INTERNALS__;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('disables input when disconnected', () => {
    const wrapper = mount(ChatArea, {
      props: {
        messages: [],
        username: 'ALPHA',
        isConnected: false,
        users: {},
      },
    });

    expect(wrapper.find('#chat-msg').attributes('disabled')).toBeDefined();
  });

  it('emits send for outbound message when connected', async () => {
    const wrapper = mount(ChatArea, {
      props: {
        messages: [],
        username: 'ALPHA',
        isConnected: true,
        users: {},
      },
    });

    await wrapper.find('#chat-msg').setValue('hello lobby');
    await wrapper.find('.send-btn').trigger('click');

    expect(wrapper.emitted('send')?.[0]).toEqual(['hello lobby']);
  });

  it('does not emit send for blank input', async () => {
    const wrapper = mount(ChatArea, {
      props: {
        messages: [],
        username: 'ALPHA',
        isConnected: true,
        users: {},
      },
    });

    await wrapper.find('#chat-msg').setValue('   ');
    await wrapper.find('.send-btn').trigger('click');

    expect(wrapper.emitted('send')).toBeUndefined();
  });

  it('renders mention highlight and external link, and opens link in browser fallback', async () => {
    const wrapper = mount(ChatArea, {
      props: {
        messages: [
          { user: 'BRAVO', message: 'Ping @ALPHA https://example.com/report' },
        ],
        username: 'ALPHA',
        isConnected: true,
        users: {},
      },
    });

    await vi.runAllTimersAsync();

    expect(wrapper.find('.mention-highlight').text()).toBe('@ALPHA');
    const link = wrapper.find('a.chat-link');
    expect(link.exists()).toBe(true);

    await link.trigger('click');
    expect(window.open).toHaveBeenCalledWith('https://example.com/report', '_blank', 'noopener,noreferrer');
  });

  it('emits typing true and false after debounce window', async () => {
    const wrapper = mount(ChatArea, {
      props: {
        messages: [],
        username: 'ALPHA',
        isConnected: true,
        users: {},
      },
    });

    const input = wrapper.find('#chat-msg');
    await input.setValue('typing now');

    expect(wrapper.emitted('typing')?.[0]).toEqual([true]);
    vi.advanceTimersByTime(2100);
    expect(wrapper.emitted('typing')?.slice(-1)?.[0]).toEqual([false]);
  });

  it('sends message from Enter key when no suggestions are open', async () => {
    const wrapper = mount(ChatArea, {
      props: {
        messages: [],
        username: 'ALPHA',
        isConnected: true,
        users: {},
      },
    });

    const input = wrapper.find('#chat-msg');
    await input.setValue('keyboard send');
    await input.trigger('keydown', { key: 'Enter' });

    expect(wrapper.emitted('send')?.slice(-1)?.[0]).toEqual(['keyboard send']);
  });

  it('applies mention request into input when connected', async () => {
    const wrapper = mount(ChatArea, {
      props: {
        messages: [],
        username: 'ALPHA',
        isConnected: true,
        users: {
          BRAVO: { username: 'BRAVO', dmAvailable: true },
        },
        mentionRequest: null,
      },
    });

    await wrapper.setProps({ mentionRequest: { username: 'BRAVO', nonce: 1 } });
    await vi.runAllTimersAsync();

    expect((wrapper.find('#chat-msg').element as HTMLInputElement).value).toContain('@BRAVO ');
  });

  it('ignores mention request when disconnected', async () => {
    const wrapper = mount(ChatArea, {
      props: {
        messages: [],
        username: 'ALPHA',
        isConnected: false,
        users: {
          BRAVO: { username: 'BRAVO', dmAvailable: true },
        },
        mentionRequest: null,
      },
    });

    await wrapper.setProps({ mentionRequest: { username: 'BRAVO', nonce: 2 } });
    await vi.runAllTimersAsync();

    expect((wrapper.find('#chat-msg').element as HTMLInputElement).value).toBe('');
  });

  it('supports emoji autocomplete selection from keyboard', async () => {
    const wrapper = mount(ChatArea, {
      props: {
        messages: [],
        username: 'ALPHA',
        isConnected: true,
        users: {},
      },
    });

    const input = wrapper.find('#chat-msg');
    await input.setValue(':smil');
    expect(wrapper.findAll('.emoji-item').length).toBeGreaterThan(0);

    await input.trigger('keydown', { key: 'Enter' });
    await nextTick();

    const value = (input.element as HTMLInputElement).value;
    expect(value).not.toContain(':smil');
    expect(wrapper.findAll('.emoji-item')).toHaveLength(0);
  });

  it('supports mention autocomplete selection from keyboard', async () => {
    const wrapper = mount(ChatArea, {
      props: {
        messages: [],
        username: 'ALPHA',
        isConnected: true,
        users: {
          BRAVO: { username: 'BRAVO', dmAvailable: true },
          CHARLIE: { username: 'CHARLIE', dmAvailable: true },
        },
      },
    });

    const input = wrapper.find('#chat-msg');
    await input.setValue('@br');
    expect(wrapper.findAll('.emoji-item').length).toBeGreaterThan(0);

    await input.trigger('keydown', { key: 'Enter' });
    await nextTick();

    expect((input.element as HTMLInputElement).value).toContain('@BRAVO ');
  });

  it('supports keyboard navigation for mention suggestions and closes with escape', async () => {
    const wrapper = mount(ChatArea, {
      props: {
        messages: [],
        username: 'ALPHA',
        isConnected: true,
        users: {
          BRAVO: { username: 'BRAVO', dmAvailable: true },
          BETA: { username: 'BETA', dmAvailable: true },
          BLAZE: { username: 'BLAZE', dmAvailable: true },
        },
      },
    });

    const input = wrapper.find('#chat-msg');
    await input.setValue('@b');

    await input.trigger('keydown', { key: 'ArrowDown' });
    await nextTick();
    const activeAfterDown = wrapper.findAll('.emoji-item.active');
    expect(activeAfterDown).toHaveLength(1);
    expect(activeAfterDown[0].text()).toContain('BETA');

    await input.trigger('keydown', { key: 'ArrowUp' });
    await nextTick();
    const activeAfterUp = wrapper.findAll('.emoji-item.active');
    expect(activeAfterUp).toHaveLength(1);
    expect(activeAfterUp[0].text()).toContain('BRAVO');

    await input.trigger('keydown', { key: 'Escape' });
    await nextTick();
    expect(wrapper.findAll('.emoji-item')).toHaveLength(0);
  });

  it('renders external link title from fetched html metadata', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url === 'https://example.com/article') {
        return {
          ok: true,
          text: async () => '<html><head><title>  Fresh News  </title></head><body></body></html>',
        };
      }
      return {
        ok: false,
        text: async () => '',
      };
    }));

    const wrapper = mount(ChatArea, {
      props: {
        messages: [
          { user: 'BRAVO', message: 'Read this https://example.com/article' },
        ],
        username: 'ALPHA',
        isConnected: true,
        users: {},
      },
    });

    await vi.runAllTimersAsync();
    await nextTick();

    const link = wrapper.find('a.chat-link');
    expect(link.exists()).toBe(true);
    expect(link.text()).toBe('Fresh News');
  });

  it('falls back to jina mirror title when direct fetch does not provide one', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url === 'https://example.com/no-title') {
        return {
          ok: true,
          text: async () => '<html><head></head><body>No title</body></html>',
        };
      }
      if (url === 'https://r.jina.ai/http://example.com/no-title') {
        return {
          ok: true,
          text: async () => 'Title: Mirrored Headline',
        };
      }
      return {
        ok: false,
        text: async () => '',
      };
    }));

    const wrapper = mount(ChatArea, {
      props: {
        messages: [
          { user: 'BRAVO', message: 'alt title https://example.com/no-title' },
        ],
        username: 'ALPHA',
        isConnected: true,
        users: {},
      },
    });

    await vi.runAllTimersAsync();
    await nextTick();

    const link = wrapper.find('a.chat-link');
    expect(link.exists()).toBe(true);
    expect(link.text()).toBe('Mirrored Headline');
  });

  it('falls back to raw url label when direct and jina title fetches fail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network blocked');
    }));

    const wrapper = mount(ChatArea, {
      props: {
        messages: [
          { user: 'BRAVO', message: 'fallback label https://example.com/raw-link' },
        ],
        username: 'ALPHA',
        isConnected: true,
        users: {},
      },
    });

    await vi.runAllTimersAsync();
    await nextTick();

    const link = wrapper.find('a.chat-link');
    expect(link.exists()).toBe(true);
    expect(link.text()).toBe('https://example.com/raw-link');
  });

  it('renders large emoji style for emoji-only message', () => {
    const wrapper = mount(ChatArea, {
      props: {
        messages: [
          { user: 'BRAVO', message: '😀😀' },
        ],
        username: 'ALPHA',
        isConnected: true,
        users: {},
      },
    });

    expect(wrapper.find('.text.large-emoji').exists()).toBe(true);
  });

  it('strips CSS-like blocks from rendered message text', () => {
    const wrapper = mount(ChatArea, {
      props: {
        messages: [
          { user: 'BRAVO', message: 'hello .x{color:red} world' },
        ],
        username: 'ALPHA',
        isConnected: true,
        users: {},
      },
    });

    expect(wrapper.text()).toContain('hello');
    expect(wrapper.text()).toContain('world');
    expect(wrapper.text()).not.toContain('.x{color:red}');
  });

  it('removes loaded image URL text from rendered message body', async () => {
    const imageUrl = 'https://cdn.example.com/test.png';
    const wrapper = mount(ChatArea, {
      props: {
        messages: [
          { user: 'BRAVO', message: `look ${imageUrl}` },
        ],
        username: 'ALPHA',
        isConnected: true,
        users: {},
      },
    });

    await vi.runAllTimersAsync();

    const image = wrapper.find('img.embedded-image');
    expect(image.exists()).toBe(true);
    await image.trigger('load');
    await nextTick();

    expect(wrapper.text()).toContain('look');
    expect(wrapper.text()).not.toContain(imageUrl);
  });

  it('shows image fallback text when image load fails', async () => {
    const imageUrl = 'https://cdn.example.com/fail.png';
    const wrapper = mount(ChatArea, {
      props: {
        messages: [
          { user: 'BRAVO', message: `broken ${imageUrl}` },
        ],
        username: 'ALPHA',
        isConnected: true,
        users: {},
      },
    });

    await vi.runAllTimersAsync();
    const image = wrapper.find('img.embedded-image');
    expect(image.exists()).toBe(true);

    await image.trigger('error');
    await nextTick();

    expect(wrapper.find('.image-fallback').text()).toContain(imageUrl);
  });

  it('renders youtube fallback when extracted youtube url has no parsed video id', () => {
    const wrapper = mount(ChatArea, {
      props: {
        messages: [
          { user: 'BRAVO', message: 'maybe video https://www.youtube.com/watch?v=ABCDEFGHIJK' },
        ],
        username: 'ALPHA',
        isConnected: true,
        users: {},
      },
    });

    const fallback = wrapper.find('.video-fallback');
    expect(fallback.exists()).toBe(true);
    expect(fallback.text()).toBe('https://www.youtube.com/watch?v=ABCDEFGHIJK');
  });

  it('initializes youtube player and supports play, pause, seek, volume, and teardown', async () => {
    const { player } = setupYouTubeMock();

    const wrapper = mount(ChatArea, {
      props: {
        messages: [
          { user: 'BRAVO', message: 'clip https://youtu.be/AbCdEfGhI12' },
        ],
        username: 'ALPHA',
        isConnected: true,
        users: {},
      },
    });

    await nextTick();
    vi.advanceTimersByTime(400);
    await nextTick();

    const playPauseButton = wrapper.findAll('button.video-control-btn')[0];
    await playPauseButton.trigger('click');
    expect(player.playVideo).toHaveBeenCalled();

    vi.advanceTimersByTime(400);
    await nextTick();

    await wrapper.findAll('button.video-control-btn')[0].trigger('click');
    expect(player.pauseVideo).toHaveBeenCalled();

    const progressInput = wrapper.find('input.video-progress');
    await progressInput.setValue('33');
    expect(player.seekTo).toHaveBeenCalledWith(33, true);

    const volumeInput = wrapper.find('input.video-volume');
    await volumeInput.setValue('45');
    expect(player.setVolume).toHaveBeenCalledWith(45);

    wrapper.unmount();
    expect(player.destroy).toHaveBeenCalled();
  });

  it('handles youtube fullscreen enter and exit from custom control button', async () => {
    setupYouTubeMock();

    const wrapper = mount(ChatArea, {
      props: {
        messages: [
          { user: 'BRAVO', message: 'clip https://youtu.be/AbCdEfGhI12' },
        ],
        username: 'ALPHA',
        isConnected: true,
        users: {},
      },
    });

    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      writable: true,
      value: null,
    });

    const exitFullscreen = vi.fn(async () => {
      Object.defineProperty(document, 'fullscreenElement', {
        configurable: true,
        writable: true,
        value: null,
      });
      document.dispatchEvent(new Event('fullscreenchange'));
    });

    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      writable: true,
      value: exitFullscreen,
    });

    await nextTick();
    vi.advanceTimersByTime(400);
    await nextTick();

    const shell = wrapper.find('.video-player-shell').element as HTMLElement & { requestFullscreen?: () => Promise<void> };
    const requestFullscreen = vi.fn(async () => {
      Object.defineProperty(document, 'fullscreenElement', {
        configurable: true,
        writable: true,
        value: shell,
      });
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    shell.requestFullscreen = requestFullscreen;

    const fullButton = wrapper.findAll('button.video-control-btn').find((btn) => btn.text() === 'FULL');
    expect(fullButton).toBeTruthy();
    await fullButton!.trigger('click');
    expect(requestFullscreen).toHaveBeenCalled();

    await nextTick();
    const exitButton = wrapper.findAll('button.video-control-btn').find((btn) => btn.text() === 'EXIT');
    expect(exitButton).toBeTruthy();
    await exitButton!.trigger('click');
    expect(exitFullscreen).toHaveBeenCalled();
  });

  it('pins a youtube embed to the top panel and unpins it', async () => {
    const { player } = setupYouTubeMock();

    const wrapper = mount(ChatArea, {
      props: {
        messages: [
          { user: 'BRAVO', message: 'clip https://youtu.be/AbCdEfGhI12' },
        ],
        username: 'ALPHA',
        isConnected: true,
        users: {},
      },
    });

    await nextTick();
    vi.advanceTimersByTime(400);
    await nextTick();

    const feedDetails = wrapper.find('details.video-expandable');
    (feedDetails.element as HTMLDetailsElement).open = true;
    await feedDetails.trigger('toggle');
    await nextTick();

    const pinButton = wrapper.find('button.video-pin-btn');
    expect(pinButton.exists()).toBe(true);
    expect(pinButton.text()).toBe('PIN');

    await pinButton.trigger('click');
    await nextTick();
    vi.advanceTimersByTime(10);
    await nextTick();

    expect(wrapper.find('.pinned-video-panel').exists()).toBe(true);
    expect(wrapper.find('.pinned-video-title').text()).toContain('PINNED:');
    expect(wrapper.find('button.video-pin-btn').attributes('aria-pressed')).toBe('true');
  expect((wrapper.find('details.video-expandable').element as HTMLDetailsElement).open).toBe(false);
    expect(player.playVideo).toHaveBeenCalled();

    await wrapper.find('.pinned-video-header .video-control-btn').trigger('click');
    await nextTick();

    expect(wrapper.find('.pinned-video-panel').exists()).toBe(false);
    expect(wrapper.find('button.video-pin-btn').attributes('aria-pressed')).toBe('false');
  });

  it('toggles pin button label between pin and unpin states', async () => {
    setupYouTubeMock();

    const wrapper = mount(ChatArea, {
      props: {
        messages: [
          { user: 'BRAVO', message: 'clip https://youtu.be/AbCdEfGhI12' },
        ],
        username: 'ALPHA',
        isConnected: true,
        users: {},
      },
    });

    await nextTick();
    vi.advanceTimersByTime(400);
    await nextTick();

    const pinButton = wrapper.find('button.video-pin-btn');
    expect(pinButton.text()).toBe('PIN');

    await pinButton.trigger('click');
    await nextTick();
    expect(wrapper.find('button.video-pin-btn').text()).toBe('UNPIN');

    await wrapper.find('button.video-pin-btn').trigger('click');
    await nextTick();
    expect(wrapper.find('button.video-pin-btn').text()).toBe('PIN');
  });

  it('starts pinned video at a smaller default height', async () => {
    setupYouTubeMock();

    const wrapper = mount(ChatArea, {
      attachTo: document.body,
      props: {
        messages: [{ user: 'BRAVO', message: 'clip https://youtu.be/AbCdEfGhI12' }],
        username: 'ALPHA',
        isConnected: true,
        users: {},
      },
    });

    await nextTick();
    vi.advanceTimersByTime(400);
    await nextTick();

    await wrapper.find('button.video-pin-btn').trigger('click');
    await nextTick();

    const pinnedShell = wrapper.find('.pinned-video-shell');
    expect(pinnedShell.exists()).toBe(true);
    expect(pinnedShell.attributes('style')).toContain('--pinned-video-height: 190px');
  });

  it('resizes pinned video with drag and clamps to preserve chat visibility', async () => {
    setupYouTubeMock();

    const wrapper = mount(ChatArea, {
      attachTo: document.body,
      props: {
        messages: [{ user: 'BRAVO', message: 'clip https://youtu.be/AbCdEfGhI12' }],
        username: 'ALPHA',
        isConnected: true,
        users: {},
      },
    });

    await nextTick();
    vi.advanceTimersByTime(400);
    await nextTick();

    const chatArea = wrapper.find('#chat-area').element as HTMLElement;
    Object.defineProperty(chatArea, 'clientHeight', {
      configurable: true,
      get: () => 500,
    });

    await wrapper.find('button.video-pin-btn').trigger('click');
    await nextTick();

    const handle = wrapper.find('.pinned-video-divider');
    expect(handle.exists()).toBe(true);

    await handle.trigger('mousedown', { clientY: 100 });
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 500 }));
    await nextTick();

    const pinnedShell = wrapper.find('.pinned-video-shell');
    // 500px chat area => max pinned height is clamped to 320px.
    expect(pinnedShell.attributes('style')).toContain('--pinned-video-height: 320px');

    window.dispatchEvent(new MouseEvent('mousemove', { clientY: -200 }));
    await nextTick();
    expect(pinnedShell.attributes('style')).toContain('--pinned-video-height: 140px');

    window.dispatchEvent(new MouseEvent('mouseup'));
  });

  it('auto-advances pinned video to the next chat video when playback ends', async () => {
    const stateChangeCallbacks: Array<(event: { data: number }) => void> = [];

    const player = {
      playVideo: vi.fn(),
      pauseVideo: vi.fn(),
      seekTo: vi.fn(),
      setVolume: vi.fn(),
      getCurrentTime: vi.fn(() => 0),
      getDuration: vi.fn(() => 60),
      getVolume: vi.fn(() => 70),
      getPlayerState: vi.fn(() => 0),
      destroy: vi.fn(),
    };

    (window as any).YT = {
      Player: vi.fn(function (this: unknown, _element: HTMLElement, options: any) {
        if (options?.events?.onStateChange) {
          stateChangeCallbacks.push(options.events.onStateChange);
        }
        setTimeout(() => options?.events?.onReady?.(), 0);
        return player;
      }),
      PlayerState: { PLAYING: 1 },
    };

    const wrapper = mount(ChatArea, {
      props: {
        messages: [
          { user: 'BRAVO', message: 'first https://youtu.be/AbCdEfGhI12' },
          { user: 'CHARLIE', message: 'second https://youtu.be/ZyXwVuTsRq9' },
        ],
        username: 'ALPHA',
        isConnected: true,
        users: {},
      },
    });

    await nextTick();
    vi.advanceTimersByTime(400);
    await nextTick();

    const pinButtons = wrapper.findAll('button.video-pin-btn');
    await pinButtons[0].trigger('click');
    await nextTick();

    expect(wrapper.findAll('button.video-pin-btn')[0].attributes('aria-pressed')).toBe('true');
    expect(wrapper.findAll('button.video-pin-btn')[1].attributes('aria-pressed')).toBe('false');

    // Last state-change callback belongs to the pinned player instance.
    const pinnedStateChange = stateChangeCallbacks[stateChangeCallbacks.length - 1];
    pinnedStateChange({ data: 0 });
    await nextTick();
    vi.advanceTimersByTime(10);
    await nextTick();

    expect(wrapper.findAll('button.video-pin-btn')[0].attributes('aria-pressed')).toBe('false');
    expect(wrapper.findAll('button.video-pin-btn')[1].attributes('aria-pressed')).toBe('true');
    expect(player.playVideo).toHaveBeenCalled();
  });

  it('navigates pinned video with previous and next header buttons', async () => {
    setupYouTubeMock();

    const wrapper = mount(ChatArea, {
      props: {
        messages: [
          { user: 'BRAVO', message: 'first https://youtu.be/AbCdEfGhI12' },
          { user: 'CHARLIE', message: 'second https://youtu.be/ZyXwVuTsRq9' },
        ],
        username: 'ALPHA',
        isConnected: true,
        users: {},
      },
    });

    await nextTick();
    vi.advanceTimersByTime(400);
    await nextTick();

    await wrapper.findAll('button.video-pin-btn')[0].trigger('click');
    await nextTick();

    await wrapper.find('button[aria-label="Next video"]').trigger('click');
    await nextTick();
    expect(wrapper.findAll('button.video-pin-btn')[1].attributes('aria-pressed')).toBe('true');

    await wrapper.find('button[aria-label="Previous video"]').trigger('click');
    await nextTick();
    expect(wrapper.findAll('button.video-pin-btn')[0].attributes('aria-pressed')).toBe('true');
  });

  it('clamps youtube volume range before setting player volume', async () => {
    const { player } = setupYouTubeMock();

    const wrapper = mount(ChatArea, {
      props: {
        messages: [
          { user: 'BRAVO', message: 'clip https://youtu.be/AbCdEfGhI12' },
        ],
        username: 'ALPHA',
        isConnected: true,
        users: {},
      },
    });

    await nextTick();
    vi.advanceTimersByTime(400);
    await nextTick();

    const volumeInput = wrapper.find('input.video-volume');
    const volumeEl = volumeInput.element as HTMLInputElement;

    volumeEl.value = '-20';
    await volumeInput.trigger('input');

    volumeEl.value = '200';
    await volumeInput.trigger('input');

    expect(player.setVolume).toHaveBeenNthCalledWith(1, 0);
    expect(player.setVolume).toHaveBeenNthCalledWith(2, 100);
  });

  it('tab key selects active emoji suggestion', async () => {
    const wrapper = mount(ChatArea, {
      props: {
        messages: [],
        username: 'ALPHA',
        isConnected: true,
        users: {},
      },
    });

    const input = wrapper.find('#chat-msg');
    await input.setValue(':smil');
    expect(wrapper.findAll('.emoji-item').length).toBeGreaterThan(0);

    await input.trigger('keydown', { key: 'Tab' });
    await nextTick();

    const value = (input.element as HTMLInputElement).value;
    expect(value).not.toContain(':smil');
    expect(wrapper.findAll('.emoji-item')).toHaveLength(0);
  });

  it('tab key selects active mention suggestion', async () => {
    const wrapper = mount(ChatArea, {
      props: {
        messages: [],
        username: 'ALPHA',
        isConnected: true,
        users: {
          BRAVO: { username: 'BRAVO', dmAvailable: true },
        },
      },
    });

    const input = wrapper.find('#chat-msg');
    await input.setValue('@br');
    expect(wrapper.findAll('.emoji-item').length).toBeGreaterThan(0);

    await input.trigger('keydown', { key: 'Tab' });
    await nextTick();

    expect((input.element as HTMLInputElement).value).toContain('@BRAVO ');
    expect(wrapper.findAll('.emoji-item')).toHaveLength(0);
  });

  it('supports arrowdown and arrowup keyboard navigation through emoji suggestion list', async () => {
    const wrapper = mount(ChatArea, {
      props: {
        messages: [],
        username: 'ALPHA',
        isConnected: true,
        users: {},
      },
    });

    const input = wrapper.find('#chat-msg');
    await input.setValue(':smil');

    const initialItems = wrapper.findAll('.emoji-item');
    expect(initialItems.length).toBeGreaterThan(1);
    expect(initialItems[0].classes()).toContain('active');

    await input.trigger('keydown', { key: 'ArrowDown' });
    await nextTick();
    const afterDown = wrapper.findAll('.emoji-item');
    expect(afterDown[1].classes()).toContain('active');
    expect(afterDown[0].classes()).not.toContain('active');

    await input.trigger('keydown', { key: 'ArrowUp' });
    await nextTick();
    const afterUp = wrapper.findAll('.emoji-item');
    expect(afterUp[0].classes()).toContain('active');
    expect(afterUp[1].classes()).not.toContain('active');
  });

  it('emits typing false when input loses focus', async () => {
    const wrapper = mount(ChatArea, {
      props: {
        messages: [],
        username: 'ALPHA',
        isConnected: true,
        users: {},
      },
    });

    await wrapper.find('#chat-msg').trigger('blur');
  expect(wrapper.emitted('typing')?.slice(-1)?.[0]).toEqual([false]);
  });

  it('shows typing cursor during message animation then hides once animation completes', async () => {
    const wrapper = mount(ChatArea, {
      props: {
        messages: [],
        username: 'ALPHA',
        isConnected: true,
        users: {},
      },
    });

    // Add a new message so the animation watcher fires (it is not immediate)
    await wrapper.setProps({ messages: [{ user: 'BRAVO', message: 'Hi!' }] });
    await nextTick();

    expect(wrapper.find('.cursor').exists()).toBe(true);

    await vi.runAllTimersAsync();
    await nextTick();

    expect(wrapper.find('.cursor').exists()).toBe(false);
  });

  it('renders system message in system-msg style without sender label', () => {
    const wrapper = mount(ChatArea, {
      props: {
        messages: [{ user: 'SYSTEM', message: 'ALPHA has joined', isSystem: true }],
        username: 'ALPHA',
        isConnected: true,
        users: {},
      },
    });

    expect(wrapper.find('.system-msg').exists()).toBe(true);
    expect(wrapper.find('.msg').exists()).toBe(false);
  });

  it('converts emoji shortcode in input to emoji character on input event', async () => {
    const wrapper = mount(ChatArea, {
      props: {
        messages: [],
        username: 'ALPHA',
        isConnected: true,
        users: {},
      },
    });

    // After setValue, convertEmojisInInput replaces the shortcode in chatInput ref.
    // Verify by sending the message and asserting the emitted payload is converted.
    await wrapper.find('#chat-msg').setValue(':heart:');
    await wrapper.find('.send-btn').trigger('click');

    const sent = wrapper.emitted('send')?.[0]?.[0] as string | undefined;
    expect(sent).toBeDefined();
    expect(sent).not.toContain(':heart:');
    expect(sent).toContain('\u2764');
  });

  it('shows default emoji suggestions when only a colon is typed', async () => {
    const wrapper = mount(ChatArea, {
      props: {
        messages: [],
        username: 'ALPHA',
        isConnected: true,
        users: {},
      },
    });

    await wrapper.find('#chat-msg').setValue(':');
    expect(wrapper.findAll('.emoji-item').length).toBeGreaterThan(0);
  });

  it('selects emoji suggestion via mousedown without dismissing input focus', async () => {
    const wrapper = mount(ChatArea, {
      props: {
        messages: [],
        username: 'ALPHA',
        isConnected: true,
        users: {},
      },
    });

    const input = wrapper.find('#chat-msg');
    await input.setValue(':smil');

    const firstItem = wrapper.find('.emoji-item');
    expect(firstItem.exists()).toBe(true);
    await firstItem.trigger('mousedown');
    await nextTick();

    expect(wrapper.findAll('.emoji-item')).toHaveLength(0);
    const value = (input.element as HTMLInputElement).value;
    expect(value).not.toContain(':smil');
    expect(value.length).toBeGreaterThan(0);
  });

  it('selects mention suggestion via mousedown and inserts at-mention into input', async () => {
    const wrapper = mount(ChatArea, {
      props: {
        messages: [],
        username: 'ALPHA',
        isConnected: true,
        users: {
          BRAVO: { username: 'BRAVO', dmAvailable: true },
        },
      },
    });

    const input = wrapper.find('#chat-msg');
    await input.setValue('@br');

    const firstItem = wrapper.find('.emoji-item');
    expect(firstItem.exists()).toBe(true);
    await firstItem.trigger('mousedown');
    await nextTick();

    expect(wrapper.findAll('.emoji-item')).toHaveLength(0);
    expect((input.element as HTMLInputElement).value).toContain('@BRAVO ');
  });

  it('fetches youtube oembed title and renders it in the embed summary header', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes('oembed')) {
        return {
          ok: true,
          json: async () => ({ title: 'Awesome Clip' }),
          text: async () => '',
        };
      }
      return { ok: false, json: async () => ({}), text: async () => '' };
    }));

    setupYouTubeMock();

    const wrapper = mount(ChatArea, {
      props: {
        messages: [{ user: 'BRAVO', message: 'watch https://youtu.be/AbCdEfGhI12' }],
        username: 'ALPHA',
        isConnected: true,
        users: {},
      },
    });

    // Use flushPromises to drain the async oEmbed fetch chain without
    // triggering the YouTube sync setInterval (which vi.runAllTimersAsync would loop on).
    await flushPromises();
    await nextTick();

    expect(wrapper.find('.video-header-title').text()).toBe('Awesome Clip');
  });

  it('pauses youtube player when embed details element is collapsed', async () => {
    const { player } = setupYouTubeMock();

    const wrapper = mount(ChatArea, {
      props: {
        messages: [{ user: 'BRAVO', message: 'clip https://youtu.be/AbCdEfGhI12' }],
        username: 'ALPHA',
        isConnected: true,
        users: {},
      },
    });

    await nextTick();
    vi.advanceTimersByTime(400);
    await nextTick();

    const details = wrapper.find('details.video-expandable');
    const detailsEl = details.element as HTMLDetailsElement;
    detailsEl.open = false;
    await details.trigger('toggle');

    expect(player.pauseVideo).toHaveBeenCalled();
  });

  it('sync interval polls player state and updates the timecode display', async () => {
    setupYouTubeMock();

    const wrapper = mount(ChatArea, {
      props: {
        messages: [{ user: 'BRAVO', message: 'clip https://youtu.be/AbCdEfGhI12' }],
        username: 'ALPHA',
        isConnected: true,
        users: {},
      },
    });

    await nextTick();
    vi.advanceTimersByTime(400);
    await nextTick();

    vi.advanceTimersByTime(350);
    await nextTick();

    // Mock player returns currentTime=12, duration=125
    expect(wrapper.find('.video-timecode').text()).toBe('0:12 / 2:05');
  });

  it('fullscreen overlay auto-hides after inactivity delay and reappears on pointer move', async () => {
    setupYouTubeMock();

    const wrapper = mount(ChatArea, {
      props: {
        messages: [{ user: 'BRAVO', message: 'clip https://youtu.be/AbCdEfGhI12' }],
        username: 'ALPHA',
        isConnected: true,
        users: {},
      },
    });

    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      writable: true,
      value: null,
    });
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      writable: true,
      value: vi.fn(async () => {
        Object.defineProperty(document, 'fullscreenElement', { configurable: true, writable: true, value: null });
        document.dispatchEvent(new Event('fullscreenchange'));
      }),
    });

    await nextTick();
    vi.advanceTimersByTime(400);
    await nextTick();

    const shell = wrapper.find('.video-player-shell').element as HTMLElement & { requestFullscreen?: () => Promise<void> };
    shell.requestFullscreen = vi.fn(async () => {
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, writable: true, value: shell });
      document.dispatchEvent(new Event('fullscreenchange'));
    });

    const fullButton = wrapper.findAll('button.video-control-btn').find((btn) => btn.text() === 'FULL');
    await fullButton!.trigger('click');
    await nextTick();

    // Overlay should be visible immediately after entering fullscreen
    const exitBtn = wrapper.find('button.video-fullscreen-exit');
    expect(exitBtn.exists()).toBe(true);
    expect(exitBtn.classes()).not.toContain('hidden');

    // After 2100ms the overlay auto-hides
    vi.advanceTimersByTime(2100);
    await nextTick();
    expect(wrapper.find('button.video-fullscreen-exit').classes()).toContain('hidden');

    // Mouse movement over the shell brings the overlay back
    await wrapper.find('.video-player-shell').trigger('mousemove');
    await nextTick();
    expect(wrapper.find('button.video-fullscreen-exit').classes()).not.toContain('hidden');
  });

  it('renders emoji shortcodes in incoming messages as emoji characters', async () => {
    const wrapper = mount(ChatArea, {
      props: {
        messages: [{ user: 'BRAVO', message: 'on fire :fire: right now' }],
        username: 'ALPHA',
        isConnected: true,
        users: {},
      },
    });

    await vi.runAllTimersAsync();
    await nextTick();

    expect(wrapper.text()).toContain('🔥');
    expect(wrapper.text()).not.toContain(':fire:');
  });

  it('does not render youtube url as a chat-link in the message body', () => {
    const wrapper = mount(ChatArea, {
      props: {
        messages: [{ user: 'BRAVO', message: 'watch https://youtu.be/AbCdEfGhI12 and enjoy' }],
        username: 'ALPHA',
        isConnected: true,
        users: {},
      },
    });

    // URL is stripped from the message body text and shown only in the embed header, not as a link
    expect(wrapper.find('a.chat-link').exists()).toBe(false);
    // Message body text content excludes the raw URL
    expect(wrapper.find('.text').text()).not.toContain('https://youtu.be/AbCdEfGhI12');
  });

  it('disables youtube player controls before onReady and enables them after', async () => {
    setupYouTubeMock();

    const wrapper = mount(ChatArea, {
      props: {
        messages: [{ user: 'BRAVO', message: 'clip https://youtu.be/AbCdEfGhI12' }],
        username: 'ALPHA',
        isConnected: true,
        users: {},
      },
    });

    await nextTick();
    // onReady has not fired yet — all controls must be disabled
    const buttons = wrapper.findAll('button.video-control-btn');
    expect(buttons[0].attributes('disabled')).toBeDefined();
    expect(buttons[1].attributes('disabled')).toBeDefined();
    expect(wrapper.find('input.video-progress').attributes('disabled')).toBeDefined();
    expect(wrapper.find('input.video-volume').attributes('disabled')).toBeDefined();

    // Fire onReady
    vi.advanceTimersByTime(400);
    await nextTick();

    const buttonsAfter = wrapper.findAll('button.video-control-btn');
    expect(buttonsAfter[0].attributes('disabled')).toBeUndefined();
    expect(buttonsAfter[1].attributes('disabled')).toBeUndefined();
  });

  it('youtube onStateChange callback updates the play-pause button label', async () => {
    let capturedOnStateChange: ((e: { data: number }) => void) | undefined;

    const player = {
      playVideo: vi.fn(),
      pauseVideo: vi.fn(),
      seekTo: vi.fn(),
      setVolume: vi.fn(),
      getCurrentTime: vi.fn(() => 0),
      getDuration: vi.fn(() => 60),
      getVolume: vi.fn(() => 70),
      getPlayerState: vi.fn(() => 0),
      destroy: vi.fn(),
    };

    (window as any).YT = {
      Player: vi.fn(function (this: unknown, _element: HTMLElement, options: any) {
        capturedOnStateChange = options?.events?.onStateChange;
        setTimeout(() => options?.events?.onReady?.(), 0);
        return player;
      }),
      PlayerState: { PLAYING: 1 },
    };

    const wrapper = mount(ChatArea, {
      props: {
        messages: [{ user: 'BRAVO', message: 'clip https://youtu.be/AbCdEfGhI12' }],
        username: 'ALPHA',
        isConnected: true,
        users: {},
      },
    });

    await nextTick();
    vi.advanceTimersByTime(400);
    await nextTick();

    expect(wrapper.findAll('button.video-control-btn')[0].text()).toBe('PLAY');

    capturedOnStateChange?.({ data: 1 });
    await nextTick();
    expect(wrapper.findAll('button.video-control-btn')[0].text()).toBe('PAUSE');

    capturedOnStateChange?.({ data: 2 });
    await nextTick();
    expect(wrapper.findAll('button.video-control-btn')[0].text()).toBe('PLAY');
  });

  it('mention autocomplete does not suggest own username', async () => {
    const wrapper = mount(ChatArea, {
      props: {
        messages: [],
        username: 'ALPHA',
        isConnected: true,
        users: {
          ALPHA: { username: 'ALPHA', dmAvailable: true },
          ALICIA: { username: 'ALICIA', dmAvailable: true },
        },
      },
    });

    await wrapper.find('#chat-msg').setValue('@al');

    const itemTexts = wrapper.findAll('.emoji-item').map((el) => el.text());
    expect(itemTexts.some((t) => t.includes('ALPHA'))).toBe(false);
    expect(itemTexts.some((t) => t.includes('ALICIA'))).toBe(true);
  });

  it('appendMentionToInput inserts a space separator when existing input has no trailing whitespace', async () => {
    const wrapper = mount(ChatArea, {
      props: {
        messages: [],
        username: 'ALPHA',
        isConnected: true,
        users: { BRAVO: { username: 'BRAVO', dmAvailable: true } },
        mentionRequest: null,
      },
    });

    await wrapper.find('#chat-msg').setValue('hello');
    await wrapper.setProps({ mentionRequest: { username: 'BRAVO', nonce: 1 } });
    await vi.runAllTimersAsync();

    expect((wrapper.find('#chat-msg').element as HTMLInputElement).value).toBe('hello @BRAVO ');
  });

  it('uses tauri openUrl instead of window.open when tauri runtime is detected', async () => {
    vi.mocked(tauriOpener.openUrl).mockResolvedValue(undefined);
    (window as any).__TAURI_INTERNALS__ = {};

    const wrapper = mount(ChatArea, {
      props: {
        messages: [{ user: 'BRAVO', message: 'check https://example.com/tauri-link' }],
        username: 'ALPHA',
        isConnected: true,
        users: {},
      },
    });

    await vi.runAllTimersAsync();
    await nextTick();

    const link = wrapper.find('a.chat-link');
    expect(link.exists()).toBe(true);
    await link.trigger('click');
    await vi.runAllTimersAsync();
    await nextTick();

    expect(vi.mocked(tauriOpener.openUrl)).toHaveBeenCalledWith('https://example.com/tauri-link');
    expect(window.open).not.toHaveBeenCalled();
  });
});
