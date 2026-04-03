<template>
  <div class="radio-bg" :style="bgStyle">
    <svg viewBox="0 0 1000 500" preserveAspectRatio="none">
      <defs>
        <!-- Glow effect -->
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"></feMergeNode>
            <feMergeNode in="SourceGraphic"></feMergeNode>
          </feMerge>
        </filter>
      </defs>

      <!-- Static Grid for that Retro CRT look -->
      <path v-for="i in 10" :key="'h'+i" :d="`M 0 ${i * 50} L 1000 ${i * 50}`" class="grid-line" :style="gridLineStyle" />
      <path v-for="i in 20" :key="'v'+i" :d="`M ${i * 50} 0 L ${i * 50} 500`" class="grid-line" :style="gridLineStyle" />

      <!-- Animated Sine Waves -->
      <path :class="['wave', 'wave-1']" :d="sinePath" :style="wave1Style" />
      <path :class="['wave', 'wave-2']" :d="sinePath" :style="wave2Style" />
      <path :class="['wave', 'wave-3']" :d="sinePath" :style="wave3Style" />
    </svg>
    <div class="scanlines"></div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useTheme } from '../composables/useTheme';

const { currentTheme, getThemeUserColors, getThemeTokenValue } = useTheme();
const themeChangeTick = ref(0);
let themeObserver: MutationObserver | null = null;

onMounted(() => {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;
  themeObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
        themeChangeTick.value += 1;
        break;
      }
    }
  });

  themeObserver.observe(root, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
});

onBeforeUnmount(() => {
  themeObserver?.disconnect();
  themeObserver = null;
});

// Generates a simple sine wave path across the 1000-unit viewBox
const sinePath = computed(() => {
  let d = 'M 0 250';
  for (let x = 0; x <= 1000; x += 10) {
    const y = 250 + Math.sin(x / 50) * 100;
    d += ` L ${x} ${y}`;
  }
  return d;
});

// Get 3 random unique indices from the color array
function getRandomColorIndices(arrayLength: number): [number, number, number] {
  if (arrayLength <= 1) {
    return [0, 0, 0];
  }

  if (arrayLength === 2) {
    return [0, 1, Math.floor(Math.random() * 2)] as [number, number, number];
  }

  const indices = new Set<number>();
  while (indices.size < 3) {
    indices.add(Math.floor(Math.random() * arrayLength));
  }
  return Array.from(indices) as [number, number, number];
}

// Get theme-based colors with random selection
const themeColors = computed(() => {
  // Track both local theme refs and document-level theme attribute changes.
  void currentTheme.value;
  void themeChangeTick.value;
  const palette = getThemeUserColors();
  const fallbackPalette = ['#39ff14', '#00ff00', '#00ffaa'];
  const activePalette = palette.length > 0 ? palette : fallbackPalette;

  const [idx1, idx2, idx3] = getRandomColorIndices(activePalette.length);

  return {
    bg: getThemeTokenValue('--color-bg-base', '#0a0f0a'),
    primary: activePalette[idx1],
    secondary: activePalette[idx2],
    tertiary: activePalette[idx3],
  };
});

const bgStyle = computed(() => ({
  background: themeColors.value.bg,
}));

const wave1Style = computed(() => ({
  stroke: themeColors.value.primary,
}));

const wave2Style = computed(() => ({
  stroke: themeColors.value.secondary,
}));

const wave3Style = computed(() => ({
  stroke: themeColors.value.tertiary,
}));

const gridLineStyle = computed(() => ({
  stroke: `color-mix(in srgb, ${themeColors.value.primary} 10%, transparent)`,
}));
</script>

<style scoped>
.radio-bg {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  z-index: -1;
  transition: background 0.3s ease;
}

svg {
  width: 100%;
  height: 100%;
}

.grid-line {
  stroke-width: 1;
}

.wave {
  fill: none;
  stroke-width: 3;
  filter: url(#glow);
  opacity: 0.7;
  stroke-dasharray: 1000;
  stroke-dashoffset: 1000;
  animation: signal 4s linear infinite;
  transition: stroke 0.3s ease;
}

.wave-1 {
  animation-duration: 3s;
  opacity: 0.9;
}

.wave-2 {
  animation-duration: 5s;
  stroke-width: 2;
  opacity: 0.5;
  transform: translateY(20px);
}

.wave-3 {
  animation-duration: 2s;
  stroke-width: 1;
  opacity: 0.4;
  transform: translateY(-30px);
}

@keyframes signal {
  from { stroke-dashoffset: 2000; }
  to { stroke-dashoffset: 0; }
}

.scanlines {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    rgba(18, 16, 16, 0) 50%,
    rgba(0, 0, 0, 0.25) 50%
  ), linear-gradient(
    90deg,
    rgba(255, 0, 0, 0.06),
    rgba(0, 255, 0, 0.02),
    rgba(0, 0, 255, 0.06)
  );
  background-size: 100% 4px, 3px 100%;
  pointer-events: none;
}
</style>
