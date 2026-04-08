import { createApp, ref } from 'vue';
import {
  AnimationEffect,
  ensureAnimationStyles,
  getAnimationDuration,
} from './messageEffectHelpers';
import TypewriterEffect from '../components/effects/TypewriterEffect.vue';
import ScanEffect from '../components/effects/ScanEffect.vue';
import MatrixEffect from '../components/dm-effects/MatrixEffect.vue';
import GlitchEffect from '../components/dm-effects/GlitchEffect.vue';
import FlamesEffect from '../components/dm-effects/FlamesEffect.vue';
import RustEffect from '../components/dm-effects/RustEffect.vue';
import PacmanEffect from '../components/dm-effects/PacmanEffect.vue';

const effectComponentMap: Record<Exclude<AnimationEffect, 'none'>, any> = {
  typewriter: TypewriterEffect,
  scan: ScanEffect,
  matrix: MatrixEffect,
  glitch: GlitchEffect,
  flames: FlamesEffect,
  rust: RustEffect,
  pacman: PacmanEffect,
};

function mountEffectComponent(
  effect: Exclude<AnimationEffect, 'none'>,
  text: string,
  element: HTMLElement
): Promise<void> {
  ensureAnimationStyles();
  element.innerHTML = '';

  const component = effectComponentMap[effect];
  if (!component) {
    element.textContent = text;
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const app = createApp(component, {
      text,
      onDone: () => {
        app.unmount();
        element.innerHTML = '';
        resolve();
      },
    });

    app.mount(element);
  });
}

export function useMessageAnimations() {
  const isPlaying = ref(false);

  async function playAnimation(effect: AnimationEffect, text: string, element?: HTMLElement | null): Promise<void> {
    if (!element || !text) return;

    isPlaying.value = true;
    try {
      if (effect === 'none') {
        element.innerHTML = '';
        return;
      }

      await mountEffectComponent(effect, text, element);
    } finally {
      isPlaying.value = false;
    }
  }

  return {
    playAnimation,
    getAnimationDuration,
    isPlaying,
  };
}

export { getAnimationDuration };
