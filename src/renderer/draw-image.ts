import type { ImageLayerData, ResolvedTransform } from '../types';
import type { MediaCache } from './media-cache';
import { resolveNumericProperty } from './interpolation';
import { fitRect } from './fit';
import { renderMorph } from './draw-morph';

type FitMode = ImageLayerData['fitMode'];

/** Place the bitmap inside a dw×dh box according to the fit mode. */
function drawFitted(
  ctx: CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  fitMode: FitMode,
  dw: number,
  dh: number,
): void {
  const r = fitRect(fitMode, bitmap.width, bitmap.height, dw, dh);
  ctx.drawImage(bitmap, r.x, r.y, r.w, r.h);
}

/** True when the fitted bitmap can extend past the layer box. */
function overflowsBox(bitmap: ImageBitmap, fitMode: FitMode, dw: number, dh: number): boolean {
  switch (fitMode) {
    case 'cover': {
      const scale = Math.max(dw / bitmap.width, dh / bitmap.height);
      return bitmap.width * scale > dw + 0.5 || bitmap.height * scale > dh + 0.5;
    }
    case 'none':
      return bitmap.width > dw || bitmap.height > dh;
    default:
      return false;
  }
}

/** The morphed content for this frame, or null to draw the plain image. */
function morphContent(
  layer: ImageLayerData,
  bitmap: ImageBitmap,
  mediaCache: MediaCache,
  frameInLayer: number,
  dw: number,
  dh: number,
): HTMLCanvasElement | null {
  const morph = layer.morph;
  if (!morph) return null;
  const target = mediaCache.get(morph.target);
  if (!target) return null; // Target still loading — show the plain image meanwhile
  const t = resolveNumericProperty(layer.keyframes, 'morphProgress', frameInLayer, morph.progress);
  return renderMorph({
    a: bitmap, b: target, fitMode: layer.fitMode, pairs: morph.pairs, t, width: dw, height: dh,
  });
}

export function drawImageLayer(
  ctx: CanvasRenderingContext2D,
  layer: ImageLayerData,
  resolved: ResolvedTransform,
  frameInLayer: number,
  mediaCache: MediaCache,
): void {
  const bitmap = mediaCache.get(layer.src);
  if (!bitmap) return; // Image not loaded yet

  const { width: dw, height: dh } = resolved;
  if (dw <= 0 || dh <= 0) return;

  const borderRadius = resolveNumericProperty(layer.keyframes, 'borderRadius', frameInLayer, layer.borderRadius);

  // Keep the bitmap inside the layer box. `cover` scales past the box by
  // definition, and `none` does whenever the source is larger than the box.
  if (borderRadius > 0) {
    ctx.beginPath();
    ctx.roundRect(0, 0, dw, dh, borderRadius);
    ctx.clip();
  } else if (overflowsBox(bitmap, layer.fitMode, dw, dh)) {
    ctx.beginPath();
    ctx.rect(0, 0, dw, dh);
    ctx.clip();
  }

  // Rendered once and drawn wherever the plain image would be — the tint path
  // draws the content twice (colour, then alpha mask).
  const morphed = morphContent(layer, bitmap, mediaCache, frameInLayer, dw, dh);
  const drawContent = (target: CanvasRenderingContext2D) => {
    if (morphed) target.drawImage(morphed, 0, 0, dw, dh);
    else drawFitted(target, bitmap, layer.fitMode, dw, dh);
  };

  if (!layer.tintColor) {
    drawContent(ctx);
    return;
  }

  // Tint goes through an offscreen canvas. Blending straight onto `ctx` would
  // tint every layer already drawn beneath this one, and would paint the
  // bitmap's transparent pixels solid. Re-masking with `destination-in`
  // restores the source alpha, so a cutout PNG stays a cutout.
  const tinted = document.createElement('canvas');
  tinted.width = Math.max(1, Math.ceil(dw));
  tinted.height = Math.max(1, Math.ceil(dh));
  const tctx = tinted.getContext('2d');
  if (!tctx) {
    drawContent(ctx);
    return;
  }

  drawContent(tctx);
  tctx.globalCompositeOperation = layer.tintBlend ?? 'multiply';
  tctx.fillStyle = layer.tintColor;
  tctx.fillRect(0, 0, dw, dh);
  tctx.globalCompositeOperation = 'destination-in';
  drawContent(tctx);

  ctx.drawImage(tinted, 0, 0);
}
