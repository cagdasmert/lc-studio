import type { ImageLayerData, ResolvedTransform } from '../types';
import type { MediaCache } from './media-cache';

type FitMode = ImageLayerData['fitMode'];

/** Place the bitmap inside a dw×dh box according to the fit mode. */
function drawFitted(
  ctx: CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  fitMode: FitMode,
  dw: number,
  dh: number,
): void {
  const sw = bitmap.width;
  const sh = bitmap.height;

  switch (fitMode) {
    case 'fill':
      ctx.drawImage(bitmap, 0, 0, dw, dh);
      break;

    case 'contain': {
      const scale = Math.min(dw / sw, dh / sh);
      const w = sw * scale;
      const h = sh * scale;
      ctx.drawImage(bitmap, (dw - w) / 2, (dh - h) / 2, w, h);
      break;
    }

    case 'cover': {
      const scale = Math.max(dw / sw, dh / sh);
      const w = sw * scale;
      const h = sh * scale;
      ctx.drawImage(bitmap, (dw - w) / 2, (dh - h) / 2, w, h);
      break;
    }

    case 'none':
      ctx.drawImage(bitmap, (dw - sw) / 2, (dh - sh) / 2);
      break;
  }
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

export function drawImageLayer(
  ctx: CanvasRenderingContext2D,
  layer: ImageLayerData,
  resolved: ResolvedTransform,
  mediaCache: MediaCache,
): void {
  const bitmap = mediaCache.get(layer.src);
  if (!bitmap) return; // Image not loaded yet

  const { width: dw, height: dh } = resolved;
  if (dw <= 0 || dh <= 0) return;

  // Keep the bitmap inside the layer box. `cover` scales past the box by
  // definition, and `none` does whenever the source is larger than the box.
  if (layer.borderRadius > 0) {
    ctx.beginPath();
    ctx.roundRect(0, 0, dw, dh, layer.borderRadius);
    ctx.clip();
  } else if (overflowsBox(bitmap, layer.fitMode, dw, dh)) {
    ctx.beginPath();
    ctx.rect(0, 0, dw, dh);
    ctx.clip();
  }

  if (!layer.tintColor) {
    drawFitted(ctx, bitmap, layer.fitMode, dw, dh);
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
    drawFitted(ctx, bitmap, layer.fitMode, dw, dh);
    return;
  }

  drawFitted(tctx, bitmap, layer.fitMode, dw, dh);
  tctx.globalCompositeOperation = layer.tintBlend ?? 'multiply';
  tctx.fillStyle = layer.tintColor;
  tctx.fillRect(0, 0, dw, dh);
  tctx.globalCompositeOperation = 'destination-in';
  drawFitted(tctx, bitmap, layer.fitMode, dw, dh);

  ctx.drawImage(tinted, 0, 0);
}
