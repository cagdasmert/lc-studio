import type { FxWindow } from '../types';
import { getEasing } from './easing';

/**
 * Collapse an FX timing window to a single scalar for one frame.
 *
 * 0 at the start of the entrance, 1 once it completes, back to 0 across the
 * exit. Reveal effects read this as geometry (0 = unrevealed); continuous
 * effects read it as an intensity multiplier.
 *
 * `clamp` must be false for reveals and true for continuous effects: the
 * back/elastic/spring easings overshoot outside [0, 1], which is the desired
 * look for a reveal but would mean a negative glow radius for a decoration.
 */
export function envelope(
  window: FxWindow | undefined,
  frameInLayer: number,
  layerDuration: number,
  clamp: boolean,
): number {
  if (!window || layerDuration <= 0) return 1;

  const ease = getEasing(window.easing, window.easingParams);
  const f = frameInLayer;

  let enter = 1;
  if (window.inFrames > 0) {
    if (f < window.inDelay) {
      enter = 0;
    } else if (f < window.inDelay + window.inFrames) {
      enter = ease((f - window.inDelay) / window.inFrames);
    }
  }

  let exit = 1;
  if (window.outFrames > 0) {
    // Frames run 0..layerDuration-1, so the exit must land on lastFrame.
    // Anchoring to layerDuration would leave 1/outFrames still showing.
    const lastFrame = layerDuration - 1;
    const outStart = lastFrame - window.outFrames;
    if (f >= lastFrame) {
      exit = 0;
    } else if (f > outStart) {
      exit = ease(1 - (f - outStart) / window.outFrames);
    }
  }

  // Multiply, not min: min would cap an overshooting entrance at the exit's
  // resting value of 1, throwing away the overshoot on purpose left unclamped.
  const env = enter * exit;
  return clamp ? Math.max(0, Math.min(1, env)) : env;
}
