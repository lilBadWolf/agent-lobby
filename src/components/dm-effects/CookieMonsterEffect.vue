<template>
  <div class="stage" ref="stageRef">
    
    <!-- SVG Filter for "Fuzzy" Texture -->
    <svg style="width:0; height:0; position:absolute;" aria-hidden="true">
      <defs>
        <filter id="blue-fuzz">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="5" />
        </filter>
      </defs>
    </svg>

    <!-- The Monster (Version 1 Visuals) -->
    <div v-show="isReady" class="monster" :style="monsterStyle">
      <div class="body-shape">
        <!-- Face Container -->
        <div class="face">
          <div class="eye left"><div class="pupil"></div></div>
          <div class="eye right"><div class="pupil"></div></div>
          <!-- The "Void" Mouth (Center) -->
          <div class="mouth"></div>
        </div>
      </div>
    </div>

    <!-- Particle System (Version 3 Physics) -->
    <div class="crumbs-layer">
      <div
        v-for="crumb in crumbs"
        :key="crumb.id"
        class="crumb"
        :style="{
          transform: `translate3d(${crumb.x}px, ${crumb.y}px, 0) rotate(${crumb.r}deg)`,
          opacity: crumb.life,
          width: `${crumb.size}px`,
          height: `${crumb.size}px`
        }"
      ></div>
    </div>

    <!-- Text Layer -->
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

    <audio ref="audioRef" src="./sounds/om-nom-nom.mp3" loop preload="auto" playsinline />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

// --- Types ---
interface TextLetter { char: string; eaten: boolean }
interface TextLine { letters: TextLetter[]; rowElement?: HTMLElement | null; letterElements?: HTMLElement[] }
interface Crumb { id: number; x: number; y: number; vx: number; vy: number; r: number; vr: number; life: number; size: number }

// --- Props ---
const props = defineProps<{ text: string }>()
const emit = defineEmits<{ (event: 'done'): void }>()

// --- State ---
const lines = reactive<TextLine[]>([])
const crumbs = reactive<Crumb[]>([])
const stageRef = ref<HTMLElement | null>(null)
const containerRef = ref<HTMLElement | null>(null)
const audioRef = ref<HTMLAudioElement | null>(null)
const isReady = ref(false)

const monsterState = reactive({ 
  left: 0, 
  top: 0, 
  size: 130
})

let animationFrame = 0
let audioUnlocked = false
let hasPlayedAudio = false
let resizeObserver: ResizeObserver | null = null
let crumbIdCounter = 0
let startDelayTimer = 0

// --- Text Processing ---
function buildLines(text: string) {
  lines.length = 0
  const normalized = String(text || '').trim()
  if (!normalized) return
  text.split('\n').forEach((line) => {
    lines.push({
      letters: Array.from(line).map((char) => ({ char: char === ' ' ? '\u00A0' : char, eaten: false })),
    })
  })
}
buildLines(props.text)
watch(() => props.text, (val) => {
  isReady.value = false
  buildLines(val)
})

// --- Computed Styles ---
const monsterStyle = computed(() => ({
  left: `${monsterState.left}px`,
  top: `${monsterState.top}px`,
  width: `${monsterState.size}px`,
  height: `${monsterState.size}px`,
}))

// --- Audio ---
function playCrunch() {
  if (!audioRef.value || hasPlayedAudio) return
  hasPlayedAudio = true
  audioRef.value.currentTime = 0
  audioRef.value.volume = 0.7
  audioRef.value.play().catch(() => {})
}

function stopCrunch() {
  if (!audioRef.value) return
  audioRef.value.pause()
}

function unlockAudio() {
  if (!audioUnlocked && audioRef.value && lines.length) {
    audioUnlocked = true
    audioRef.value.volume = 0.0
    audioRef.value.play().then(() => {
      audioRef.value!.pause()
      audioRef.value!.volume = 0.7
    }).catch(() => {})
  }
}

