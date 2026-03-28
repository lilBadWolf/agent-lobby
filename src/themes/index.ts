import { retroTerminal } from './retro-terminal';
import { synthwave } from './synthwave';
import { softPink } from './soft-pink';
import { lightBlue } from './light-blue';
import { lightOrange } from './light-orange';
import { lightMint } from './light-mint';

export { retroTerminal, synthwave, softPink, lightBlue, lightOrange, lightMint };

export const THEMES = {
  'retro-terminal': retroTerminal,
  'synthwave': synthwave,
  'soft-pink': softPink,
  'light-blue': lightBlue,
  'light-orange': lightOrange,
  'light-mint': lightMint,
};

export type ThemeKey = keyof typeof THEMES;
