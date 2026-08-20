import type { Scene, Layer, ClipPathDef, BoxShadow } from '../types';
import type { MediaCache } from './media-cache';
import type { VideoCache } from './video-cache';
import { resolveLayerTransform } from './interpolation';
import { buildFilterString } from './effects';
import { getFx, fxEnv, hasBitmapFx, fxPadding, compositeLayerFx } from './layer-fx';
import { createCanvasGradient } from './gradient';
import { evaluateMotionPath } from './motion-path';
import { drawTextLayer } from './draw-text';
import { drawShapeLayer } from './draw-shape';
import { drawImageLayer } from './draw-image';
import { drawVideoLayer } from './draw-video';
import { drawSvgLayer } from './draw-svg';

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

    // Echo: stamp the layer as it was a few frames ago, fading with distance.
    // Drawn first so the trail sits behind the layer itself.
    const echo = getFx(layer.layerFx, 'echo');
    if (echo && echo.count > 0 && echo.frameGap > 0) {
      const echoEnv = fxEnv(
        echo, frameInScene - layer.startFrame, layer.endFrame - layer.startFrame,
      );
      if (echoEnv > 0) {
        for (let step = echo.count; step >= 1; step--) {
          const pastFrame = frameInScene - step * echo.frameGap;
          if (pastFrame < layer.startFrame) continue;
          drawLayerAtFrame(
            ctx, layer, pastFrame, mediaCache, fps, videoCache,
            Math.pow(echo.decay, step) * echoEnv,
          );
        }
      }
    }

    drawLayerAtFrame(ctx, layer, frameInScene, mediaCache, fps, videoCache, 1);
  }
}

/**
 * Draw a single layer as it appears at `frameInScene`.
 * `alphaMultiplier` lets echo stamps fade without touching layer opacity.
 */
function drawLayerAtFrame(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  frameInScene: number,
  mediaCache: MediaCache,
  fps: number,
  videoCache: VideoCache | undefined,
  alphaMultiplier: number,
): void {
  const frameInLayer = frameInScene - layer.startFrame;
  const resolved = resolveLayerTransform(layer, frameInLayer);

  // Motion path override — replaces x/y (and optionally rotation)
  if (layer.motionPath && layer.motionPath.points.length >= 2) {
    const layerDuration = layer.endFrame - layer.startFrame;
    const t = layerDuration > 0 ? frameInLayer / layerDuration : 0;
    const pos = evaluateMotionPath(layer.motionPath, t);
    resolved.x = pos.x;
    resolved.y = pos.y;
    if (layer.motionPath.alignToPath) {
      resolved.rotation = (pos.angle * 180) / Math.PI;
    }
  }

  ctx.save();

  // Opacity (clamp to valid range)
  ctx.globalAlpha *= Math.max(0, Math.min(1, resolved.opacity)) * alphaMultiplier;
  if (ctx.globalAlpha <= 0) {
    ctx.restore();
    return;
  }

  // Blend mode
  if (layer.blendMode !== 'normal') {
    ctx.globalCompositeOperation = layer.blendMode;
  }

  // Apply 2D transform: place anchor at (x,y), rotate/scale/skew around it, then shift to top-left
  ctx.translate(resolved.x, resolved.y);
  ctx.rotate((resolved.rotation * Math.PI) / 180);
  if (resolved.skewX !== 0 || resolved.skewY !== 0) {
    const sx = Math.tan((resolved.skewX * Math.PI) / 180);
    const sy = Math.tan((resolved.skewY * Math.PI) / 180);
    ctx.transform(1, sy, sx, 1, 0, 0);
  }
  ctx.scale(resolved.scaleX, resolved.scaleY);
  ctx.translate(-resolved.width * resolved.anchorX, -resolved.height * resolved.anchorY);

  // Clip path
  if (layer.clipPath) {
    applyClipPath(ctx, layer.clipPath, resolved.width, resolved.height);
  }

  const bitmapFx = hasBitmapFx(layer.layerFx);
  const needsFxCanvas = layer.effects.length > 0 || bitmapFx;
  const shadow = layer.boxShadow && layer.boxShadow.blur > 0 ? layer.boxShadow : null;

  // Reasons to render the layer into an offscreen canvas first:
  //  - WebKit (WKWebView) doesn't reliably apply ctx.filter to text/shape
  //    drawing ops, but drawImage() IS filtered in every version.
  //  - Layer FX composite the layer's own pixels several times over.
  //  - The drop shadow masks against it, so a cutout PNG or a glyph casts a
  //    shadow in its own shape rather than the shape of its bounding box.
  let layerCanvas: HTMLCanvasElement | null = null;
  let fxPad = 0;
  if (needsFxCanvas || shadow) {
    fxPad = bitmapFx ? fxPadding(layer.layerFx) : 0;
    const w = Math.max(1, Math.round(resolved.width)) + fxPad * 2;
    const h = Math.max(1, Math.round(resolved.height)) + fxPad * 2;
    const offscreen = document.createElement('canvas');
    offscreen.width = w;
    offscreen.height = h;
    const offCtx = offscreen.getContext('2d');
    if (offCtx) {
      offCtx.translate(fxPad, fxPad);
      drawLayer(offCtx, layer, resolved, frameInLayer, mediaCache, fps, videoCache);
      layerCanvas = offscreen;
    }
  }

  // Drawn before the layer itself so the shadow sits behind it.
  if (shadow && layerCanvas) {
    drawSilhouetteShadow(ctx, layerCanvas, shadow, fxPad, resolved.width, resolved.height);
  }

  if (needsFxCanvas && layerCanvas) {
    compositeLayerFx(
      ctx, layerCanvas, layer.layerFx, fxPad, frameInLayer,
      layer.endFrame - layer.startFrame,
      buildFilterString(layer.effects),
    );
  } else {
    // Dispatch to type-specific drawer
    drawLayer(ctx, layer, resolved, frameInLayer, mediaCache, fps, videoCache);
  }

  ctx.restore();
}

