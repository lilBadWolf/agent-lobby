<template>
  <div class="matrix-bg" :style="bgStyle">
    <div
      class="matrix-column"
      v-for="column in columns"
      :key="column.id"
      :style="getColumnStyle(column)"
    >
      <span
        v-for="row in rows"
        :key="`${column.id}-${row}`"
        class="matrix-char"
        :style="getCharStyle(column, row)"
      >
        {{ getChar(column, row) }}
      </span>
    </div>
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

interface MatrixColumn {
  id: number;
  initialOffset: number;
  speed: number;
  opacity: number;
}

const columns: MatrixColumn[] = Array.from({ length: 44 }, (_, index) => ({
  id: index,
  initialOffset: Math.random(),
  speed: 5.5 + (index % 5) * 0.7,
  opacity: 0.35 + ((index % 5) * 0.1),
}));
const rows = Array.from({ length: 54 }, (_, index) => index + 1);
// Use only ASCII and common matrix-style glyphs for maximum font compatibility
const characters = [
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J',
  'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T',
  'U', 'V', 'W', 'X', 'Y', 'Z',
  '@', '#', '$', '%', '&', '*', '+', '-', '=', '?',
  '/', '\\', '|', '!', '~', '^', ':', ';', '.', ','
];

const themeColors = computed(() => {
  void currentTheme.value;
  void themeChangeTick.value;

  const palette = getThemeUserColors();
  const activePalette = palette.length > 0 ? palette : ['#39ff14', '#00ff00', '#00ffaa'];

  return {
    bg: getThemeTokenValue('--auth-background-base', getThemeTokenValue('--color-bg-base', '#030904')),
    primary: getThemeTokenValue('--auth-matrix-color', activePalette[0]),
    secondary: activePalette[1] ?? activePalette[0],
    tertiary: activePalette[2] ?? activePalette[0],
  };
});

const bgStyle = computed(() => ({
  background: themeColors.value.bg,
  color: themeColors.value.primary,
}));

function getColumnStyle(column: MatrixColumn) {
  // Use a negative animation delay to start each column at a random point in the animation cycle
  return {
    animationDelay: `-${(column.initialOffset * column.speed).toFixed(2)}s`,
    animationDuration: `${column.speed}s`,
    opacity: column.opacity,
  };
}

function getChar(column: { id: number }, row: number) {
  const seed = column.id * 61 + row * 13;
  return characters[Math.abs(seed) % characters.length];
}

function getCharStyle(column: { id: number }, row: number) {
  const head = row === rows.length;
  const accent = head ? themeColors.value.secondary : themeColors.value.primary;
  const fade = 0.09 + ((row / rows.length) * 0.55) + ((column.id % 4) * 0.02);
  const offset = (column.id % 3) * 0.5;

  return {
    opacity: head ? 1 : Math.min(1, fade),
    color: accent,
    filter: head ? 'drop-shadow(0 0 10px currentColor)' : 'none',
    transform: `translateY(${row * 2 + offset}px)`,
  };
}
</script>

<style scoped>
.matrix-bg {
  position: fixed;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(44, minmax(2px, 1fr));
  gap: 0.5px;
  padding: 12px 10px;
  overflow: hidden;
  z-index: -1;
}

.matrix-column {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 0.5px;
  animation: matrix-fall linear infinite;
}


.matrix-char {
  display: block;
  font-family: 'Fira Mono', 'Consolas', 'Courier New', Courier, monospace;
  font-size: 16px;
  line-height: 1.05;
  color: currentColor;
  /* Remove text-shadow for sharpness */
  text-shadow: none;
  white-space: nowrap;
  opacity: 0.25;
  transition: color 0.2s ease, opacity 0.2s ease;
  /* Prevent font smoothing for crisp look */
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: auto;
}

.matrix-char:nth-child(odd) {
  transform: translateX(1px);
}

.matrix-char:nth-child(even) {
  transform: translateX(-1px);
}

.matrix-char:last-child {
  opacity: 1;
}


/* Removed dark overlay from columns for clarity */

@keyframes matrix-fall {
  from {
    transform: translateY(-140%);
  }
  to {
    transform: translateY(140%);
  }
}
</style>
