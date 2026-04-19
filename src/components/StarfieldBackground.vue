<template>
  <div ref="starfieldRoot" class="starfield-bg"></div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import * as THREE from 'three';
import { useTheme } from '../composables/useTheme';


const starfieldRoot = ref<HTMLElement | null>(null);

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let animationId: number | null = null;
let stars: THREE.Points | null = null;
let nebulaMeshes: THREE.Mesh[] = [];
const { getThemeUserColors } = useTheme();


function hexToThreeColor(hex: string): THREE.Color {
  return new THREE.Color(hex);
}

function createNebula(_width: number, _height: number, themeColors: string[]) {
  // Add a few semi-transparent colored planes as nebula/ribbons
  const nebulaCount = 3 + Math.floor(Math.random() * 2);
  for (let i = 0; i < nebulaCount; i++) {
    const color = themeColors[i % themeColors.length];
    const geometry = new THREE.PlaneGeometry(
      600 + Math.random() * 400,
      80 + Math.random() * 120,
      32,
      4
    );
    // Wavy effect
    for (let v = 0; v < geometry.attributes.position.count; v++) {
      const y = geometry.attributes.position.getY(v);
      geometry.attributes.position.setZ(v, Math.sin(y * 0.08 + i) * (20 + Math.random() * 30));
    }
    geometry.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.18 + Math.random() * 0.18,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.x = (Math.random() - 0.5) * 900;
    mesh.position.y = (Math.random() - 0.5) * 900;
    mesh.position.z = -400 - Math.random() * 800;
    mesh.rotation.z = Math.random() * Math.PI * 2;
    mesh.rotation.x = -0.2 + Math.random() * 0.4;
    scene?.add(mesh);
    nebulaMeshes.push(mesh);
  }
}

function createStarfield(width: number, height: number) {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
  camera.position.z = 400;

  // Dramatically increase star count
  const starCount = 8000;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 3);
  const themeColors = getThemeUserColors();
  for (let i = 0; i < starCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 2000;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 2000;
    positions[i * 3 + 2] = -Math.random() * 2000;
    // Assign a random theme color to each star
    const color = hexToThreeColor(themeColors[Math.floor(Math.random() * themeColors.length)]);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({ vertexColors: true, size: 1.2 });
  stars = new THREE.Points(geometry, material);
  scene.add(stars);

  createNebula(width, height, themeColors);
}


function animate() {
  if (!renderer || !scene || !camera || !stars) return;
  stars.rotation.y += 0.0008;
  stars.rotation.x += 0.0002;
  // Animate nebula ribbons
  for (let i = 0; i < nebulaMeshes.length; i++) {
    const mesh = nebulaMeshes[i];
    mesh.position.x += Math.sin(Date.now() * 0.0002 + i) * 0.08;
    mesh.position.y += Math.cos(Date.now() * 0.00018 + i) * 0.06;
    mesh.rotation.z += 0.0002 * (i % 2 === 0 ? 1 : -1);
  }
  renderer.render(scene, camera);
  animationId = requestAnimationFrame(animate);
}

onMounted(() => {
  if (!starfieldRoot.value) return;
  const width = starfieldRoot.value.clientWidth || window.innerWidth;
  const height = starfieldRoot.value.clientHeight || window.innerHeight;
  renderer = new THREE.WebGLRenderer({ alpha: true });
  renderer.setSize(width, height);
  starfieldRoot.value.appendChild(renderer.domElement);
  createStarfield(width, height);
  animate();
});


onBeforeUnmount(() => {
  if (animationId) cancelAnimationFrame(animationId);
  if (renderer) {
    renderer.dispose();
    renderer.domElement.remove();
  }
  // Remove nebula meshes
  nebulaMeshes.forEach(mesh => {
    scene?.remove(mesh);
    (mesh.geometry as THREE.BufferGeometry).dispose();
    (mesh.material as THREE.Material).dispose();
  });
  nebulaMeshes = [];
  renderer = null;
  scene = null;
  camera = null;
  stars = null;
});
</script>

<style scoped>
.starfield-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  z-index: 0;
}
canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
