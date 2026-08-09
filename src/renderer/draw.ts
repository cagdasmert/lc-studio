import type { Scene, TextLayer } from '../types';
import { getEasing } from './easing';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function drawTextLayer(
  ctx: CanvasRenderingContext2D,
  layer: TextLayer,
  frameInScene: number,
  width: number,
  height: number,
): void {
  const { animation } = layer;
  const rawProgress =
    animation.durationFrames > 0
      ? (frameInScene - animation.delayFrames) / animation.durationFrames
      : 1;
  const progress = clamp(rawProgress, 0, 1);
  const eased = getEasing(animation.easing)(progress);

  const pixelX = layer.x * width;
  const pixelY = layer.y * height;
  const slideDistance = height * 0.1;

  ctx.save();
  ctx.font = `${layer.fontSize}px ${layer.fontFamily}`;
  ctx.fillStyle = layer.color;
  ctx.textAlign = layer.align;
  ctx.textBaseline = 'middle';

  let drawX = pixelX;
  let drawY = pixelY;
  let text = layer.content;

  switch (animation.type) {
    case 'fade-in':
      ctx.globalAlpha = eased;
      break;
    case 'slide-up':
      ctx.globalAlpha = eased;
      drawY += (1 - eased) * slideDistance;
      break;
    case 'slide-left':
      ctx.globalAlpha = eased;
      drawX += (1 - eased) * slideDistance;
      break;
    case 'typewriter':
      text = layer.content.slice(0, Math.floor(layer.content.length * eased));
      break;
    case 'none':
      break;
  }

  ctx.fillText(text, drawX, drawY);
  ctx.restore();
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  frameInScene: number,
  width: number,
  height: number,
): void {
  // Background
  ctx.fillStyle = scene.backgroundColor;
  ctx.fillRect(0, 0, width, height);

  // Text layers
  for (const layer of scene.textLayers) {
    drawTextLayer(ctx, layer, frameInScene, width, height);
  }
}
