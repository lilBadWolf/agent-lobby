import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import PongGame from '../PongGame.vue';
import { createPairedDataChannels } from '../../test/mocks/pairedDataChannel';

class ChannelDriver {
  readyState: RTCDataChannelState = 'open';
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: Event) => void) | null = null;
  private messageListeners = new Set<(event: MessageEvent) => void>();
  private openListeners = new Set<() => void>();
  private closeListeners = new Set<() => void>();
  send = vi.fn((raw: string) => {
    if (this.readyState !== 'open') {
      throw new Error('RTCDataChannel is not open');
    }

    return raw;
  });

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    if (type === 'message') {
      if (typeof listener === 'function') {
        this.messageListeners.add(listener as (event: MessageEvent) => void);
        return;
      }

      this.messageListeners.add((event) => listener.handleEvent(event));
      return;
    }

    if (type === 'open') {
      if (typeof listener === 'function') {
        this.openListeners.add(listener as () => void);
        return;
      }

      this.openListeners.add(() => listener.handleEvent(new Event('open')));
      return;
    }

    if (type === 'close') {
      if (typeof listener === 'function') {
        this.closeListeners.add(listener as () => void);
        return;
      }

      this.closeListeners.add(() => listener.handleEvent(new Event('close')));
    }
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    if (type === 'message') {
      if (typeof listener === 'function') {
        this.messageListeners.delete(listener as (event: MessageEvent) => void);
      }
      return;
    }

    if (type === 'open' && typeof listener === 'function') {
      this.openListeners.delete(listener as () => void);
      return;
    }

    if (type === 'close' && typeof listener === 'function') {
      this.closeListeners.delete(listener as () => void);
    }
  }

  emit(payload: unknown) {
    const event = { data: JSON.stringify(payload) } as MessageEvent;
    this.onmessage?.(event);
    this.messageListeners.forEach((listener) => listener(event));
  }

  emitOpen() {
    this.readyState = 'open';
    this.onopen?.(new Event('open'));
    this.openListeners.forEach((listener) => listener());
  }

  emitClose() {
    this.readyState = 'closed';
    this.onclose?.(new Event('close'));
    this.closeListeners.forEach((listener) => listener());
  }
}

function extractLeftPercent(styleValue: string): number {
  const match = styleValue.match(/left:\s*([\d.]+)%/);
  return match ? Number.parseFloat(match[1]) : 0;
}

function extractTopPercent(styleValue: string): number {
  const match = styleValue.match(/top:\s*([\d.]+)%/);
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

  it('starts both peers, shows countdown on both sides, and advances the ball', async () => {
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

    expect(alpha.find('.pong-countdown-overlay').exists()).toBe(true);
    expect(bravo.find('.pong-countdown-overlay').exists()).toBe(true);

    await advance(3000);

    const alphaBallStart = alpha.find('.pong-ball').attributes('style') ?? '';
    const bravoBallStart = bravo.find('.pong-ball').attributes('style') ?? '';

    await advance(200);

    const alphaBallLater = alpha.find('.pong-ball').attributes('style') ?? '';
    const bravoBallLater = bravo.find('.pong-ball').attributes('style') ?? '';

    expect(extractTopPercent(alphaBallLater)).toBeGreaterThan(extractTopPercent(alphaBallStart));
    expect(extractTopPercent(bravoBallLater)).toBeLessThan(extractTopPercent(bravoBallStart));
    expect(extractTopPercent(alphaBallLater)).toBeGreaterThan(extractTopPercent(bravoBallLater));
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

    const bottomBefore = bravo.find('.pong-bottom-paddle').attributes('style') ?? '';

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    await advance(120);
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight' }));
    await advance(40);

    expect(channel.send).toHaveBeenCalled();
    const sentMessages = channel.send.mock.calls.map(([raw]) => JSON.parse(String(raw)));
    expect(sentMessages.some((message) => message.type === 'pong-paddle')).toBe(true);

    const bottomStyle = bravo.find('.pong-bottom-paddle').attributes('style') ?? '';
    expect(extractLeftPercent(bottomStyle)).toBeGreaterThan(extractLeftPercent(bottomBefore));
    expect(extractLeftPercent(bottomStyle)).toBeGreaterThan(40);
  });

  it('recovers when non-initiator start signal arrives before channel opens', async () => {
    const channel = new ChannelDriver();
    channel.readyState = 'connecting';

    const bravo = mount(PongGame, {
      props: {
        user: 'BRAVO',
        peerName: 'ALPHA',
        dataChannel: channel as unknown as RTCDataChannel,
        startSignal: 0,
        isInitiator: false,
        waitingForAcceptance: false,
      },
    });

    await bravo.setProps({ startSignal: 1 });

    expect(bravo.text()).toContain('Waiting for direct line to start PONG...');

    channel.emitOpen();
    await advance(50);

    expect(bravo.find('.pong-countdown-overlay').exists()).toBe(true);

    await advance(4000);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    await advance(140);
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight' }));
    await advance(40);

    const sentMessages = channel.send.mock.calls.map(([raw]) => JSON.parse(String(raw)));
    expect(sentMessages.some((message) => message.type === 'pong-paddle')).toBe(true);
  });

  it('restarts the remote round when a new pong-start arrives during play', async () => {
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

    await advance(3200);
    expect(bravo.find('.pong-countdown-overlay').exists()).toBe(false);

    channel.emit({
      type: 'pong-state',
      seq: 1,
      ballX: 140,
      ballY: 120,
      velX: 160,
      velY: -100,
      paddleX: 90,
    });
    await advance(80);

    const movingBall = bravo.find('.pong-ball').attributes('style') ?? '';

    channel.emit({
      type: 'pong-start',
      authority: 'ALPHA',
      seq: 2,
      ballX: 180,
      ballY: 110,
      velX: 120,
      velY: 140,
      paddleX: 100,
    });
    await advance(50);

    expect(bravo.find('.pong-countdown-overlay').exists()).toBe(true);
    expect(bravo.find('.pong-ball').attributes('style')).not.toEqual(movingBall);
  });

  it('syncs the scoreboards when Alpha misses the ball', async () => {
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

    await advance(3200);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    await advance(900);
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowLeft' }));

    await advance(2500);

    expect(alpha.text()).toContain('ALPHA 0 — 1 BRAVO');
    expect(bravo.text()).toContain('BRAVO 1 — 0 ALPHA');
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
