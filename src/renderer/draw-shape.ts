import type { ShapeLayerData, ResolvedTransform } from '../types';
import { createCanvasGradient } from './gradient';
import { resolveNumericProperty } from './interpolation';

export function drawShapeLayer(
  ctx: CanvasRenderingContext2D,
  layer: ShapeLayerData,
  resolved: ResolvedTransform,
  frameInLayer: number,
): void {
  const { width, height } = resolved;
  // Back/elastic easings overshoot, which can carry the radius below zero,
  // and roundRect throws on a negative radius.
  const cornerRadius = Math.max(
    0, resolveNumericProperty(layer.keyframes, 'cornerRadius', frameInLayer, layer.cornerRadius),
  );
  const strokeWidth = resolveNumericProperty(layer.keyframes, 'strokeWidth', frameInLayer, layer.strokeWidth);

  ctx.beginPath();

  switch (layer.shapeType) {
    case 'rect':
      ctx.rect(0, 0, width, height);
      break;

    case 'rounded-rect':
      ctx.roundRect(0, 0, width, height, cornerRadius);
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

    case 'triangle':
      ctx.moveTo(width / 2, 0);
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.closePath();
      break;

    case 'star': {
      const points = layer.starPoints ?? 5;
      const innerRatio = layer.starInnerRadius ?? 0.4;
      const cx = width / 2;
      const cy = height / 2;
      const outerR = Math.min(width, height) / 2;
      const innerR = outerR * innerRatio;
      for (let i = 0; i < points * 2; i++) {
        const angle = (i * Math.PI) / points - Math.PI / 2;
        const r = i % 2 === 0 ? outerR : innerR;
        const px = cx + r * Math.cos(angle);
        const py = cy + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    }

    case 'polygon': {
      const sides = layer.polygonSides ?? 6;
      const cx = width / 2;
      const cy = height / 2;
      const r = Math.min(width, height) / 2;
      for (let i = 0; i < sides; i++) {
        const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
        const px = cx + r * Math.cos(angle);
        const py = cy + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    }

    case 'arrow': {
      // Right-pointing arrow: shaft + head
      const shaftH = height * 0.4;
      const headW = width * 0.35;
      const shaftTop = (height - shaftH) / 2;
      const shaftBot = shaftTop + shaftH;
      ctx.moveTo(0, shaftTop);
      ctx.lineTo(width - headW, shaftTop);
      ctx.lineTo(width - headW, 0);
      ctx.lineTo(width, height / 2);
      ctx.lineTo(width - headW, height);
      ctx.lineTo(width - headW, shaftBot);
      ctx.lineTo(0, shaftBot);
      ctx.closePath();
      break;
    }
  }

  if (layer.fill && layer.shapeType !== 'line') {
    const fillType = layer.fillType ?? 'solid';
    if (fillType !== 'solid' && layer.fillGradient) {
      ctx.fillStyle = createCanvasGradient(ctx, layer.fillGradient, width, height);
    } else {
      ctx.fillStyle = layer.fill;
    }
    ctx.fill();
  }

  if (layer.stroke && strokeWidth > 0) {
    ctx.strokeStyle = layer.stroke;
    ctx.lineWidth = strokeWidth;
    if (layer.strokeDash && layer.strokeDash.length > 0) {
      ctx.setLineDash(layer.strokeDash);
      if (layer.strokeDashOffset) {
        ctx.lineDashOffset = layer.strokeDashOffset;
      }
    }
    ctx.stroke();
  }
}
