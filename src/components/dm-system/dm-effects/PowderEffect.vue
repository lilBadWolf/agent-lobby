<template>
  <div ref="root" class="powder-effect-root"></div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Scene,
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
let smokePoints: Points | null = null;
let particlesGeometry: BufferGeometry | null = null;
let smokeCanvas: HTMLCanvasElement | null = null;
let textPlaneWidth = 0;
let textPlaneHeight = 0;
let animationWidth = 0;
let particleCount = 0;
let particlePositions: Float32Array | null = null;
let particleVelocities: Float32Array | null = null;
let particlePhases: Float32Array | null = null;
let startTime = 0;
let lastTime = 0;
let smokeStarted = false;

const totalDuration = 3200;
const showTextDuration = 900;
const textFadeDuration = 500;

function cleanup() {
  if (frameId !== null) {
    window.cancelAnimationFrame(frameId);
    frameId = null;
  }
  window.removeEventListener('resize', resizeCanvas);
  if (smokePoints) {
    scene?.remove(smokePoints);
    smokePoints.geometry.dispose();
    (smokePoints.material as PointsMaterial).dispose();
    smokePoints = null;
  }
  particlesGeometry = null;
  particleCount = 0;
  particlePositions = null;
  particleVelocities = null;
  particlePhases = null;
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
  context.fillStyle = '#ffffff';
  context.shadowColor = 'rgba(255, 255, 255, 0.7)';
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
  return { texture, canvas, width: canvas.width, height: canvas.height, letterOrigins };
}

function buildTextPlane(text: string, maxContainerWidth: number) {
  const { texture, canvas, width, height } = getCanvasTexture(text, maxContainerWidth);
  const aspect = width / height;

  const visibleHeight = 2 * camera!.position.z * Math.tan((camera!.fov * Math.PI) / 360);
  const visibleWidth = visibleHeight * camera!.aspect;

  const maxPlaneWidth = visibleWidth * 0.9;
  let planeWidth = maxPlaneWidth;
  let planeHeight = planeWidth / aspect;
  if (planeHeight > visibleHeight * 0.95) {
    planeHeight = visibleHeight * 0.95;
    planeWidth = planeHeight * aspect;
  }

  const geometry = new PlaneGeometry(planeWidth, planeHeight);
  const material = new MeshBasicMaterial({ map: texture, transparent: true, opacity: 1 });
  const mesh = new Mesh(geometry, material);
  mesh.position.set(0, 0, 0);

  return { mesh, canvas, planeWidth, planeHeight };
}

function createSmokeParticles(canvas: HTMLCanvasElement, planeWidth: number, planeHeight: number, textOffsetX: number) {
  if (!scene) return;

  const image = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height);
  if (!image) return;

  const count = 2800;
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  let used = 0;
  let attempts = 0;
  const maxAttempts = count * 20;

  while (used < count && attempts < maxAttempts) {
    attempts += 1;
    const px = Math.floor(Math.random() * canvas.width);
    const py = Math.floor(Math.random() * canvas.height);
    const alpha = image.data[(py * canvas.width + px) * 4 + 3];
    if (alpha < 100) continue;

    const localX = ((px / canvas.width) - 0.5) * planeWidth;
    const localY = (0.5 - py / canvas.height) * planeHeight;
    const worldX = textOffsetX + localX;
    const worldY = localY;
    const z = (Math.random() - 0.5) * 0.15;

    positions[used * 3] = worldX;
    positions[used * 3 + 1] = worldY;
    positions[used * 3 + 2] = z;
    phases[used] = (worldX + animationWidth * 0.5) / animationWidth;
    velocities[used * 3] = -0.02 - Math.random() * 0.04;
    velocities[used * 3 + 1] = (Math.random() - 0.5) * 0.02;
    velocities[used * 3 + 2] = (Math.random() - 0.5) * 0.01;

    used += 1;
  }

  particleCount = used;
  particlePositions = positions;
  particleVelocities = velocities;
  particlePhases = phases;

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  particlesGeometry = geometry;

  const material = new PointsMaterial({
    color: new Color(0.78, 0.78, 0.8),
    size: 0.12,
    transparent: true,
    opacity: 0.8,
    blending: 1,
    depthWrite: false,
    sizeAttenuation: true,
  });

  smokePoints = new Points(geometry, material);
  smokePoints.frustumCulled = false;
  scene.add(smokePoints);
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

  if (elapsed > showTextDuration && !smokeStarted) {
    smokeStarted = true;
    if (textMesh) {
      textMesh.material.opacity = 1;
      textMesh.position.x -= 0.1;
    }
    if (smokeCanvas && textPlaneWidth && textPlaneHeight && textMesh) {
      createSmokeParticles(smokeCanvas, textPlaneWidth, textPlaneHeight, textMesh.position.x);
    }
  }

  if (textMesh && smokeStarted) {
    const fadeElapsed = elapsed - showTextDuration;
    if (fadeElapsed >= 0) {
      const alpha = Math.max(0, 1 - fadeElapsed / textFadeDuration);
      textMesh.material.opacity = alpha;
      textMesh.position.x -= delta * 0.18;
      if (alpha <= 0.02) {
        scene.remove(textMesh);
        textMesh.geometry.dispose();
        textMesh.material.dispose();
        textMesh = null;
      }
    }
  }

  if (smokeStarted && smokePoints && particlePositions && particleVelocities && particlePhases && particlesGeometry) {
    const smokeAlpha = Math.max(0, 1 - (elapsed - showTextDuration) / (totalDuration - showTextDuration));
    const time = elapsed * 0.001 * 0.5;

    for (let i = 0; i < particleCount; i += 1) {
      if (time > 1 - particlePhases[i]) {
        const index = i * 3;
        particlePositions[index] += particleVelocities[index] * 2;
        particlePositions[index + 1] += Math.sin(time + i * 0.3) * 0.008;
        particlePositions[index + 2] += Math.cos(time + i * 0.5) * 0.008;
      }
    }

    particlesGeometry.attributes.position.needsUpdate = true;
    (smokePoints.material as PointsMaterial).opacity = smokeAlpha * 0.85;
  }

  renderer.render(scene, camera);

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
  camera.position.set(0, 0, 5.5);
  camera.lookAt(0, 0, 0);

  const ambient = new AmbientLight(0xffffff, 1.2);
  scene.add(ambient);

  renderer = new WebGLRenderer({ alpha: true, antialias: true });
  renderer.setClearColor(new Color(0x000000), 0);
  root.value.appendChild(renderer.domElement);

  resizeCanvas();

  const containerWidth = root.value?.clientWidth ?? 800;
  const visibleHeight = 2 * camera.position.z * Math.tan((camera.fov * Math.PI) / 360);
  const visibleWidth = visibleHeight * camera.aspect;
  const planeData = buildTextPlane(props.text, containerWidth);
  textMesh = planeData.mesh;
  smokeCanvas = planeData.canvas;
  textPlaneWidth = planeData.planeWidth;
  textPlaneHeight = planeData.planeHeight;
  animationWidth = visibleWidth;

  if (textMesh) {
    const rightEdgeX = visibleWidth * 0.5 - textPlaneWidth * 0.5 - visibleWidth * 0.04;
    textMesh.position.x = rightEdgeX;
    scene.add(textMesh);
  }

  startTime = 0;
  lastTime = 0;
  smokeStarted = false;

  frameId = window.requestAnimationFrame(animate);
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
.powder-effect-root {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
