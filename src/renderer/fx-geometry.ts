import { hash } from './noise';

export type SliceOrder = 'sequential' | 'center-out' | 'random';

/**
 * Where band `i` sits in the reveal order, as 0 (first) to 1 (last).
 * Pure and DOM-free so it can be unit-tested without a canvas.
 */
export function bandOrderPosition(i: number, bands: number, order: SliceOrder): number {
  if (bands <= 1) return 0;
  switch (order) {
    case 'sequential':
      return i / (bands - 1);
    case 'center-out': {
      const mid = (bands - 1) / 2;
      // With an even band count no band sits exactly on the centre, so the
      // closest pair is 0.5 away. Rebasing by that distance is what lets the
      // centre-most bands start at 0 instead of being pushed to the end.
      const minDist = bands % 2 === 0 ? 0.5 : 0;
      const range = mid - minDist;
      return range <= 0 ? 0 : (Math.abs(i - mid) - minDist) / range;
    }
    case 'random':
      // Fixed seed: the shuffle must be identical on every frame and in
      // every render, or bands would reshuffle as the reveal plays.
      return hash(i, 9173);
  }
}

/** A single band's local progress, given the layer envelope and a stagger. */
export function bandProgress(env: number, orderPos: number, stagger: number): number {
  const s = Math.max(0, Math.min(0.95, stagger));
  const local = (env - orderPos * s) / (1 - s);
  return Math.max(0, Math.min(1, local));
}
