<template>
  <div class="spectrum-analyzer" aria-hidden="true">
    <canvas ref="canvasRef"></canvas>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as THREE from 'three';
import { useTheme } from '../composables/useTheme';

const props = defineProps<{
  audioEl: HTMLAudioElement | null;
  enabled: boolean;
  barCount?: number;
  fftSize?: number;
  spectrumSensitivity?: number;
  gradientBars?: boolean;
  thresholdLow?: number;
  thresholdMedium?: number;
  thresholdHigh?: number;
}>();

const { getThemeTokenValue } = useTheme();

const canvasRef = ref<HTMLCanvasElement | null>(null);
let audioContext: AudioContext | null = null;
let analyserNode: AnalyserNode | null = null;
let sourceNode: MediaElementAudioSourceNode | null = null;
let currentAudioEl: HTMLAudioElement | null = null;
let frameId: number | null = null;

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.OrthographicCamera | null = null;
let barGroup: THREE.Group | null = null;
let barMeshes: Array<THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>> = [];
let canvasWidth = 0;
let canvasHeight = 0;

const DEFAULT_BAR_COUNT = 64;
const DEFAULT_FFT_SIZE = 2048;
const DEFAULT_SPECTRUM_SENSITIVITY = 1;
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

function resolveSpectrumSensitivity(rawValue: number | undefined): number {
  if (typeof rawValue !== 'number') {
    return DEFAULT_SPECTRUM_SENSITIVITY;
  }

  return rawValue >= 0.5 && rawValue <= 2 ? rawValue : DEFAULT_SPECTRUM_SENSITIVITY;
}

function resolveSpectrumThreshold(rawValue: number | undefined, fallback: number): number {
  if (typeof rawValue !== 'number' || Number.isNaN(rawValue)) {
    return fallback;
  }

  return Math.min(1, Math.max(0, rawValue));
}

function applySpectrumSensitivity(bars: number[]): number[] {
  const sensitivity = resolveSpectrumSensitivity(props.spectrumSensitivity);
  if (sensitivity === DEFAULT_SPECTRUM_SENSITIVITY) {
    return bars;
  }

  return bars.map((bar) => Math.min(1, Math.max(0, bar * sensitivity)));
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

function getThemeColors(): {
  accentMuted: string;
  thresholdLow: string;
  thresholdMedium: string;
  thresholdHigh: string;
} {
  return {
    accentMuted: getThemeTokenValue('--color-chat-text-muted', 'rgba(109, 198, 255, 0.9)'),
    thresholdLow: getThemeTokenValue('--color-spectrum-threshold-low', 'rgba(132, 255, 187, 0.9)'),
    thresholdMedium: getThemeTokenValue('--color-spectrum-threshold-medium', 'rgba(255, 209, 102, 0.9)'),
    thresholdHigh: getThemeTokenValue('--color-spectrum-threshold-high', 'rgba(255, 107, 107, 0.9)'),
  };
}

function getBarColor(value: number) {
  const colors = getThemeColors();
  const accent = getThemeTokenValue('--color-accent', 'rgba(109, 198, 255, 0.9)');

  if (!props.gradientBars) {
    return accent;
  }

  const lowThreshold = resolveSpectrumThreshold(props.thresholdLow, 0.15);
  const mediumThreshold = resolveSpectrumThreshold(props.thresholdMedium, 0.30);
  const highThreshold = resolveSpectrumThreshold(props.thresholdHigh, 0.60);

  if (value >= highThreshold) {
    return colors.thresholdHigh;
  }

  if (value >= mediumThreshold) {
    return colors.thresholdMedium;
  }

  if (value >= lowThreshold) {
    return colors.thresholdLow;
  }

  return colors.accentMuted;
}

function updateRendererSize() {
  if (!canvasRef.value || !renderer || !camera) {
    return;
  }

  ensureCanvasSize();

  const width = canvasRef.value.width;
  const height = canvasRef.value.height;
  if (width === canvasWidth && height === canvasHeight) {
    return;
  }

  canvasWidth = width;
  canvasHeight = height;
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(width, height, false);
  camera.left = 0;
  camera.right = width;
  camera.top = height;
  camera.bottom = 0;
  camera.updateProjectionMatrix();

  if (barMeshes.length) {
    const barCount = resolveBarCount(props.barCount);
    const spacing = width / barCount;
    const barWidth = Math.max(1, spacing * 0.72);

    barMeshes.forEach((mesh, index) => {
      mesh.scale.x = barWidth;
      mesh.position.x = index * spacing + spacing / 2;
    });
  }
}

function createThreeRenderer() {
  const canvas = canvasRef.value;
  if (!canvas || renderer) {
    return;
  }

  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(window.devicePixelRatio || 1);

  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(0, 1, 1, 0, -1000, 1000);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);

  scene.add(camera);
  updateRendererSize();
}

