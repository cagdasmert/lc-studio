// @vitest-environment node
//
// Decrypt reveal, FX pack spec A2.2–A2.5.

import { beforeAll, describe, expect, it } from 'vitest';
import { createCanvas } from 'canvas';
import { installCanvasDocument } from '../test-utils/node-canvas';
import { applyDecrypt } from './fx-decrypt';
import { fxPadding } from './layer-fx';
import type { DecryptFx } from '../types';

beforeAll(installCanvasDocument);

/** Spec defaults from LAYER_FX_SPECS.decrypt. */
const fx = (over: Partial<DecryptFx> = {}): DecryptFx => ({
  type: 'decrypt', cell: 14, charset: 'cipher', color: '#7CFFB2', tint: 0.6, scrambleFrames: 2,
  order: 'random', angle: 0, stagger: 0.7, edgeGlow: 0.6, ...over,
});

function gradient(W: number, H: number) {
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#ff3366');
  g.addColorStop(1, '#3366ff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  return { c, ctx };
}

/** A layer with a transparent margin and a transparent hole, like a glyph. */
function holed(): HTMLCanvasElement {
  const { c, ctx } = gradient(300, 160);
  ctx.clearRect(0, 0, 300, 9);
  ctx.clearRect(100, 50, 45, 37);
  ctx.clearRect(0, 140, 300, 20);
  return c as unknown as HTMLCanvasElement;
}

const data = (c: HTMLCanvasElement) => c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
const same = (a: Uint8ClampedArray, b: Uint8ClampedArray) => a.length === b.length && a.every((v, i) => v === b[i]);

describe('applyDecrypt', () => {
  it('A2.2 returns the source at env ≥ 1 and nothing at env ≤ 0', () => {
    const src = holed();
    expect(applyDecrypt(src, fx(), 1, 0)).toBe(src);
    for (const env of [0, -0.3]) {
      const out = data(applyDecrypt(src, fx(), env, 5));
      expect(out.every((v, i) => i % 4 !== 3 || v === 0)).toBe(true);
    }
  });

  it('A2.3 sweep: left 10% resolved, right 10% empty, glyphs in between', () => {
    const W = 600;
    const H = 120;
    const src = gradient(W, H).c as unknown as HTMLCanvasElement;
    const want = data(src);
    const out = data(applyDecrypt(src, fx({ order: 'sweep', angle: 0, stagger: 0.95 }), 0.5, 4));
    let glyphPixels = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const equal = [0, 1, 2, 3].every((k) => out[i + k] === want[i + k]);
        if (x < 56 && !equal) throw new Error(`left pixel ${x},${y} not resolved`);   // cells 0–3: left 10%
        if (x >= 546 && out[i + 3] !== 0) throw new Error(`right pixel ${x},${y} not empty`); // cells 39+
        if (x >= 56 && x < 546 && !equal && out[i + 3] > 0) glyphPixels++;
      }
    }
    expect(glyphPixels).toBeGreaterThan(0);
  });

  it('A2.4 keeps transparent source pixels transparent at every env', () => {
    const src = holed();
    const s = data(src);
    for (const order of ['random', 'sweep', 'center-out'] as const) {
      for (const env of [0.1, 0.3, 0.5, 0.7, 0.95]) {
        for (const charset of ['cipher', 'ramp', 'binary'] as const) {
          const out = data(applyDecrypt(src, fx({ order, charset }), env, 3));
          for (let i = 3; i < s.length; i += 4) {
            if (s[i] === 0 && out[i] !== 0) throw new Error(`${order}/${charset} env ${env}: pixel ${(i - 3) / 4} lit`);
          }
        }
      }
    }
  });

  it('A2.5 holds each glyph for scrambleFrames frames, and repeats exactly', () => {
    const src = holed();
    const f = fx({ scrambleFrames: 3 });
    const at = (frame: number) => data(applyDecrypt(src, f, 0.5, frame));
    expect(same(at(0), at(1))).toBe(true);
    expect(same(at(0), at(2))).toBe(true);
    expect(same(at(0), at(3))).toBe(false);
    expect(same(at(7), at(7))).toBe(true);
  });

  it('ramp glyphs do not scramble', () => {
    const src = holed();
    const f = fx({ charset: 'ramp', scrambleFrames: 1 });
    expect(same(data(applyDecrypt(src, f, 0.5, 0)), data(applyDecrypt(src, f, 0.5, 9)))).toBe(true);
  });

  it('A2.4 / R2.4 needs no padding', () => {
    expect(fxPadding([fx()])).toBe(0);
  });
});
