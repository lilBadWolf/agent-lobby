import { mount, VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import BattleshipGame from '../BattleshipGame.vue';
import { createPairedDataChannels } from '../../test/mocks/pairedDataChannel';

async function flush(ms = 40) {
  vi.advanceTimersByTime(ms);
  await nextTick();
  await Promise.resolve();
}

async function placeFleet(wrapper: VueWrapper<any>) {
  const localCells = wrapper.findAll('.your-board .local-grid .cell');
  const startCells = [0, 10, 20, 30, 40];

  for (const cellIndex of startCells) {
    await localCells[cellIndex].trigger('click');
    await flush(10);
  }
}

describe('BattleshipGame multiplayer sync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('transitions both peers to battle once both are ready', async () => {
    const channels = createPairedDataChannels();

    const alpha = mount(BattleshipGame, {
      props: {
        user: 'ALPHA',
        peerName: 'BRAVO',
        dataChannel: channels.left,
        startSignal: 1,
        waitingForAcceptance: false,
      },
    });

    const bravo = mount(BattleshipGame, {
      props: {
        user: 'BRAVO',
        peerName: 'ALPHA',
        dataChannel: channels.right,
        startSignal: 1,
        waitingForAcceptance: false,
      },
    });

    await flush(50);
    await placeFleet(alpha);
    await placeFleet(bravo);

    await alpha.find('.controls .action-btn.primary').trigger('click');
    await bravo.find('.controls .action-btn.primary').trigger('click');

    await flush(200);

    expect(alpha.find('.phase-chip').text()).toContain('ENGAGED');
    expect(bravo.find('.phase-chip').text()).toContain('ENGAGED');
  });

  it('syncs shot and result state between peers without deadlocking turn flow', async () => {
    const channels = createPairedDataChannels();

    const alpha = mount(BattleshipGame, {
      props: {
        user: 'ALPHA',
        peerName: 'BRAVO',
        dataChannel: channels.left,
        startSignal: 1,
        waitingForAcceptance: false,
      },
    });

    const bravo = mount(BattleshipGame, {
      props: {
        user: 'BRAVO',
        peerName: 'ALPHA',
        dataChannel: channels.right,
        startSignal: 1,
        waitingForAcceptance: false,
      },
    });

    await flush(50);
    await placeFleet(alpha);
    await placeFleet(bravo);

    await alpha.find('.controls .action-btn.primary').trigger('click');
    await bravo.find('.controls .action-btn.primary').trigger('click');
    await flush(200);

    const alphaEnemyCells = alpha.findAll('.target-board .grid.enemy .cell');
    await alphaEnemyCells[0].trigger('click');
    await flush(250);

    expect(alphaEnemyCells[0].classes()).toContain('hit');

    const bravoLocalCells = bravo.findAll('.your-board .local-grid .cell');
    expect(bravoLocalCells[0].classes()).toContain('hit');

    expect(alpha.text()).toContain('BRAVO is targeting');
  });
});
