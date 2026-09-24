import { describe, expect, it } from 'vitest';
import {
  dropInconsistent, dropInvisible, matchFeatures, mutualMatches, spread,
  type Candidate, type FeatureGrid,
} from './match';
import type { MorphView } from '../../renderer/morph-field';

function grid(cols: number, rows: number, vectors: number[][]): FeatureGrid {
  const dim = vectors[0].length;
  const data = new Float32Array(cols * rows * dim);
  vectors.forEach((v, i) => {
    const n = Math.hypot(...v);
    v.forEach((x, k) => { data[i * dim + k] = x / n; });
  });
  return { cols, rows, dim, data };
}

const cand = (ax: number, ay: number, bx: number, by: number, sim = 0.8): Candidate =>
  ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, sim });

describe('mutualMatches', () => {
  it('keeps only pairs that are each other’s nearest neighbour', () => {
    // A0 ↔ B0 is mutual. A1's best is B0 too, but B0 prefers A0: dropped.
    const A = grid(2, 1, [[1, 0, 0], [0.8, 0.6, 0]]);
    const B = grid(2, 1, [[1, 0, 0], [0, 0, 1]]);
    const out = mutualMatches(A, B);
    expect(out).toHaveLength(1);
    expect(out[0].a).toEqual({ x: 0.25, y: 0.5 });
    expect(out[0].b).toEqual({ x: 0.25, y: 0.5 });
    expect(out[0].sim).toBeCloseTo(1, 6);
  });
});

describe('spread', () => {
  it('keeps the best candidate per bucket', () => {
    const out = spread([cand(0.1, 0.1, 0, 0, 0.9), cand(0.2, 0.2, 0, 0, 0.5), cand(0.9, 0.9, 0, 0, 0.7)], 2);
    expect(out.map((c) => c.sim)).toEqual([0.9, 0.7]);
  });
});

describe('dropInconsistent', () => {
  it('drops a pair that moves against all its neighbours', () => {
    const corners = [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]]
      .map(([x, y]) => cand(x, y, x + 0.1, y));
    const outlier = cand(0.5, 0.5, 0.0, 0.5);
    const out = dropInconsistent([...corners, outlier], 4, 0.2);
    expect(out).toHaveLength(4);
    expect(out).not.toContain(outlier);
  });
});

describe('dropInvisible', () => {
  it('drops pairs outside the layer box under cover', () => {
    // A 200×100 cover in a 100² box → rect (−50,0,200,100). u = 0.1 → x = −30: outside.
    const view: MorphView = { fitMode: 'cover', sizeA: { w: 200, h: 100 }, sizeB: { w: 200, h: 100 }, boxW: 100, boxH: 100 };
    const out = dropInvisible([cand(0.1, 0.5, 0.5, 0.5), cand(0.5, 0.5, 0.5, 0.5)], view);
    expect(out).toEqual([cand(0.5, 0.5, 0.5, 0.5)]);
  });
});

describe('matchFeatures', () => {
  const view: MorphView = { fitMode: 'fill', sizeA: { w: 28, h: 14 }, sizeB: { w: 28, h: 14 }, boxW: 100, boxH: 100 };

  it('drops matches below the similarity floor', () => {
    const A = grid(1, 1, [[1, 0]]);
    const B = grid(1, 1, [[0.2, 0.9798]]);
    expect(matchFeatures(A, B, view)).toEqual([]);
  });

  it('returns auto pairs with confidence and fresh ids', () => {
    const A = grid(2, 1, [[1, 0, 0], [0, 1, 0]]);
    const B = grid(2, 1, [[0, 1, 0], [1, 0, 0]]);
    let n = 0;
    const pairs = matchFeatures(A, B, view, () => `p${n++}`);
    expect(pairs.map((p) => [p.id, p.source])).toEqual([['p0', 'auto'], ['p1', 'auto']]);
    expect(pairs[0].confidence).toBeCloseTo(1, 6);
    expect(pairs[0].a).toEqual({ x: 0.25, y: 0.5 });
    expect(pairs[0].b).toEqual({ x: 0.75, y: 0.5 });
  });
});
