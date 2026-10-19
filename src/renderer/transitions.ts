import type { Scene, TransitionType } from '../types';
import type { MediaCache } from './media-cache';
import type { PreparedVideoFrames } from './draw-video';
import { drawSceneLayers, drawSceneBackground } from './draw';
import { hash } from './noise';
import { acquire, release, renderSceneSurface, sceneNeedsSurface } from './scene-surface';
import { runPassInto, textureHolds } from './gl/pass';
import { withOverrides } from './gl/uniforms';
import { frameUniforms, isGlTransition, transitionDefaults, transitionProgram } from './gl/transitions';

/**
 * Draw a transition frame: the outgoing scene at `outgoingFrame`, the
 * incoming one frozen at its frame 0. Both backgrounds are drawn here.
 *
 * Every type but zoom renders each scene into its own surface and
 * composites the two, so each scene keeps its background.
 */
export function drawTransition(
  ctx: CanvasRenderingContext2D,
  outgoing: Scene,
  incoming: Scene,
  outgoingFrame: number,
  progress: number,
  type: TransitionType,
  width: number,
  height: number,
  mediaCache: MediaCache,
  fps: number = 30,
  videoFrames?: PreparedVideoFrames,
  /** Shader parameters for a GPU transition (Scene.transitionParams). */
  params?: Record<string, number>,
): void {
  // Zoom has always drawn both backgrounds straight onto the target. Going
  // through a surface would resample it when scaled and change its output,
  // so it only does when a scene needs a surface anyway.
  if ((type === 'zoom-in' || type === 'zoom-out')
    && !sceneNeedsSurface(outgoing) && !sceneNeedsSurface(incoming)) {
    drawZoom(ctx, outgoing, incoming, outgoingFrame, progress, width, height, mediaCache, fps, videoFrames, type === 'zoom-in');
    return;
  }

  const from = renderSceneSurface(outgoing, outgoingFrame, width, height, mediaCache, fps, videoFrames);
  const renderIncoming = () => renderSceneSurface(incoming, 0, width, height, mediaCache, fps, videoFrames);
  let to: HTMLCanvasElement | null = null;
  try {
    // A shader transition whose GPU texture already holds the frozen incoming
    // scene needs neither its surface nor its upload.
    if (isGlTransition(type)) {
      const key = frozenSceneKey(incoming, width, height, mediaCache);
      if (drawGlTransition(ctx, from, textureHolds(1, key, width, height) ? null : (to = renderIncoming()), key, progress, type, width, height, params)) return;
      type = 'fade';
    }
    to ??= renderIncoming();
    compositeSurfaces(ctx, from, to, progress, type, width, height);
  } finally {
    release(from);
    if (to) release(to);
  }
}

/** Draw a shader transition; false when WebGL can't, and the caller fades instead. */
function drawGlTransition(
  ctx: CanvasRenderingContext2D, from: HTMLCanvasElement, to: HTMLCanvasElement | null, incomingKey: string | null,
  progress: number, type: TransitionType, width: number, height: number, params?: Record<string, number>,
): boolean {
  if (!isGlTransition(type)) return false;
  const uniforms = { ...withOverrides(transitionDefaults(type), params), ...frameUniforms(type, progress, width, height) };
  return runPassInto(ctx, 0, 0, width, height, transitionProgram(type), [from, to], uniforms, [null, incomingKey]);
}

function compositeSurfaces(
  ctx: CanvasRenderingContext2D,
  from: HTMLCanvasElement,
  to: HTMLCanvasElement,
  progress: number,
  type: TransitionType,
  width: number,
  height: number,
): void {
  switch (type) {
    case 'slide-left': return drawSlide(ctx, from, to, progress, width, height, -1, 0);
    case 'slide-right': return drawSlide(ctx, from, to, progress, width, height, 1, 0);
    case 'slide-up': return drawSlide(ctx, from, to, progress, width, height, 0, -1);
    case 'slide-down': return drawSlide(ctx, from, to, progress, width, height, 0, 1);

    case 'wipe-horizontal':
    case 'wipe-vertical':
      ctx.drawImage(from, 0, 0);
      ctx.save();
      ctx.beginPath();
      if (type === 'wipe-horizontal') ctx.rect(0, 0, width * progress, height);
      else ctx.rect(0, 0, width, height * progress);
      ctx.clip();
      ctx.drawImage(to, 0, 0);
      ctx.restore();
      return;

    case 'zoom-in':
    case 'zoom-out': {
      ctx.drawImage(to, 0, 0);
      ctx.save();
      ctx.globalAlpha *= 1 - progress;
      applyZoom(ctx, progress, width, height, type === 'zoom-in');
      ctx.drawImage(from, 0, 0);
      ctx.restore();
      return;
    }

    case 'dissolve':
      ctx.drawImage(from, 0, 0);
      maskDissolve(to, progress, width, height);
      ctx.drawImage(to, 0, 0);
      return;

    case 'fade':
    default: {
      ctx.drawImage(from, 0, 0);
      const alpha = ctx.globalAlpha;
      ctx.globalAlpha = alpha * progress;
      ctx.drawImage(to, 0, 0);
      ctx.globalAlpha = alpha;
      return;
    }
  }
}

