// @vitest-environment node
//
// Not a pass/fail gate: prints how long one 1080² morph frame takes, as a
// proxy for the webview budget (≤ 33 ms). Run with MORPH_PERF=1.
import { beforeAll, describe, expect, it } from 'vitest';
import { renderMorph } from './draw-morph';
import { installCanvasDocument, bitmap } from '../test-utils/node-canvas';
import type { MorphPair } from '../types';

const enabled = typeof process !== 'undefined' && process.env.MORPH_PERF === '1';

beforeAll(installCanvasDocument);

describe.skipIf(!enabled)('renderMorph performance', () => {
  it('times a 1080 × 1080 frame with 40 pairs', () => {
    const img = (hue: number) => bitmap(1080, 1080, (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 1080, 1080);
      g.addColorStop(0, `hsl(${hue},70%,50%)`);
      g.addColorStop(1, `hsl(${hue + 120},70%,50%)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 1080, 1080);
    });
    const a = img(0), b = img(200);
    const pairs: MorphPair[] = Array.from({ length: 40 }, (_, i) => ({
      id: `p${i}`, source: 'auto', confidence: 0.7,
      a: { x: 0.1 + (i % 8) * 0.1, y: 0.1 + Math.floor(i / 8) * 0.15 },
      b: { x: 0.12 + (i % 8) * 0.1, y: 0.08 + Math.floor(i / 8) * 0.15 },
    }));
    renderMorph({ a, b, fitMode: 'fill', pairs, t: 0.4, width: 1080, height: 1080 }); // warm the texture cache
    const runs = 5;
    const t0 = performance.now();
    for (let i = 0; i < runs; i++) {
      renderMorph({ a, b, fitMode: 'fill', pairs, t: 0.3 + i * 0.1, width: 1080, height: 1080 });
    }
    const ms = (performance.now() - t0) / runs;
    console.log(`renderMorph 1080² (node-canvas): ${ms.toFixed(1)} ms/frame`);
    expect(ms).toBeGreaterThan(0);
  });
});
