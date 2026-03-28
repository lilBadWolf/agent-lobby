import { retroTerminal } from './retro-terminal';
import { synthwave } from './synthwave';
import { softPink } from './soft-pink';

export { retroTerminal, synthwave, softPink };

export const THEMES = {
  'retro-terminal': retroTerminal,
  'synthwave': synthwave,
  'soft-pink': softPink,
};

export type ThemeKey = keyof typeof THEMES;
