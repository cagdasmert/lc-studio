import type { DisintegrateFx } from '../types';
import { hash, signedHash } from './noise';
import { bandProgress } from './fx-geometry';

/**
 * Disintegrate reveal: the layer assembles from grains of its own pixels, or
 * blows away into them on exit.
 *
 * The bitmap is cut into `grain`-sized cells. Each cell is released in a
 * sweep across the layer (`sweep`, `stagger`); until it lands it sits away
 * from home along the wind (`angle` ± `spread`), lifted or dropped by
 * `gravity`, and faded by `fade`. All of it is a closed-form function of the
 * cell and the envelope, so any frame can be drawn on its own.
 *
 * Grains are written straight into a pixel buffer, never one fillRect each.
 */
export function applyDisintegrate(src: HTMLCanvasElement, fx: DisintegrateFx, env: number): HTMLCanvasElement {
  if (env >= 1) return src;
  const w = src.width;
  const h = src.height;
  const sctx = src.getContext('2d');
  if (!sctx) return src;

  const g = Math.max(1, Math.round(fx.grain));
  const cols = Math.ceil(w / g);
  const rows = Math.ceil(h / g);
  const input = sctx.getImageData(0, 0, w, h);
  const src32 = new Uint32Array(input.data.buffer, input.data.byteOffset, w * h);

  // Cells with any alpha, and their bounding box: the sweep is normalised
  // across what is actually drawn, not across the padded canvas.
  const cells: number[] = [];
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      if (!cellHasAlpha(src32, w, h, gx * g, gy * g, g)) continue;
      cells.push(gx, gy);
      const cx = gx * g + g / 2;
      const cy = gy * g + g / 2;
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;
    }
  }

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const octx = out.getContext('2d');
  if (!octx || cells.length === 0) return out;

  const sweep = (fx.sweep * Math.PI) / 180;
  const sx = Math.cos(sweep);
  const sy = Math.sin(sweep);
  // Projection of the content box's corners on the sweep direction.
  let lo = Infinity;
  let hi = -Infinity;
  for (const x of [minX, maxX]) {
    for (const y of [minY, maxY]) {
      const p = x * sx + y * sy;
      if (p < lo) lo = p;
      if (p > hi) hi = p;
    }
  }
  const range = hi - lo;

  const output = octx.createImageData(w, h);
  const dst = output.data;
  const dst32 = new Uint32Array(dst.buffer, dst.byteOffset, w * h);
  const fade = Math.max(0, Math.min(1, fx.fade));

  for (let c = 0; c < cells.length; c += 2) {
    const gx = cells[c];
    const gy = cells[c + 1];
    const cx = gx * g + g / 2;
    const cy = gy * g + g / 2;
    const position = range > 0 ? (cx * sx + cy * sy - lo) / range : 0;
    const d = 1 - bandProgress(env, position, fx.stagger);

    const keep = 1 - fade * d;
    if (keep <= 0) continue;

    let ox = 0;
    let oy = 0;
    if (d > 0) {
      const dir = ((fx.angle + fx.spread * 180 * signedHash(gx, gy, 7)) * Math.PI) / 180;
      const dist = fx.scatter * d * (0.35 + 0.65 * hash(gx, gy, 8));
      ox = Math.round(Math.cos(dir) * dist);
      oy = Math.round(Math.sin(dir) * dist + fx.gravity * d * d);
    }

    const x0 = gx * g;
    const y0 = gy * g;
    const x1 = Math.min(w, x0 + g);
    const y1 = Math.min(h, y0 + g);
    for (let y = y0; y < y1; y++) {
      const ty = y + oy;
      if (ty < 0 || ty >= h) continue;
      for (let x = x0; x < x1; x++) {
        const tx = x + ox;
        if (tx < 0 || tx >= w) continue;
        const px = src32[y * w + x];
        const sa = px >>> 24;
        if (sa === 0) continue;
        const a = keep >= 1 ? sa : Math.round(sa * keep);
        if (a === 0) continue;
        const j = ty * w + tx;
        const da = dst32[j] >>> 24;
        if (da === 0) {
          dst32[j] = ((px & 0x00ffffff) | (a << 24)) >>> 0;
        } else {
          blendOver(dst, j * 4, px, a, da);
        }
      }
    }
  }

  octx.putImageData(output, 0, 0);
  return out;
}

function cellHasAlpha(src32: Uint32Array, w: number, h: number, x0: number, y0: number, g: number): boolean {
  const x1 = Math.min(w, x0 + g);
  const y1 = Math.min(h, y0 + g);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (src32[y * w + x] >>> 24) return true;
    }
  }
  return false;
}

/** Source-over of one unpremultiplied pixel (colour of `px`, alpha `sa`) onto dst[i..i+3] (alpha `da`). */
function blendOver(dst: Uint8ClampedArray, i: number, px: number, sa: number, da: number): void {
  const as = sa / 255;
  const ad = (da / 255) * (1 - as);
  const ao = as + ad;
  dst[i] = ((px & 0xff) * as + dst[i] * ad) / ao;
  dst[i + 1] = (((px >>> 8) & 0xff) * as + dst[i + 1] * ad) / ao;
  dst[i + 2] = (((px >>> 16) & 0xff) * as + dst[i + 2] * ad) / ao;
  dst[i + 3] = ao * 255;
}
