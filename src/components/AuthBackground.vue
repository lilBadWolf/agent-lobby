<template>
  <div class="auth-background-root">
    <component :is="backgroundComponent" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useTheme } from '../composables/useTheme';
import SimulationBackground from './SimulationBackground.vue';
import SinewaveBackground from './SinewaveBackground.vue';
import StarfieldBackground from './StarfieldBackground.vue';
import LavaBackground from './LavaBackground.vue';

const props = defineProps<{
  soundpack?: string;
}>();

const { getThemeTokenValue } = useTheme();

const soundpackVariantMap: Record<string, 'starfield' | 'sinewave' | 'matrix' | 'lava' | 'none'> = {
  'outer-rim': 'starfield',
  'simulation': 'matrix',
  'bubbles': 'lava',
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
    case 'lava':
      return LavaBackground;
    case 'none':
      return null;
    case 'sinewave':
    default:
      return SinewaveBackground;
  }
});

</script>

<style scoped>
.auth-background-root {
  position: fixed;
  inset: 0;
  z-index: -1;
}
</style>
