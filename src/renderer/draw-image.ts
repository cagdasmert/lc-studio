import type { ImageLayerData, ResolvedTransform } from '../types';
import type { MediaCache } from './media-cache';

export function drawImageLayer(
  ctx: CanvasRenderingContext2D,
  layer: ImageLayerData,
  resolved: ResolvedTransform,
  mediaCache: MediaCache,
): void {
  const bitmap = mediaCache.get(layer.src);
  if (!bitmap) return; // Image not loaded yet

  const { width: dw, height: dh } = resolved;
  const sw = bitmap.width;
  const sh = bitmap.height;

  // Clip for border radius
  if (layer.borderRadius > 0) {
    ctx.beginPath();
    ctx.roundRect(0, 0, dw, dh, layer.borderRadius);
    ctx.clip();
  }

  switch (layer.fitMode) {
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

  // Color tint overlay
  if (layer.tintColor) {
    ctx.save();
    ctx.globalCompositeOperation = layer.tintBlend ?? 'multiply';
    ctx.fillStyle = layer.tintColor;
    ctx.fillRect(0, 0, dw, dh);
    ctx.restore();
  }
}
