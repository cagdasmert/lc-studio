import type { MorphPair } from '../../types';
import { fitRect, uvToBox, type Vec2 } from '../../renderer/fit';
import type { MorphView } from '../../renderer/morph-field';
import { newPairId } from '../morph-edit';

/** One image's patch features: rows × cols patches, each an L2-normalised dim-vector. */
export interface FeatureGrid {
  cols: number;
  rows: number;
  dim: number;
  data: Float32Array;
}

export interface Candidate { a: Vec2; b: Vec2; sim: number }

export const MATCH = {
  minSim: 0.3,
  buckets: 8,
  neighbours: 4,
  maxDeviation: 0.2,
  maxPairs: 48,
} as const;

function centre(g: FeatureGrid, i: number): Vec2 {
  return { x: ((i % g.cols) + 0.5) / g.cols, y: (Math.floor(i / g.cols) + 0.5) / g.rows };
}

/** Pairs of patches that are each other's most similar patch (cosine). */
export function mutualMatches(A: FeatureGrid, B: FeatureGrid): Candidate[] {
  const na = A.cols * A.rows;
  const nb = B.cols * B.rows;
  const dim = A.dim;
  const bestB = new Int32Array(na).fill(-1);
  const bestBSim = new Float32Array(na).fill(-Infinity);
  const bestA = new Int32Array(nb).fill(-1);
  const bestASim = new Float32Array(nb).fill(-Infinity);
  for (let i = 0; i < na; i++) {
    const ia = i * dim;
    for (let j = 0; j < nb; j++) {
      const jb = j * dim;
      let s = 0;
      for (let k = 0; k < dim; k++) s += A.data[ia + k] * B.data[jb + k];
      if (s > bestBSim[i]) { bestBSim[i] = s; bestB[i] = j; }
      if (s > bestASim[j]) { bestASim[j] = s; bestA[j] = i; }
    }
  }
  const out: Candidate[] = [];
  for (let i = 0; i < na; i++) {
    const j = bestB[i];
    if (j >= 0 && bestA[j] === i) out.push({ a: centre(A, i), b: centre(B, j), sim: bestBSim[i] });
  }
  return out;
}

/** Best candidate per cell of a buckets × buckets split of A, best first. */
export function spread(c: readonly Candidate[], buckets: number): Candidate[] {
  const best = new Map<number, Candidate>();
  for (const x of c) {
    const bx = Math.min(buckets - 1, Math.floor(x.a.x * buckets));
    const by = Math.min(buckets - 1, Math.floor(x.a.y * buckets));
    const key = by * buckets + bx;
    const cur = best.get(key);
    if (!cur || x.sim > cur.sim) best.set(key, x);
  }
  return [...best.values()].sort((p, q) => q.sim - p.sim);
}

function median(values: number[]): number {
  const s = [...values].sort((p, q) => p - q);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Drop pairs whose displacement disagrees with their neighbours'. Local, not
 * one global transform, so different subjects (which warp non-rigidly) pass.
 */
export function dropInconsistent(c: readonly Candidate[], k: number, maxDev: number): Candidate[] {
  if (c.length < 3) return [...c];
  return c.filter((x) => {
    const others = c
      .filter((y) => y !== x)
      .map((y) => ({ y, d: Math.hypot(y.a.x - x.a.x, y.a.y - x.a.y) }))
      .sort((p, q) => p.d - q.d)
      .slice(0, k)
      .map(({ y }) => y);
    const mdx = median(others.map((y) => y.b.x - y.a.x));
    const mdy = median(others.map((y) => y.b.y - y.a.y));
    return Math.hypot(x.b.x - x.a.x - mdx, x.b.y - x.a.y - mdy) <= maxDev;
  });
}

/** Drop pairs where either point falls outside the layer box under its fit. */
export function dropInvisible(c: readonly Candidate[], view: MorphView): Candidate[] {
  const rA = fitRect(view.fitMode, view.sizeA.w, view.sizeA.h, view.boxW, view.boxH);
  const rB = fitRect(view.fitMode, view.sizeB.w, view.sizeB.h, view.boxW, view.boxH);
  const inside = (p: Vec2) => p.x >= 0 && p.x <= view.boxW && p.y >= 0 && p.y <= view.boxH;
  return c.filter((x) => inside(uvToBox(x.a, rA)) && inside(uvToBox(x.b, rB)));
}

/** From two images' patch features to spread-out, consistent auto pairs. */
export function matchFeatures(
  A: FeatureGrid,
  B: FeatureGrid,
  view: MorphView,
  makeId: () => string = newPairId,
): MorphPair[] {
  let c = mutualMatches(A, B).filter((x) => x.sim >= MATCH.minSim);
  c = spread(c, MATCH.buckets);
  c = dropInconsistent(c, MATCH.neighbours, MATCH.maxDeviation);
  c = dropInvisible(c, view);
  return c
    .sort((p, q) => q.sim - p.sim)
    .slice(0, MATCH.maxPairs)
    .map((x) => ({
      id: makeId(),
      a: x.a,
      b: x.b,
      source: 'auto' as const,
      confidence: Math.max(0, Math.min(1, x.sim)),
    }));
}
