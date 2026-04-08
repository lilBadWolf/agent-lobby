export const dmEffectOptions = [
  { value: 'none', label: 'NONE' },
  { value: 'bubbles', label: 'BUBBLES' },
  { value: 'codex', label: 'CODEX' },
  { value: 'flames', label: 'FLAMES' },
  { value: 'glitch', label: 'GLITCH' },
  { value: 'inferno', label: 'INFERNO' },
  { value: 'mspacman', label: 'MS PACMAN' },
  { value: 'pacman', label: 'PACMAN' },
  { value: 'smoke', label: 'POWDER' },
  { value: 'rust', label: 'RUST' },
  { value: 'starmap', label: 'STARMAP' },
] as const;

export type AnimationEffect = 'none' | 'typewriter' | 'scan' | 'codex' | 'glitch' | 'flames' | 'rust' | 'pacman' | 'mspacman' | 'starmap' | 'bubbles' | 'smoke' | 'inferno';

interface WordAppendState {
  currentWordContainer: HTMLSpanElement | null;
}

export function ensureAnimationStyles() {
  const styleId = 'message-animations-styles';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    @keyframes typewriter-blink {
      0%, 49%, 100% { opacity: 1; }
      50%, 99% { opacity: 0; }
    }

    @keyframes codex-fall {
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

    @keyframes codex-settle {
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

    @keyframes rust-decay {
      0% {
        color: #efefef;
        text-shadow: 0 0 0px #000;
        transform: scale(1);
        filter: sepia(0) brightness(1) blur(0);
      }
      20% {
        color: #8e442d;
        text-shadow: 2px 2px 2px #2c1a1a;
        filter: sepia(0.8) brightness(0.8) contrast(1.2);
      }
      80% {
        opacity: 1;
        transform: translateY(0) rotate(0deg);
        filter: sepia(1) brightness(0.5) blur(0.5px);
      }
      100% {
        opacity: 0;
        color: #2c1a1a;
        transform: translateY(40px) rotate(10deg) scale(0.8);
        filter: sepia(1) brightness(0.2) blur(4px);
      }
    }

    .rust-char {
      display: inline-block;
      font-weight: 900;
      white-space: pre;
      animation: rust-decay 3.8s cubic-bezier(0.4, 0, 1, 1) forwards;
      will-change: transform, filter, opacity;
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

    .codex-char {
      display: inline-block;
      animation: codex-fall 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
      color: var(--color-accent, #39ff14);
      font-weight: bold;
      letter-spacing: 2px;
    }

    .codex-char.settle {
      animation: codex-settle 0.4s ease-out forwards;
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
      display: inline-block;
      white-space: pre-wrap;
    }
  `;
  document.head.appendChild(style);
}

export function createWordAppendState(): WordAppendState {
  return {
    currentWordContainer: null,
  };
}

export function appendCharacterPreservingWords(
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

export function getAnimationDuration(effect: AnimationEffect, textLength: number): number {
  const baseLength = Math.max(1, textLength);

  switch (effect) {
    case 'typewriter':
      return 1000 + baseLength * 50;
    case 'scan':
      return 1000 + baseLength * 20;
    case 'codex':
      return 1500 + baseLength * 30;
    case 'glitch':
      return 1200 + baseLength * 20;
    case 'flames':
      return 1800 + baseLength * 40;
    case 'rust':
      return 3800 + baseLength * 45;
    case 'pacman':
      return 2200 + baseLength * 20;
    case 'mspacman':
      return 2400 + baseLength * 20;
    case 'starmap':
      return 2600 + baseLength * 28;
    case 'bubbles':
      return 2500 + baseLength * 30;
    case 'smoke':
      return 2600 + baseLength * 30;
    case 'inferno':
      return 2800 + baseLength * 35;
    default:
      return 0;
  }
}