// --- Layout Engine ---
function layout() {
  if (!stageRef.value || !containerRef.value) return { stageRect: new DOMRect(), monsterSize: 130 }

  const stageRect = stageRef.value.getBoundingClientRect()
  if (stageRect.width === 0) return { stageRect, monsterSize: 130 }

  const padding = 20
  const rowGap = 10
  const maxWidth = stageRect.width - padding * 2
  const maxHeight = stageRect.height - padding * 2
  
  const rowEls = Array.from(containerRef.value.querySelectorAll('.text-row')) as HTMLElement[]
  rowEls.forEach((rowEl, index) => {
    lines[index].rowElement = rowEl
    lines[index].letterElements = Array.from(rowEl.querySelectorAll('.letter')) as HTMLElement[]
  })

  const rowRects = rowEls.map(el => el.getBoundingClientRect())
  const contentWidth = rowRects.length ? Math.max(...rowRects.map(r => r.width)) : 0
  const contentHeight = rowEls.length 
    ? rowRects.reduce((sum, r) => sum + r.height, 0) + rowGap * (rowEls.length - 1) 
    : 0

  const scale = Math.min(
    maxWidth / Math.max(contentWidth, 1), 
    maxHeight / Math.max(contentHeight, 1), 
    1
  )
  containerRef.value.style.transform = `scale(${scale})`

  // Size calculation
  const lineHeight = rowRects.length ? rowRects[0].height : 60
  const monsterSize = (lineHeight * 2.2) / scale // Nice and big
  monsterState.size = Math.max(monsterSize, 90)
  
  monsterState.left = -monsterState.size - 50
  monsterState.top = stageRect.height / 2

  return { stageRect, monsterSize: monsterState.size }
}

// --- Particle System (V3 Physics) ---
function spawnCrumbs(x: number, y: number) {
  // Burst of 3-5 crumbs
  const count = 3 + Math.floor(Math.random() * 3)
  for (let i = 0; i < count; i++) {
    crumbs.push({
      id: crumbIdCounter++,
      x, y,
      // Physics: Explode outward from center mouth
      vx: (Math.random() - 0.5) * 18, 
      vy: (Math.random() - 0.5) * 18, 
      r: Math.random() * 360,
      vr: (Math.random() - 0.5) * 30,
      life: 1.0,
      size: 8 + Math.random() * 10
    })
  }
}

function updateCrumbs() {
  for (let i = crumbs.length - 1; i >= 0; i--) {
    const c = crumbs[i]
    c.x += c.vx
    c.y += c.vy
    c.r += c.vr
    c.vy += 0.7 // Gravity
    c.life -= 0.02 // Fade
    if (c.life <= 0) crumbs.splice(i, 1)
  }
}

// --- Animation Loop ---
function animatePasses(layoutData: { stageRect: DOMRect; monsterSize: number }) {
  const { stageRect, monsterSize } = layoutData
  
  const passes: any[] = []
  lines.forEach((line) => {
    if (!line.letterElements?.length) return
    passes.push({
      line,
      entries: line.letterElements.map((el, idx) => ({ element: el, index: idx }))
    })
  })

  let passIndex = 0
  if (passes.length === 0) { emit('done'); return }

  function startLinePass() {
    if (passIndex >= passes.length) {
      stopCrunch()
      emit('done')
      return
    }

    const pass = passes[passIndex]
    
    // Center Monster Y on Line
    const firstRect = pass.entries[0].element.getBoundingClientRect()
    const lineCenterY = firstRect.top - stageRect.top + (firstRect.height / 2)
    monsterState.top = lineCenterY - (monsterSize / 2)
    
    const startX = -monsterSize - 50
    const endX = stageRect.width + monsterSize * 0.5
    
    // SLOW SPEED (V3)
    const duration = 3200 
    const startTime = performance.now()

    function frame(now: number) {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      
      // Move
      const currentLeft = startX + (endX - startX) * progress
      monsterState.left = currentLeft
      
      // Mouth Position (Center of Face)
      // Since he is facing forward, the mouth is exactly in the middle of the div
      const mouthWorldX = currentLeft + (monsterSize * 0.5)
      const mouthWorldY = monsterState.top + (monsterSize * 0.65) // Slightly lower than center

      // Eat Check
      pass.entries.forEach((entry: any) => {
        const line = pass.line
        const letterState = line.letters[entry.index]
        if (!letterState.eaten) {
          const rect = entry.element.getBoundingClientRect()
          const letterLeft = rect.left - stageRect.left
          
          // Trigger when mouth (center) hits the letter
          // Added a small offset (-20) so he eats it as he arrives
          if (mouthWorldX > letterLeft - 20) {
            letterState.eaten = true
            spawnCrumbs(mouthWorldX, mouthWorldY)
          }
        }
      })

      updateCrumbs()

      if (progress < 1) {
        animationFrame = requestAnimationFrame(frame)
      } else {
        passIndex++
        setTimeout(startLinePass, 250)
      }
    }
    
    if (!hasPlayedAudio) playCrunch()
    animationFrame = requestAnimationFrame(frame)
  }

  isReady.value = true
  startLinePass()
}

