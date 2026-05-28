<template>
  <div ref="root" class="bubble-effect-root"></div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  AmbientLight,
  CanvasTexture,
  Color,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from 'three';

const props = defineProps<{ text: string }>();
const emit = defineEmits<{ (event: 'done'): void }>();
const root = ref<HTMLDivElement | null>(null);

let renderer: WebGLRenderer | null = null;
let scene: Scene | null = null;
let camera: PerspectiveCamera | null = null;
let frameId: number | null = null;
let textMesh: Mesh<PlaneGeometry, MeshBasicMaterial> | null = null;
let letterOrigins: Array<{ x: number; y: number }> = [];
let bubbleMeshes: Array<Mesh<SphereGeometry, MeshStandardMaterial>> = [];
let startTime = 0;
let lastTime = 0;
let hasStartedBubbles = false;

const totalDuration = 3200;
const showTextDuration = 1000;

function finishEffect() {
  cleanup();
  emit('done');
}

function getCanvasTexture(text: string, maxContainerWidth: number) {
  const padding = 80;
  const maxCanvasWidth = Math.max(400, Math.floor(maxContainerWidth - padding * 2));
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas not supported');
  }

  const fontSize = 120;
  const lineHeight = fontSize * 1.2;
  const font = `bold ${fontSize}px "Comic Sans MS", "Comic Sans", cursive, system-ui, sans-serif`;
  context.font = font;

  const words = text.split(/(\s+)/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const nextLine = currentLine ? currentLine + word : word;
    const nextWidth = context.measureText(nextLine).width;
    if (nextWidth > maxCanvasWidth && currentLine) {
      lines.push(currentLine.trimEnd());
      currentLine = word.trimStart();
    } else {
      currentLine = nextLine;
    }
  }
  if (currentLine) {
    lines.push(currentLine.trimEnd());
  }

  const width = Math.max(400, Math.min(maxCanvasWidth, Math.max(...lines.map((line) => context.measureText(line).width))));
  const height = Math.ceil(lines.length * lineHeight + padding * 1.5);

  canvas.width = Math.ceil(width + padding * 2);
  canvas.height = Math.ceil(height);

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'rgba(0, 0, 0, 0)';
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.font = font;
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillStyle = '#7ac7ff';
  context.shadowColor = 'rgba(138, 201, 255, 0.9)';
  context.shadowBlur = 24;

  const letterOrigins: Array<{ x: number; y: number }> = [];
  const baseX = padding;
  let y = padding / 1.2 + lineHeight / 2;

  for (const line of lines) {
    const lineWidth = context.measureText(line).width;
    const lineStart = baseX + (width - lineWidth) / 2;
    let x = lineStart;

    for (const char of Array.from(line)) {
      const charWidth = context.measureText(char).width;
      if (char !== ' ') {
        letterOrigins.push({ x: x + charWidth / 2, y });
      }
      x += charWidth;
    }

    context.fillText(line, lineStart, y);
    y += lineHeight;
  }

  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return { texture, width: canvas.width, height: canvas.height, letterOrigins };
}

function buildTextPlane(text: string, maxContainerWidth: number) {
  const { texture, width, height, letterOrigins: rawLetterOrigins } = getCanvasTexture(text, maxContainerWidth);
  const aspect = width / height;

  const visibleHeight = 2 * camera!.position.z * Math.tan((camera!.fov * Math.PI) / 360);
  const visibleWidth = visibleHeight * camera!.aspect;

  let planeWidth = visibleWidth * 0.92;
  let planeHeight = planeWidth / aspect;

  if (planeHeight > visibleHeight * 0.92) {
    planeHeight = visibleHeight * 0.92;
    planeWidth = planeHeight * aspect;
  }

  const geometry = new PlaneGeometry(planeWidth, planeHeight);
  const material = new MeshBasicMaterial({ map: texture, transparent: true });
  const mesh = new Mesh(geometry, material);
  mesh.position.set(0, 0, 0);

  const originPoints = rawLetterOrigins.map((origin) => ({
    x: ((origin.x - width / 2) / width) * planeWidth,
    y: ((height / 2 - origin.y) / height) * planeHeight,
  }));

  return { mesh, letterOrigins: originPoints };
}

