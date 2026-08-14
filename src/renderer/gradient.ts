import type { GradientDef } from '../types';

/**
 * Convert a GradientDef to a CanvasGradient that covers the given rectangle.
 *
 * Linear angle convention:
 *   0° = left → right, 90° = top → bottom, 180° = right → left, 270° = bottom → top
 */
export function createCanvasGradient(
  ctx: CanvasRenderingContext2D,
  gradient: GradientDef,
  width: number,
  height: number,
): CanvasGradient {
  let g: CanvasGradient;

  if (gradient.type === 'linear') {
    const rad = (gradient.angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    // Half-diagonal projected onto the gradient direction — ensures full coverage
    const halfLen = (Math.abs(width * cos) + Math.abs(height * sin)) / 2;
    const cx = width / 2;
    const cy = height / 2;
    g = ctx.createLinearGradient(
      cx - cos * halfLen, cy - sin * halfLen,
      cx + cos * halfLen, cy + sin * halfLen,
    );
  } else {
    const cx = gradient.centerX * width;
    const cy = gradient.centerY * height;
    const r = gradient.radius * Math.max(width, height);
    g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, r));
  }

  for (const stop of gradient.stops) {
    g.addColorStop(Math.max(0, Math.min(1, stop.offset)), stop.color);
  }

  return g;
}
