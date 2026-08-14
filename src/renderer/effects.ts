import type { LayerEffect } from '../types';

export function buildFilterString(effects: LayerEffect[]): string {
  if (effects.length === 0) return 'none';

  return effects
    .map((e) => {
      switch (e.type) {
        case 'blur':
          return `blur(${e.value}px)`;
        case 'brightness':
          return `brightness(${e.value})`;
        case 'contrast':
          return `contrast(${e.value})`;
        case 'saturate':
          return `saturate(${e.value})`;
        case 'grayscale':
          return `grayscale(${e.value})`;
        case 'sepia':
          return `sepia(${e.value})`;
        case 'hue-rotate':
          return `hue-rotate(${e.value}deg)`;
        case 'invert':
          return `invert(${e.value})`;
        case 'drop-shadow':
          return `drop-shadow(${e.value})`;
        default:
          return '';
      }
    })
    .filter(Boolean)
    .join(' ');
}
