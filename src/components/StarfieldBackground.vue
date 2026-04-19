<template>
  <div ref="container" class="deep-space-container"></div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import * as THREE from 'three';

const container = ref<HTMLElement | null>(null);
let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let animationId: number | null = null;

/** 
 * SHADERS 
 */

const nebulaVS = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const nebulaFS = `
  uniform float time;
  varying vec2 vUv;

  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy) );
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m; m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  void main() {
    vec2 uv = vUv;
    float n = snoise(vec2(uv.x * 1.2 + time * 0.03, uv.y * 1.2));
    float n2 = snoise(vec2(uv.x * 2.0 - time * 0.02, uv.y * 3.0));
    float density = n * 0.5 + n2 * 0.3;
    float mask = pow(1.0 - distance(uv, vec2(0.5)), 2.0);
    
    // NASA color palette
    vec3 deepColor = vec3(0.05, 0.0, 0.15); // Deep space purple
    vec3 midColor = vec3(0.0, 0.2, 0.5);  // Teal/Blue
    vec3 highColor = vec3(0.8, 0.3, 0.6); // Pink/Hydrogen
    
    vec3 color = mix(deepColor, midColor, smoothstep(-0.2, 0.4, density));
    color = mix(color, highColor, smoothstep(0.4, 1.0, density));
    
    gl_FragColor = vec4(color, smoothstep(0.1, 0.7, density) * mask * 0.4);
  }
`;

const starVS = `
  attribute float size;
  attribute float opacity;
  varying float vOpacity;
  varying vec3 vColor;
  uniform float time;
  void main() {
    vColor = color;
    // Fast subtle twinkling
    float twinkle = 0.6 + 0.4 * sin(time * 3.0 + position.x);
    vOpacity = opacity * twinkle;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const starFS = `
  varying float vOpacity;
  varying vec3 vColor;
  void main() {
    float d = distance(gl_PointCoord, vec2(0.5, 0.5));
    if (d > 0.5) discard;
    float glow = pow(1.0 - d * 2.0, 2.0);
    gl_FragColor = vec4(vColor, vOpacity * glow);
  }
`;

/**
 * LOGIC
 */

let starSystem: THREE.Points | null = null;
let nebulaGroup: THREE.Group | null = null;

function createStarfield() {
  const starCount = 50000;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 3);
  const sizes = new Float32Array(starCount);
  const opacities = new Float32Array(starCount);

  const palette = [0x9bb0ff, 0xffffff, 0xffcc6f, 0xffd2a1];

  for (let i = 0; i < starCount; i++) {
    const r = 1800 * Math.cbrt(Math.random());
    const theta = Math.random() * 2 * Math.PI;
    const phi = Math.acos(2 * Math.random() - 1);

    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);

    const c = new THREE.Color(palette[Math.floor(Math.random() * palette.length)]);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;

    sizes[i] = Math.random() * 1.8 + 0.4;
    opacities[i] = Math.random();
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('opacity', new THREE.BufferAttribute(opacities, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: starVS,
    fragmentShader: starFS,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    vertexColors: true
  });

  const points = new THREE.Points(geometry, material);
  points.renderOrder = 1; // Always render stars ON TOP
  return points;
}

function createNebula() {
  const group = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const material = new THREE.ShaderMaterial({
      uniforms: { time: { value: Math.random() * 100 } },
      vertexShader: nebulaVS,
      fragmentShader: nebulaFS,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3500, 3500), material);
    mesh.position.z = -1200 - (Math.random() * 600);
    mesh.rotation.z = Math.random() * Math.PI;
    mesh.renderOrder = -1; // Always render nebula BEHIND
    group.add(mesh);
  }
  return group;
}

function animate() {
  if (!renderer || !scene || !camera) return;
  const time = performance.now() * 0.001;

  if (starSystem) {
    (starSystem.material as THREE.ShaderMaterial).uniforms.time.value = time;
    starSystem.rotation.y = time * 0.005;
  }
  if (nebulaGroup) {
    nebulaGroup.children.forEach((m, i) => {
      ( (m as THREE.Mesh).material as THREE.ShaderMaterial).uniforms.time.value = time * 0.5 + i;
    });
  }

  renderer.render(scene, camera);
  animationId = requestAnimationFrame(animate);
}

onMounted(() => {
  if (!container.value) return;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(65, container.value.clientWidth / container.value.clientHeight, 1, 4000);
  camera.position.z = 600;

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(container.value.clientWidth, container.value.clientHeight);
  container.value.appendChild(renderer.domElement);

  nebulaGroup = createNebula();
  scene.add(nebulaGroup);

  starSystem = createStarfield();
  scene.add(starSystem);

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
  renderer?.dispose();
});
</script>

<style scoped>
.deep-space-container {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  background: #000;
  overflow: hidden;
  z-index: 0;
}
</style>
