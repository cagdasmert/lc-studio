import type { VideoLayerData, ResolvedTransform } from '../types';
import { fitRect } from './fit';

/** A decoded video frame, ready to draw. */
export type VideoFrameImage = HTMLCanvasElement | OffscreenCanvas;

/** Video frames decoded ahead of a synchronous draw, by layer id. */
export interface PreparedVideoFrames {
  get(layerId: string): VideoFrameImage | undefined;
}

/**
 * Draw the frame prepared for this layer, cover-fitted and clipped to the
 * layer box as image layers are. With nothing prepared — the clip is still
 * decoding (preview only; export always prepares first) or can't be decoded —
 * the layer draws nothing, and whatever is underneath shows.
 */
export function drawVideoLayer(
  ctx: CanvasRenderingContext2D,
  layer: VideoLayerData,
  resolved: ResolvedTransform,
  frames: PreparedVideoFrames,
): void {
  const frame = frames.get(layer.id);
  if (!frame) return;

  const { width: dw, height: dh } = resolved;
  if (frame.width === 0 || frame.height === 0 || dw <= 0 || dh <= 0) return;

  const r = fitRect('cover', frame.width, frame.height, dw, dh);
  ctx.beginPath();
  ctx.rect(0, 0, dw, dh);
  ctx.clip();
  ctx.drawImage(frame, r.x, r.y, r.w, r.h);
}
