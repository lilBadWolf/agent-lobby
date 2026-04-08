<template>
  <span ref="container" class="effect-root"></span>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import {
  ensureAnimationStyles,
  appendCharacterPreservingWords,
  createWordAppendState,
} from '../../composables/messageEffectHelpers';

const props = defineProps<{ text: string }>();
const emit = defineEmits<{ (event: 'done'): void }>();
const container = ref<HTMLElement | null>(null);
const timers = new Set<number>();

function clearTimers() {
  timers.forEach((id) => window.clearTimeout(id));
  timers.clear();
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
  if (!text) {
    finishEffect();
    return;
  }

  const chars = Array.from(text);
  const charDelay = 50;
  let currentIndex = 0;
  const appendState = createWordAppendState();

  function addNextChar() {
    if (!container.value) {
      finishEffect();
      return;
    }

    if (currentIndex < chars.length) {
      appendCharacterPreservingWords(container.value, chars[currentIndex], appendState, (value) => {
        const span = document.createElement('span');
        span.className = 'typewriter-char';
        span.textContent = value;
        return span;
      });
      currentIndex += 1;
      timers.add(window.setTimeout(addNextChar, charDelay));
    } else {
      const cursor = document.createElement('span');
      cursor.className = 'typewriter-cursor';
      container.value.appendChild(cursor);
      timers.add(window.setTimeout(() => {
        if (container.value) {
          container.value.innerHTML = '';
        }
        finishEffect();
      }, 500));
    }
  }

  addNextChar();
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
