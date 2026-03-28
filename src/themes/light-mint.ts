import type { Theme } from './types';

export const lightMint: Theme = {
  name: 'Light Mint',
  colors: {
    neonGreen: '#10b981',
    darkBg: '#f0fdf4',
    dimGreen: 'rgba(16, 185, 129, 0.1)',
    alertRed: '#ef4444',
    textWhite: '#1f2937',
    systemDim: 'rgba(16, 185, 129, 0.5)',
  },
  userColors: [
    '#10b981', // emerald
    '#059669', // emerald-dark
    '#047857', // emerald-darker
    '#34d399', // emerald-light
    '#6ee7b7', // emerald-lighter
    '#a7f3d0', // pale emerald
    '#0891b2', // cyan
    '#06b6d4', // cyan-light
    '#14b8a6', // teal
    '#2dd4bf', // teal-light
    '#0ea5e9', // sky blue
    '#38bdf8', // sky blue-light
    '#3b82f6', // blue
    '#60a5fa', // blue-light
    '#7c3aed', // violet
  ],
};
