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
  if (!text) {
    finishEffect();
    return;
  }

  const chars = Array.from(text);
  const baseDelay = 60;
  let charIndex = 0;
  const appendState = createWordAppendState();

  function addFlamesChar() {
    if (!container.value) {
      finishEffect();
      return;
    }

    if (charIndex < chars.length) {
      const currentChar = chars[charIndex];
      if (/\s/.test(currentChar)) {
        appendCharacterPreservingWords(container.value, currentChar, appendState, () => {
          const noop = document.createElement('span');
          noop.textContent = '';
          return noop;
        });
      } else {
        appendCharacterPreservingWords(container.value, currentChar, appendState, (value) => {
          const span = document.createElement('span');
          span.className = 'flames-char';
          span.textContent = value;
          span.style.animationDelay = `${charIndex * baseDelay}ms`;
          return span;
        });
      }
      charIndex += 1;
      timerIds.add(window.setTimeout(addFlamesChar, baseDelay));
    } else {
      timerIds.add(window.setTimeout(() => {
        if (container.value) {
          container.value.innerHTML = '';
        }
        finishEffect();
      }, 2500));
    }
  }

  addFlamesChar();
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
  display: block;
  width: 100%;
  white-space: pre-wrap;
  text-align: center;
}
</style>