function disposeThreeRenderer() {
  if (barGroup && scene) {
    scene.remove(barGroup);
    barGroup = null;
  }

  for (const mesh of barMeshes) {
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
  barMeshes = [];

  if (renderer) {
    renderer.dispose();
    renderer = null;
  }

  scene = null;
  camera = null;
  canvasWidth = 0;
  canvasHeight = 0;
}

function buildSpectrumBars(requestedCount: number) {
  createThreeRenderer();
  if (!renderer || !scene || !camera) {
    return;
  }

  const barCount = resolveBarCount(requestedCount);
  if (barGroup && scene) {
    scene.remove(barGroup);
  }

  for (const mesh of barMeshes) {
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
  barMeshes = [];

  barGroup = new THREE.Group();
  scene.add(barGroup);

  const width = Math.max(1, canvasWidth);
  const spacing = width / barCount;
  const barWidth = Math.max(1, spacing * 0.72);

  for (let index = 0; index < barCount; index += 1) {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({
      color: getThemeTokenValue('--color-accent', '#39ff14'),
      transparent: true,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.set(barWidth, 1, 1);
    mesh.position.set(index * spacing + spacing / 2, 0.5, 0);
    barGroup.add(mesh);
    barMeshes.push(mesh);
  }

  renderer.render(scene, camera);
}

function drawSpectrum(bars: number[]) {
  if (!renderer || !scene || !camera || !barMeshes.length) {
    return;
  }

  updateRendererSize();

  const height = Math.max(1, canvasHeight);

  for (let index = 0; index < Math.min(bars.length, barMeshes.length); index += 1) {
    const value = Math.max(0, Math.min(1, bars[index]));
    const mesh = barMeshes[index];
    const barHeight = Math.max(1, value * height);

    mesh.scale.y = barHeight;
    mesh.position.y = barHeight * 0.5;
    mesh.material.color.setStyle(getBarColor(value));
  }

  renderer.render(scene, camera);
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

  return applySpectrumSensitivity(bars);
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
    return applySpectrumSensitivity(reduceSpectrumToBarCount(spectrum, barCount));
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

  updateRendererSize();
  buildSpectrumBars(resolveBarCount(props.barCount));
  frameId = requestAnimationFrame(updateFrame);
}

function handleResize() {
  updateRendererSize();
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

watch([
  () => props.audioEl,
  () => props.enabled,
  () => props.fftSize,
], async ([audioEl, enabled]) => {
  if (enabled && audioEl) {
    await createAnalyzer();
  } else {
    stopAnalyzer();
  }
});

watch(
  [
    () => props.barCount,
    () => props.gradientBars,
    () => props.thresholdLow,
    () => props.thresholdMedium,
    () => props.thresholdHigh,
  ], () => {
    if (renderer) {
      buildSpectrumBars(resolveBarCount(props.barCount));
    }
  },
);

onMounted(() => {
  createThreeRenderer();
  buildSpectrumBars(resolveBarCount(props.barCount));

  if (props.enabled && props.audioEl) {
    void createAnalyzer();
  }

  window.addEventListener('resize', handleResize);
});

onBeforeUnmount(() => {
  stopAnalyzer();
  disposeThreeRenderer();
  window.removeEventListener('resize', handleResize);
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
}

.spectrum-analyzer canvas {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
