import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { getAnimationDuration, useMessageAnimations } from '../useMessageAnimations';

describe('getAnimationDuration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns expected duration for known effects', () => {
    expect(getAnimationDuration('typewriter', 10)).toBe(1500);
    expect(getAnimationDuration('scan', 10)).toBe(1200);
    expect(getAnimationDuration('matrix', 10)).toBe(1800);
    expect(getAnimationDuration('glitch', 10)).toBe(1400);
    expect(getAnimationDuration('flames', 10)).toBe(2200);
  });

  it('guards against zero-length text and unknown effects', () => {
    expect(getAnimationDuration('typewriter', 0)).toBe(1050);
    expect(getAnimationDuration('none', 30)).toBe(0);
  });

  it('plays all animation effects and resets playing state', async () => {
    const { playAnimation, isPlaying } = useMessageAnimations();
    const target = document.createElement('div');

    const effects: Array<'typewriter' | 'scan' | 'matrix' | 'glitch' | 'flames'> = [
      'typewriter',
      'scan',
      'matrix',
      'glitch',
      'flames',
    ];

    for (const effect of effects) {
      const promise = playAnimation(effect, 'HI A', target);
      expect(isPlaying.value).toBe(true);
      vi.runAllTimers();
      await promise;
      expect(isPlaying.value).toBe(false);
      expect(target.innerHTML).toBe('');
    }

    expect(document.getElementById('message-animations-styles')).toBeTruthy();
  });

  it('clears element for none effect', async () => {
    const { playAnimation } = useMessageAnimations();
    const target = document.createElement('div');
    target.innerHTML = 'stale';

    await playAnimation('none', 'ignored', target);

    expect(target.innerHTML).toBe('');
  });
});
