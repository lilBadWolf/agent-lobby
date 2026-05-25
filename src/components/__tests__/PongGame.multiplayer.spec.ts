import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import PongGame from '../PongGame.vue';
import { createPairedDataChannels } from '../../test/mocks/pairedDataChannel';

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
});
