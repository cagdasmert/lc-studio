import type { TextLayerData, ResolvedTransform } from '../types';
import { resolveNumericProperty, resolveColorProperty } from './interpolation';

export function drawTextLayer(
  ctx: CanvasRenderingContext2D,
  layer: TextLayerData,
  resolved: ResolvedTransform,
  frameInLayer: number,
): void {
  const fontSize = resolveNumericProperty(layer.keyframes, 'fontSize', frameInLayer, layer.fontSize);
  const letterSpacing = resolveNumericProperty(layer.keyframes, 'letterSpacing', frameInLayer, layer.letterSpacing);
  const lineHeight = resolveNumericProperty(layer.keyframes, 'lineHeight', frameInLayer, layer.lineHeight);
  const color = resolveColorProperty(
    layer.keyframes as unknown as Record<string, import('../types').KeyframeTrack<string>>,
    'color', frameInLayer, layer.color,
  );

  const weight = layer.fontWeight === 'normal' ? '' : layer.fontWeight;
  const style = layer.fontStyle === 'normal' ? '' : layer.fontStyle;
  ctx.font = `${style} ${weight} ${fontSize}px ${layer.fontFamily}`.trim();
  ctx.fillStyle = color;
  ctx.textAlign = layer.align;
  ctx.textBaseline = 'top';

  // Text shadow
  if (layer.textShadow) {
    ctx.shadowColor = layer.textShadow.color;
    ctx.shadowBlur = layer.textShadow.blur;
    ctx.shadowOffsetX = layer.textShadow.offsetX;
    ctx.shadowOffsetY = layer.textShadow.offsetY;
  }

  // Word wrap
  const lines = wrapText(ctx, layer.content, layer.maxWidth || resolved.width, letterSpacing);
  const lineHeightPx = fontSize * lineHeight;
  const totalHeight = lines.length * lineHeightPx;

  // Vertical alignment offset
  let yOffset = 0;
  if (layer.verticalAlign === 'middle') {
    yOffset = (resolved.height - totalHeight) / 2;
  } else if (layer.verticalAlign === 'bottom') {
    yOffset = resolved.height - totalHeight;
  }

  // Text alignment x offset
  let xOffset = 0;
  if (layer.align === 'center') xOffset = resolved.width / 2;
  else if (layer.align === 'right') xOffset = resolved.width;

  for (let i = 0; i < lines.length; i++) {
    const ly = yOffset + i * lineHeightPx;

    // Stroke
    if (layer.textStroke) {
      ctx.strokeStyle = layer.textStroke.color;
      ctx.lineWidth = layer.textStroke.width;
      ctx.lineJoin = 'round';
      if (letterSpacing !== 0) {
        drawWithLetterSpacing(ctx, lines[i], xOffset, ly, letterSpacing, true);
      } else {
        ctx.strokeText(lines[i], xOffset, ly);
      }
    }

    // Fill
    if (letterSpacing !== 0) {
      drawWithLetterSpacing(ctx, lines[i], xOffset, ly, letterSpacing, false);
    } else {
      ctx.fillText(lines[i], xOffset, ly);
    }
  }

  // Reset shadow
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  _letterSpacing: number,
): string[] {
  if (maxWidth <= 0) return text.split('\n');

  const paragraphs = text.split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    const words = para.split(' ');
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);

      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    lines.push(currentLine);
  }

  return lines;
}

function drawWithLetterSpacing(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
  stroke: boolean,
): void {
  // For center/right alignment, compute total width first
  let totalWidth = 0;
  for (const char of text) {
    totalWidth += ctx.measureText(char).width + spacing;
  }
  totalWidth -= spacing; // no spacing after last char

  let startX = x;
  if (ctx.textAlign === 'center') startX -= totalWidth / 2;
  else if (ctx.textAlign === 'right') startX -= totalWidth;

  const savedAlign = ctx.textAlign;
  ctx.textAlign = 'left';

  let cx = startX;
  for (const char of text) {
    if (stroke) ctx.strokeText(char, cx, y);
    else ctx.fillText(char, cx, y);
    cx += ctx.measureText(char).width + spacing;
  }

  ctx.textAlign = savedAlign;
}
