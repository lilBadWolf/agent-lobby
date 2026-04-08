<template>
  <div class="stage" ref="stageRef">
    <div class="pacman" ref="pacmanRef" :style="pacmanStyle">
      <div class="body"></div>
      <div class="eye"></div>
    </div>

    <div class="text-container" ref="containerRef">
      <div v-for="(line, lineIndex) in lines" :key="lineIndex" class="text-row">
        <span
          v-for="(letter, letterIndex) in line.letters"
          :key="letterIndex"
          class="letter"
          :class="{ eaten: letter.eaten }"
        >
          {{ letter.char }}
        </span>
      </div>
    </div>

    <audio ref="audioRef" src="./sounds/waka-waka.mp3" loop preload="auto" playsinline />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

interface TextLetter {
  char: string
  eaten: boolean
}

interface TextLine {
  letters: TextLetter[]
  rowElement?: HTMLElement | null
  letterElements?: HTMLElement[]
}

const props = defineProps<{ text: string }>()
const emit = defineEmits<{ (event: 'done'): void }>()

const lines = reactive<TextLine[]>([])

function buildLines(text: string) {
  lines.length = 0
  const normalized = String(text || '').trim()
  if (!normalized) {
    return
  }

  text.split('\n').forEach((line: string) => {
    lines.push({
      letters: Array.from(line).map((char: string) => ({
        char: char === ' ' ? '\u00A0' : char,
        eaten: false,
      })),
    })
  })
}

buildLines(props.text)
watch(() => props.text, (nextText) => {
  buildLines(nextText)
})

const stageRef = ref<HTMLElement | null>(null)
const containerRef = ref<HTMLElement | null>(null)
const audioRef = ref<HTMLAudioElement | null>(null)
const pacmanPosition = reactive({ left: 0, top: 0, size: 120 })
let animationFrame = 0
let audioUnlocked = false
let hasPlayedWaka = false
let resizeObserver: ResizeObserver | null = null

const pacmanStyle = computed(() => ({
  left: `${pacmanPosition.left}px`,
  top: `${pacmanPosition.top}px`,
  width: `${pacmanPosition.size}px`,
  height: `${pacmanPosition.size}px`,
  display: lines.length ? 'block' : 'none',
}))

function playWaka() {
  if (!audioRef.value || hasPlayedWaka) return
  hasPlayedWaka = true

  audioRef.value.currentTime = 0
  audioRef.value.volume = 0.55
  audioRef.value.muted = false
  const promise = audioRef.value.play()
  if (promise && typeof promise.catch === 'function') {
    promise.catch(() => {
      // Autoplay may be blocked until user interaction.
    })
  }
}

function stopWaka() {
  if (!audioRef.value) return
  audioRef.value.pause()
  audioRef.value.currentTime = 0
}

function unlockAudio() {
  if (!audioUnlocked && audioRef.value && lines.length) {
    audioUnlocked = true
    audioRef.value.volume = 0.55
    audioRef.value.play().catch(() => {})
  }
}

function layout() {
  if (!stageRef.value || !containerRef.value) {
    return { stageRect: new DOMRect(0, 0, 0, 0), pacmanSize: 120, contentOffsetY: 0 }
  }

  const stageRect = stageRef.value.getBoundingClientRect()
  const rowGap = parseFloat(getComputedStyle(containerRef.value).gap) || 0
  const paddingX = 16
  const paddingY = 16
  const maxWidth = stageRect.width - paddingX * 2
  const rowEls = Array.from(containerRef.value.querySelectorAll('.text-row')) as HTMLElement[]
  rowEls.forEach((rowEl: HTMLElement, index: number) => {
    lines[index].rowElement = rowEl
    lines[index].letterElements = Array.from(rowEl.querySelectorAll('.letter')) as HTMLElement[]
  })

  const rowRects = rowEls.map((rowEl: HTMLElement) => rowEl.getBoundingClientRect())
  const maxRowWidth = rowRects.length ? Math.max(...rowRects.map((rect) => rect.width)) : 0
  const totalHeight = rowEls.length ? rowRects.reduce((sum, rect) => sum + rect.height, 0) + rowGap * (rowEls.length - 1) : 0
  const maxHeight = stageRect.height - paddingY * 2
  const scale = Math.min(maxWidth / Math.max(maxRowWidth, 1), maxHeight / Math.max(totalHeight || 1, 1), 1)
  containerRef.value.style.transform = `scale(${scale})`

  const baseRowHeight = rowRects[0]?.height || 1
  const pacmanSize = Math.min(120, Math.max(64, baseRowHeight * 1.1 * scale))
  pacmanPosition.size = pacmanSize
  pacmanPosition.left = stageRect.width + pacmanSize
  const lastRowEl = rowEls[rowEls.length - 1]
  const lastRowRect = lastRowEl ? lastRowEl.getBoundingClientRect() : null
  pacmanPosition.top = lastRowRect ? lastRowRect.top - stageRect.top + lastRowRect.height / 2 : stageRect.height / 2
  return { stageRect, pacmanSize }
}

type PacmanPass = {
  top: number
  entries: Array<{ element: HTMLElement; index: number }>
  line: TextLine
}

