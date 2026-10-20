// @vitest-environment node
//
// FX pack spec A1.7: one disintegrate frame of a 1000 × 240 text bitmap at
// grain 2 must take under 15 ms in node-canvas. Timing-sensitive, so it runs
// only with FX_PERF=1, like draw-morph.perf.test.ts.
import { beforeAll, describe, expect, it } from 'vitest';
import { applyDisintegrate } from './fx-disintegrate';
import { installCanvasDocument, bitmap } from '../test-utils/node-canvas';

const enabled = typeof process !== 'undefined' && process.env.FX_PERF === '1';

beforeAll(installCanvasDocument);

describe.skipIf(!enabled)('applyDisintegrate performance', () => {
  it('runs a 1000 × 240 text bitmap at grain 2 in under 15 ms', () => {
    const text = bitmap(1000, 240, (ctx) => {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 170px sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText('DUST TITLE', 10, 120);
    }) as unknown as HTMLCanvasElement;
    const fx = {
      type: 'disintegrate', grain: 2, scatter: 180, angle: -30, spread: 0.35, gravity: -40,
      sweep: 0, stagger: 0.6, fade: 1,
    } as const;
    applyDisintegrate(text, fx, 0.3); // warm up
    const runs = 10;
    const t0 = performance.now();
    for (let i = 0; i < runs; i++) applyDisintegrate(text, fx, 0.05 + i * 0.09);
    const ms = (performance.now() - t0) / runs;
    console.log(`applyDisintegrate 1000×240 grain 2 (node-canvas): ${ms.toFixed(1)} ms/frame`);
    expect(ms).toBeLessThan(15);
  });
});
