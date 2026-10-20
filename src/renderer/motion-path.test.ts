import { describe, expect, it } from 'vitest';
import type { MotionPathDef } from '../types';
import { easeInBack, easeOutBack } from './easing';
import { evaluateMotionPath, motionPathAt } from './motion-path';

function expectAt(actual: { x: number; y: number }, x: number, y: number) {
  expect(actual.x).toBeCloseTo(x, 6);
  expect(actual.y).toBeCloseTo(y, 6);
}

describe('paths without the new fields', () => {
  // Golden values recorded from motion-path.ts at 95470eb.
  const path: MotionPathDef = {
    points: [{ x: 0, y: 0 }, { x: 100, y: 0, cpX: 150, cpY: 50 }, { x: 100, y: 100 }, { x: 300, y: 100 }],
    alignToPath: true,
  };
  const golden: [number, number, number, number][] = [
    [0, 0, 0, 0],
    [0.25, 112.5, 21.09375, -0.643501],
    [0.5, 118.75, 50, 2.034444],
    [0.9, 240, 100, 0],
    [1, 300, 100, 0],
  ];

  it.each(golden)('match the old position and angle at t = %s', (t, x, y, angle) => {
    const r = evaluateMotionPath(path, t);
    expectAt(r, x, y);
    expect(r.angle).toBeCloseTo(angle, 5);
  });

  it('map layer frames to progress linearly', () => {
    expectAt(motionPathAt(path, 25, 100), 112.5, 21.09375);
  });
});

describe('constant-speed timing', () => {
  // Segments 100 and 300 long.
  const corner: MotionPathDef = {
    points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 300 }],
    timing: 'constant-speed',
  };

  it('reaches the joint a quarter of the way along', () => {
    expectAt(evaluateMotionPath(corner, 0.25), 100, 0);
  });

  it('differs from per-segment timing, which splits time equally', () => {
    expectAt(evaluateMotionPath({ ...corner, timing: 'per-segment' }, 0.25), 50, 0);
  });

  it('puts the middle frame at the midpoint by distance under ease-in-out', () => {
    const eased: MotionPathDef = { ...corner, easing: 'ease-in-out' };
    expectAt(motionPathAt(eased, 50, 100), 100, 100);
    // easeInOut(0.25) = 0.125 → 50 of 400
    expectAt(motionPathAt(eased, 25, 100), 50, 0);
  });

  it('keeps an even pace along a curve', () => {
    const curve: MotionPathDef = {
      points: [{ x: 0, y: 0, cpX: 0, cpY: 200 }, { x: 300, y: 0, cpX: 300, cpY: 200 }],
      timing: 'constant-speed',
    };
    const gaps = (p: MotionPathDef) => {
      const pts = Array.from({ length: 11 }, (_, i) => evaluateMotionPath(p, i / 10));
      return pts.slice(1).map((q, i) => Math.hypot(q.x - pts[i].x, q.y - pts[i].y));
    };
    const spread = (g: number[]) => (Math.max(...g) - Math.min(...g)) / (g.reduce((a, b) => a + b) / g.length);
    expect(spread(gaps(curve))).toBeLessThan(0.02);
    // The same curve on per-segment timing speeds up and slows down.
    expect(spread(gaps({ ...curve, timing: 'per-segment' }))).toBeGreaterThan(0.1);
  });

  it('aligns to the tangent at the same point', () => {
    expect(evaluateMotionPath(corner, 0.5).angle).toBeCloseTo(Math.PI / 2, 6);
  });
});

describe('looping', () => {
  const loop: MotionPathDef = {
    points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 300 }],
    loop: true,
  };

  it('wraps progress after easing', () => {
    expect(evaluateMotionPath(loop, 1.25)).toEqual(evaluateMotionPath(loop, 0.25));
    expect(evaluateMotionPath(loop, -0.25)).toEqual(evaluateMotionPath(loop, 0.75));
  });

  it('wraps an overshooting easing back to the start', () => {
    const r = motionPathAt({ ...loop, timing: 'constant-speed', easing: 'ease-out-back' }, 80, 100);
    expectAt(r, 400 * (easeOutBack(0.8) - 1), 0);
  });
});

describe('overshoot on open paths', () => {
  const line = (timing: MotionPathDef['timing'], easing: MotionPathDef['easing']): MotionPathDef => ({
    points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    timing,
    easing,
  });

  it('carries the layer past the end along the end tangent', () => {
    const r = motionPathAt(line('constant-speed', 'ease-out-back'), 80, 100);
    expect(r.x).toBeGreaterThan(100);
    expectAt(r, 100 * easeOutBack(0.8), 0);
  });

  it('and back past the start on per-segment timing', () => {
    const r = motionPathAt(line('per-segment', 'ease-in-back'), 20, 100);
    expect(r.x).toBeLessThan(0);
    expectAt(r, 100 * easeInBack(0.2), 0);
  });
});

describe('degenerate paths', () => {
  it.each(['per-segment', 'constant-speed'] as const)('a zero-length segment gives no NaN (%s)', (timing) => {
    const path: MotionPathDef = { points: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }], timing };
    for (const t of [-0.5, 0, 0.25, 0.5, 0.75, 1, 1.5]) {
      const r = evaluateMotionPath(path, t);
      expect([r.x, r.y, r.angle].every(Number.isFinite)).toBe(true);
    }
  });

  it('constant speed spends no time on a zero-length segment', () => {
    const path: MotionPathDef = { points: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }], timing: 'constant-speed' };
    expectAt(evaluateMotionPath(path, 0.5), 50, 0);
  });

  it('points on top of each other stay put', () => {
    const r = evaluateMotionPath({ points: [{ x: 5, y: 5 }, { x: 5, y: 5 }], timing: 'constant-speed' }, 0.5);
    expectAt(r, 5, 5);
    expect(r.angle).toBe(0);
  });
});
