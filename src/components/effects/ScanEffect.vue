<template>
  <span ref="container" class="effect-root"></span>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { ensureAnimationStyles, getAnimationDuration } from '../../composables/messageEffectHelpers';

const props = defineProps<{ text: string }>();
const emit = defineEmits<{ (event: 'done'): void }>();
const container = ref<HTMLElement | null>(null);
const timerIds = new Set<number>();

function clearTimers() {
  timerIds.forEach((id) => window.clearTimeout(id));
  timerIds.clear();
}

function finishEffect() {
  clearTimers();
  emit('done');
}

function startEffect() {
  if (!container.value) {
    return;
  }

  clearTimers();
  container.value.innerHTML = '';
  ensureAnimationStyles();

  const text = props.text || '';
  const duration = getAnimationDuration('scan', text.length);

  if (!text || duration <= 0) {
    finishEffect();
    return;
  }

  const span = document.createElement('span');
  span.className = 'scan-text';
  span.textContent = text;
  span.style.animation = `scan-reveal ${duration}ms linear forwards`;
  container.value.appendChild(span);

  timerIds.add(window.setTimeout(() => {
    if (container.value) {
      container.value.innerHTML = '';
    }
    finishEffect();
  }, duration));
}

watch(
  () => props.text,
  () => {
    startEffect();
  },
  { immediate: true }
);

onMounted(startEffect);
onBeforeUnmount(clearTimers);
</script>

<style scoped>
.effect-root {
  display: inline-block;
  white-space: pre-wrap;
}
</style>
