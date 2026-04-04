<template>
  <div class="spectrum-analyzer" aria-hidden="true">
    <canvas ref="canvasRef"></canvas>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps<{
  audioEl: HTMLAudioElement | null;
  enabled: boolean;
  barCount?: number;
  fftSize?: number;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
let audioContext: AudioContext | null = null;
let analyserNode: AnalyserNode | null = null;
let sourceNode: MediaElementAudioSourceNode | null = null;
let currentAudioEl: HTMLAudioElement | null = null;
let frameId: number | null = null;

const DEFAULT_BAR_COUNT = 64;
const DEFAULT_FFT_SIZE = 2048;
const ALLOWED_BAR_COUNTS = new Set([32, 48, 64, 96, 128]);
const ALLOWED_FFT_SIZES = new Set([1024, 2048, 4096, 8192]);

function resolveBarCount(rawValue: number | undefined): number {
  if (typeof rawValue !== 'number') {
    return DEFAULT_BAR_COUNT;
  }

  return ALLOWED_BAR_COUNTS.has(rawValue) ? rawValue : DEFAULT_BAR_COUNT;
}

function resolveFftSize(rawValue: number | undefined): number {
  if (typeof rawValue !== 'number') {
    return DEFAULT_FFT_SIZE;
  }

  return ALLOWED_FFT_SIZES.has(rawValue) ? rawValue : DEFAULT_FFT_SIZE;
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function ensureCanvasSize() {
  const canvas = canvasRef.value;
  if (!canvas) {
    return;
  }

  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width * ratio));
  canvas.height = Math.max(1, Math.floor(rect.height * ratio));
}

function getThemeColors(): { start: string; end: string } {
  const canvas = canvasRef.value;
  if (!canvas) {
    return { start: 'rgba(132, 255, 187, 0.9)', end: 'rgba(109, 198, 255, 0.9)' };
  }

  const styles = window.getComputedStyle(canvas);
  const startColor = styles.getPropertyValue('--spectrum-color-start').trim() || 'rgba(132, 255, 187, 0.9)';
  const endColor = styles.getPropertyValue('--spectrum-color-end').trim() || 'rgba(109, 198, 255, 0.9)';

  return { start: startColor, end: endColor };
}

function drawSpectrum(bars: number[]) {
  const canvas = canvasRef.value;
  if (!canvas) {
    return;
  }

  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);

  const barWidth = width / bars.length;
  const colors = getThemeColors();
  const gradient = context.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, colors.start);
  gradient.addColorStop(1, colors.end);
  context.fillStyle = gradient;

  for (let index = 0; index < bars.length; index += 1) {
    const value = Math.max(0, Math.min(1, bars[index]));
    const barHeight = value * height;
    const x = index * barWidth;
    const y = height - barHeight;
    context.fillRect(x, y, Math.max(1, barWidth * 0.8), barHeight);
  }
}

function reduceSpectrumToBarCount(spectrum: number[], barCount: number): number[] {
  if (!spectrum.length || barCount <= 0) {
    return [];
  }

 const bars: number[] = [];

// Base for log calculation (adjusting this changes the "slope")
const logBase = Math.pow(spectrum.length, 1 / barCount);

for (let index = 0; index < barCount; index += 1) {
  // Logarithmic start and end indices
  const start = Math.floor(Math.pow(logBase, index));
  const end = Math.ceil(Math.pow(logBase, index + 1));
  
  // Ensure we don't exceed spectrum length and have at least 1 sample
  const clampedStart = Math.min(start, spectrum.length - 1);
  const clampedEnd = Math.min(end, spectrum.length);
  const sampleCount = Math.max(1, clampedEnd - clampedStart);

  let sum = 0;
  for (let cursor = clampedStart; cursor < clampedEnd; cursor += 1) {
    sum += Math.abs(spectrum[cursor] ?? 0);
  }

  // Normalize and push
  // Note: High frequencies often have lower energy, 
  // you might want to multiply sum by a slight 'boost' as index increases.
  bars.push(Math.min(1, (sum / sampleCount) * 4));
}

  return bars;
}

