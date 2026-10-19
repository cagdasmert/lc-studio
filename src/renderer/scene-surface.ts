import type { Scene } from '../types';
import type { MediaCache } from './media-cache';
import type { PreparedVideoFrames } from './draw-video';
import { drawScene } from './draw';

/**
 * Scene surfaces: a whole scene (background plus layers) drawn into its own
 * composition-sized canvas, in composition pixels, with an identity
 * transform. Transitions composite two of them, and effects that read back
 * "what has been drawn so far" read from one.
 *
 * Surfaces are full-frame, so they come from a pool keyed by size rather than
 * being allocated per frame. Whoever acquires a canvas releases it when done.
 */

const pool = new Map<string, HTMLCanvasElement[]>();
const key = (w: number, h: number) => `${w}x${h}`;

/** A w×h canvas from the pool, cleared, with a reset 2D state. */
export function acquire(width: number, height: number): HTMLCanvasElement {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const free = pool.get(key(w, h));
  const canvas = free?.pop() ?? document.createElement('canvas');
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, w, h);
  }
  return canvas;
}

/** Hand a canvas from `acquire` back to the pool. */
export function release(canvas: HTMLCanvasElement): void {
  const k = key(canvas.width, canvas.height);
  const free = pool.get(k);
  if (free) {
    if (!free.includes(canvas)) free.push(canvas);
  } else {
    pool.set(k, [canvas]);
  }
}

/**
 * Draw `scene` at `frameInScene` into a pooled composition-sized canvas.
 * The caller releases the result.
 */
export function renderSceneSurface(
  scene: Scene,
  frameInScene: number,
  width: number,
  height: number,
  mediaCache: MediaCache,
  fps: number = 30,
  videoFrames?: PreparedVideoFrames,
): HTMLCanvasElement {
  const surface = acquire(width, height);
  const ctx = surface.getContext('2d');
  if (ctx) drawScene(ctx, scene, frameInScene, width, height, mediaCache, fps, videoFrames);
  return surface;
}

/**
 * Whether a scene must be drawn through a surface even outside a transition,
 * because something in it reads back the pixels drawn beneath it. Nothing
 * does yet; lens layers and the VHS scene FX will.
 */
export function sceneNeedsSurface(_scene: Scene): boolean {
  return false;
}
