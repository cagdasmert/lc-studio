import { describe, expect, it } from 'vitest';
import { buildMorphMesh, mlsRigid, type MorphView } from './morph-field';
import type { MorphPair } from '../types';

const tri = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }];

describe('mlsRigid', () => {
  it('is the identity when every control stays put', () => {
    const v = mlsRigid({ x: 3, y: 4 }, tri, tri);
    expect(v.x).toBeCloseTo(3, 9);
    expect(v.y).toBeCloseTo(4, 9);
  });

  it('reproduces a pure translation exactly', () => {
    const q = tri.map((p) => ({ x: p.x + 5, y: p.y - 2 }));
    const v = mlsRigid({ x: 3, y: 4 }, tri, q);
    expect(v.x).toBeCloseTo(8, 9);
    expect(v.y).toBeCloseTo(2, 9);
  });

  it('reproduces a 90° rotation exactly', () => {
    const p = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];
    const q = p.map(({ x, y }) => ({ x: -y, y: x }));
    const v = mlsRigid({ x: 0.5, y: 0.2 }, p, q);
    expect(v.x).toBeCloseTo(-0.2, 9);
    expect(v.y).toBeCloseTo(0.5, 9);
  });

  it('lands a control point exactly on its target', () => {
    const q = [{ x: 1, y: 1 }, { x: 12, y: 0 }, { x: 0, y: 15 }];
    expect(mlsRigid({ x: 10, y: 0 }, tri, q)).toEqual({ x: 12, y: 0 });
  });

  it('maps the weighted centroid to the target centroid', () => {
    // v = p* makes the rotation term vanish; the result is q*.
    const p = [{ x: -1, y: 0 }, { x: 1, y: 0 }];
    const q = [{ x: -1, y: 5 }, { x: 1, y: 5 }];
    const v = mlsRigid({ x: 0, y: 0 }, p, q);
    expect(v.x).toBeCloseTo(0, 9);
    expect(v.y).toBeCloseTo(5, 9);
  });

  it('returns the point unchanged with no controls', () => {
    expect(mlsRigid({ x: 7, y: 8 }, [], [])).toEqual({ x: 7, y: 8 });
  });
});

const square: MorphView = {
  fitMode: 'fill', sizeA: { w: 100, h: 100 }, sizeB: { w: 100, h: 100 }, boxW: 100, boxH: 100,
};

function pair(a: [number, number], b: [number, number]): MorphPair {
  return { id: 'p', a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] }, source: 'manual' };
}

describe('buildMorphMesh', () => {
  it('leaves A undeformed at t = 0', () => {
    const mesh = buildMorphMesh(square, [pair([0.5, 0.5], [0.6, 0.5])], 0, 4);
    for (let i = 0; i < mesh.src.length; i++) expect(mesh.dstA[i]).toBeCloseTo(mesh.src[i], 6);
  });

  it('leaves B undeformed at t = 1', () => {
    const mesh = buildMorphMesh(square, [pair([0.5, 0.5], [0.6, 0.5])], 1, 4);
    for (let i = 0; i < mesh.src.length; i++) expect(mesh.dstB[i]).toBeCloseTo(mesh.src[i], 6);
  });

  it('moves a control vertex of A halfway at t = 0.5', () => {
    // grid 2 on a 100 box: the centre vertex (50,50) is index 4 and is A's control.
    const mesh = buildMorphMesh(square, [pair([0.5, 0.5], [0.6, 0.5])], 0.5, 2);
    expect(mesh.dstA[8]).toBeCloseTo(55, 9);
    expect(mesh.dstA[9]).toBeCloseTo(50, 9);
  });

  it('maps points through each image’s own fit', () => {
    // box 200×200. A 400×200 contain → rect (0,50,200,100); B 200×400 → (50,0,100,200).
    // a (0.75,0.5) → A box (150,100); b (0.5,0.25) → B box (100,50).
    // grid 4: (150,100) is column 3, row 2 → index (2·5+3)·2 = 26.
    const view: MorphView = {
      fitMode: 'contain', sizeA: { w: 400, h: 200 }, sizeB: { w: 200, h: 400 }, boxW: 200, boxH: 200,
    };
    const mesh = buildMorphMesh(view, [pair([0.75, 0.5], [0.5, 0.25])], 1, 4);
    expect(mesh.dstA[26]).toBeCloseTo(100, 9);
    expect(mesh.dstA[27]).toBeCloseTo(50, 9);
  });

  it('pins the box corners', () => {
    const mesh = buildMorphMesh(square, [pair([0.3, 0.3], [0.7, 0.7])], 0.5, 4);
    const last = mesh.src.length - 2;
    expect([mesh.dstA[0], mesh.dstA[1]]).toEqual([0, 0]);
    expect([mesh.dstB[last], mesh.dstB[last + 1]]).toEqual([100, 100]);
  });
});
