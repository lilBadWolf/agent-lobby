import { ref } from 'vue';
import * as anime from 'animejs';

type AnimationEffect = 'none' | 'typewriter' | 'scan' | 'matrix' | 'glitch' | 'flames' | 'rust';

interface WordAppendState {
  currentWordContainer: HTMLSpanElement | null;
}

// Generate style tag for animation keyframes if not already present
function ensureAnimationStyles() {
  const styleId = 'message-animations-styles';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    @keyframes typewriter-blink {
      0%, 49%, 100% { opacity: 1; }
      50%, 99% { opacity: 0; }
    }

    @keyframes scan-reveal {
      from {
        clip-path: inset(0 0 100% 0);
      }
      to {
        clip-path: inset(0 0 0 0);
      }
    }

    .animation-container {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }

    .animation-text {
      display: inline-flex;
      flex-wrap: wrap;
      justify-content: center;
      text-align: center;
      white-space: pre-wrap;
      line-height: 1;
      font-family: inherit;
    }

    .animation-char {
      display: inline-block;
      white-space: pre;
      will-change: transform, opacity, filter, color, text-shadow;
    }

    .anim-word {
      display: inline-flex;
      white-space: nowrap;
      vertical-align: baseline;
    }

    .typewriter-char {
      display: inline-block;
      font-family: inherit;
      font-size: inherit;
      color: inherit;
    }

    .typewriter-cursor {
      display: inline-block;
      width: 2px;
      height: 1em;
      background: currentColor;
      margin-left: 2px;
      animation: typewriter-blink 1s step-end infinite;
    }

    .scan-text {
      animation: scan-reveal linear forwards;
      font-family: inherit;
    }
  `;
  document.head.appendChild(style);
}

function createWordAppendState(): WordAppendState {
  return {
    currentWordContainer: null
  };
}

function appendCharacterPreservingWords(
  container: HTMLElement,
  char: string,
  state: WordAppendState,
  createCharElement: (value: string) => HTMLElement
) {
  if (/\s/.test(char)) {
    container.appendChild(document.createTextNode(char));
    state.currentWordContainer = null;
    return;
  }

  if (!state.currentWordContainer) {
    const wordContainer = document.createElement('span');
    wordContainer.className = 'anim-word';
    container.appendChild(wordContainer);
    state.currentWordContainer = wordContainer;
  }

  state.currentWordContainer.appendChild(createCharElement(char));
}

function createAnimatedCharSpans(element: HTMLElement, text: string): HTMLElement[] {
  const spans: HTMLElement[] = [];
  let currentWord: HTMLElement | null = null;
  const chars = Array.from(text);

  for (const char of chars) {
    if (/\s/.test(char)) {
      element.appendChild(document.createTextNode(char));
      currentWord = null;
      continue;
    }

    if (!currentWord) {
      currentWord = document.createElement('span');
      currentWord.className = 'anim-word';
      element.appendChild(currentWord);
    }

    const charSpan = document.createElement('span');
    charSpan.className = 'animation-char';
    charSpan.textContent = char;
    charSpan.style.opacity = '0';
    charSpan.style.transform = 'translateY(-8px) scale(1)';
    currentWord.appendChild(charSpan);
    spans.push(charSpan);
  }

  return spans;
}

function getRandomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Helper to calculate animation duration
export function getAnimationDuration(effect: AnimationEffect, textLength: number): number {
  const baseLength = Math.max(1, textLength);

  switch (effect) {
    case 'typewriter':
      return 1000 + baseLength * 50;
    case 'scan':
      return 1000 + baseLength * 20;
    case 'matrix':
      return 1400 + baseLength * 20;
    case 'glitch':
      return 1400 + baseLength * 18;
    case 'flames':
      return 1600 + baseLength * 30;
    case 'rust':
      return 2000 + baseLength * 35;
    default:
      return 0;
  }
}

// Typewriter effect - characters appear one by one with cursor
async function playTypewriterAnimation(text: string, element: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    ensureAnimationStyles();
    element.innerHTML = '';

    const chars = Array.from(text);
    const charDelay = 50;
    let currentIndex = 0;
    const appendState = createWordAppendState();

    function addNextChar() {
      if (currentIndex < chars.length) {
        appendCharacterPreservingWords(element, chars[currentIndex], appendState, (value) => {
          const span = document.createElement('span');
          span.className = 'typewriter-char';
          span.textContent = value;
          return span;
        });
        currentIndex++;
        setTimeout(addNextChar, charDelay);
      } else {
        // Show cursor for a moment then clear
        const cursor = document.createElement('span');
        cursor.className = 'typewriter-cursor';
        element.appendChild(cursor);
        setTimeout(() => {
          element.innerHTML = '';
          resolve();
        }, 500);
      }
    }

    addNextChar();
  });
}

// Scan lines effect - horizontal lines reveal text top to bottom
async function playScanAnimation(text: string, element: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    ensureAnimationStyles();
    element.innerHTML = '';

    const duration = getAnimationDuration('scan', text.length);
    const span = document.createElement('span');
    span.className = 'scan-text';
    span.textContent = text;
    span.style.animation = `scan-reveal ${duration}ms linear forwards`;
    element.appendChild(span);

    setTimeout(() => {
      element.innerHTML = '';
      resolve();
    }, duration);
  });
}

// Matrix effect - characters rain down with cascading effect
async function playMatrixAnimation(text: string, element: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    ensureAnimationStyles();
    element.innerHTML = '';

    const spans = createAnimatedCharSpans(element, text);
    element.style.color = 'var(--color-accent, #39ff14)';
    element.style.textShadow = '0 0 16px rgba(57,255,20,0.75), 0 0 26px rgba(57,255,20,0.35)';

    const timeline = anime.createTimeline({ autoplay: true });

    timeline.add(spans, {
      opacity: [0, 1],
      translateY: ['-120%', '0%'],
      scaleY: [1.8, 1],
      rotateX: [-20, 0],
      easing: 'easeOutQuart',
      duration: 700,
      delay: anime.stagger(22),
    });

    timeline.add(spans, {
      translateY: [0, -6, 0],
      duration: 550,
      easing: 'easeInOutSine',
      delay: anime.stagger(18),
      offset: '-=280',
    });

    timeline.add(element, {
      opacity: [1, 0.9, 1],
      duration: 600,
      easing: 'easeInOutSine',
      offset: '-=550',
    });

    timeline.then(() => {
      element.innerHTML = '';
      resolve();
    });
  });
}

// Glitch effect - aggressive RGB corruption with displacement
async function playGlitchAnimation(text: string, element: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    ensureAnimationStyles();
    element.innerHTML = '';

    const spans = createAnimatedCharSpans(element, text);
    element.style.color = '#e8fbff';
    element.style.textShadow = '0 0 24px rgba(0,255,255,0.65), 0 0 36px rgba(255,0,255,0.5)';

    const timeline = anime.createTimeline({ autoplay: true });

    timeline.add(spans, {
      opacity: [0, 1],
      translateX: ['30%', '0%'],
      rotate: [15, 0],
      skewX: [20, 0],
      duration: 420,
      easing: 'easeOutQuart',
      delay: anime.stagger(18),
    });

    timeline.add(spans, {
      translateX: [0, 10, -10, 0],
      duration: 280,
      easing: 'easeInOutSine',
      delay: anime.stagger(12),
      offset: '-=260',
    });

    timeline.add(element, {
      opacity: [1, 0.92, 1],
      duration: 1100,
      easing: 'easeInOutSine',
      update: () => {
        const offsetX = getRandomInt(-2, 2);
        const offsetY = getRandomInt(-2, 2);
        element.style.textShadow = `${offsetX}px ${offsetY}px 24px rgba(0,255,255,0.75), ${-offsetX}px ${offsetY}px 28px rgba(255,0,255,0.75), 0 0 18px rgba(255,255,255,0.2)`;
      },
      offset: '-=820',
    });

    timeline.then(() => {
      element.innerHTML = '';
      resolve();
    });
  });
}

// Flames effect - characters ignite with multi-layer fire glow
async function playFlamesAnimation(text: string, element: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    ensureAnimationStyles();
    element.innerHTML = '';

    const spans = createAnimatedCharSpans(element, text);
    element.style.color = '#ffd96f';
    element.style.textShadow = '0 0 36px rgba(255,160,0,0.7), 0 0 64px rgba(255,80,0,0.35)';

    const timeline = anime.createTimeline({ autoplay: true });

    timeline.add(spans, {
      opacity: [0, 1],
      translateY: ['20%', '0%'],
      scale: [0.8, 1],
      color: ['#fff9d4', '#ffab3b'],
      duration: 500,
      easing: 'easeOutExpo',
      delay: anime.stagger(30),
    });

    timeline.add(spans, {
      translateY: [0, -8, 0],
      duration: 700,
      easing: 'easeInOutSine',
      delay: anime.stagger(20),
      offset: '-=320',
    });

    timeline.add(element, {
      filter: ['blur(8px)', 'blur(0px)'],
      duration: 800,
      easing: 'easeOutCirc',
      offset: '-=520',
    });

    timeline.add(spans, {
      scale: [1, 1.04, 1],
      duration: 720,
      easing: 'easeInOutSine',
      delay: anime.stagger(18),
      offset: '-=520',
    });

    timeline.then(() => {
      element.innerHTML = '';
      resolve();
    });
  });
}

async function playRustAnimation(text: string, element: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    ensureAnimationStyles();
    element.innerHTML = '';

    const spans = createAnimatedCharSpans(element, text);
    element.style.color = '#e9e0c9';
    element.style.textShadow = '0 0 8px rgba(168,101,28,0.55)';

    const timeline = anime.createTimeline({ autoplay: true });

    timeline.add(spans, {
      opacity: [0, 1],
      translateY: ['-16%', '0%'],
      rotate: ['-18deg', '0deg'],
      duration: 480,
      easing: 'easeOutBack',
      delay: anime.stagger(24),
    });

    timeline.add(spans, {
      color: ['#eae1d0', '#8e442d'],
      filter: ['sepia(0) brightness(1) blur(0px)', 'sepia(1) brightness(0.65) blur(1px)'],
      duration: 900,
      easing: 'easeInOutSine',
      delay: anime.stagger(18),
      offset: '-=320',
    });

    timeline.add(spans, {
      opacity: [1, 0],
      translateX: [0, 18],
      translateY: [0, 26],
      rotate: ['0deg', '20deg'],
      duration: 820,
      easing: 'easeInQuad',
      delay: anime.stagger(28),
      offset: '+=150',
    });

    timeline.then(() => {
      element.innerHTML = '';
      resolve();
    });
  });
}


// Main animation player function
export function useMessageAnimations() {
  const isPlaying = ref(false);

  async function playAnimation(effect: AnimationEffect, text: string, element?: HTMLElement | null): Promise<void> {
    if (!element || !text) return;

    isPlaying.value = true;

    try {
      switch (effect) {
        case 'typewriter':
          await playTypewriterAnimation(text, element);
          break;
        case 'scan':
          await playScanAnimation(text, element);
          break;
        case 'matrix':
          await playMatrixAnimation(text, element);
          break;
        case 'glitch':
          await playGlitchAnimation(text, element);
          break;
        case 'flames':
          await playFlamesAnimation(text, element);
          break;
        case 'rust':
          await playRustAnimation(text, element);
          break;
        default:
          // 'none' effect - just clear element
          element.innerHTML = '';
      }
    } finally {
      isPlaying.value = false;
    }
  }

  return {
    playAnimation,
    getAnimationDuration,
    isPlaying,
    playTypewriterAnimation,
    playScanAnimation,
    playMatrixAnimation,
    playGlitchAnimation,
    playFlamesAnimation,
    playRustAnimation,
  };
}
