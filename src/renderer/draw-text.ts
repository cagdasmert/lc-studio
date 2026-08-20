import type { TextLayerData, ResolvedTransform, CharAnimationDef } from '../types';
import { resolveNumericProperty, resolveColorProperty } from './interpolation';
import { createCanvasGradient } from './gradient';
import { getEasing } from './easing';
import { hash } from './noise';

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
  const fillType = layer.fillType ?? 'solid';
  if (fillType !== 'solid' && layer.fillGradient) {
    ctx.fillStyle = createCanvasGradient(ctx, layer.fillGradient, resolved.width, resolved.height);
  } else {
    ctx.fillStyle = color;
  }
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

  const hasCharAnim = layer.charAnimation && layer.charAnimation.type !== 'none';

  if (hasCharAnim) {
    drawWithCharAnimation(ctx, lines, xOffset, yOffset, lineHeightPx, letterSpacing, layer, frameInLayer);
  } else {
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

function drawWithCharAnimation(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  xOffset: number,
  yOffset: number,
  lineHeightPx: number,
  letterSpacing: number,
  layer: TextLayerData,
  frameInLayer: number,
): void {
  const anim = layer.charAnimation!;
  const easeFn = getEasing(anim.easing ?? 'ease-out');

  // Flatten all chars with their positions
  let globalCharIdx = 0;
  const savedAlign = ctx.textAlign;
  ctx.textAlign = 'left';

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const ly = yOffset + lineIdx * lineHeightPx;
    const line = lines[lineIdx];

    // Compute line width for alignment
    let lineWidth = 0;
    for (const ch of line) {
      lineWidth += ctx.measureText(ch).width + letterSpacing;
    }
    lineWidth -= letterSpacing;

    let startX = xOffset;
    if (savedAlign === 'center') startX = xOffset - lineWidth / 2;
    else if (savedAlign === 'right') startX = xOffset - lineWidth;

    let cx = startX;
    for (const ch of line) {
      const charW = ctx.measureText(ch).width;

      // Calculate per-char progress
      const charStartFrame = globalCharIdx * anim.staggerFrames;
      const charEndFrame = charStartFrame + anim.durationFrames;
      let progress: number;
      if (frameInLayer >= charEndFrame) {
        progress = 1;
      } else if (frameInLayer <= charStartFrame) {
        progress = 0;
      } else {
        progress = (frameInLayer - charStartFrame) / anim.durationFrames;
        progress = easeFn(Math.max(0, Math.min(1, progress)));
      }

      // Wave floats continuously rather than revealing, so it is always drawn
      if (anim.type === 'wave') progress = 1;

      // Scramble shows random glyphs until the character settles
      const drawnChar = anim.type === 'scramble' && progress < 1 && progress > 0
        ? scrambleChar(globalCharIdx, frameInLayer)
        : ch;

      if (progress > 0) {
        applyCharEffect(
          ctx, anim, drawnChar, cx, ly, charW, lineHeightPx, progress, layer,
          globalCharIdx, frameInLayer,
        );
      }

      cx += charW + letterSpacing;
      globalCharIdx++;
    }
    // Count the implicit newline (for stagger continuity)
    globalCharIdx++;
  }

  ctx.textAlign = savedAlign;
}

const SCRAMBLE_GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&@$?/\\<>*+=';

/**
 * Pick a stand-in glyph for a character that hasn't settled yet. Changes a few
 * times a second (not every frame, which reads as noise) and is a pure
 * function of the character index and frame, so renders stay reproducible.
 */
function scrambleChar(charIndex: number, frameInLayer: number): string {
  const tick = Math.floor(frameInLayer / 2);
  const i = Math.floor(hash(charIndex, tick) * SCRAMBLE_GLYPHS.length);
  return SCRAMBLE_GLYPHS[Math.min(SCRAMBLE_GLYPHS.length - 1, i)];
}

function applyCharEffect(
  ctx: CanvasRenderingContext2D,
  anim: CharAnimationDef,
  ch: string,
  x: number,
  y: number,
  charW: number,
  lineH: number,
  progress: number,
  layer: TextLayerData,
  charIndex: number,
  frameInLayer: number,
): void {
  ctx.save();

  switch (anim.type) {
    case 'fade-in':
      ctx.globalAlpha *= progress;
      break;

    case 'slide-up':
      ctx.globalAlpha *= progress;
      ctx.translate(0, lineH * (1 - progress));
      break;

    case 'slide-down':
      ctx.globalAlpha *= progress;
      ctx.translate(0, -lineH * (1 - progress));
      break;

    case 'scale-in': {
      const scale = progress;
      const cx = x + charW / 2;
      const cy = y + lineH / 2;
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.translate(-cx, -cy);
      ctx.globalAlpha *= progress;
      break;
    }

    case 'rotate-in': {
      const cx = x + charW / 2;
      const cy = y + lineH / 2;
      ctx.translate(cx, cy);
      ctx.rotate(Math.PI * (1 - progress));
      ctx.translate(-cx, -cy);
      ctx.globalAlpha *= progress;
      break;
    }

    case 'typewriter':
      // Binary: visible or not
      if (progress < 0.01) {
        ctx.restore();
        return;
      }
      break;

    case 'scramble':
      // Unsettled characters are dimmer, so the settled ones read as "locked in"
      if (progress < 1) ctx.globalAlpha *= 0.45 + progress * 0.55;
      break;

    case 'wave': {
      // staggerFrames sets the phase offset per character, durationFrames the
      // period — reusing the existing controls rather than adding new ones.
      const period = Math.max(1, anim.durationFrames);
      const phase = (frameInLayer / period) * Math.PI * 2 + charIndex * (anim.staggerFrames * 0.2);
      ctx.translate(0, Math.sin(phase) * lineH * 0.15);
      break;
    }
  }

  // Stroke
  if (layer.textStroke) {
    ctx.strokeStyle = layer.textStroke.color;
    ctx.lineWidth = layer.textStroke.width;
    ctx.lineJoin = 'round';
    ctx.strokeText(ch, x, y);
  }

  ctx.fillText(ch, x, y);
  ctx.restore();
}
