<template>
  <div class="stage" ref="stageRef">
    <canvas class="star-canvas" ref="canvasRef"></canvas>

    <div class="text-grid" ref="textGridRef">
      <div v-for="(line, lineIndex) in lines" :key="lineIndex" class="text-row">
        <span
          v-for="(letter, letterIndex) in line.letters"
          :key="letterIndex"
          class="star-letter"
          :class="{ revealed: letter.revealed }"
        >
          {{ letter.char }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

interface LetterState {
  char: string
  revealed: boolean
}

interface LineState {
  letters: LetterState[]
}

interface StarPoint {
  letter: LetterState
  startX: number
  startY: number
  targetX: number
  targetY: number
  delay: number
  lineIndex: number
  prevIndex: number | null
}

const props = defineProps<{ text: string }>()
const emit = defineEmits<{ (event: 'done'): void }>()

const stageRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const textGridRef = ref<HTMLElement | null>(null)
const lines = reactive<LineState[]>([])
const starPoints: StarPoint[] = []
let animationFrame = 0
let animationStart = 0
let isComplete = false
let resizeObserver: ResizeObserver | null = null

function buildLines(text: string) {
  lines.length = 0

  const normalized = String(text || '').trim()
  if (!normalized) return

  text.split('\n').forEach((line) => {
    lines.push({
      letters: Array.from(line).map((char) => ({
        char: char === ' ' ? '\u00A0' : char,
        revealed: false,
      })),
    })
  })
}

buildLines(props.text)
watch(() => props.text, (nextText) => {
  if (nextText !== undefined) {
    buildLines(nextText)
  }
})

function randomEdgePoint(width: number, height: number) {
  const angle = Math.random() * Math.PI * 2
  const radius = Math.max(width, height) * 0.85
  return {
    x: width / 2 + Math.cos(angle) * radius,
    y: height / 2 + Math.sin(angle) * radius,
  }
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3)
}

function getCanvasContext() {
  return canvasRef.value?.getContext('2d') ?? null
}

function createStarPoints() {
  starPoints.length = 0
  if (!stageRef.value || !textGridRef.value) return

  const stageRect = stageRef.value.getBoundingClientRect()
  const letterElements = Array.from(textGridRef.value.querySelectorAll<HTMLElement>('.star-letter'))
  let elementIndex = 0

  lines.forEach((line, lineIndex) => {
    let previousStarIndex: number | null = null
    let wordIndex = 0
    let letterIndexInWord = 0

    line.letters.forEach((letter) => {
      const element = letterElements[elementIndex]
      elementIndex += 1

      if (!element) {
        return
      }

      const isWordSeparator = !letter.char.trim()
      if (isWordSeparator) {
        wordIndex += 1
        letterIndexInWord = 0
        previousStarIndex = null
        return
      }

      const rect = element.getBoundingClientRect()
      const targetX = rect.left - stageRect.left + rect.width / 2
      const targetY = rect.top - stageRect.top + rect.height / 2
      const start = randomEdgePoint(stageRect.width, stageRect.height)
      const delay = lineIndex * 220 + wordIndex * 260 + letterIndexInWord * 24

      starPoints.push({
        letter,
        startX: start.x,
        startY: start.y,
        targetX,
        targetY,
        delay,
        lineIndex,
        prevIndex: previousStarIndex,
      })

      previousStarIndex = starPoints.length - 1
      letterIndexInWord += 1
    })
  })
}

