import type { Scene, TransitionType } from '../types';
import type { MediaCache } from './media-cache';
import type { VideoCache } from './video-cache';
import { drawSceneLayers, drawSceneBackground } from './draw';

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
  videoCache?: VideoCache,
): void {
  const draw = (scene: Scene, frame: number) =>
    drawSceneLayers(ctx, scene, frame, width, height, mediaCache, fps, videoCache);

  switch (type) {
    case 'fade':
      ctx.globalAlpha = 1 - progress;
      draw(outgoing, outgoingFrame);
      ctx.globalAlpha = progress;
      draw(incoming, 0);
      ctx.globalAlpha = 1;
      break;

    case 'slide-left':
      drawSlide(ctx, outgoing, incoming, outgoingFrame, progress, width, height, draw, -1, 0);
      break;
    case 'slide-right':
      drawSlide(ctx, outgoing, incoming, outgoingFrame, progress, width, height, draw, 1, 0);
      break;
    case 'slide-up':
      drawSlide(ctx, outgoing, incoming, outgoingFrame, progress, width, height, draw, 0, -1);
      break;
    case 'slide-down':
      drawSlide(ctx, outgoing, incoming, outgoingFrame, progress, width, height, draw, 0, 1);
      break;

    case 'wipe-horizontal':
      drawWipe(ctx, outgoing, incoming, outgoingFrame, progress, width, height, draw, true, mediaCache);
      break;
    case 'wipe-vertical':
      drawWipe(ctx, outgoing, incoming, outgoingFrame, progress, width, height, draw, false, mediaCache);
      break;

    case 'zoom-in':
      drawZoom(ctx, outgoing, incoming, outgoingFrame, progress, width, height, draw, true, mediaCache);
      break;
    case 'zoom-out':
      drawZoom(ctx, outgoing, incoming, outgoingFrame, progress, width, height, draw, false, mediaCache);
      break;

    case 'dissolve':
    default:
      ctx.globalAlpha = 1 - progress;
      draw(outgoing, outgoingFrame);
      ctx.globalAlpha = progress;
      draw(incoming, 0);
      ctx.globalAlpha = 1;
      break;
  }
}

type DrawFn = (scene: Scene, frame: number) => void;

function drawSlide(
  ctx: CanvasRenderingContext2D,
  outgoing: Scene, incoming: Scene,
  outgoingFrame: number, progress: number,
  width: number, height: number, draw: DrawFn,
  dirX: number, dirY: number,
) {
  const offsetX = dirX * progress * width;
  const offsetY = dirY * progress * height;

  ctx.save();
  ctx.translate(offsetX, offsetY);
  draw(outgoing, outgoingFrame);
  ctx.restore();

  ctx.save();
  ctx.translate(offsetX - dirX * width, offsetY - dirY * height);
  draw(incoming, 0);
  ctx.restore();
}

function drawWipe(
  ctx: CanvasRenderingContext2D,
  outgoing: Scene, incoming: Scene,
  outgoingFrame: number, progress: number,
  width: number, height: number, draw: DrawFn,
  horizontal: boolean,
  mediaCache: MediaCache,
) {
  draw(outgoing, outgoingFrame);

  ctx.save();
  ctx.beginPath();
  if (horizontal) {
    ctx.rect(0, 0, width * progress, height);
  } else {
    ctx.rect(0, 0, width, height * progress);
  }
  ctx.clip();
  ctx.clearRect(0, 0, width, height);
  drawSceneBackground(ctx, incoming, width, height, mediaCache);
  draw(incoming, 0);
  ctx.restore();
}

function drawZoom(
  ctx: CanvasRenderingContext2D,
  outgoing: Scene, incoming: Scene,
  outgoingFrame: number, progress: number,
  width: number, height: number, draw: DrawFn,
  zoomIn: boolean,
  mediaCache: MediaCache,
) {
  draw(incoming, 0);

  ctx.save();
  ctx.globalAlpha = 1 - progress;
  const scale = zoomIn ? 1 + progress * 0.3 : 1 - progress * 0.3;
  ctx.translate(width / 2, height / 2);
  ctx.scale(scale, scale);
  ctx.translate(-width / 2, -height / 2);
  drawSceneBackground(ctx, outgoing, width, height, mediaCache);
  draw(outgoing, outgoingFrame);
  ctx.restore();
}
