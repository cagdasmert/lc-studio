import type { Scene, TransitionType } from '../types';
import type { MediaCache } from './media-cache';
import { drawSceneLayers } from './draw';

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
): void {
  switch (type) {
    case 'fade':
      drawFade(ctx, outgoing, incoming, outgoingFrame, progress, width, height, mediaCache);
      break;
    case 'slide-left':
      drawSlide(ctx, outgoing, incoming, outgoingFrame, progress, width, height, mediaCache, -1, 0);
      break;
    case 'slide-right':
      drawSlide(ctx, outgoing, incoming, outgoingFrame, progress, width, height, mediaCache, 1, 0);
      break;
    case 'slide-up':
      drawSlide(ctx, outgoing, incoming, outgoingFrame, progress, width, height, mediaCache, 0, -1);
      break;
    case 'slide-down':
      drawSlide(ctx, outgoing, incoming, outgoingFrame, progress, width, height, mediaCache, 0, 1);
      break;
    case 'wipe-horizontal':
      drawWipe(ctx, outgoing, incoming, outgoingFrame, progress, width, height, mediaCache, true);
      break;
    case 'wipe-vertical':
      drawWipe(ctx, outgoing, incoming, outgoingFrame, progress, width, height, mediaCache, false);
      break;
    case 'zoom-in':
      drawZoom(ctx, outgoing, incoming, outgoingFrame, progress, width, height, mediaCache, true);
      break;
    case 'zoom-out':
      drawZoom(ctx, outgoing, incoming, outgoingFrame, progress, width, height, mediaCache, false);
      break;
    case 'dissolve':
    default:
      // Dissolve is the same as fade for now
      drawFade(ctx, outgoing, incoming, outgoingFrame, progress, width, height, mediaCache);
      break;
  }
}

function drawFade(
  ctx: CanvasRenderingContext2D,
  outgoing: Scene, incoming: Scene,
  outgoingFrame: number, progress: number,
  width: number, height: number, mediaCache: MediaCache,
) {
  ctx.globalAlpha = 1 - progress;
  drawSceneLayers(ctx, outgoing, outgoingFrame, width, height, mediaCache);
  ctx.globalAlpha = progress;
  drawSceneLayers(ctx, incoming, 0, width, height, mediaCache);
  ctx.globalAlpha = 1;
}

function drawSlide(
  ctx: CanvasRenderingContext2D,
  outgoing: Scene, incoming: Scene,
  outgoingFrame: number, progress: number,
  width: number, height: number, mediaCache: MediaCache,
  dirX: number, dirY: number,
) {
  const offsetX = dirX * progress * width;
  const offsetY = dirY * progress * height;

  ctx.save();
  ctx.translate(offsetX, offsetY);
  drawSceneLayers(ctx, outgoing, outgoingFrame, width, height, mediaCache);
  ctx.restore();

  ctx.save();
  ctx.translate(offsetX - dirX * width, offsetY - dirY * height);
  drawSceneLayers(ctx, incoming, 0, width, height, mediaCache);
  ctx.restore();
}

function drawWipe(
  ctx: CanvasRenderingContext2D,
  outgoing: Scene, incoming: Scene,
  outgoingFrame: number, progress: number,
  width: number, height: number, mediaCache: MediaCache,
  horizontal: boolean,
) {
  // Draw outgoing full
  drawSceneLayers(ctx, outgoing, outgoingFrame, width, height, mediaCache);

  // Draw incoming clipped
  ctx.save();
  ctx.beginPath();
  if (horizontal) {
    ctx.rect(0, 0, width * progress, height);
  } else {
    ctx.rect(0, 0, width, height * progress);
  }
  ctx.clip();
  // Clear the clipped area and draw incoming
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = incoming.backgroundColor;
  ctx.fillRect(0, 0, width, height);
  drawSceneLayers(ctx, incoming, 0, width, height, mediaCache);
  ctx.restore();
}

function drawZoom(
  ctx: CanvasRenderingContext2D,
  outgoing: Scene, incoming: Scene,
  outgoingFrame: number, progress: number,
  width: number, height: number, mediaCache: MediaCache,
  zoomIn: boolean,
) {
  // Draw incoming behind
  drawSceneLayers(ctx, incoming, 0, width, height, mediaCache);

  // Draw outgoing with zoom + fade
  ctx.save();
  ctx.globalAlpha = 1 - progress;
  const scale = zoomIn ? 1 + progress * 0.3 : 1 - progress * 0.3;
  ctx.translate(width / 2, height / 2);
  ctx.scale(scale, scale);
  ctx.translate(-width / 2, -height / 2);
  ctx.fillStyle = outgoing.backgroundColor;
  ctx.fillRect(0, 0, width, height);
  drawSceneLayers(ctx, outgoing, outgoingFrame, width, height, mediaCache);
  ctx.restore();
}