onMounted(() => {
  if (lines.length) {
    startDelayTimer = window.setTimeout(() => {
      const data = layout()
      animatePasses(data)
    }, 600)
    document.addEventListener('pointerdown', unlockAudio, { once: true })
  } else {
    emit('done')
  }
  window.addEventListener('resize', layout)
  resizeObserver = new ResizeObserver(layout)
  if (stageRef.value) resizeObserver.observe(stageRef.value)
})

onBeforeUnmount(() => {
  clearTimeout(startDelayTimer)
  window.removeEventListener('resize', layout)
  document.removeEventListener('pointerdown', unlockAudio)
  cancelAnimationFrame(animationFrame)
  if (resizeObserver) resizeObserver.disconnect()
})
</script>

<style scoped>
.stage {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: center;
}

/* --- Text --- */
.text-container {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  padding: 1rem;
  z-index: 105;
}

.text-row {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  font-family: 'Inter', sans-serif;
  font-weight: 900;
  font-size: 3.5rem;
  line-height: 1.2;
  color: var(--color-text-secondary);
  text-transform: uppercase;
}

.letter {
  display: inline-block;
  transition: opacity 0.05s;
}
.letter.eaten {
  opacity: 0;
}

/* --- The Monster (Face Forward) --- */
.monster {
  position: absolute;
  z-index: 100;
  pointer-events: none;
  will-change: left, top;
  /* Face forward bobbing */
  animation: bobble 0.6s infinite ease-in-out alternate;
}

.body-shape {
  width: 100%;
  height: 100%;
  background: #005b96; /* Cookie Blue */
  border-radius: 50%;
  position: relative;
  /* Apply the fuzzy SVG filter */
  filter: url(#blue-fuzz);
  box-shadow: inset -10px -10px 30px rgba(0,0,0,0.3);
}

.face {
  width: 100%;
  height: 100%;
  position: relative;
  z-index: 2; /* Above fur */
}

/* --- The Void Mouth --- */
.mouth {
  position: absolute;
  bottom: 15%;
  left: 50%;
  width: 60%;
  height: 50%;
  background: #111; /* The Void */
  transform: translateX(-50%);
  /* Shape: Semi-circle / Ellipse hybrid */
  border-radius: 50% 50% 45% 45%;
  clip-path: ellipse(100% 100% at 50% 0%);
  /* Rapid eating animation */
  animation: nom-nom 0.25s infinite ease-in-out;
}

/* --- Googly Eyes --- */
.eye {
  position: absolute;
  width: 28%;
  height: 28%;
  background: white;
  border-radius: 50%;
  top: 15%;
  overflow: hidden;
  box-shadow: 0 2px 6px rgba(0,0,0,0.4);
}
.eye.left { left: 18%; }
.eye.right { right: 18%; top: 12%; } /* Slight offset for googly feel */

.pupil {
  position: absolute;
  width: 35%; height: 35%;
  background: #000;
  border-radius: 50%;
  top: 50%; left: 50%;
  /* Chaotic movement */
  animation: googly 0.8s infinite alternate ease-in-out;
}
.eye.right .pupil {
  animation-delay: 0.1s;
  animation-duration: 0.6s;
}

/* --- Crumbs --- */
.crumbs-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 110;
}
.crumb {
  position: absolute;
  background: #d4a266;
  border-radius: 30%;
}

/* --- Keyframes --- */
@keyframes nom-nom {
  0%, 100% { height: 10%; bottom: 35%; } /* Closed */
  50% { height: 50%; bottom: 15%; } /* Open */
}

@keyframes bobble {
  0% { transform: rotate(-3deg); }
  100% { transform: rotate(3deg); }
}

@keyframes googly {
  0% { transform: translate(-50%, -50%); }
  25% { transform: translate(-20%, -70%); }
  50% { transform: translate(-70%, -30%); }
  75% { transform: translate(-30%, -40%); }
  100% { transform: translate(-50%, -50%); }
}
</style>
