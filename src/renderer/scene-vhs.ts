import type { SceneFxDef, VhsFx } from '../types';
import { hash, hash4, signedHash, smoothNoise } from './noise';

/**
 * Worn VHS playback, applied to a scene surface in place (renderSceneSurface
 * calls it), so it shakes with the picture and each scene in a transition
 * keeps its own look. Every term is a closed-form function of the frame.
 *
 * Each row gets a horizontal offset: the slow tape wave, per-2-px-strip
 * jitter, the head-switching band at the bottom, and the travelling crease.
 * Red and blue are sampled `bleed` px to either side (red shifts left, blue
 * right). Then saturation, then the switching speckle and the crease's bright
 * noise. Rows with nothing to do are left untouched.
 *
 * `barrel` (tube curvature) needs WebGL2 and is drawn by scene-vhs-gl.ts.
 */

export function getVhs(fx: SceneFxDef[] | undefined): VhsFx | undefined {
  return fx?.find((f): f is VhsFx => f.type === 'vhs');
}

/** True when the VHS settings change no pixel, so the scene needs no surface for it. */
export function vhsIsIdentity(fx: VhsFx): boolean {
  return fx.barrel <= 0 && fx.wave <= 0 && fx.jitter <= 0 && fx.bleed <= 0 && fx.crease <= 0
    && (fx.switching <= 0 || fx.switchingHeight <= 0) && fx.saturation === 1;
}

/** The crease band at a frame: its top row and height (6–14 px), travelling down and wrapping. */
export function creaseBand(frame: number, height: number): { top: number; size: number } {
  const size = 6 + Math.floor(hash(Math.floor(frame / 30), 26) * 9);
  const travel = height + size;
  const speed = height / 90; // crosses the frame in 3 s at 30 fps
  return { top: ((frame * speed) % travel) - size, size };
}

export function applyVhs(canvas: HTMLCanvasElement, fx: VhsFx, frame: number): void {
  if (vhsIsIdentity(fx)) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const img = ctx.getImageData(0, 0, w, h);
  const src = new Uint8ClampedArray(img.data); // read from a copy, write into img
  const out = img.data;
  const src32 = new Uint32Array(src.buffer);
  const out32 = new Uint32Array(out.buffer, out.byteOffset, w * h);

  const bleed = Math.round(Math.max(0, fx.bleed));
  const switching = Math.max(0, Math.min(1, fx.switching));
  const switchTop = switching > 0 ? Math.round(h * (1 - Math.max(0, Math.min(0.2, fx.switchingHeight)))) : h;
  const crease = Math.max(0, Math.min(1, fx.crease));
  const band = creaseBand(frame, h);
  const creaseTop = crease > 0 ? Math.max(0, Math.ceil(band.top)) : h;
  const creaseEnd = crease > 0 ? Math.min(h, Math.ceil(band.top + band.size)) : h;

  // Separate passes, each in its own small function (below): in WKWebView
  // that took a 1080×1920 frame from about 90 ms to 13.

  // 1. Row offsets (wave, jitter, switching drag, crease) and chroma bleed.
  for (let y = 0; y < h; y++) {
    const strip = y >> 1;
    let dx = 0;
    if (fx.wave > 0) dx += fx.wave * smoothNoise(y / 180 + frame / 45, 21);
    if (fx.jitter > 0) dx += fx.jitter * signedHash(frame, strip, 22);
    if (y >= switchTop) {
      // Deeper into the band, the picture is dragged further sideways.
      const k = (y - switchTop) / Math.max(1, h - switchTop);
      dx += switching * (6 + 40 * k) * (0.6 + 0.4 * signedHash(frame, strip, 23));
    }
    if (y >= creaseTop && y < creaseEnd) dx += crease * 24 * signedHash(frame, strip, 27);
    const shift = Math.round(dx);
    const row = y * w;
    if (bleed === 0) {
      if (shift !== 0) shiftRow(src32, out32, row, w, shift);
    } else {
      bleedRow(src, out, row, w, shift, bleed);
    }
  }

  // 2. Saturation.
  if (fx.saturation !== 1) saturate(new Int32Array(out.buffer, out.byteOffset, w * h), Math.round(Math.max(0, fx.saturation) * 256));

  // 3. Head-switching speckle, in the bottom band only.
  if (switching > 0) speckle(out, w, switchTop, h, frame, switching);

  // 4. The crease's bright noise.
  if (crease > 0) creaseNoise(out, w, creaseTop, creaseEnd, frame, crease);
  ctx.putImageData(img, 0, 0);
}

