import { ref } from 'vue';

type AnimationEffect = 'none' | 'typewriter' | 'scan' | 'matrix' | 'glitch' | 'flames';

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

    @keyframes matrix-fall {
      0% {
        opacity: 0;
        transform: translateY(-100px) scaleY(2);
        text-shadow: 0 0 5px rgba(57, 255, 20, 0);
      }
      50% {
        opacity: 1;
        text-shadow: 0 0 15px rgba(57, 255, 20, 0.8);
      }
      100% {
        opacity: 1;
        transform: translateY(0) scaleY(1);
        text-shadow: 0 0 25px rgba(57, 255, 20, 1), 0 0 40px rgba(57, 255, 20, 0.6), inset 0 0 10px rgba(57, 255, 20, 0.4);
      }
    }

    @keyframes matrix-settle {
      0% {
        text-shadow: 0 0 25px rgba(57, 255, 20, 1), 0 0 40px rgba(57, 255, 20, 0.6);
      }
      100% {
        text-shadow: 0 0 10px rgba(57, 255, 20, 0.6);
      }
    }

    @keyframes glitch-corrupt {
      0% {
        opacity: 0;
        transform: translateX(-10px) skewX(-5deg);
        color: #00ccff;
        text-shadow: -2px 0 #0088ff, 2px 0 #00ffff;
      }
      25% {
        opacity: 0.7;
        transform: translateX(5px) skewX(3deg);
        color: #0088ff;
        text-shadow: -3px 0 #00ccff, 3px 0 #00ffff;
      }
      50% {
        opacity: 0.9;
        transform: translateX(-3px) skewX(-2deg);
        color: #00ffff;
        text-shadow: -2px 0 #0044ff, 2px 0 #00ccff;
      }
      75% {
        opacity: 0.8;
        transform: translateX(2px) skewX(1deg);
        color: #0088ff;
        text-shadow: -1px 0 #00ffff, 2px 0 #0044ff;
      }
      100% {
        opacity: 1;
        transform: translateX(0) skewX(0deg);
        color: #00ffff;
        text-shadow: 0 0 15px rgba(0, 200, 255, 0.8), 0 0 25px rgba(0, 136, 255, 0.5);
      }
    }

    @keyframes flames-ignite {
      0% {
        opacity: 0;
        color: #ffffff;
        text-shadow:
          0 0 5px #ffff00,
          0 0 10px #ff8800,
          0 0 15px #ff3300;
        transform: translateY(0) scale(0.8);
      }
      30% {
        opacity: 1;
        color: #ffff00;
        text-shadow:
          0 0 10px #ffff00,
          0 0 20px #ff8800,
          0 0 30px #ff3300,
          0 0 40px #ff0000;
        transform: translateY(-10px) scale(1.1);
      }
      60% {
        opacity: 1;
        color: #ff8800;
        text-shadow:
          0 0 15px #ff8800,
          0 0 25px #ff3300,
          0 0 35px #ff0000,
          0 0 50px #cc0000;
        transform: translateY(-20px) scale(1);
      }
      100% {
        opacity: 0;
        color: #ff0000;
        text-shadow:
          0 0 10px #ff0000,
          0 0 20px #ff0000;
        transform: translateY(-40px) scale(0.3) rotateZ(15deg);
      }
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
      display: inline-block;
    }

    .anim-word {
      display: inline-block;
      white-space: nowrap;
      vertical-align: baseline;
    }

    .typewriter-char {
      display: inline;
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

    .matrix-char {
      display: inline-block;
      animation: matrix-fall 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
      color: var(--color-accent, #39ff14);
      font-weight: bold;
      letter-spacing: 2px;
    }

    .matrix-char.settle {
      animation: matrix-settle 0.4s ease-out forwards;
    }

    .glitch-char {
      display: inline-block;
      animation: glitch-corrupt 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
      font-weight: bold;
      letter-spacing: 1px;
    }

    .flames-char {
      display: inline-block;
      animation: flames-ignite 2s ease-in-out forwards;
      font-weight: bold;
      filter: blur(0px);
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

// Helper to calculate animation duration
export function getAnimationDuration(effect: AnimationEffect, textLength: number): number {
  const baseLength = Math.max(1, textLength);

  switch (effect) {
    case 'typewriter':
      return 1000 + baseLength * 50;
    case 'scan':
      return 1000 + baseLength * 20;
    case 'matrix':
      return 1500 + baseLength * 30;
    case 'glitch':
      return 1200 + baseLength * 20;
    case 'flames':
      return 1800 + baseLength * 40;
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

    const chars = Array.from(text);
    const charDelay = 40;
    let addedChars = 0;
    const totalChars = chars.filter((char) => !/\s/.test(char)).length;
    const appendState = createWordAppendState();

    for (let i = 0; i < chars.length; i++) {
      setTimeout(() => {
        const currentChar = chars[i];
        if (/\s/.test(currentChar)) {
          appendCharacterPreservingWords(element, currentChar, appendState, () => {
            const noop = document.createElement('span');
            noop.textContent = '';
            return noop;
          });
          return;
        }

        appendCharacterPreservingWords(element, currentChar, appendState, (value) => {
          const span = document.createElement('span');
          span.className = 'matrix-char';
          span.textContent = value;
          span.style.animationDelay = '0ms';
          return span;
        });

        addedChars++;

        // After all chars are added, add settling animation
        if (totalChars > 0 && addedChars === totalChars) {
          setTimeout(() => {
            Array.from(element.querySelectorAll('.matrix-char')).forEach((char) => {
              (char as HTMLElement).classList.add('settle');
            });
          }, 600);
        }
      }, i * charDelay);
    }

    // Clear after animation completes
    setTimeout(() => {
      element.innerHTML = '';
      resolve();
    }, 2000);
  });
}

// Glitch effect - aggressive RGB corruption with displacement
async function playGlitchAnimation(text: string, element: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    ensureAnimationStyles();
    element.innerHTML = '';

    const chars = Array.from(text);
    const charDelay = 30;
    let charIndex = 0;
    const appendState = createWordAppendState();

    function addGlitchChar() {
      if (charIndex < chars.length) {
        const currentChar = chars[charIndex];
        if (/\s/.test(currentChar)) {
          appendCharacterPreservingWords(element, currentChar, appendState, () => {
            const noop = document.createElement('span');
            noop.textContent = '';
            return noop;
          });
        } else {
          appendCharacterPreservingWords(element, currentChar, appendState, (value) => {
            const span = document.createElement('span');
            span.className = 'glitch-char';
            span.textContent = value;
            span.style.animationDelay = `${charIndex * charDelay}ms`;
            return span;
          });
        }
        charIndex++;
        setTimeout(addGlitchChar, charDelay);
      } else {
        setTimeout(() => {
          element.innerHTML = '';
          resolve();
        }, 2000);
      }
    }

    addGlitchChar();
  });
}

// Flames effect - characters ignite with multi-layer fire glow
async function playFlamesAnimation(text: string, element: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    ensureAnimationStyles();
    element.innerHTML = '';

    const chars = Array.from(text);
    const baseDelay = 60;
    let charIndex = 0;
    const appendState = createWordAppendState();

    function addFlamesChar() {
      if (charIndex < chars.length) {
        const currentChar = chars[charIndex];
        if (/\s/.test(currentChar)) {
          appendCharacterPreservingWords(element, currentChar, appendState, () => {
            const noop = document.createElement('span');
            noop.textContent = '';
            return noop;
          });
        } else {
          appendCharacterPreservingWords(element, currentChar, appendState, (value) => {
            const span = document.createElement('span');
            span.className = 'flames-char';
            span.textContent = value;
            span.style.animationDelay = `${charIndex * baseDelay}ms`;
            return span;
          });
        }
        charIndex++;
        setTimeout(addFlamesChar, baseDelay);
      } else {
        setTimeout(() => {
          element.innerHTML = '';
          resolve();
        }, 2500);
      }
    }

    addFlamesChar();
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
    playFlamesAnimation
  };
}
