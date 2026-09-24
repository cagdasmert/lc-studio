import { describe, expect, it } from 'vitest';
import { boxToUv, fitRect, uvToBox } from './fit';

// A 400×300 bitmap into a 200×200 box, rects worked out by hand.
describe('fitRect', () => {
  it('fill stretches to the box', () => {
    expect(fitRect('fill', 400, 300, 200, 200)).toEqual({ x: 0, y: 0, w: 200, h: 200 });
  });

  it('contain scales by the smaller ratio and centres', () => {
    // scale min(0.5, 0.667) = 0.5 → 200×150, centred vertically
    expect(fitRect('contain', 400, 300, 200, 200)).toEqual({ x: 0, y: 25, w: 200, h: 150 });
  });

  it('cover scales by the larger ratio and centres', () => {
    // scale max(0.5, 0.667) = 2/3 → 266.67×200, overhanging 33.33 each side
    const r = fitRect('cover', 400, 300, 200, 200);
    expect(r.x).toBeCloseTo(-33.333, 3);
    expect(r.y).toBe(0);
    expect(r.w).toBeCloseTo(266.667, 3);
    expect(r.h).toBe(200);
  });

  it('none keeps native size and centres', () => {
    expect(fitRect('none', 400, 300, 200, 200)).toEqual({ x: -100, y: -50, w: 400, h: 300 });
  });
});

describe('uvToBox / boxToUv', () => {
  const rect = { x: 0, y: 25, w: 200, h: 150 };

  it('maps UV into the fitted rect', () => {
    expect(uvToBox({ x: 0.25, y: 0.5 }, rect)).toEqual({ x: 50, y: 100 });
  });

  it('inverts uvToBox', () => {
    expect(boxToUv({ x: 50, y: 100 }, rect)).toEqual({ x: 0.25, y: 0.5 });
  });
});