function spawnBubbles(origins: Array<{ x: number; y: number }>) {
  if (!scene) return;
  const bubbleCount = Math.min(64, Math.max(24, origins.length * 2));
  const baseSize = 0.1;

  for (let i = 0; i < bubbleCount; i += 1) {
    const origin = origins[i % origins.length];
    const size = baseSize * (0.7 + Math.random() * 1.0);
    const geometry = new SphereGeometry(size, 14, 14);
    const material = new MeshStandardMaterial({
      color: new Color(0.5 + Math.random() * 0.15, 0.75 + Math.random() * 0.15, 1),
      transparent: true,
      opacity: 1,
      roughness: 0.35,
      metalness: 0.08,
      emissive: new Color(0.08, 0.28, 0.85),
      emissiveIntensity: 0.28,
    });

    const bubble = new Mesh(geometry, material);
    const jitterX = (Math.random() - 0.5) * 0.2;
    const jitterY = (Math.random() - 0.5) * 0.16;
    const z = (Math.random() - 0.5) * 0.2;
    bubble.position.set(origin.x + jitterX, origin.y + jitterY, z);
    bubble.userData = {
      velocity: new Vector3((Math.random() - 0.5) * 0.24, 0.6 + Math.random() * 0.8, (Math.random() - 0.5) * 0.08),
      rotationSpeed: new Vector3(Math.random() * 0.8, Math.random() * 0.8, Math.random() * 0.8),
    };

    bubbleMeshes.push(bubble);
    scene.add(bubble);
  }
}

function resizeCanvas() {
  if (!root.value || !renderer || !camera) return;
  const width = Math.max(240, root.value.clientWidth);
  const height = Math.max(180, root.value.clientHeight);
  renderer.setSize(width, height);
  renderer.domElement.style.width = `${width}px`;
  renderer.domElement.style.height = `${height}px`;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function animate(now: number) {
  if (!scene || !camera || !renderer) return;
  if (!startTime) {
    startTime = now;
    lastTime = now;
  }

  const elapsed = now - startTime;
  const delta = (now - lastTime) / 1000;
  lastTime = now;

  if (elapsed > showTextDuration && !hasStartedBubbles) {
    hasStartedBubbles = true;
    if (textMesh) {
      scene.remove(textMesh);
      textMesh.geometry.dispose();
      textMesh.material.dispose();
      textMesh = null;
    }
    spawnBubbles(letterOrigins.length ? letterOrigins : [{ x: 0, y: 0 }]);
  }

  if (hasStartedBubbles) {
    const fadeStart = totalDuration - 500;
    const alpha = elapsed > fadeStart ? Math.max(0, 1 - (elapsed - fadeStart) / 500) : 1;
    bubbleMeshes.forEach((bubble) => {
      const data = bubble.userData as { velocity: Vector3; rotationSpeed: Vector3 };
      bubble.position.addScaledVector(data.velocity, delta);
      bubble.rotation.x += data.rotationSpeed.x * delta;
      bubble.rotation.y += data.rotationSpeed.y * delta;
      bubble.rotation.z += data.rotationSpeed.z * delta;
      (bubble.material as MeshStandardMaterial).opacity = alpha;
    });
  }

  if (scene && camera && renderer) {
    renderer.render(scene, camera);
  }

  if (elapsed >= totalDuration) {
    finishEffect();
    return;
  }

  frameId = window.requestAnimationFrame(animate);
}

function startEffect() {
  cleanup();

  if (!root.value) {
    emit('done');
    return;
  }

  if (!props.text) {
    emit('done');
    return;
  }

  scene = new Scene();
  scene.background = null;
  scene.fog = null;

  camera = new PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 0, 4.5);
  camera.lookAt(0, 0, 0);

  const ambient = new AmbientLight(0xffffff, 1.2);
  scene.add(ambient);

  renderer = new WebGLRenderer({ alpha: true, antialias: true });
  renderer.setClearColor(new Color(0x000000), 0);
  root.value.appendChild(renderer.domElement);

  resizeCanvas();

  const containerWidth = root.value?.clientWidth ?? 800;
  const planeData = buildTextPlane(props.text, containerWidth);
  textMesh = planeData.mesh;
  letterOrigins = planeData.letterOrigins;

  if (textMesh) {
    scene.add(textMesh);
  }

  startTime = 0;
  lastTime = 0;
  hasStartedBubbles = false;

  frameId = window.requestAnimationFrame(animate);
}

function cleanup() {
  if (frameId !== null) {
    window.cancelAnimationFrame(frameId);
    frameId = null;
  }
  window.removeEventListener('resize', resizeCanvas);
  bubbleMeshes.forEach((bubble) => {
    bubble.geometry.dispose();
    bubble.material.dispose();
    scene?.remove(bubble);
  });
  bubbleMeshes = [];
  if (textMesh) {
    textMesh.geometry.dispose();
    textMesh.material.dispose();
    scene?.remove(textMesh);
    textMesh = null;
  }
  if (renderer) {
    renderer.dispose();
    if (renderer.domElement.parentElement) {
      renderer.domElement.parentElement.removeChild(renderer.domElement);
    }
    renderer = null;
  }
  scene = null;
  camera = null;
}

watch(
  () => props.text,
  (newValue, oldValue) => {
    if (newValue !== oldValue) {
      startEffect();
    }
  }
);

onMounted(() => {
  if (root.value) {
    root.value.style.width = '100%';
    root.value.style.height = '100%';
    root.value.style.display = 'block';
    root.value.style.position = 'relative';
  }
  window.addEventListener('resize', resizeCanvas);
  startEffect();
});

onBeforeUnmount(cleanup);
</script>

<style scoped>
.bubble-effect-root {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
