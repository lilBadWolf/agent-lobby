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
  const charDelay = 40;
  const totalChars = chars.filter((char) => !/\s/.test(char)).length;
  let addedChars = 0;
  const appendState = createWordAppendState();

  for (let i = 0; i < chars.length; i++) {
    timerIds.add(window.setTimeout(() => {
      const currentChar = chars[i];
      if (/\s/.test(currentChar)) {
        appendCharacterPreservingWords(container.value!, currentChar, appendState, () => {
          const noop = document.createElement('span');
          noop.textContent = '';
          return noop;
        });
        return;
      }

      appendCharacterPreservingWords(container.value!, currentChar, appendState, (value) => {
        const span = document.createElement('span');
        span.className = 'matrix-char';
        span.textContent = value;
        span.style.animationDelay = '0ms';
        return span;
      });

      addedChars += 1;
      if (totalChars > 0 && addedChars === totalChars) {
        timerIds.add(window.setTimeout(() => {
          container.value?.querySelectorAll('.matrix-char').forEach((char) => {
            char.classList.add('settle');
          });
        }, 600));
      }
    }, i * charDelay));
  }

  timerIds.add(window.setTimeout(() => {
    if (container.value) {
      container.value.innerHTML = '';
    }
    finishEffect();
  }, 2000));
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