/*
 * Each pass is its own small function. Inlined into applyVhs, the saturation
 * loop alone took about 40 ms a frame in JavaScriptCore once the row pass had
 * run before it; on its own it takes about 4.
 */

/** Saturation in 8.8 fixed point (q = saturation × 256), a whole pixel at a
 *  time. Through an Int32 view: a Uint32 read of an opaque pixel is ≥ 2³¹,
 *  which JavaScriptCore holds as a double. */
function saturate(px32: Int32Array, q: number): void {
  for (let i = 0; i < px32.length; i++) {
    const px = px32[i];
    const r = px & 255; const g = (px >> 8) & 255; const b = (px >> 16) & 255;
    const l = (54 * r + 183 * g + 19 * b) >> 8;
    let r2 = l + (((r - l) * q) >> 8); r2 = r2 < 0 ? 0 : r2 > 255 ? 255 : r2;
    let g2 = l + (((g - l) * q) >> 8); g2 = g2 < 0 ? 0 : g2 > 255 ? 255 : g2;
    let b2 = l + (((b - l) * q) >> 8); b2 = b2 < 0 ? 0 : b2 > 255 ? 255 : b2;
    px32[i] = (px & 0xff000000) | (b2 << 16) | (g2 << 8) | r2;
  }
}

/** Sparse noise speckles in rows [y0, y1) at `amount` opacity. */
function speckle(out: Uint8ClampedArray, w: number, y0: number, y1: number, frame: number, amount: number): void {
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < w; x++) {
      if (hash4(x >> 1, y, frame, 25) >= 0.18) continue;
      const o = (y * w + x) * 4;
      const n = 255 * hash4(x, y, frame, 24);
      out[o] += (n - out[o]) * amount;
      out[o + 1] += (n - out[o + 1]) * amount;
      out[o + 2] += (n - out[o + 2]) * amount;
    }
  }
}

/** The crease band's bright noise in rows [y0, y1). */
function creaseNoise(out: Uint8ClampedArray, w: number, y0: number, y1: number, frame: number, crease: number): void {
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const m = crease * 0.8 * hash4(x, y, frame, 28);
      const n = 180 + 75 * hash4(x, y, frame, 29);
      out[o] += (n - out[o]) * m;
      out[o + 1] += (n - out[o + 1]) * m;
      out[o + 2] += (n - out[o + 2]) * m;
    }
  }
}

/** One row shifted by `shift`, with red sampled `bleed` px to the right (so it sits left) and blue to the left. Edges hold. */
function bleedRow(src: Uint8ClampedArray, out: Uint8ClampedArray, row: number, w: number, shift: number, bleed: number): void {
  const last = w - 1;
  for (let x = 0; x < w; x++) {
    let g = x + shift;
    g = g < 0 ? 0 : g > last ? last : g;
    const r = g + bleed > last ? last : g + bleed;
    const b = g - bleed < 0 ? 0 : g - bleed;
    const o = (row + x) * 4;
    out[o] = src[(row + r) * 4];
    out[o + 1] = src[(row + g) * 4 + 1];
    out[o + 2] = src[(row + b) * 4 + 2];
    out[o + 3] = src[(row + g) * 4 + 3];
  }
}

/** out[row + x] = src[row + x + shift], holding the row's edge pixel where that runs off. */
function shiftRow(src: Uint32Array, out: Uint32Array, row: number, w: number, shift: number): void {
  if (shift > 0) {
    const n = Math.max(0, w - shift);
    out.set(src.subarray(row + Math.min(shift, w), row + w), row);
    out.fill(src[row + w - 1], row + n, row + w);
  } else {
    const s = Math.min(-shift, w);
    out.set(src.subarray(row, row + w - s), row + s);
    out.fill(src[row], row, row + s);
  }
}
