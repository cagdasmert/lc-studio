import type { ShapeLayerData, ResolvedTransform } from '../types';

export function drawShapeLayer(
  ctx: CanvasRenderingContext2D,
  layer: ShapeLayerData,
  resolved: ResolvedTransform,
): void {
  const { width, height } = resolved;

  ctx.beginPath();

  switch (layer.shapeType) {
    case 'rect':
      ctx.rect(0, 0, width, height);
      break;

    case 'rounded-rect':
      ctx.roundRect(0, 0, width, height, layer.cornerRadius);
      break;

    case 'circle': {
      const r = Math.min(width, height) / 2;
      ctx.arc(width / 2, height / 2, r, 0, Math.PI * 2);
      break;
    }

    case 'ellipse':
      ctx.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
      break;

    case 'line':
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      break;
  }

  if (layer.fill && layer.shapeType !== 'line') {
    ctx.fillStyle = layer.fill;
    ctx.fill();
  }

  if (layer.stroke && layer.strokeWidth > 0) {
    ctx.strokeStyle = layer.stroke;
    ctx.lineWidth = layer.strokeWidth;
    ctx.stroke();
  }
}
