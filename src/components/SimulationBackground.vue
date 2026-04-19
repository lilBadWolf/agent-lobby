<template>
  <div class="matrix-bg" :style="bgStyle">
    <div 
      v-for="col in activeColumns" 
      :key="col.id" 
      class="matrix-col" 
      :style="getColumnStyle(col)"
    >
      <span 
        v-for="(char, rowIndex) in col.chars" 
        :key="rowIndex" 
        class="matrix-char"
        :class="{ 'is-head': rowIndex === col.chars.length - 1 }"
        :style="getCharStyle(col, rowIndex)"
      >
        {{ char }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useTheme } from '../composables/useTheme';

// --- TYPES ---
// Strict typing fixes the "string | number" errors
interface MatrixColumn {
  id: number;
  tier: 'fg' | 'mg' | 'bg';
  lanePos: number;
  size: number;
  speed: number;
  initialOffset: number;
  opacity: number;
  z: number;
  brightness: number;
  chars: string[];
}

const { currentTheme, getThemeUserColors, getThemeTokenValue } = useTheme();
const themeChangeTick = ref(0);
let themeObserver: MutationObserver | null = null;
let glitchInterval: number | undefined = undefined;

// --- CONFIGURATION ---
const TOTAL_LANES = 125; 
const ROW_COUNT = 32;   
const CHARS = "ﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ012345789Z:・.=*+-<>_".split("");

// Reactive Grid State
const activeColumns = reactive<MatrixColumn[]>([]);

onMounted(() => {
  if (typeof document === 'undefined') return;
  
  initGrid();

  // --- THE DECODING ENGINE ---
  glitchInterval = window.setInterval(() => {
    activeColumns.forEach(col => {
      // 1. Head Glitch: The cursor changes constantly
      if (Math.random() > 0.5) {
        const headIdx = col.chars.length - 1;
        col.chars[headIdx] = getRandomChar();
      }

      // 2. Trail Glitch: Background noise
      // Dense background columns have more "static" (higher flip chance)
      const flipChance = col.tier === 'bg' ? 0.92 : 0.96;
      const flipCount = col.tier === 'bg' ? 3 : 1;
      
      for (let k = 0; k < flipCount; k++) {
        if (Math.random() > flipChance) { 
           // Safe access check
           const randomRow = Math.floor(Math.random() * (col.chars.length - 1));
           col.chars[randomRow] = getRandomChar();
        }
      }
    });
  }, 35); 

  themeObserver = new MutationObserver(() => themeChangeTick.value++);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
});

onBeforeUnmount(() => {
  themeObserver?.disconnect();
  clearInterval(glitchInterval);
});

function getRandomChar(): string {
  return CHARS[Math.floor(Math.random() * CHARS.length)];
}

function initGrid() {
  activeColumns.length = 0; 
  
  // COOLDOWN SYSTEM:
  // Forces a minimum gap between Foreground columns
  let fgCooldown = 0; 
  const MIN_FG_DISTANCE = 15; // Minimum lanes between huge columns

  for (let i = 0; i < TOTAL_LANES; i++) {
    const lanePos = (i / TOTAL_LANES) * 100;
    const rand = Math.random();
    
    let tier: MatrixColumn['tier'];
    let size, speed, opacity, z, brightness;

    // Decrement cooldown
    if (fgCooldown > 0) fgCooldown--;

    // --- DENSITY & SPACING LOGIC ---
    
    // 1. Foreground: Check randomness AND Cooldown
    if (rand < 0.05 && fgCooldown === 0) {
      tier = 'fg'; 
      size = 60; // Massive
      speed = 15; // Slow
      opacity = 1.0; 
      z = 20; 
      brightness = 1.5;
      fgCooldown = MIN_FG_DISTANCE; // Reset cooldown
    } 
    // 2. Midground: ~20%
    else if (rand < 0.25) {
      tier = 'mg'; 
      size = 22; 
      speed = 10; 
      opacity = 0.7; 
      z = 5; 
      brightness = 1.1;
    } 
    // 3. Background: ~75% (Fill the rest)
    else {
      tier = 'bg'; 
      size = 14; 
      speed = 2; // Fast
      opacity = 0.25; 
      z = 1; 
      brightness = 0.8;
    }

    activeColumns.push({
      id: i,
      tier,
      lanePos, 
      size,
      speed: speed + Math.random() * (speed * 0.4), 
      initialOffset: Math.random() * 20,
      opacity,
      z,
      brightness,
      chars: Array.from({ length: ROW_COUNT }, getRandomChar)
    });
  }
}

const themeColors = computed(() => {
  void currentTheme.value;
  void themeChangeTick.value;
  const palette = getThemeUserColors();
  return {
    bg: getThemeTokenValue('--auth-background-base', '#030904'),
    primary: getThemeTokenValue('--auth-matrix-color', palette?.[0] || '#39ff14'),
    head: '#ffffff' 
  };
});

const bgStyle = computed(() => ({
  '--matrix-color': themeColors.value.primary,
  '--matrix-head': themeColors.value.head,
  backgroundColor: themeColors.value.bg,
}));

function getColumnStyle(col: MatrixColumn) {
  return {
    left: `${col.lanePos}%`,
    fontSize: `${col.size}px`,
    animationDuration: `${col.speed}s`,
    animationDelay: `-${col.initialOffset}s`,
    opacity: col.opacity,
    zIndex: col.z,
    filter: `brightness(${col.brightness})`
  };
}

function getCharStyle(col: MatrixColumn, index: number) {
  const isHead = index === col.chars.length - 1;
  
  // Trail Fade Logic
  let op = (index + 3) / col.chars.length; 
  if (op > 1) op = 1;

  return {
    opacity: isHead ? 1 : op,
    // Only apply heavy glow to the sparse foreground/midground to save GPU
    textShadow: (isHead && col.z > 1) 
      ? `0 0 ${col.size * 0.4}px var(--matrix-head), 0 0 ${col.size * 0.8}px var(--matrix-color)` 
      : 'none',
    color: isHead ? 'var(--matrix-head)' : 'var(--matrix-color)',
    fontWeight: isHead ? 900 : 500,
  };
}
</script>

<style scoped>
.matrix-bg {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: #000;
  z-index: -1;
  font-family: 'MS Gothic', 'Meiryo', monospace;
}

.matrix-col {
  position: absolute;
  top: -100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  will-change: transform; 
  animation: fall linear infinite;
}

.matrix-char {
  line-height: 0.85;
  white-space: nowrap;
  user-select: none;
  -webkit-font-smoothing: none; 
}

.is-head {
  z-index: 2;
  transform: scale(1.15); 
}

@keyframes fall {
  from { transform: translateY(0); }
  to { transform: translateY(220vh); }
}
</style>
