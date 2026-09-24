import type { ImageFitMode, MorphPair } from '../types';
import { fitRect } from './fit';
import { buildMorphMesh, type MorphMesh, type MorphView } from './morph-field';

/** Grid cells per side. Tuned by the performance check (spec: ≤ 33 ms at 1080²). */
export const MORPH_GRID = 24;

/** How far each destination triangle's edges are pushed outward, so the
 *  antialiased edges of neighbours overlap instead of leaving hairline gaps.
 *  1 px is the smallest value that leaves no partly transparent pixels. */
const SEAM_PX = 1;

/** Cap on the miter factor, so sliver triangles grow by at most ~4·SEAM_PX. */
const MAX_MITER = 2 * SEAM_PX;

/** Source-rect margin around each triangle, in texture px. */
const SRC_MARGIN = 2;

/** Clamp-to-edge padding around each texture, in px. */
const PAD = 2;

export interface MorphDrawInput {
  a: ImageBitmap;
  b: ImageBitmap;
  fitMode: ImageFitMode;
  pairs: readonly MorphPair[];
  t: number;
  width: number;
  height: number;
  grid?: number;
}

function blank(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return ctx;
}

interface Texture {
  /** The bitmap under its fit, box-sized. */
  plain: HTMLCanvasElement;
  /** The same, with PAD px of its edge pixels repeated all round. */
  padded: HTMLCanvasElement;
}

// One texture per bitmap, rebuilt when the fit or box size changes.
const textureCache = new WeakMap<object, { key: string; texture: Texture }>();

/**
 * The bitmap under its fit, which is what the warp samples. The padded copy
 * repeats the edge pixels outward (clamp-to-edge): a stretched border triangle
 * samples a little past the edge, and against transparency its pixels would
 * come out part-transparent.
 */
function texture(bitmap: ImageBitmap, fitMode: ImageFitMode, w: number, h: number): Texture {
  const key = `${fitMode}:${w}x${h}`;
  const hit = textureCache.get(bitmap);
  if (hit && hit.key === key) return hit.texture;

  const plain = blank(w, h);
  const r = fitRect(fitMode, bitmap.width, bitmap.height, w, h);
  ctx2d(plain).drawImage(bitmap, r.x, r.y, r.w, r.h);

  const padded = blank(w + PAD * 2, h + PAD * 2);
  const p = ctx2d(padded);
  p.imageSmoothingEnabled = false;
  p.drawImage(plain, PAD, PAD);
  // Edges: stretch the outermost row/column of pixels across the padding.
  p.drawImage(plain, 0, 0, 1, h, 0, PAD, PAD, h);
  p.drawImage(plain, w - 1, 0, 1, h, w + PAD, PAD, PAD, h);
  p.drawImage(plain, 0, 0, w, 1, PAD, 0, w, PAD);
  p.drawImage(plain, 0, h - 1, w, 1, PAD, h + PAD, w, PAD);
  // Corners: the corner pixel itself.
  p.drawImage(plain, 0, 0, 1, 1, 0, 0, PAD, PAD);
  p.drawImage(plain, w - 1, 0, 1, 1, w + PAD, 0, PAD, PAD);
  p.drawImage(plain, 0, h - 1, 1, 1, 0, h + PAD, PAD, PAD);
  p.drawImage(plain, w - 1, h - 1, 1, 1, w + PAD, h + PAD, PAD, PAD);

  const texture = { plain, padded };
  textureCache.set(bitmap, { key, texture });
  return texture;
}

/**
 * The triangle with every edge moved SEAM_PX outward. Each vertex slides along
 * its corner's bisector by the miter length, capped so a sliver triangle
 * can't throw out a long spike.
 */
function grow(
  x0: number, y0: number, x1: number, y1: number, x2: number, y2: number,
): [number, number][] {
  const pts: [number, number][] = [[x0, y0], [x1, y1], [x2, y2]];
  const sign = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0) >= 0 ? 1 : -1;
  // Outward unit normal of the edge from vertex i to vertex i+1.
  const normals = pts.map(([ax, ay], i) => {
    const [bx, by] = pts[(i + 1) % 3];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    return [(sign * (by - ay)) / len, (sign * -(bx - ax)) / len];
  });
  return pts.map(([x, y], i) => {
    const [ax, ay] = normals[(i + 2) % 3]; // edge arriving at this vertex
    const [bx, by] = normals[i];           // edge leaving it
    const k = Math.min(SEAM_PX / Math.max(1 + ax * bx + ay * by, 1e-6), MAX_MITER);
    return [x + (ax + bx) * k, y + (ay + by) * k];
  });
}

