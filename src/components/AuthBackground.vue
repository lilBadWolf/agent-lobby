<template>
  <div class="auth-background-root">
    <div
      v-if="useCustomBackground"
      ref="customBackgroundRoot"
      class="auth-background-custom-root"
    />
    <component v-else :is="backgroundComponent" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useTheme } from '../composables/useTheme';
import SimulationBackground from './SimulationBackground.vue';
import SinewaveBackground from './SinewaveBackground.vue';
import StarfieldBackground from './StarfieldBackground.vue';

const props = defineProps<{
  soundpack?: string;
  soundpackBackgroundJsUrl?: string;
  soundpackBackgroundCssUrl?: string;
}>();

const { getThemeTokenValue } = useTheme();
const customBackgroundRoot = ref<HTMLElement | null>(null);
const customBackgroundCleanup = ref<(() => void) | null>(null);
const customBackgroundLoaded = ref(false);
const currentCssLink = ref<HTMLLinkElement | null>(null);

const soundpackVariantMap: Record<string, 'starfield' | 'sinewave' | 'matrix' | 'none'> = {
  'outer-rim': 'starfield',
  'simulation': 'matrix',
  default: 'sinewave',
};

const authBackgroundVariant = computed(() => {
  const explicitVariant = getThemeTokenValue('--auth-background-variant', '').trim().toLowerCase();
  if (explicitVariant) {
    return explicitVariant as 'sinewave' | 'matrix' | 'none';
  }

  const normalizedSoundpack = props.soundpack?.trim().toLowerCase() || 'default';
  return soundpackVariantMap[normalizedSoundpack] ?? 'sinewave';
});

const backgroundComponent = computed(() => {
  switch (authBackgroundVariant.value) {
    case 'starfield':
      return StarfieldBackground;
    case 'matrix':
      return SimulationBackground;
    case 'none':
      return null;
    case 'sinewave':
    default:
      return SinewaveBackground;
  }
});

const useCustomBackground = computed(() => customBackgroundLoaded.value);

function removeCustomCss() {
  if (currentCssLink.value) {
    currentCssLink.value.remove();
    currentCssLink.value = null;
  }
}

function clearCustomBackground() {
  if (customBackgroundCleanup.value) {
    try {
      customBackgroundCleanup.value();
    } catch {
      // Ignore cleanup failures.
    }
    customBackgroundCleanup.value = null;
  }
  customBackgroundLoaded.value = false;
}

async function loadCustomBackground() {
  clearCustomBackground();

  if (!props.soundpackBackgroundJsUrl || !customBackgroundRoot.value) {
    return;
  }

  try {
    // @vite-ignore is required because the URL is dynamic and may point to a local custom file.
    const module = await import(/* @vite-ignore */ props.soundpackBackgroundJsUrl);
    const mountFn = module?.mount ?? module?.default;

    if (typeof mountFn !== 'function') {
      return;
    }

    const cleanup = await mountFn(customBackgroundRoot.value, {
      soundpack: props.soundpack || 'default',
      getThemeTokenValue,
    });

    if (typeof cleanup === 'function') {
      customBackgroundCleanup.value = cleanup;
    } else if (cleanup && typeof cleanup.destroy === 'function') {
      customBackgroundCleanup.value = () => cleanup.destroy();
    }

    customBackgroundLoaded.value = true;
  } catch {
    customBackgroundLoaded.value = false;
  }
}

watch(
  () => props.soundpackBackgroundCssUrl,
  (url) => {
    removeCustomCss();

    if (!url) {
      return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    document.head.appendChild(link);
    currentCssLink.value = link;
  },
  { immediate: true }
);

watch(
  () => [props.soundpackBackgroundJsUrl, props.soundpack],
  () => {
    void loadCustomBackground();
  },
  { immediate: true }
);

onMounted(() => {
  void loadCustomBackground();
});

onBeforeUnmount(() => {
  clearCustomBackground();
  removeCustomCss();
});
</script>

<style scoped>
.auth-background-root,
.auth-background-custom-root {
  position: fixed;
  inset: 0;
  z-index: -1;
}
</style>
