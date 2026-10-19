import type { LensLayerData, LensMode, ResolvedTransform } from '../types';
import { resolveNumericProperty } from './interpolation';
import { acquire, release } from './scene-surface';
import { RAMP, drawGlyph, packRgba } from './glyphs';

/**
 * Lens layers change whatever has been drawn under them. They are drawn by
 * drawSceneLayers in z-order, onto a scene surface (a composition-sized
 * canvas with an identity transform), so the lens reads back exactly the
 * layers below it and nothing above.
 *
 * Steps: resolve the transform (keyframes, motion path) like any layer; take
 * the lens shape's bounding box on the surface, plus the feather; copy that
 * region into a pooled snapshot; run the mode on it; draw the result back
 * clipped to the shape under the layer's transform, feathered; draw the ring.
 */

/** The modes the renderer draws. Mirrors LENS_SPECS in fx-schema.ts, which
 *  the renderer must not import; fx-kinds.test.ts keeps the two in sync. */
export const LENS_MODES: LensMode[] = ['magnify', 'pixelate', 'dither', 'ascii'];

/** A 2D affine transform, as in ctx.setTransform(a, b, c, d, e, f). */
export interface Matrix { a: number; b: number; c: number; d: number; e: number; f: number }

/** The layer's local box (0,0)–(w,h) → surface pixels, as drawLayerAtFrame builds it. */
export function lensMatrix(t: ResolvedTransform): Matrix {
  const rad = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const kx = Math.tan(((t.skewX ?? 0) * Math.PI) / 180);
  const ky = Math.tan(((t.skewY ?? 0) * Math.PI) / 180);
  // rotate · skew(kx, ky) · scale(sx, sy)
  const a0 = cos - sin * ky; const b0 = sin + cos * ky;
  const c0 = cos * kx - sin; const d0 = sin * kx + cos;
  const a = a0 * t.scaleX; const b = b0 * t.scaleX;
  const c = c0 * t.scaleY; const d = d0 * t.scaleY;
  const ox = -t.width * t.anchorX;
  const oy = -t.height * t.anchorY;
  return { a, b, c, d, e: t.x + a * ox + c * oy, f: t.y + b * ox + d * oy };
}

const apply = (m: Matrix, x: number, y: number): [number, number] => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];

function shapePath(ctx: CanvasRenderingContext2D, lens: LensLayerData, w: number, h: number, inset = 0): void {
  ctx.beginPath();
  if (lens.shape === 'circle') {
    ctx.arc(w / 2, h / 2, Math.max(0, Math.min(w, h) / 2 - inset), 0, Math.PI * 2);
  } else {
    const rw = Math.max(0, w - inset * 2);
    const rh = Math.max(0, h - inset * 2);
    if (lens.shape === 'rounded-rect' && lens.cornerRadius > 0) {
      ctx.roundRect(inset, inset, rw, rh, Math.min(lens.cornerRadius, rw / 2, rh / 2));
    } else {
      ctx.rect(inset, inset, rw, rh);
    }
  }
}

/**
 * Draw a lens onto `ctx`, which must be a scene surface (identity transform,
 * composition pixels). `resolved` is the layer's transform at this frame.
 */
