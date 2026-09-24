import { describe, expect, it } from 'vitest';
import { inputSize, patchGrid, toChw } from './features';

describe('inputSize', () => {
  it('scales the long side to 448 and snaps both sides to 14', () => {
    expect(inputSize(1000, 750)).toEqual({ w: 448, h: 336 });
    expect(inputSize(300, 1200)).toEqual({ w: 112, h: 448 });
  });
});

describe('toChw', () => {
  it('normalises with ImageNet mean/std into planar RGB', () => {
    const out = toChw(new Uint8ClampedArray([255, 0, 128, 255]), 1, 1);
    expect(out[0]).toBeCloseTo((1 - 0.485) / 0.229, 5);
    expect(out[1]).toBeCloseTo((0 - 0.456) / 0.224, 5);
    expect(out[2]).toBeCloseTo((128 / 255 - 0.406) / 0.225, 5);
  });

  it('lays channels out as planes, not interleaved', () => {
    // Two pixels: red then green. Plane R = [r0, r1], plane G = [g0, g1].
    const out = toChw(new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]), 2, 1);
    expect(out[0]).toBeCloseTo((1 - 0.485) / 0.229, 5);   // R of pixel 0
    expect(out[1]).toBeCloseTo((0 - 0.485) / 0.229, 5);   // R of pixel 1
    expect(out[3]).toBeCloseTo((1 - 0.456) / 0.224, 5);   // G of pixel 1
  });
});

describe('patchGrid', () => {
  it('drops the CLS token and L2-normalises each patch', () => {
    // CLS, then patches (3,4) and (0,2); 28×14 input → 2 cols × 1 row.
    const hidden = new Float32Array([9, 9, 3, 4, 0, 2]);
    const g = patchGrid(hidden, 28, 14, 2);
    expect([g.cols, g.rows, g.dim]).toEqual([2, 1, 2]);
    expect(g.data[0]).toBeCloseTo(0.6, 6);
    expect(g.data[1]).toBeCloseTo(0.8, 6);
    expect(Array.from(g.data.slice(2))).toEqual([0, 1]);
  });
});
