<template>
  <div ref="container" class="lava-lamp-container"></div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import * as THREE from 'three';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import { useTheme } from '../composables/useTheme';

const container = ref<HTMLElement | null>(null);
let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let effect: MarchingCubes | null = null;
let material: THREE.Material | null = null;
let animationId: number | null = null;
let ballParams: Array<{ xCenter: number; xPhase: number; zCenter: number; zPhase: number; yOffset: number; size: number; hueOffset: number; depthShift: number; themeColor: string }> = [];
let keyLight: THREE.PointLight | null = null;
let fillLight: THREE.PointLight | null = null;
let rimLight: THREE.PointLight | null = null;
let bottomWarmLight: THREE.PointLight | null = null;
let bottomFillLight: THREE.PointLight | null = null;
let topGreenGlow: THREE.PointLight | null = null;
let topYellowGlow: THREE.PointLight | null = null;
let sideMagentaGlow: THREE.PointLight | null = null;
let sideCyanGlow: THREE.PointLight | null = null;

// CONFIGURATION
const RESOLUTION = 64;     // Grid resolution (higher = smoother but slower)
const BALL_COUNT = 14;     // Number of blobs
const STREAM_CENTERS = [0.12, 0.32, 0.52, 0.72, 0.92];
const NEON_ACCENT_COLORS = ['#ff5cff', '#ffd200', '#59ff2e', '#28ffef', '#ff8f00', '#adff2f', '#b3ff00', '#ff5a00'];

const { currentTheme, getThemeUserColors } = useTheme();
const themePalette = computed(() => {
  void currentTheme.value;
  const palette = getThemeUserColors();
  const normalizedPalette = palette.length > 0 ? palette : ['#ff6a00', '#ffb347', '#ff3e3e', '#ff70d1', '#3dd1ff'];
  return [...normalizedPalette, ...NEON_ACCENT_COLORS, ...NEON_ACCENT_COLORS, ...NEON_ACCENT_COLORS];
});

function parseThemeColor(color: string) {
  const value = color.trim();
  if (/^#([0-9a-fA-F]{8})$/.test(value)) {
    return `#${value.slice(1, 7)}`;
  }
  if (/^#([0-9a-fA-F]{4})$/.test(value)) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
  }
  return value;
}

function animate() {
  if (!renderer || !scene || !camera || !effect) return;

  const time = performance.now() * 0.001;

  // 1. Reset the scalar field (clears previous frame's blobs)
  effect.reset();

  // 2. Update physics and add balls to the field
  for (let i = 0; i < BALL_COUNT; i++) {
    const params = ballParams[i];
    const y = ((time * 0.17 + params.yOffset) % 1.3) * 1.1 - 0.1;
    const x = params.xCenter + Math.sin(params.xPhase + time * 0.23) * 0.18;
    const z = params.zCenter + Math.cos(params.zPhase + time * 0.26) * 0.16 + params.depthShift;

    const color = new THREE.Color(parseThemeColor(params.themeColor));

    const rad = params.size + Math.sin(params.xPhase + time * 0.7) * 0.013;
    const strength = rad * 5.8;
    const subtract = 15.2;

    effect.addBall(x, y, z, strength, subtract, color);
  }

  // 3. Triangulate the field into geometry
  effect.update();

  // Keep a subtle overall spin while the blobs flow upward
  effect.rotation.y = time * 0.016;

  if (keyLight) {
    keyLight.position.x = 0.9 + Math.sin(time * 0.18) * 0.12;
    keyLight.position.y = 2.0 + Math.cos(time * 0.12) * 0.08;
  }

  if (fillLight) {
    fillLight.position.x = -1.5 + Math.cos(time * 0.16) * 0.16;
    fillLight.position.z = 1.8 + Math.sin(time * 0.14) * 0.14;
  }

  if (topGreenGlow) {
    topGreenGlow.position.x = -1.6 + Math.sin(time * 0.11) * 0.12;
    topGreenGlow.position.z = 2.2 + Math.cos(time * 0.09) * 0.10;
  }

  if (topYellowGlow) {
    topYellowGlow.position.x = 1.4 + Math.cos(time * 0.13) * 0.14;
    topYellowGlow.position.z = 2.0 + Math.sin(time * 0.10) * 0.12;
  }

  if (sideMagentaGlow) {
    sideMagentaGlow.position.y = 0.2 + Math.sin(time * 0.12) * 0.14;
    sideMagentaGlow.position.z = 0.6 + Math.cos(time * 0.15) * 0.12;
  }

  if (sideCyanGlow) {
    sideCyanGlow.position.y = 0.4 + Math.cos(time * 0.14) * 0.13;
    sideCyanGlow.position.z = 0.8 + Math.sin(time * 0.11) * 0.10;
  }

  if (bottomWarmLight) {
    bottomWarmLight.position.x = Math.sin(time * 0.08) * 0.12;
    bottomWarmLight.position.y = -2.8 + Math.cos(time * 0.07) * 0.06;
  }

  if (bottomFillLight) {
    bottomFillLight.position.x = -0.9 + Math.cos(time * 0.09) * 0.10;
    bottomFillLight.position.y = -2.4 + Math.sin(time * 0.10) * 0.08;
  }

  renderer.render(scene, camera);
  animationId = requestAnimationFrame(animate);
}

