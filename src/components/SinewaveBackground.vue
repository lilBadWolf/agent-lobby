<template>
  <div class="radio-bg">
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
      <path v-for="i in 10" :key="'h'+i" :d="`M 0 ${i * 50} L 1000 ${i * 50}`" class="grid-line" />
      <path v-for="i in 20" :key="'v'+i" :d="`M ${i * 50} 0 L ${i * 50} 500`" class="grid-line" />

      <!-- Animated Sine Waves -->
      <path v-for="n in 3" :key="n" :class="['wave', `wave-${n}`]" :d="sinePath" />
    </svg>
    <div class="scanlines"></div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

// Generates a simple sine wave path across the 1000-unit viewBox
const sinePath = computed(() => {
  let d = 'M 0 250';
  for (let x = 0; x <= 1000; x += 10) {
    const y = 250 + Math.sin(x / 50) * 100;
    d += ` L ${x} ${y}`;
  }
  return d;
});
</script>

<style scoped>
.radio-bg {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: #020a02; /* Deep forest/black */
  overflow: hidden;
  z-index: -1;
}

svg {
  width: 100%;
  height: 100%;
}

.grid-line {
  stroke: rgba(0, 255, 65, 0.1);
  stroke-width: 1;
}

.wave {
  fill: none;
  stroke: #39ff14; /* Matrix/Neon Green */
  stroke-width: 3;
  filter: url(#glow);
  opacity: 0.7;
  stroke-dasharray: 1000;
  stroke-dashoffset: 1000;
  animation: signal 4s linear infinite;
}

.wave-1 { animation-duration: 3s; opacity: 0.9; }
.wave-2 { animation-duration: 5s; stroke: #008f11; stroke-width: 2; opacity: 0.5; transform: translateY(20px); }
.wave-3 { animation-duration: 2s; stroke: #adff2f; stroke-width: 1; opacity: 0.4; transform: translateY(-30px); }

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
