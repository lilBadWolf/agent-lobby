<template>
  <div ref="root" class="inferno-effect-root"></div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  AmbientLight,
  AdditiveBlending,
  CanvasTexture,
  Color,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
} from 'three';

const props = defineProps<{ text: string }>();
const emit = defineEmits<{ (event: 'done'): void }>();
const root = ref<HTMLDivElement | null>(null);

let renderer: WebGLRenderer | null = null;
let scene: Scene | null = null;
let camera: PerspectiveCamera | null = null;
let frameId: number | null = null;
let textMesh: Mesh<PlaneGeometry, ShaderMaterial> | null = null;
let backdropMesh: Mesh<PlaneGeometry, ShaderMaterial> | null = null;
let startTime = 0;

const totalDuration = 3200;

function cleanup() {
  if (frameId !== null) {
    window.cancelAnimationFrame(frameId);
    frameId = null;
  }
  window.removeEventListener('resize', resizeCanvas);
  if (textMesh) {
    textMesh.geometry.dispose();
    textMesh.material.dispose();
    scene?.remove(textMesh);
    textMesh = null;
  }
  if (backdropMesh) {
    backdropMesh.geometry.dispose();
    backdropMesh.material.dispose();
    scene?.remove(backdropMesh);
    backdropMesh = null;
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
  const font = `bold ${fontSize}px system-ui, sans-serif`;
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
  context.fillStyle = '#ffebcd';
  context.shadowColor = 'rgba(255, 200, 120, 0.8)';
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
  const { texture, width, height } = getCanvasTexture(text, maxContainerWidth);
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
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uColor1: { value: new Color(0xff8c00) },
      uColor2: { value: new Color(0xffff80) },
      uTexture: { value: texture },
    },
    vertexShader: `
      varying vec2 vUv;
      varying float vNoise;
      uniform float uTime;

      float hash(float n) { return fract(sin(n) * 43758.5453123); }
      float noise(vec3 x) {
        vec3 p = floor(x);
        vec3 f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        float n = p.x + p.y * 57.0 + p.z * 113.0;
        return mix(
          mix(mix(hash(n + 0.0), hash(n + 1.0), f.x), mix(hash(n + 57.0), hash(n + 58.0), f.x), f.y),
          mix(mix(hash(n + 113.0), hash(n + 114.0), f.x), mix(hash(n + 170.0), hash(n + 171.0), f.x), f.y),
          f.z
        );
      }

      void main() {
        vUv = uv;
        float noiseInput = uTime * 0.9 + position.y * 0.6;
        vNoise = noise(vec3(position.xy * 1.2, noiseInput));
        vec3 displaced = position + normal * vNoise * 0.08;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      varying float vNoise;
      uniform float uTime;
      uniform vec3 uColor1;
      uniform vec3 uColor2;
      uniform sampler2D uTexture;

      void main() {
        vec4 tex = texture2D(uTexture, vUv);
        float heat = smoothstep(0.2, 1.0, 1.0 - vUv.y);
        float flicker = sin(vUv.y * 18.0 - uTime * 5.4 + vNoise * 2.4) * 0.4 + 0.6;
        float flame = clamp(heat * flicker + vNoise * 0.25, 0.0, 1.0);
        flame *= mix(0.9, 1.4, pow(1.0 - vUv.y, 2.0));
        vec3 color = mix(uColor1, uColor2, flame);
        color = mix(color, vec3(1.0, 0.95, 0.72), smoothstep(0.5, 1.0, flame));
        float alpha = tex.a * clamp(flame * 1.8 + (1.0 - vUv.y) * 0.8, 0.0, 1.0);
        if (alpha < 0.02) discard;
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });

  const mesh = new Mesh(geometry, material);
  mesh.position.set(0, 0, 0);

  const glowGeometry = new PlaneGeometry(planeWidth * 1.15, planeHeight * 1.15);
  const glowMaterial = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uTexture: { value: texture },
      uGlow: { value: 1.0 },
    },
    vertexShader: `
      varying vec2 vUv;
      uniform float uTime;
      void main() {
        vUv = uv;
        vec3 displaced = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime;
      uniform float uGlow;
      uniform sampler2D uTexture;

      float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
      }

      void main() {
        vec4 tex = texture2D(uTexture, vUv);
        float mask = smoothstep(0.05, 0.3, tex.a);
        float flame = smoothstep(0.0, 1.0, sin(vUv.x * 14.0 + uTime * 4.0) * 0.3 + pow(vUv.y, 1.8) * 0.9);
        float noise = random(vUv + uTime * 0.2) * 0.25;
        float glow = flame * mask * (0.8 + noise) * uGlow;
        vec3 color = vec3(1.0, 0.45, 0.05) * glow;
        color += vec3(1.0, 0.9, 0.5) * pow(glow, 2.0);
        float alpha = mask * glow * 0.5;
        if (alpha < 0.02) discard;
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });

  const glowMesh = new Mesh(glowGeometry, glowMaterial);
  glowMesh.position.set(0, 0, -0.08);
  return { mesh, glowMesh };
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
  }

  const elapsed = now - startTime;

  if (textMesh) {
    textMesh.material.uniforms.uTime.value = elapsed * 0.001;
  }
  if (backdropMesh) {
    backdropMesh.material.uniforms.uTime.value = elapsed * 0.001;
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
  backdropMesh = planeData.glowMesh;

  if (backdropMesh) {
    scene.add(backdropMesh);
  }
  if (textMesh) {
    scene.add(textMesh);
  }

  startTime = 0;

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
.inferno-effect-root {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
