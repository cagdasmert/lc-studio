import type { VideoLayerData, ResolvedTransform } from '../types';
import type { VideoCache } from './video-cache';

export function drawVideoLayer(
  ctx: CanvasRenderingContext2D,
  layer: VideoLayerData,
  resolved: ResolvedTransform,
  frameInLayer: number,
  fps: number,
  videoCache: VideoCache,
): void {
  const video = videoCache.get(layer.src);
  if (!video || video.readyState < 2) return; // Not loaded yet

  const { width: dw, height: dh } = resolved;

  // Calculate the time position in the source video
  const layerTimeSecs = frameInLayer / fps;
  const videoTimeSecs = layer.startTime + layerTimeSecs * layer.playbackRate;

  // Seek synchronously for preview (best-effort, may show stale frame)
  if (Math.abs(video.currentTime - videoTimeSecs) > 1 / fps) {
    video.currentTime = videoTimeSecs;
  }

  // Draw the video frame scaled to fit the layer dimensions (cover mode)
  const sw = video.videoWidth;
  const sh = video.videoHeight;

  if (sw === 0 || sh === 0) return;

  const scale = Math.max(dw / sw, dh / sh);
  const w = sw * scale;
  const h = sh * scale;

  ctx.drawImage(video, (dw - w) / 2, (dh - h) / 2, w, h);
}