function getWrappedPasses() {
  const passes: PacmanPass[] = []
  lines.forEach((line) => {
    const groups: PacmanPass[] = []
    ;(line.letterElements || []).forEach((element: HTMLElement, index: number) => {
      const rect = element.getBoundingClientRect()
      const top = Math.round(rect.top)
      let group = groups.find((g) => Math.abs(g.top - top) < 4)
      if (!group) {
        group = { top, entries: [], line }
        groups.push(group)
      }
      group.entries.push({ element, index })
    })
    groups.sort((a, b) => a.top - b.top)
    groups.forEach((group) => passes.push(group))
  })
  return passes
}

interface LayoutData {
  stageRect: DOMRect
  pacmanSize: number
}

function animatePasses(layoutData: LayoutData) {
  const stageRect = layoutData.stageRect
  const pacmanSize = layoutData.pacmanSize
  const passes = getWrappedPasses().reverse()
  let passIndex = 0

  if (passes.length === 0) {
    emit('done')
    return
  }

  function startLinePass() {
    if (passIndex >= passes.length) {
      stopWaka()
      emit('done')
      return
    }

    const pass = passes[passIndex]
    const letterRects = pass.entries.map((entry) => entry.element.getBoundingClientRect())
    const firstLetterRect = letterRects[0] ?? new DOMRect()
    const lineCenter = firstLetterRect.top - stageRect.top + firstLetterRect.height / 2
    pacmanPosition.top = lineCenter
    pacmanPosition.left = stageRect.width + pacmanSize

    const startX = stageRect.width + pacmanSize
    const endX = -pacmanSize - 20
    const totalDistance = startX - endX
    const duration = 2200
    const startTime = performance.now()

    function frame(now: number) {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const pacmanX = startX - totalDistance * progress
      pacmanPosition.left = pacmanX

      const pacmanFront = pacmanX + 18
      letterRects.forEach((rect, idx) => {
        const entry = pass.entries[idx]
        const line = pass.line
        if (!line.letters[entry.index].eaten && pacmanFront < rect.right - stageRect.left - 12) {
          line.letters[entry.index].eaten = true
        }
      })

      if (progress < 1) {
        animationFrame = requestAnimationFrame(frame)
      } else {
        passIndex += 1
        setTimeout(startLinePass, 300)
      }
    }

    if (!hasPlayedWaka) {
      playWaka()
    }

    animationFrame = requestAnimationFrame(frame)
  }

  startLinePass()
}

onMounted(() => {
  if (lines.length) {
    const layoutData = layout()
    playWaka()
    animatePasses(layoutData)
    document.addEventListener('pointerdown', unlockAudio, { once: true })
  } else {
    emit('done')
  }
  window.addEventListener('resize', layout)

  resizeObserver = new ResizeObserver(layout)
  if (stageRef.value) resizeObserver.observe(stageRef.value)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', layout)
  document.removeEventListener('pointerdown', unlockAudio)
  if (resizeObserver && stageRef.value) resizeObserver.unobserve(stageRef.value)
  cancelAnimationFrame(animationFrame)
})
</script>

<style scoped>
.stage {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  padding: 0;
  border-radius: 0;
  overflow: hidden;
  background: transparent;
  box-shadow: none;
  display: flex;
  justify-content: center;
  align-items: center;
}

.text-container {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 0.35rem;
  width: 100%;
  max-width: 100%;
  padding: 0 1rem;
  box-sizing: border-box;
}

.text-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.18em;
  width: 100%;
  font-size: clamp(2.2rem, 5vw, 3.2rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  text-transform: uppercase;
  line-height: 1;
  white-space: normal;
  overflow-wrap: break-word;
  word-break: normal;
  hyphens: none;
  color: var(--color-chat-text, currentColor);
  text-align: center;
}

.letter {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  margin: 0 0.05em;
  line-height: 1;
  color: inherit;
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.letter.eaten {
  opacity: 0;
  transform: scale(0.2);
  pointer-events: none;
}

.pacman {
  position: absolute;
  top: 50%;
  left: calc(100% + 120px);
  width: var(--pacman-size, 120px);
  height: var(--pacman-size, 120px);
  transform: translateY(-50%);
  animation: pacman-bob 0.8s ease-in-out infinite;
  z-index: 1;
}

.pacman .body {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 25%, #fff85c 0%, #ffd242 45%, #f9a413 100%);
  position: relative;
  overflow: hidden;
  animation: mouth-open 0.35s infinite ease-in-out, chomping 0.35s infinite ease-in-out;
  clip-path: polygon(100% 0%, 0% 0%, 0% 45%, 35% 50%, 0% 55%, 0% 100%, 100% 100%);
  will-change: transform, clip-path;
}

.pacman .eye {
  position: absolute;
  z-index: 2;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #111;
  top: 10px;
  right: 22px;
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.8);
}

.pacman .eye::after {
  content: '';
  position: absolute;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.95);
  top: 3px;
  left: 4px;
}

@keyframes pacman-bob {
  0%, 100% {
    transform: translateY(-50%) translateX(0);
  }
  50% {
    transform: translateY(-48%) translateX(0);
  }
}

@keyframes mouth-open {
  0%, 100% {
    clip-path: polygon(100% 0%, 0% 0%, 0% 42%, 35% 50%, 0% 58%, 0% 100%, 100% 100%);
  }
  50% {
    clip-path: polygon(100% 0%, 0% 0%, 0% 12%, 65% 50%, 0% 88%, 0% 100%, 100% 100%);
  }
}

@keyframes chomping {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(0.98);
  }
}
</style>