/**
 * Stamp a layer's drop shadow using the already-rendered layer as the mask.
 * The shadow is drawn on its own canvas, then the layer is erased out of it
 * with destination-out — leaving only the shadow, in the layer's real shape.
 */
function drawSilhouetteShadow(
  ctx: CanvasRenderingContext2D,
  layerCanvas: HTMLCanvasElement,
  bs: BoxShadow,
  fxPad: number,
  width: number,
  height: number,
): void {
  const pad = bs.blur + bs.spread + Math.max(Math.abs(bs.offsetX), Math.abs(bs.offsetY)) + 10;
  const offscreen = document.createElement('canvas');
  offscreen.width = Math.round(width + pad * 2);
  offscreen.height = Math.round(height + pad * 2);
  const oc = offscreen.getContext('2d');
  if (!oc) return;

  // Line the layer's own origin up with (pad, pad) on the shadow canvas.
  const dx = pad - fxPad;
  const dy = pad - fxPad;

  oc.shadowColor = bs.color;
  oc.shadowBlur = bs.blur + bs.spread;
  oc.shadowOffsetX = bs.offsetX;
  oc.shadowOffsetY = bs.offsetY;
  oc.drawImage(layerCanvas, dx, dy);

  // Erase the layer, leaving only the shadow it cast.
  oc.globalCompositeOperation = 'destination-out';
  oc.shadowColor = 'transparent';
  oc.shadowBlur = 0;
  oc.shadowOffsetX = 0;
  oc.shadowOffsetY = 0;
  oc.drawImage(layerCanvas, dx, dy);

  ctx.drawImage(offscreen, -pad, -pad);
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
    case 'svg':
      drawSvgLayer(ctx, layer, resolved);
      break;
  }
}

/**
 * Draw a complete scene (background + all layers).
 */
function applyClipPath(
  ctx: CanvasRenderingContext2D,
  clip: ClipPathDef,
  width: number,
  height: number,
): void {
  ctx.beginPath();
  switch (clip.type) {
    case 'rect': {
      const i = clip.inset;
      if (clip.borderRadius) {
        ctx.roundRect(i, i, width - i * 2, height - i * 2, clip.borderRadius);
      } else {
        ctx.rect(i, i, width - i * 2, height - i * 2);
      }
      break;
    }
    case 'circle': {
      const cx = clip.cx * width;
      const cy = clip.cy * height;
      const r = clip.radius * Math.min(width, height);
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      break;
    }
    case 'ellipse': {
      const cx = clip.cx * width;
      const cy = clip.cy * height;
      ctx.ellipse(cx, cy, clip.rx * width, clip.ry * height, 0, 0, Math.PI * 2);
      break;
    }
    case 'polygon': {
      for (let i = 0; i < clip.points.length; i++) {
        const [px, py] = clip.points[i];
        if (i === 0) ctx.moveTo(px * width, py * height);
        else ctx.lineTo(px * width, py * height);
      }
      ctx.closePath();
      break;
    }
    case 'path': {
      const p2d = new Path2D(clip.d);
      // Scale SVG path to fit layer dimensions
      ctx.save();
      // Path2D doesn't auto-scale, but we clip at layer coordinate space
      // The user provides path data in the layer's coordinate system
      ctx.clip(p2d);
      ctx.restore();
      return; // clip already applied via Path2D
    }
  }
  ctx.clip();
}

/**
 * Draw a scene's background (solid color, gradient, or image).
 * Exported so transitions and compositor can reuse it.
 */
export function drawSceneBackground(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  width: number,
  height: number,
  mediaCache: MediaCache,
): void {
  const bgType = scene.backgroundType ?? 'solid';

  if (bgType === 'solid' || bgType === 'image') {
    ctx.fillStyle = scene.backgroundColor;
    ctx.fillRect(0, 0, width, height);
  }

  if ((bgType === 'linear-gradient' || bgType === 'radial-gradient') && scene.backgroundGradient) {
    ctx.fillStyle = createCanvasGradient(ctx, scene.backgroundGradient, width, height);
    ctx.fillRect(0, 0, width, height);
  }

  if (bgType === 'image' && scene.backgroundImage) {
    const bitmap = mediaCache.get(scene.backgroundImage);
    if (bitmap) {
      const fit = scene.backgroundImageFit ?? 'cover';
      const sw = bitmap.width;
      const sh = bitmap.height;
      switch (fit) {
        case 'fill':
          ctx.drawImage(bitmap, 0, 0, width, height);
          break;
        case 'contain': {
          const scale = Math.min(width / sw, height / sh);
          const w = sw * scale;
          const h = sh * scale;
          ctx.drawImage(bitmap, (width - w) / 2, (height - h) / 2, w, h);
          break;
        }
        case 'cover':
        default: {
          const scale = Math.max(width / sw, height / sh);
          const w = sw * scale;
          const h = sh * scale;
          ctx.drawImage(bitmap, (width - w) / 2, (height - h) / 2, w, h);
          break;
        }
        case 'none':
          ctx.drawImage(bitmap, (width - sw) / 2, (height - sh) / 2);
          break;
      }
    }
  }
}

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
  drawSceneBackground(ctx, scene, width, height, mediaCache);

  drawSceneLayers(ctx, scene, frameInScene, width, height, mediaCache, fps, videoCache);
}
