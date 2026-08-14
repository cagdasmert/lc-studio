import type { SvgLayerData, ResolvedTransform } from '../types';

// Cache rendered SVG bitmaps by content hash to avoid re-rendering every frame
const svgCache = new Map<string, ImageBitmap>();
const pendingRenders = new Map<string, Promise<ImageBitmap | null>>();

function svgCacheKey(layer: SvgLayerData, w: number, h: number): string {
  return `${layer.content}|${w}|${h}|${layer.fillColor ?? ''}|${layer.strokeColor ?? ''}`;
}

/**
 * Render an SVG layer by serializing SVG markup to an Image,
 * then drawing it onto the canvas. Uses a cache to avoid
 * re-parsing SVG every frame.
 */
export function drawSvgLayer(
  ctx: CanvasRenderingContext2D,
  layer: SvgLayerData,
  resolved: ResolvedTransform,
): void {
  const { width, height } = resolved;
  const w = Math.round(width);
  const h = Math.round(height);
  if (w <= 0 || h <= 0) return;

  const key = svgCacheKey(layer, w, h);
  const cached = svgCache.get(key);

  if (cached) {
    ctx.drawImage(cached, 0, 0, w, h);
    return;
  }

  // Trigger async render if not already in progress
  if (!pendingRenders.has(key)) {
    const promise = renderSvgToBitmap(layer, w, h);
    pendingRenders.set(key, promise);
    promise.then((bitmap) => {
      pendingRenders.delete(key);
      if (bitmap) {
        svgCache.set(key, bitmap);
      }
    });
  }

  // Draw placeholder rectangle while SVG loads
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(0, 0, w, h);
  ctx.setLineDash([]);
  ctx.fillStyle = '#666';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SVG', w / 2, h / 2);
}

async function renderSvgToBitmap(
  layer: SvgLayerData,
  width: number,
  height: number,
): Promise<ImageBitmap | null> {
  try {
    let svgContent = layer.content.trim();

    // Ensure it has an <svg> wrapper
    if (!svgContent.startsWith('<svg')) {
      const vb = layer.viewBox || `0 0 ${width} ${height}`;
      svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${width}" height="${height}">${svgContent}</svg>`;
    } else {
      // Inject width/height if not present
      if (!svgContent.includes('width=')) {
        svgContent = svgContent.replace('<svg', `<svg width="${width}" height="${height}"`);
      }
      // Ensure xmlns
      if (!svgContent.includes('xmlns')) {
        svgContent = svgContent.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
      }
    }

    // Apply fill/stroke color overrides
    if (layer.fillColor) {
      svgContent = svgContent.replace(/<svg([^>]*)>/, `<svg$1 fill="${layer.fillColor}">`);
    }
    if (layer.strokeColor) {
      svgContent = svgContent.replace(/<svg([^>]*)>/, `<svg$1 stroke="${layer.strokeColor}">`);
    }

    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    try {
      const img = new Image();
      img.width = width;
      img.height = height;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('SVG load failed'));
        img.src = url;
      });
      return await createImageBitmap(img, { resizeWidth: width, resizeHeight: height });
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (err) {
    console.warn('SVG render failed:', err);
    return null;
  }
}
