// @vitest-environment node
//
// Disintegrate reveal, FX pack spec A1.1–A1.6. A1.7 (timing) is in
// fx-disintegrate.perf.test.ts.

import { beforeAll, describe, expect, it } from 'vitest';
import { createCanvas } from 'canvas';
import { installCanvasDocument } from '../test-utils/node-canvas';
import { applyDisintegrate } from './fx-disintegrate';
import { fxPadding } from './layer-fx';
import type { DisintegrateFx } from '../types';

beforeAll(installCanvasDocument);

/** Spec defaults from LAYER_FX_SPECS.disintegrate. */
const fx = (over: Partial<DisintegrateFx> = {}): DisintegrateFx => ({
  type: 'disintegrate', grain: 2, scatter: 180, angle: -30, spread: 0.35, gravity: -40,
  sweep: 0, stagger: 0.6, fade: 1, ...over,
});

/** A W×H layer with a gradient band and a transparent margin, like a padded text bitmap. */
function source(W = 400, H = 120): HTMLCanvasElement {
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, '#ff3366');
  g.addColorStop(1, '#33ccff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.clearRect(0, 0, W, 6); // a transparent strip, as around real content
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(40, 30, 50, 30); // semi-transparent pixels too
  return c as unknown as HTMLCanvasElement;
}

const pixels = (c: HTMLCanvasElement) => c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
const same = (a: Uint8ClampedArray, b: Uint8ClampedArray) => a.length === b.length && a.every((v, i) => v === b[i]);

describe('applyDisintegrate', () => {
  it('A1.1 returns the source unchanged at env ≥ 1', () => {
    const src = source();
    expect(applyDisintegrate(src, fx(), 1)).toBe(src);
    expect(applyDisintegrate(src, fx(), 1.2)).toBe(src);
  });

  it('A1.2 is fully transparent at env 0 with the default fade', () => {
    const out = pixels(applyDisintegrate(source(), fx(), 0));
    for (let i = 3; i < out.length; i += 4) if (out[i] !== 0) throw new Error(`alpha at ${(i - 3) / 4}`);
  });

  it('never draws with negative alpha when an easing overshoots below 0', () => {
    const out = pixels(applyDisintegrate(source(), fx(), -0.35));
    expect(out.every((v, i) => i % 4 !== 3 || v === 0)).toBe(true);
  });

  it('A1.3 equals the source at every env with no scatter, gravity or fade', () => {
    const src = source();
    const want = pixels(src);
    for (const env of [0, 0.2, 0.5, 0.9]) {
      expect(same(pixels(applyDisintegrate(src, fx({ scatter: 0, gravity: 0, fade: 0 }), env)), want)).toBe(true);
    }
  });

  it('A1.4 gives identical pixels for identical inputs', () => {
    const src = source();
    for (const env of [0.1, 0.5, 0.8]) {
      expect(same(pixels(applyDisintegrate(src, fx(), env)), pixels(applyDisintegrate(src, fx(), env)))).toBe(true);
    }
  });

  it('A1.5 releases in a sweep: left 10% in place, right 10% gone at env 0.5', () => {
    const W = 1000;
    const H = 120;
    const c = createCanvas(W, H);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#3399ff';
    ctx.fillRect(0, 0, W, H);
    const src = c as unknown as HTMLCanvasElement;
    const want = pixels(src);
    const out = pixels(applyDisintegrate(src, fx({ angle: 0, spread: 0, gravity: 0, sweep: 0, stagger: 0.95 }), 0.5));
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (x < W * 0.1) {
          if (![0, 1, 2, 3].every((k) => out[i + k] === want[i + k])) throw new Error(`left pixel ${x},${y} moved`);
        } else if (x >= W * 0.9) {
          if (out[i + 3] !== 0) throw new Error(`right pixel ${x},${y} is visible`);
        }
      }
    }
  });

  it('moves grains while the reveal plays', () => {
    const src = source();
    expect(same(pixels(applyDisintegrate(src, fx(), 0.5)), pixels(src))).toBe(false);
  });

  it('A1.6 pads by scatter plus |gravity|, the same at every envelope', () => {
    const windowed = (inFrames: number): DisintegrateFx =>
      fx({ window: { inDelay: 0, inFrames, outFrames: 0, easing: 'linear' } });
    expect(fxPadding([fx()])).toBe(220);
    expect(fxPadding([windowed(10)])).toBe(220);
    expect(fxPadding([windowed(0)])).toBe(220);
    expect(fxPadding([fx({ scatter: 100.4, gravity: -0.3 })])).toBe(101);
  });
});