onMounted(() => {
  if (!container.value) return;

  // Setup Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x040018);
  
  // Camera Setup
  camera = new THREE.PerspectiveCamera(50, container.value.clientWidth / container.value.clientHeight, 0.1, 100);
  camera.position.set(0, 0, 3.9);

  // Renderer Setup
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(container.value.clientWidth, container.value.clientHeight);
  renderer.setClearColor(0x040018, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.value.appendChild(renderer.domElement);

  // Material: Reflective neon lava blobs
  material = new THREE.MeshPhongMaterial({
    vertexColors: true, // REQUIRED for theme-based blob colors
    color: 0xffffff,
    specular: 0xffffff,
    shininess: 110,
    emissive: 0xffffff,
    emissiveIntensity: 0.15,
    transparent: true,
    opacity: 0.94,
    side: THREE.DoubleSide,
    reflectivity: 0.9,
  });

  const palette = themePalette.value;
  ballParams = Array.from({ length: BALL_COUNT }, (_, i) => {
    const center = STREAM_CENTERS[i % STREAM_CENTERS.length];
    const useAccent = Math.random() < 0.5;
    const themeColor = useAccent
      ? NEON_ACCENT_COLORS[Math.floor(Math.random() * NEON_ACCENT_COLORS.length)]
      : palette[Math.floor(Math.random() * palette.length)];

    return {
      xCenter: Math.min(Math.max(center + (Math.random() * 0.12 - 0.06), 0.05), 0.95),
      xPhase: Math.random() * Math.PI * 1.5,
      zCenter: Math.min(Math.max(0.4 + (Math.random() * 0.36 - 0.18), 0.10), 0.90),
      zPhase: Math.random() * Math.PI * 1.8,
      yOffset: Math.random() * 0.8,
      size: 0.06 + Math.random() * 0.04,
      hueOffset: Math.random() * 0.18,
      depthShift: Math.random() * 0.12 - 0.06,
      themeColor,
    };
  });

  // Initialize Marching Cubes
  // resolution, material, enableColors, enableUvs, maxPolyCount
  effect = new MarchingCubes(RESOLUTION, material!, true, true, 50000);
  effect.position.set(0, 0, 0);
  effect.scale.set(2.0, 2.4, 1.6); // Stretch horizontally and vertically for a fuller lava lamp effect
  scene.add(effect);

  // Lighting
  keyLight = new THREE.PointLight(0x8d6bff, 2.4, 12);
  keyLight.position.set(0.9, 2.0, 2.4);
  scene.add(keyLight);

  fillLight = new THREE.PointLight(0x67e0ff, 1.4, 14);
  fillLight.position.set(-1.5, -1.0, 1.8);
  scene.add(fillLight);

  rimLight = new THREE.PointLight(0x7b4cff, 0.9, 14);
  rimLight.position.set(0, -2.5, -3.5);
  scene.add(rimLight);

  bottomWarmLight = new THREE.PointLight(0x7a34ff, 2.2, 18);
  bottomWarmLight.position.set(0, -2.8, 1.2);
  scene.add(bottomWarmLight);

  bottomFillLight = new THREE.PointLight(0x3ac0ff, 1.2, 20);
  bottomFillLight.position.set(-0.9, -2.4, 0.9);
  scene.add(bottomFillLight);

  topGreenGlow = new THREE.PointLight(0x8dff5a, 1.1, 16);
  topGreenGlow.position.set(-1.6, 1.8, 2.2);
  scene.add(topGreenGlow);

  topYellowGlow = new THREE.PointLight(0xffd84e, 1.0, 16);
  topYellowGlow.position.set(1.4, 1.6, 2.0);
  scene.add(topYellowGlow);

  sideMagentaGlow = new THREE.PointLight(0xff4cff, 0.9, 14);
  sideMagentaGlow.position.set(1.8, 0.2, 0.6);
  scene.add(sideMagentaGlow);

  sideCyanGlow = new THREE.PointLight(0x3de0ff, 0.9, 14);
  sideCyanGlow.position.set(-1.7, 0.4, 0.8);
  scene.add(sideCyanGlow);

  const ambientLight = new THREE.AmbientLight(0x2b1c55);
  scene.add(ambientLight);

  // Start
  animate();
  window.addEventListener('resize', onResize);
});

function onResize() {
  if (!container.value || !camera || !renderer) return;
  camera.aspect = container.value.clientWidth / container.value.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.value.clientWidth, container.value.clientHeight);
}

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  if (animationId) cancelAnimationFrame(animationId);

  if (renderer) {
    if (container.value?.contains(renderer.domElement)) {
      container.value.removeChild(renderer.domElement);
    }
    renderer.dispose();
    renderer = null;
  }

  if (effect) {
    if (effect.geometry) effect.geometry.dispose();
    if (material) material.dispose();
    effect = null;
  }
});
</script>

<style scoped>
.lava-lamp-container {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  background: radial-gradient(circle at center, #090019 0%, #020006 65%),
              radial-gradient(circle at 25% 20%, rgba(112, 56, 210, 0.20), transparent 22%),
              radial-gradient(circle at 75% 15%, rgba(38, 153, 255, 0.12), transparent 16%);
  overflow: hidden;
  z-index: 0;
}
</style>