const sceneIds = new WeakMap<Scene, number>();
let nextSceneId = 1;

/**
 * A key for the incoming scene's frozen frame-0 surface, so the GL pass can
 * keep its texture across a transition instead of re-uploading it each frame.
 * Scenes are replaced, not mutated, when edited, so the object identifies the
 * content; the media cache's size changes when an image finishes loading. A
 * scene with video layers is never keyed, since its frames come per render.
 */
function frozenSceneKey(scene: Scene, width: number, height: number, mediaCache: MediaCache): string | null {
  if (scene.layers.some((l) => l.type === 'video')) return null;
  let id = sceneIds.get(scene);
  if (!id) {
    id = nextSceneId++;
    sceneIds.set(scene, id);
  }
  return `scene${id}@0:${width}x${height}:${mediaCache.size}`;
}

function drawSlide(
  ctx: CanvasRenderingContext2D,
  from: HTMLCanvasElement,
  to: HTMLCanvasElement,
  progress: number,
  width: number, height: number,
  dirX: number, dirY: number,
) {
  const offsetX = dirX * progress * width;
  const offsetY = dirY * progress * height;
  ctx.drawImage(from, offsetX, offsetY);
  ctx.drawImage(to, offsetX - dirX * width, offsetY - dirY * height);
}

/** Dissolve block size in px: 8 at 1080 wide, never under 4. */
export function dissolveBlock(width: number, height: number): number {
  return Math.max(4, Math.round(Math.min(width, height) / 135));
}

/**
 * Keep only the blocks of `surface` that have dissolved in at `progress`: a
 * block shows the incoming scene once hash(bx, by, 6047) < progress. The mask
 * is built at block resolution and scaled up without smoothing, so every
 * block is all one scene or all the other.
 */
function maskDissolve(surface: HTMLCanvasElement, progress: number, width: number, height: number): void {
  const block = dissolveBlock(width, height);
  const bw = Math.ceil(width / block);
  const bh = Math.ceil(height / block);
  const mask = acquire(bw, bh);
  const sctx = surface.getContext('2d');
  const mctx = mask.getContext('2d');
  try {
    if (!sctx || !mctx) return;
    const data = mctx.createImageData(bw, bh);
    for (let by = 0; by < bh; by++) {
      for (let bx = 0; bx < bw; bx++) {
        if (hash(bx, by, 6047) < progress) data.data[(by * bw + bx) * 4 + 3] = 255;
      }
    }
    mctx.putImageData(data, 0, 0);
    sctx.save();
    sctx.imageSmoothingEnabled = false;
    sctx.globalCompositeOperation = 'destination-in';
    sctx.drawImage(mask, 0, 0, bw, bh, 0, 0, bw * block, bh * block);
    sctx.restore();
  } finally {
    release(mask);
  }
}

function applyZoom(ctx: CanvasRenderingContext2D, progress: number, width: number, height: number, zoomIn: boolean) {
  const scale = zoomIn ? 1 + progress * 0.3 : 1 - progress * 0.3;
  ctx.translate(width / 2, height / 2);
  ctx.scale(scale, scale);
  ctx.translate(-width / 2, -height / 2);
}

/** The outgoing scene scales and fades out over the incoming one, drawn straight onto `ctx`. */
function drawZoom(
  ctx: CanvasRenderingContext2D,
  outgoing: Scene, incoming: Scene,
  outgoingFrame: number, progress: number,
  width: number, height: number,
  mediaCache: MediaCache, fps: number, videoFrames: PreparedVideoFrames | undefined,
  zoomIn: boolean,
) {
  drawSceneBackground(ctx, incoming, width, height, mediaCache);
  drawSceneLayers(ctx, incoming, 0, width, height, mediaCache, fps, videoFrames);

  ctx.save();
  ctx.globalAlpha = 1 - progress;
  applyZoom(ctx, progress, width, height, zoomIn);
  drawSceneBackground(ctx, outgoing, width, height, mediaCache);
  drawSceneLayers(ctx, outgoing, outgoingFrame, width, height, mediaCache, fps, videoFrames);
  ctx.restore();
}
