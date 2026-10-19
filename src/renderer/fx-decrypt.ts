import type { DecryptFx } from '../types';
import { hash } from './noise';
import { bandProgress } from './fx-geometry';
import { BINARY, CIPHER, RAMP, drawGlyph, packRgba } from './glyphs';

/**
 * Decrypt reveal: cells of cipher glyphs flicker over the layer's shape, then
 * snap into its real pixels, in random order, in a sweep, or from the centre
 * out. On exit the layer encrypts and vanishes.
 *
 * Unlike text `charAnimation: 'scramble'`, which swaps font glyphs per
 * character, this works on the pixels of any layer, with bitmap glyphs.
 *
 * A cell takes part when its mean alpha is at least 0.15. Cells below that
 * (sparse edges) skip the glyph phase: empty, then their real pixels.
 */
export function applyDecrypt(src: HTMLCanvasElement, fx: DecryptFx, env: number, frameInLayer: number): HTMLCanvasElement {
  if (env >= 1) return src;
  const w = src.width;
  const h = src.height;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const sctx = src.getContext('2d');
  const octx = out.getContext('2d');
  if (!sctx || !octx) return src;

  const cell = Math.max(1, Math.round(fx.cell));
  const cols = Math.ceil(w / cell);
  const rows = Math.ceil(h / cell);
  const input = sctx.getImageData(0, 0, w, h);
  const s = input.data;
  const src32 = new Uint32Array(s.buffer, s.byteOffset, w * h);

  // Per-cell mean colour (alpha-weighted) and mean alpha, plus the box of
  // cells with any content, which the sweep and centre-out orders span.
  const n = cols * rows;
  const meanA = new Float32Array(n);
  const meanR = new Float32Array(n);
  const meanG = new Float32Array(n);
  const meanB = new Float32Array(n);
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const x0 = cx * cell; const y0 = cy * cell;
      const x1 = Math.min(w, x0 + cell); const y1 = Math.min(h, y0 + cell);
      let a = 0; let r = 0; let g = 0; let b = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * w + x) * 4;
          const pa = s[i + 3];
          a += pa; r += s[i] * pa; g += s[i + 1] * pa; b += s[i + 2] * pa;
        }
      }
      const k = cy * cols + cx;
      const area = (x1 - x0) * (y1 - y0);
      meanA[k] = a / area / 255;
      if (a > 0) {
        meanR[k] = r / a; meanG[k] = g / a; meanB[k] = b / a;
        const mx = x0 + cell / 2; const my = y0 + cell / 2;
        if (mx < minX) minX = mx;
        if (mx > maxX) maxX = mx;
        if (my < minY) minY = my;
        if (my > maxY) maxY = my;
      }
    }
  }
  if (minX > maxX) return out; // nothing drawn

  const rad = (fx.angle * Math.PI) / 180;
  const ux = Math.cos(rad); const uy = Math.sin(rad);
  let lo = Infinity; let hi = -Infinity;
  for (const x of [minX, maxX]) for (const y of [minY, maxY]) {
    const p = x * ux + y * uy;
    if (p < lo) lo = p;
    if (p > hi) hi = p;
  }
  const midX = (minX + maxX) / 2; const midY = (minY + maxY) / 2;
  const maxDist = Math.hypot(maxX - midX, maxY - midY);

  const ink = parseHex(fx.color);
  const tint = Math.max(0, Math.min(1, fx.tint));
  const glow = Math.max(0, Math.min(1, fx.edgeGlow));
  const set = fx.charset === 'binary' ? BINARY : CIPHER;
  const tick = Math.floor(frameInLayer / Math.max(1, Math.round(fx.scrambleFrames)));

  const output = octx.createImageData(w, h);
  const dst32 = new Uint32Array(output.data.buffer, output.data.byteOffset, w * h);

  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const k = cy * cols + cx;
      if (meanA[k] === 0) continue;
      const mx = cx * cell + cell / 2; const my = cy * cell + cell / 2;
      let position: number;
      if (fx.order === 'sweep') position = hi > lo ? (mx * ux + my * uy - lo) / (hi - lo) : 0;
      else if (fx.order === 'center-out') position = maxDist > 0 ? Math.hypot(mx - midX, my - midY) / maxDist : 0;
      else position = hash(cx, cy, 4111);
      const local = bandProgress(env, position, fx.stagger);
      if (local <= 0) continue;

      const x0 = cx * cell; const y0 = cy * cell;
      if (local >= 1) {
        const x1 = Math.min(w, x0 + cell); const y1 = Math.min(h, y0 + cell);
        for (let y = y0; y < y1; y++) {
          const row = y * w;
          for (let x = x0; x < x1; x++) dst32[row + x] = src32[row + x];
        }
        continue;
      }
      if (meanA[k] < 0.15) continue;

      let bits: number;
      if (fx.charset === 'ramp') {
        const lum = (0.2126 * meanR[k] + 0.7152 * meanG[k] + 0.0722 * meanB[k]) / 255;
        bits = RAMP[Math.min(RAMP.length - 1, Math.round(lum * (RAMP.length - 1)))];
      } else {
        bits = set[Math.floor(hash(cx, cy, tick) * set.length)];
      }
      let r = meanR[k] + (ink[0] - meanR[k]) * tint;
      let g = meanG[k] + (ink[1] - meanG[k]) * tint;
      let b = meanB[k] + (ink[2] - meanB[k]) * tint;
      if (local > 0.8 && glow > 0) {
        const surge = glow * (local - 0.8) / 0.2;
        r += (255 - r) * surge; g += (255 - g) * surge; b += (255 - b) * surge;
      }
      const a = Math.round(meanA[k] * 255);
      drawGlyph(dst32, w, x0, y0, cell, bits, packRgba(Math.round(r), Math.round(g), Math.round(b), a));
      // Glyphs stay inside the layer's shape: transparent source pixels stay transparent.
      const x1 = Math.min(w, x0 + cell); const y1 = Math.min(h, y0 + cell);
      for (let y = y0; y < y1; y++) {
        const row = y * w;
        for (let x = x0; x < x1; x++) if ((src32[row + x] >>> 24) === 0) dst32[row + x] = 0;
      }
    }
  }

  octx.putImageData(output, 0, 0);
  return out;
}

function parseHex(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map((c) => c + c).join('');
  const v = parseInt(h.slice(0, 6), 16);
  return Number.isFinite(v) ? [(v >> 16) & 255, (v >> 8) & 255, v & 255] : [255, 255, 255];
}