/** Draw one textured triangle: source (s) triangle of `tex` onto destination (d). */
function drawTriangle(
  ctx: CanvasRenderingContext2D,
  tex: HTMLCanvasElement,
  s: Float64Array,
  d: Float64Array,
  i0: number, i1: number, i2: number,
): void {
  const sx0 = s[i0], sy0 = s[i0 + 1], sx1 = s[i1], sy1 = s[i1 + 1], sx2 = s[i2], sy2 = s[i2 + 1];
  const dx0 = d[i0], dy0 = d[i0 + 1], dx1 = d[i1], dy1 = d[i1 + 1], dx2 = d[i2], dy2 = d[i2 + 1];

  const ux1 = sx1 - sx0, uy1 = sy1 - sy0, ux2 = sx2 - sx0, uy2 = sy2 - sy0;
  const det = ux1 * uy2 - ux2 * uy1;
  if (Math.abs(det) < 1e-9) return;
  const vx1 = dx1 - dx0, vy1 = dy1 - dy0, vx2 = dx2 - dx0, vy2 = dy2 - dy0;
  // Affine map taking the source triangle onto the destination triangle.
  const a = (vx1 * uy2 - vx2 * uy1) / det;
  const b = (vy1 * uy2 - vy2 * uy1) / det;
  const c = (vx2 * ux1 - vx1 * ux2) / det;
  const dd = (vy2 * ux1 - vy1 * ux2) / det;
  const e = dx0 - a * sx0 - c * sy0;
  const f = dy0 - b * sx0 - dd * sy0;

  const [p0, p1, p2] = grow(dx0, dy0, dx1, dy1, dx2, dy2);

  // Only the triangle's neighbourhood of the texture is drawn: a full-texture
  // draw per triangle costs area × triangles on CPU and GPU canvases alike.
  // Box coordinates; the padded texture holds box (x, y) at (x + PAD, y + PAD).
  const minX = Math.max(-PAD, Math.floor(Math.min(sx0, sx1, sx2)) - SRC_MARGIN);
  const minY = Math.max(-PAD, Math.floor(Math.min(sy0, sy1, sy2)) - SRC_MARGIN);
  const maxX = Math.min(tex.width - PAD, Math.ceil(Math.max(sx0, sx1, sx2)) + SRC_MARGIN);
  const maxY = Math.min(tex.height - PAD, Math.ceil(Math.max(sy0, sy1, sy2)) + SRC_MARGIN);
  if (maxX <= minX || maxY <= minY) return;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(p0[0], p0[1]);
  ctx.lineTo(p1[0], p1[1]);
  ctx.lineTo(p2[0], p2[1]);
  ctx.closePath();
  ctx.clip();
  ctx.transform(a, b, c, dd, e, f);
  ctx.drawImage(
    tex, minX + PAD, minY + PAD, maxX - minX, maxY - minY,
    minX, minY, maxX - minX, maxY - minY,
  );
  ctx.restore();
}

function warp(target: HTMLCanvasElement, tex: HTMLCanvasElement, mesh: MorphMesh, dst: Float64Array): void {
  const ctx = ctx2d(target);
  const stride = mesh.cols + 1;
  for (let r = 0; r < mesh.rows; r++) {
    for (let c = 0; c < mesh.cols; c++) {
      const i00 = (r * stride + c) * 2;
      const i10 = i00 + 2;
      const i01 = i00 + stride * 2;
      const i11 = i01 + 2;
      drawTriangle(ctx, tex, mesh.src, dst, i00, i10, i11);
      drawTriangle(ctx, tex, mesh.src, dst, i00, i11, i01);
    }
  }
}

/**
 * The morphed layer content at progress t, in a box-sized canvas.
 *
 * Each image is warped toward the in-between point positions at full opacity
 * (so the seam overlap is invisible), then the two are blended additively:
 * (1 − τ)·A + τ·B in premultiplied space, with τ = clamp(t). That is exact,
 * transparency included, so a cutout fades without leaving A behind.
 *
 * May return a cached canvas; callers only read from it.
 */
export function renderMorph(m: MorphDrawInput): HTMLCanvasElement {
  const w = Math.max(1, Math.round(m.width));
  const h = Math.max(1, Math.round(m.height));
  const texA = texture(m.a, m.fitMode, w, h);
  if (m.t === 0) return texA.plain;
  const texB = texture(m.b, m.fitMode, w, h);
  if (m.t === 1) return texB.plain;

  const view: MorphView = {
    fitMode: m.fitMode,
    sizeA: { w: m.a.width, h: m.a.height },
    sizeB: { w: m.b.width, h: m.b.height },
    boxW: w,
    boxH: h,
  };
  const mesh = buildMorphMesh(view, m.pairs, m.t, m.grid ?? MORPH_GRID);

  const warpedA = blank(w, h);
  warp(warpedA, texA.padded, mesh, mesh.dstA);
  const warpedB = blank(w, h);
  warp(warpedB, texB.padded, mesh, mesh.dstB);

  const tau = Math.max(0, Math.min(1, m.t));
  const out = blank(w, h);
  const o = ctx2d(out);
  o.globalAlpha = 1 - tau;
  o.drawImage(warpedA, 0, 0);
  o.globalAlpha = tau;
  o.globalCompositeOperation = 'lighter';
  o.drawImage(warpedB, 0, 0);
  return out;
}
