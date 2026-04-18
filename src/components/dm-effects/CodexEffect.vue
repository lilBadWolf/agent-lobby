<template>
  <span ref="container" class="effect-root"></span>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { ensureAnimationStyles } from '../../composables/messageEffectHelpers';

const props = defineProps<{ text: string }>();
const emit = defineEmits<{ (event: 'done'): void }>();
const container = ref<HTMLElement | null>(null);
const timerIds = new Set<number>();
const intervalIds = new Set<number>();

const codexCharset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%^&*()[]{}<>?/|\\';

function randomCodexChar() {
  return codexCharset.charAt(Math.floor(Math.random() * codexCharset.length));
}

function clearTimers() {
  timerIds.forEach((id) => window.clearTimeout(id));
  timerIds.clear();
  intervalIds.forEach((id) => window.clearInterval(id));
  intervalIds.clear();
}

function finishEffect() {
  clearTimers();
  emit('done');
}

function createCodexChar(delay: number) {
  const span = document.createElement('span');
  span.className = 'codex-char';
  span.style.animationDelay = `${delay}ms`;
  span.textContent = randomCodexChar();
  return span;
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

  const lines = text.split('\n');
  const lineDelay = 120;
  const charDelay = 40;
  let totalChars = 0;

  lines.forEach((line) => {
    totalChars += Array.from(line).filter((char) => char !== ' ').length;
  });

  if (totalChars === 0) {
    finishEffect();
    return;
  }

  let settledCount = 0;

  lines.forEach((line, lineIndex) => {
    line.split('').forEach((char, charIndex) => {
      const delay = lineIndex * lineDelay + charIndex * charDelay;

      if (char === ' ') {
        container.value?.appendChild(document.createTextNode(' '));
        return;
      }

      const span = createCodexChar(delay);
      container.value?.appendChild(span);

      const updateInterval = window.setInterval(() => {
        if (!span.classList.contains('settle')) {
          span.textContent = randomCodexChar();
        }
      }, 50);
      intervalIds.add(updateInterval);

      timerIds.add(window.setTimeout(() => {
        window.clearInterval(updateInterval);
        intervalIds.delete(updateInterval);
        span.textContent = char;
        span.classList.add('settle');
        settledCount += 1;
        if (settledCount === totalChars) {
          timerIds.add(window.setTimeout(finishEffect, 800));
        }
      }, delay + 700));
    });
    if (lineIndex < lines.length - 1) {
      container.value?.appendChild(document.createElement('br'));
    }
  });
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
