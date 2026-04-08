import { createApp, ref } from 'vue';
import {
  AnimationEffect,
  ensureAnimationStyles,
  getAnimationDuration,
} from './messageEffectHelpers';
import TypewriterEffect from '../components/effects/TypewriterEffect.vue';
import ScanEffect from '../components/effects/ScanEffect.vue';
import CodexEffect from '../components/dm-effects/CodexEffect.vue';
import GlitchEffect from '../components/dm-effects/GlitchEffect.vue';
import FlamesEffect from '../components/dm-effects/FlamesEffect.vue';
import RustEffect from '../components/dm-effects/RustEffect.vue';
import PacmanEffect from '../components/dm-effects/PacmanEffect.vue';
import MsPacmanEffect from '../components/dm-effects/MsPacmanEffect.vue';
import StarmapEffect from '../components/dm-effects/StarmapEffect.vue';
import BubbleEffect from '../components/dm-effects/BubbleEffect.vue';
import PowderEffect from '../components/dm-effects/PowderEffect.vue';
import InfernoEffect from '../components/dm-effects/InfernoEffect.vue';

const effectComponentMap: Record<Exclude<AnimationEffect, 'none'>, any> = {
  typewriter: TypewriterEffect,
  scan: ScanEffect,
  codex: CodexEffect,
  glitch: GlitchEffect,
  flames: FlamesEffect,
  rust: RustEffect,
  pacman: PacmanEffect,
  mspacman: MsPacmanEffect,
  starmap: StarmapEffect,
  bubbles: BubbleEffect,
  smoke: PowderEffect,
  inferno: InfernoEffect,
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
        try {
          app.unmount();
        } catch {
          // App may already be unmounted by parent removal.
        }
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
