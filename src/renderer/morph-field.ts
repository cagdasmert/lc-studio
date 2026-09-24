import type { ImageFitMode, MorphPair } from '../types';
import { fitRect, uvToBox, type Size, type Vec2 } from './fit';

/** Everything that fixes where a pair's UV points sit in the layer box. */
export interface MorphView {
  fitMode: ImageFitMode;
  sizeA: Size;   // source bitmap sizes
  sizeB: Size;
  boxW: number;  // layer box
  boxH: number;
}

/**
 * Rigid moving-least-squares deformation (Schaefer, McPhail & Warren 2006,
 * α = 1): the as-rigid-as-possible map that sends each control p_i to q_i,
 * evaluated at v. Exact at the controls, reproduces rigid motions exactly,
 * and bends smoothly in between — which keeps noisy auto-matched points from
 * tearing the image the way per-triangle warps do.
 */
export function mlsRigid(v: Vec2, p: readonly Vec2[], q: readonly Vec2[]): Vec2 {
  const n = p.length;
  if (n === 0) return { x: v.x, y: v.y };

  let sw = 0, psx = 0, psy = 0, qsx = 0, qsy = 0;
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const dx = p[i].x - v.x;
    const dy = p[i].y - v.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < 1e-12) return { x: q[i].x, y: q[i].y };
    const wi = 1 / d2;
    w[i] = wi;
    sw += wi;
    psx += wi * p[i].x; psy += wi * p[i].y;
    qsx += wi * q[i].x; qsy += wi * q[i].y;
  }
  psx /= sw; psy /= sw; qsx /= sw; qsy /= sw;

  const dx = v.x - psx;
  const dy = v.y - psy;
  let fx = 0, fy = 0;
  for (let i = 0; i < n; i++) {
    const phx = p[i].x - psx, phy = p[i].y - psy;
    const qhx = q[i].x - qsx, qhy = q[i].y - qsy;
    const a = phx * dx + phy * dy;   // p̂ · d
    const b = phx * dy - phy * dx;   // p̂ × d
    fx += w[i] * (qhx * a - qhy * b);
    fy += w[i] * (qhx * b + qhy * a);
  }
  const fl = Math.hypot(fx, fy);
  if (fl < 1e-12) return { x: dx + qsx, y: dy + qsy };
  const dl = Math.hypot(dx, dy);
  return { x: (dl * fx) / fl + qsx, y: (dl * fy) / fl + qsy };
}

/** Box corners and edge midpoints, as fractions of the box. Pinned (a = b). */
const ANCHORS: readonly [number, number][] = [
  [0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5],
];

/** Every pair's points in box px (each through its own image's fit), plus the anchors. */
export function morphControls(view: MorphView, pairs: readonly MorphPair[]): { pA: Vec2[]; pB: Vec2[] } {
  const rA = fitRect(view.fitMode, view.sizeA.w, view.sizeA.h, view.boxW, view.boxH);
  const rB = fitRect(view.fitMode, view.sizeB.w, view.sizeB.h, view.boxW, view.boxH);
  const pA = pairs.map((pr) => uvToBox(pr.a, rA));
  const pB = pairs.map((pr) => uvToBox(pr.b, rB));
  for (const [u, v] of ANCHORS) {
    const anchor = { x: u * view.boxW, y: v * view.boxH };
    pA.push(anchor);
    pB.push(anchor);
  }
  return { pA, pB };
}

export interface MorphMesh {
  cols: number;
  rows: number;
  /** Regular grid over the box — the texture coordinates of both images. */
  src: Float64Array;
  /** Where each grid vertex of image A lands at progress t. */
  dstA: Float64Array;
  /** Where each grid vertex of image B lands at progress t. */
  dstB: Float64Array;
}

/**
 * Sample the warp on a grid. `t` is deliberately unclamped: back/elastic
 * easings overshoot the geometry, as reveal FX do. Blend weights are clamped
 * by the caller.
 */
export function buildMorphMesh(
  view: MorphView,
  pairs: readonly MorphPair[],
  t: number,
  grid: number,
): MorphMesh {
  const { pA, pB } = morphControls(view, pairs);
  const pT = pA.map((a, i) => ({ x: a.x + (pB[i].x - a.x) * t, y: a.y + (pB[i].y - a.y) * t }));

  const n = (grid + 1) * (grid + 1) * 2;
  const src = new Float64Array(n);
  const dstA = new Float64Array(n);
  const dstB = new Float64Array(n);
  let k = 0;
  for (let r = 0; r <= grid; r++) {
    for (let c = 0; c <= grid; c++) {
      const g = { x: (c / grid) * view.boxW, y: (r / grid) * view.boxH };
      src[k] = g.x; src[k + 1] = g.y;
      const fa = mlsRigid(g, pA, pT);
      dstA[k] = fa.x; dstA[k + 1] = fa.y;
      const fb = mlsRigid(g, pB, pT);
      dstB[k] = fb.x; dstB[k + 1] = fb.y;
      k += 2;
    }
  }
  return { cols: grid, rows: grid, src, dstA, dstB };
}
