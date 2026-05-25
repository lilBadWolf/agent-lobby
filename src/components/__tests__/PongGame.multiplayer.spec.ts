import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import PongGame from '../PongGame.vue';
import { createPairedDataChannels } from '../../test/mocks/pairedDataChannel';

class ChannelDriver {
  readyState: RTCDataChannelState = 'open';
  private messageListeners = new Set<(event: MessageEvent) => void>();
  send = vi.fn();

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    if (type !== 'message') {
      return;
    }

    if (typeof listener === 'function') {
      this.messageListeners.add(listener as (event: MessageEvent) => void);
      return;
    }

    this.messageListeners.add((event) => listener.handleEvent(event));
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    if (type !== 'message') {
      return;
    }

    if (typeof listener === 'function') {
      this.messageListeners.delete(listener as (event: MessageEvent) => void);
    }
  }

  emit(payload: unknown) {
    const event = { data: JSON.stringify(payload) } as MessageEvent;
    this.messageListeners.forEach((listener) => listener(event));
  }
}

function extractLeftPercent(styleValue: string): number {
  const match = styleValue.match(/left:\s*([\d.]+)%/);
  return match ? Number.parseFloat(match[1]) : 0;
}

async function advance(ms: number) {
  vi.advanceTimersByTime(ms);
  await nextTick();
  await Promise.resolve();
}

describe('PongGame multiplayer sync', () => {
  beforeEach(() => {
    vi.useFakeTimers();

    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      return window.setTimeout(() => callback(performance.now()), 16);
    });

    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      clearTimeout(id);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('starts both peers and keeps remote ball moving from authoritative state', async () => {
    const channels = createPairedDataChannels();

    const alpha = mount(PongGame, {
      props: {
        user: 'ALPHA',
        peerName: 'BRAVO',
        dataChannel: channels.left,
        startSignal: 0,
        isInitiator: true,
        waitingForAcceptance: false,
      },
    });

    const bravo = mount(PongGame, {
      props: {
        user: 'BRAVO',
        peerName: 'ALPHA',
        dataChannel: channels.right,
        startSignal: 0,
        isInitiator: false,
        waitingForAcceptance: false,
      },
    });

    await alpha.setProps({ startSignal: 1 });
    await bravo.setProps({ startSignal: 1 });

    await advance(3400);

    const before = bravo.find('.pong-ball').attributes('style');
    await advance(300);
    const after = bravo.find('.pong-ball').attributes('style');

    expect(alpha.text()).toContain('PONG');
    expect(bravo.text()).toContain('PONG');
    expect(after).not.toEqual(before);
  });

  it('applies paddle updates in real time in both directions', async () => {
    const channels = createPairedDataChannels();

    const alpha = mount(PongGame, {
      props: {
        user: 'ALPHA',
        peerName: 'BRAVO',
        dataChannel: channels.left,
        startSignal: 0,
        isInitiator: true,
        waitingForAcceptance: false,
      },
    });

    const bravo = mount(PongGame, {
      props: {
        user: 'BRAVO',
        peerName: 'ALPHA',
        dataChannel: channels.right,
        startSignal: 0,
        isInitiator: false,
        waitingForAcceptance: false,
      },
    });

    channels.left.send(JSON.stringify({ type: 'pong-paddle', x: 20 }));
    await advance(50);

    const bravoTop = bravo.find('.pong-top-paddle').attributes('style') ?? '';
    expect(extractLeftPercent(bravoTop)).toBeGreaterThan(5);

    channels.right.send(JSON.stringify({ type: 'pong-paddle', x: 340 }));
    await advance(50);

    const alphaTop = alpha.find('.pong-top-paddle').attributes('style') ?? '';
    expect(extractLeftPercent(alphaTop)).toBeGreaterThan(70);
  });

  it('allows non-initiator keyboard control and emits paddle updates', async () => {
    const channel = new ChannelDriver();

    const bravo = mount(PongGame, {
      props: {
        user: 'BRAVO',
        peerName: 'ALPHA',
        dataChannel: channel as unknown as RTCDataChannel,
        startSignal: 1,
        isInitiator: false,
        waitingForAcceptance: false,
      },
    });

    // Non-initiator enters running mode when authoritative state starts flowing.
    channel.emit({
      type: 'pong-state',
      seq: 1,
      ballX: 120,
      ballY: 110,
      velX: 120,
      velY: -90,
      paddleX: 90,
    });
    await advance(70);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    await advance(120);
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight' }));
    await advance(40);

    expect(channel.send).toHaveBeenCalled();
    const sentMessages = channel.send.mock.calls.map(([raw]) => JSON.parse(String(raw)));
    expect(sentMessages.some((message) => message.type === 'pong-paddle')).toBe(true);

    const bottomStyle = bravo.find('.pong-bottom-paddle').attributes('style') ?? '';
    expect(extractLeftPercent(bottomStyle)).toBeGreaterThan(40);
  });

  it('keeps remote paddle updates flowing under latency and reordering', async () => {
    const channels = createPairedDataChannels({
      minLatencyMs: 10,
      maxLatencyMs: 90,
      reorderRate: 0.2,
    });

    const alpha = mount(PongGame, {
      props: {
        user: 'ALPHA',
        peerName: 'BRAVO',
        dataChannel: channels.left,
        startSignal: 1,
        isInitiator: true,
        waitingForAcceptance: false,
      },
    });

    const bravo = mount(PongGame, {
      props: {
        user: 'BRAVO',
        peerName: 'ALPHA',
        dataChannel: channels.right,
        startSignal: 1,
        isInitiator: false,
        waitingForAcceptance: false,
      },
    });

    await advance(3400);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    await advance(220);
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight' }));
    await advance(220);

    const alphaRemote = alpha.find('.pong-top-paddle').attributes('style') ?? '';
    const bravoRemote = bravo.find('.pong-top-paddle').attributes('style') ?? '';

    expect(extractLeftPercent(alphaRemote)).toBeGreaterThan(35);
    expect(extractLeftPercent(bravoRemote)).toBeGreaterThan(35);
  });
});