function layout() {
  if (!stageRef.value || !canvasRef.value) return

  const stageRect = stageRef.value.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const canvas = canvasRef.value
  canvas.width = Math.max(1, Math.floor(stageRect.width * dpr))
  canvas.height = Math.max(1, Math.floor(stageRect.height * dpr))
  canvas.style.width = `${stageRect.width}px`
  canvas.style.height = `${stageRect.height}px`

  const ctx = getCanvasContext()
  if (ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  createStarPoints()
}

function drawFrame(timestamp: number) {
  if (!stageRef.value || !canvasRef.value || !textGridRef.value) {
    return
  }

  const ctx = getCanvasContext()
  if (!ctx || !starPoints.length) {
    return
  }

  if (!animationStart) {
    animationStart = timestamp
  }

  const elapsed = timestamp - animationStart
  const animationDuration = 2600
  const starDuration = 900
  const totalDuration = animationDuration + 600

  ctx.clearRect(0, 0, stageRef.value.clientWidth, stageRef.value.clientHeight)
  ctx.fillStyle = 'rgba(8, 14, 32, 0.16)'
  ctx.fillRect(0, 0, stageRef.value.clientWidth, stageRef.value.clientHeight)

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  starPoints.forEach((point) => {
    const localElapsed = elapsed - point.delay
    if (localElapsed < 0) {
      return
    }

    const progress = clamp(localElapsed / starDuration)
    const eased = easeOutCubic(progress)
    const x = point.startX + (point.targetX - point.startX) * eased
    const y = point.startY + (point.targetY - point.startY) * eased

    if (point.prevIndex !== null) {
      const previousPoint = starPoints[point.prevIndex]
      const prevElapsed = elapsed - previousPoint.delay
      if (prevElapsed >= 0) {
        const prevProgress = clamp(prevElapsed / starDuration)
        const prevEased = easeOutCubic(prevProgress)
        const px = previousPoint.startX + (previousPoint.targetX - previousPoint.startX) * prevEased
        const py = previousPoint.startY + (previousPoint.targetY - previousPoint.startY) * prevEased

        ctx.strokeStyle = `rgba(142, 196, 255, ${Math.min(0.36, progress)})`
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.moveTo(px, py)
        ctx.lineTo(x, y)
        ctx.stroke()
      }
    }

    const radius = 2.6 + eased * 1.4
    ctx.beginPath()
    ctx.fillStyle = `rgba(220, 242, 255, ${0.18 + eased * 0.4})`
    ctx.arc(x, y, radius * 2.2, 0, Math.PI * 2)
    ctx.fill()

    ctx.beginPath()
    ctx.fillStyle = `rgba(255, 255, 255, ${0.85 + eased * 0.15})`
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()

    if (progress > 0.92) {
      point.letter.revealed = true
    }
  })

  if (elapsed < totalDuration) {
    animationFrame = requestAnimationFrame(drawFrame)
  } else {
    if (!isComplete) {
      isComplete = true
      starPoints.forEach((point) => {
        point.letter.revealed = true
      })
      if (canvasRef.value) {
        canvasRef.value.style.opacity = '0'
        window.setTimeout(() => {
          const ctx = getCanvasContext()
          if (ctx && stageRef.value) {
            ctx.clearRect(0, 0, stageRef.value.clientWidth, stageRef.value.clientHeight)
          }
        }, 260)
      }
      emit('done')
    }
  }
}

onMounted(async () => {
  if (!props.text || !props.text.trim()) {
    emit('done')
    return
  }

  await nextTick()
  layout()
  animationFrame = requestAnimationFrame(drawFrame)

  if (stageRef.value) {
    resizeObserver = new ResizeObserver(() => {
      layout()
    })
    resizeObserver.observe(stageRef.value)
  }
})

onBeforeUnmount(() => {
  if (resizeObserver && stageRef.value) {
    resizeObserver.unobserve(stageRef.value)
  }
  cancelAnimationFrame(animationFrame)
})
</script>

<style scoped>
.stage {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: transparent;
  display: flex;
  justify-content: center;
  align-items: center;
}

.star-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  transition: opacity 0.26s ease;
  opacity: 1;
}

.text-grid {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  width: min(100%, 92%);
  padding: 0 1rem;
  box-sizing: border-box;
}

.text-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.16em;
  width: 100%;
  font-size: clamp(2.1rem, 5vw, 3rem);
  font-weight: 900;
  letter-spacing: -0.03em;
  text-transform: uppercase;
  line-height: 1;
  white-space: normal;
  word-break: break-word;
  hyphens: none;
  color: rgba(230, 244, 255, 0.95);
  text-align: center;
}

.star-letter {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transform: scale(0.78);
  transition: opacity 0.28s ease, transform 0.28s ease, text-shadow 0.28s ease;
}

.star-letter.revealed {
  opacity: 1;
  transform: scale(1);
  text-shadow:
    0 0 8px rgba(157, 206, 255, 0.55),
    0 0 18px rgba(137, 209, 255, 0.25);
}
</style>
