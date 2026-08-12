import type { Scene, Layer } from '../types';
import type { MediaCache } from './media-cache';
import type { VideoCache } from './video-cache';
import { resolveLayerTransform } from './interpolation';
import { buildFilterString } from './effects';
import { drawTextLayer } from './draw-text';
import { drawShapeLayer } from './draw-shape';
import { drawImageLayer } from './draw-image';
import { drawVideoLayer } from './draw-video';

/**
 * Draw all layers of a scene at the given frame.
 * Exported for use by transitions (which need to draw two scenes).
 */
export function drawSceneLayers(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  frameInScene: number,
  _width: number,
  _height: number,
  mediaCache: MediaCache,
  fps: number = 30,
  videoCache?: VideoCache,
): void {
  // Sort by zIndex (lowest first = drawn first = behind)
  const sorted = [...scene.layers]
    .filter((l) => l.visible && l.type !== 'audio')
    .sort((a, b) => a.zIndex - b.zIndex);

  for (const layer of sorted) {
    // Check if layer is active at this frame
    if (frameInScene < layer.startFrame || frameInScene >= layer.endFrame) {
      continue;
    }

    const frameInLayer = frameInScene - layer.startFrame;
    const resolved = resolveLayerTransform(layer, frameInLayer);

    ctx.save();

    // Opacity (clamp to valid range)
    ctx.globalAlpha *= Math.max(0, Math.min(1, resolved.opacity));
    if (ctx.globalAlpha <= 0) {
      ctx.restore();
      continue;
    }

    // Blend mode
    if (layer.blendMode !== 'normal') {
      ctx.globalCompositeOperation = layer.blendMode;
    }

    // Effects (CSS filters)
    if (layer.effects.length > 0) {
      ctx.filter = buildFilterString(layer.effects);
    }

    // Apply 2D transform: translate → anchor → rotate → scale → draw at origin
    ctx.translate(resolved.x, resolved.y);
    ctx.translate(resolved.width * resolved.anchorX, resolved.height * resolved.anchorY);
    ctx.rotate((resolved.rotation * Math.PI) / 180);
    ctx.scale(resolved.scaleX, resolved.scaleY);
    ctx.translate(-resolved.width * resolved.anchorX, -resolved.height * resolved.anchorY);

    // Dispatch to type-specific drawer
    drawLayer(ctx, layer, resolved, frameInLayer, mediaCache, fps, videoCache);

    ctx.restore();
  }
}

function drawLayer(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  resolved: import('../types').ResolvedTransform,
  frameInLayer: number,
  mediaCache: MediaCache,
  fps: number,
  videoCache?: VideoCache,
): void {
  switch (layer.type) {
    case 'text':
      drawTextLayer(ctx, layer, resolved, frameInLayer);
      break;
    case 'shape':
      drawShapeLayer(ctx, layer, resolved);
      break;
    case 'image':
      drawImageLayer(ctx, layer, resolved, mediaCache);
      break;
    case 'video':
      if (videoCache) {
        drawVideoLayer(ctx, layer, resolved, frameInLayer, fps, videoCache);
      }
      break;
  }
}

/**
 * Draw a complete scene (background + all layers).
 */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  frameInScene: number,
  width: number,
  height: number,
  mediaCache: MediaCache,
  fps: number = 30,
  videoCache?: VideoCache,
): void {
  // Background
  ctx.fillStyle = scene.backgroundColor;
  ctx.fillRect(0, 0, width, height);

  drawSceneLayers(ctx, scene, frameInScene, width, height, mediaCache, fps, videoCache);
}