function computeLocalSpectrum(samples: Float32Array): number[] {
  const barCount = resolveBarCount(props.barCount);
  const bars: number[] = [];
  const sampleCount = Math.max(1, Math.floor(samples.length / barCount));

  for (let index = 0; index < barCount; index += 1) {
    const start = index * sampleCount;
    const end = Math.min(samples.length, start + sampleCount);
    let energy = 0;

    for (let cursor = start; cursor < end; cursor += 1) {
      const value = samples[cursor];
      energy += value * value;
    }

    const average = energy / Math.max(1, end - start);
    bars.push(Math.min(1, Math.sqrt(average) * 8));
  }

  return bars;
}

async function computeSpectrum(samples: Float32Array): Promise<number[]> {
  const barCount = resolveBarCount(props.barCount);

  if (!isTauriRuntime()) {
    return computeLocalSpectrum(samples);
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const sampleArray = Array.from(samples);
    const spectrum = await invoke<number[]>('compute_spectrum', { samples: sampleArray });
    return reduceSpectrumToBarCount(spectrum, barCount);
  } catch {
    return computeLocalSpectrum(samples);
  }
}

async function updateFrame() {
  if (!analyserNode || !canvasRef.value) {
    frameId = null;
    return;
  }

  const data = new Float32Array(analyserNode.fftSize);
  analyserNode.getFloatTimeDomainData(data);
  const bars = await computeSpectrum(data);
  drawSpectrum(bars);
  frameId = requestAnimationFrame(updateFrame);
}

function stopAnalyzer() {
  if (frameId !== null) {
    cancelAnimationFrame(frameId);
    frameId = null;
  }

  if (analyserNode) {
    analyserNode.disconnect();
    analyserNode = null;
  }

  // Restore audio output: reconnect source directly to destination
  if (sourceNode && audioContext) {
    try {
      sourceNode.disconnect();
      sourceNode.connect(audioContext.destination);
    } catch {
      // Ignore if audioContext is closed or invalid
    }
  }
}

async function createAnalyzer() {
  if (!props.enabled || !props.audioEl) {
    stopAnalyzer();
    return;
  }

  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    await audioContext.resume().catch(() => undefined);
  }

  if (currentAudioEl !== props.audioEl) {
    if (sourceNode) {
      sourceNode.disconnect();
      sourceNode = null;
    }

    currentAudioEl = props.audioEl;
    sourceNode = audioContext.createMediaElementSource(props.audioEl);
  }

  stopAnalyzer();

  const analyser = audioContext.createAnalyser();
  analyser.fftSize = resolveFftSize(props.fftSize);
  analyser.smoothingTimeConstant = 0.68;

  sourceNode?.disconnect();
  sourceNode?.connect(analyser);
  analyser.connect(audioContext.destination);

  analyserNode = analyser;

  ensureCanvasSize();
  frameId = requestAnimationFrame(updateFrame);
}

watch([() => props.audioEl, () => props.enabled, () => props.barCount, () => props.fftSize], async ([audioEl, enabled]) => {
  if (enabled && audioEl) {
    await createAnalyzer();
  } else {
    stopAnalyzer();
  }
});

onMounted(() => {
  if (props.enabled && props.audioEl) {
    void createAnalyzer();
  }
});

onBeforeUnmount(() => {
  stopAnalyzer();
});
</script>

<style scoped>
.spectrum-analyzer {
  width: 100%;
  height: 500px;
  padding: 200px 0 0;
  margin: -450px 0 10px 0;
  position: relative;
  pointer-events: none;
  z-index: 0;
  flex: 0 0 auto;
  /* Theme colors for spectrum bars - dynamically set from theme */
  --spectrum-color-start: var(--color-accent, rgba(132, 255, 187, 0.9));
  --spectrum-color-end: var(--color-accent-muted, rgba(109, 198, 255, 0.9));
}

.spectrum-analyzer canvas {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