export function drawLensLayer(
  ctx: CanvasRenderingContext2D,
  lens: LensLayerData,
  resolved: ResolvedTransform,
  frameInLayer: number,
): void {
  const opacity = Math.max(0, Math.min(1, resolved.opacity));
  if (opacity <= 0) return;
  const intensity = Math.max(0, Math.min(1, resolveNumericProperty(lens.keyframes, 'intensity', frameInLayer, lens.intensity)));
  const w = resolved.width;
  const h = resolved.height;
  const m = lensMatrix(resolved);

  if (intensity > 0 && w > 0 && h > 0) {
    const surface = ctx.canvas;
    const feather = Math.max(0, lens.feather);
    const scale = Math.max(Math.hypot(m.a, m.b), Math.hypot(m.c, m.d));
    const corners = [apply(m, 0, 0), apply(m, w, 0), apply(m, 0, h), apply(m, w, h)];
    const grow = feather * scale + 2;
    const bx = Math.max(0, Math.floor(Math.min(...corners.map((p) => p[0])) - grow));
    const by = Math.max(0, Math.floor(Math.min(...corners.map((p) => p[1])) - grow));
    const bx1 = Math.min(surface.width, Math.ceil(Math.max(...corners.map((p) => p[0])) + grow));
    const by1 = Math.min(surface.height, Math.ceil(Math.max(...corners.map((p) => p[1])) + grow));
    const bw = bx1 - bx;
    const bh = by1 - by;
    if (bw > 0 && bh > 0) {
      const snapshot = acquire(bw, bh);
      const result = acquire(bw, bh);
      const mask = acquire(bw, bh);
      try {
        snapshot.getContext('2d')!.drawImage(surface, bx, by, bw, bh, 0, 0, bw, bh);
        const [cx, cy] = apply(m, w / 2, h / 2);
        runMode(lens, intensity, snapshot, result, cx - bx, cy - by, bx, by);
        buildMask(mask, lens, m, w, h, feather, scale, bx, by);
        const rctx = result.getContext('2d')!;
        rctx.globalCompositeOperation = 'destination-in';
        rctx.drawImage(mask, 0, 0);
        rctx.globalCompositeOperation = 'source-over';
        ctx.save();
        ctx.globalAlpha *= opacity;
        ctx.drawImage(result, bx, by);
        ctx.restore();
      } finally {
        release(snapshot);
        release(result);
        release(mask);
      }
    }
  }

  if (lens.ring && lens.ring.width > 0) {
    ctx.save();
    ctx.globalAlpha *= opacity;
    ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
    shapePath(ctx, lens, w, h, lens.ring.width / 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.strokeStyle = lens.ring.color;
    ctx.lineWidth = lens.ring.width * Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * The lens shape as an alpha mask in snapshot coordinates. The feather is
 * centred on the shape's edge. Circles use a radial gradient; rects use the
 * shape's own shadowBlur (never ctx.filter), cast from a copy drawn far
 * off-canvas so only the soft shadow lands.
 */
function buildMask(
  mask: HTMLCanvasElement, lens: LensLayerData, m: Matrix, w: number, h: number,
  feather: number, scale: number, bx: number, by: number,
): void {
  const ctx = mask.getContext('2d')!;
  const toSnap = (dx = 0) => ctx.setTransform(m.a, m.b, m.c, m.d, m.e - bx + dx, m.f - by);
  if (lens.shape === 'circle') {
    toSnap();
    const r = Math.min(w, h) / 2;
    if (feather > 0) {
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.max(0, r - feather / 2), w / 2, h / 2, r + feather / 2);
      g.addColorStop(0, '#fff');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, r + feather / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#fff';
      shapePath(ctx, lens, w, h);
      ctx.fill();
    }
  } else if (feather > 0) {
    const off = mask.width + mask.height + 1000;
    toSnap(-off);
    ctx.shadowColor = '#fff';
    // shadowBlur is a Gaussian with σ = blur / 2, visible to about 3σ: a
    // third of the feather keeps the soft edge within ±feather / 2, like the circle's.
    ctx.shadowBlur = (feather * scale) / 3;
    ctx.shadowOffsetX = off;
    ctx.fillStyle = '#fff';
    shapePath(ctx, lens, w, h);
    ctx.fill();
  } else {
    toSnap();
    ctx.fillStyle = '#fff';
    shapePath(ctx, lens, w, h);
    ctx.fill();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// ── Modes ────────────────────────────────────────────

/** 4×4 Bayer thresholds, 0–15. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function runMode(
  lens: LensLayerData, intensity: number,
  snapshot: HTMLCanvasElement, result: HTMLCanvasElement,
  cx: number, cy: number, ox: number, oy: number,
): void {
  const rctx = result.getContext('2d')!;
  const bw = snapshot.width;
  const bh = snapshot.height;
  switch (lens.mode) {
    case 'magnify': {
      const s = 1 + (Math.max(1, lens.magnify) - 1) * intensity;
      rctx.drawImage(snapshot, 0, 0); // under the scaled copy, so nothing is left empty
      rctx.save();
      rctx.translate(cx, cy);
      rctx.scale(s, s);
      rctx.translate(-cx, -cy);
      rctx.drawImage(snapshot, 0, 0);
      rctx.restore();
      return;
    }
    case 'pixelate': {
      const block = Math.max(1, Math.round(lens.block * intensity));
      if (block <= 1) { rctx.drawImage(snapshot, 0, 0); return; }
      const sw = Math.ceil(bw / block);
      const sh = Math.ceil(bh / block);
      const small = acquire(sw, sh);
      try {
        // applyPixelate's trick: downscale, then blow back up with smoothing off.
        small.getContext('2d')!.drawImage(snapshot, 0, 0, sw, sh);
        rctx.imageSmoothingEnabled = false;
        rctx.drawImage(small, 0, 0, bw, bh);
        rctx.imageSmoothingEnabled = true;
      } finally {
        release(small);
      }
      return;
    }
    case 'dither':
    case 'ascii': {
      const src = snapshot.getContext('2d')!.getImageData(0, 0, bw, bh);
      const out = rctx.createImageData(bw, bh);
      if (lens.mode === 'dither') dither(lens, src.data, out.data, bw, bh, ox, oy);
      else ascii(lens, src.data, out, bw, bh, cx, cy);
      // Mixed with the original by intensity.
      if (intensity < 1) {
        const a = src.data;
        const b = out.data;
        for (let i = 0; i < b.length; i++) b[i] = a[i] + (b[i] - a[i]) * intensity;
      }
      rctx.putImageData(out, 0, 0);
      return;
    }
  }
}

function hexRgb(hex: string | undefined): [number, number, number] | null {
  if (!hex) return null;
  let h = hex.replace('#', '');
  if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map((c) => c + c).join('');
  const v = parseInt(h.slice(0, 6), 16);
  return Number.isFinite(v) ? [(v >> 16) & 255, (v >> 8) & 255, v & 255] : null;
}

const luma = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

/** Ordered 4×4 Bayer dither, keyed on surface coordinates so the pattern doesn't crawl as the lens moves. */
function dither(lens: LensLayerData, s: Uint8ClampedArray, d: Uint8ClampedArray, w: number, h: number, ox: number, oy: number): void {
  const ink = hexRgb(lens.ink);
  const paper = hexRgb(lens.paper);
  const levels = Math.max(2, Math.min(8, Math.round(lens.ditherLevels)));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const t = (BAYER[((y + oy) & 3) * 4 + ((x + ox) & 3)] + 0.5) / 16;
      if (ink) {
        const on = luma(s[i], s[i + 1], s[i + 2]) > t;
        const p = paper ?? [s[i] * 0.25, s[i + 1] * 0.25, s[i + 2] * 0.25];
        const c = on ? ink : p;
        d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
      } else {
        for (let k = 0; k < 3; k++) {
          const q = Math.min(levels - 1, Math.floor((s[i + k] / 255) * (levels - 1) + t));
          d[i + k] = (q * 255) / (levels - 1);
        }
      }
      d[i + 3] = s[i + 3];
    }
  }
}

/** Where the ascii grid's cell boundaries fall: one cell is centred on the lens centre. */
export function asciiGridOrigin(centre: number, cell: number): number {
  const start = centre - cell / 2;
  return start - Math.ceil(start / cell) * cell;
}

/** `cell`-px cells of RAMP glyphs picked by luminance, on paper. */
function ascii(lens: LensLayerData, s: Uint8ClampedArray, out: ImageData, w: number, h: number, cx: number, cy: number): void {
  const cell = Math.max(2, Math.round(lens.cell));
  const ink = hexRgb(lens.ink);
  const paper = hexRgb(lens.paper);
  const d32 = new Uint32Array(out.data.buffer, out.data.byteOffset, w * h);
  const x0 = Math.round(asciiGridOrigin(cx, cell));
  const y0 = Math.round(asciiGridOrigin(cy, cell));
  for (let gy = y0; gy < h; gy += cell) {
    for (let gx = x0; gx < w; gx += cell) {
      const xa = Math.max(0, gx); const xb = Math.min(w, gx + cell);
      const ya = Math.max(0, gy); const yb = Math.min(h, gy + cell);
      let r = 0; let g = 0; let b = 0; let a = 0; let n = 0;
      for (let y = ya; y < yb; y++) {
        for (let x = xa; x < xb; x++) {
          const i = (y * w + x) * 4;
          r += s[i]; g += s[i + 1]; b += s[i + 2]; a += s[i + 3]; n++;
        }
      }
      if (n === 0) continue;
      r /= n; g /= n; b /= n; a /= n;
      const p = paper ?? [r * 0.25, g * 0.25, b * 0.25];
      const c = ink ?? [r, g, b];
      const paperPx = packRgba(Math.round(p[0]), Math.round(p[1]), Math.round(p[2]), Math.round(a));
      for (let y = ya; y < yb; y++) d32.fill(paperPx, y * w + xa, y * w + xb);
      const glyph = RAMP[Math.min(RAMP.length - 1, Math.round(luma(r, g, b) * (RAMP.length - 1)))];
      drawGlyph(d32, w, gx, gy, cell, glyph, packRgba(Math.round(c[0]), Math.round(c[1]), Math.round(c[2]), Math.round(a)));
    }
  }
}
