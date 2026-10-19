import type { LensLayerData } from '../types';
import { hash } from './noise';

/** One ripple impulse: when it starts (layer frame) and where (0–1 in the lens box). */
export interface Impulse {
  frame: number;
  x: number;
  y: number;
}

/** At most this many impulses are drawn at once: the most recent ones. */
export const MAX_LIVE_IMPULSES = 16;

export const RIPPLE_DEFAULTS = {
  amplitude: 10, wavelength: 40, speed: 6, decay: 0.05, refraction: 6, life: 60, ambientEvery: 0,
};

/**
 * The impulses live at `frame`: the lens's own list plus, with
 * `ambientEvery`, one every that many frames at a hashed position. An impulse
 * is live while frame_i ≤ frame < frame_i + life. Newest first, at most 16.
 * Pure, so any frame is computed on its own.
 */
export function liveImpulses(lens: Pick<LensLayerData, 'impulses' | 'life' | 'ambientEvery'>, frame: number): (Impulse & { age: number })[] {
  const life = Math.max(1, lens.life ?? RIPPLE_DEFAULTS.life);
  const all: Impulse[] = [...(lens.impulses ?? [])];
  const every = Math.round(lens.ambientEvery ?? 0);
  if (every > 0) {
    const first = Math.max(0, Math.ceil((frame - life + 1) / every));
    for (let k = first; k * every <= frame; k++) all.push({ frame: k * every, x: hash(k, 71), y: hash(k, 72) });
  }
  return all
    .filter((i) => i.frame <= frame && frame < i.frame + life)
    .sort((a, b) => b.frame - a.frame)
    .slice(0, MAX_LIVE_IMPULSES)
    .map((i) => ({ ...i, age: frame - i.frame }));
}
