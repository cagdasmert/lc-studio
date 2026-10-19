// @vitest-environment node
//
// The wipe reveal's glowing front and sparks, FX pack spec A2.6–A2.7.

import { beforeAll, describe, expect, it } from 'vitest';
import { createCanvas } from 'canvas';
import { installCanvasDocument } from '../test-utils/node-canvas';
import { applyReveals } from './layer-fx';
import type { WipeFx } from '../types';

beforeAll(installCanvasDocument);

const W = 400;
const H = 100;
const DURATION = 60;
/** env = 0.5 at frame 10 of this window. */
const WINDOW = { inDelay: 0, inFrames: 20, outFrames: 0, easing: 'linear' as const };

const wipe = (over: Partial<WipeFx> = {}): WipeFx => ({
  type: 'wipe', shape: 'linear', angle: 0, softness: 0, window: WINDOW, ...over,
});

/** A grey layer box, padded by `pad` transparent px on every side. */
function layer(pad = 0): HTMLCanvasElement {
  const c = createCanvas(W + pad * 2, H + pad * 2);
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgb(80,80,80)';
  ctx.fillRect(pad, pad, W, H);
  return c as unknown as HTMLCanvasElement;
}

const data = (c: HTMLCanvasElement) => c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
const same = (a: Uint8ClampedArray, b: Uint8ClampedArray) => a.length === b.length && a.every((v, i) => v === b[i]);
const reveal = (fx: WipeFx, frame: number, src = layer(), pad = 0) =>
  data(applyReveals(src, [fx], frame, DURATION, pad).bitmap);

describe('wipe edge glow (A2.6)', () => {
  it('renders exactly as before when the new fields are absent or 0', () => {
    for (const shape of ['linear', 'iris', 'barn'] as const) {
      for (const frame of [0, 5, 10, 15, 25]) {
        const old = reveal(wipe({ shape, softness: 30 }), frame);
        const off = reveal(wipe({ shape, softness: 30, edgeGlow: 0, sparks: 0, edgeColor: '#00ff00' }), frame);
        expect(same(old, off)).toBe(true);
      }
    }
  });

  for (const softness of [0, 40]) {
    it(`brightens just behind the front and leaves 60 px behind it alone (softness ${softness})`, () => {
      const out = reveal(wipe({ softness, edgeGlow: 30 }), 10);
      const plain = reveal(wipe({ softness }), 10);
      // At t = 0.5 the front sits on the centre column, x = 200.
      const y = H / 2;
      const px = (d: Uint8ClampedArray, x: number) => Array.from(d.subarray((y * W + x) * 4, (y * W + x) * 4 + 4));
      const behind = px(out, 199);
      expect(behind[3]).toBeGreaterThan(0);
      expect(behind[0]).toBeGreaterThan(px(plain, 199)[0]);
      for (let x = 0; x <= 140; x++) {
        expect(px(out, x)).toEqual([80, 80, 80, 255]);
      }
    });
  }

  it('draws a ring for iris and two fronts for barn doors, only on revealed pixels', () => {
    for (const shape of ['iris', 'barn'] as const) {
      const out = reveal(wipe({ shape, softness: 10, edgeGlow: 20 }), 10);
      const plain = reveal(wipe({ shape, softness: 10 }), 10);
      expect(same(out, plain)).toBe(false);
      for (let i = 3; i < out.length; i += 4) if (plain[i] === 0) expect(out[i]).toBe(0);
    }
  });
});

describe('wipe sparks (A2.7)', () => {
  const PAD = 30;
  const sparky = wipe({ softness: 10, sparks: 1, edgeColor: '#ff6a3d' });

  it('are identical across two renders and actually appear', () => {
    const a = reveal(sparky, 12, layer(PAD), PAD);
    const b = reveal(sparky, 12, layer(PAD), PAD);
    expect(same(a, b)).toBe(true);
    expect(same(a, reveal(wipe({ softness: 10 }), 12, layer(PAD), PAD))).toBe(false);
  });

  it('never fall outside the layer box, at any frame', () => {
    const w = W + PAD * 2;
    for (let frame = 0; frame < 40; frame++) {
      for (const shape of ['linear', 'iris', 'barn'] as const) {
        const out = reveal({ ...sparky, shape }, frame, layer(PAD), PAD);
        for (let i = 3; i < out.length; i += 4) {
          const p = (i - 3) / 4;
          const x = p % w;
          const y = Math.floor(p / w);
          const inside = x >= PAD && x < PAD + W && y >= PAD && y < PAD + H;
          if (!inside && out[i] !== 0) throw new Error(`${shape} frame ${frame}: spark at ${x},${y}`);
        }
      }
    }
  });

  it('outlive the entrance for a few frames, then stop', () => {
    // Frame 20 is the first frame after the entrance; the slow sparks spawned
    // in its last frames trail the front and are still inside the box.
    const settled = data(layer(PAD));
    expect(same(reveal(sparky, 20, layer(PAD), PAD), settled)).toBe(false);
    expect(same(reveal(sparky, 40, layer(PAD), PAD), settled)).toBe(true);
  });

  it('only spawn where the layer has content', () => {
    // A layer whose left half is empty: sparks spawned there are skipped, so
    // nothing ever lights up in that half above the revealed pixels.
    const src = layer(PAD);
    src.getContext('2d')!.clearRect(0, 0, PAD + W / 2, H + PAD * 2);
    for (let frame = 0; frame < 12; frame++) {
      const out = reveal(sparky, frame, src, PAD);
      for (let y = 0; y < H + PAD * 2; y++) {
        for (let x = 0; x < PAD + W / 2 - 1; x++) {
          if (out[(y * (W + PAD * 2) + x) * 4 + 3] !== 0) throw new Error(`frame ${frame}: spark at ${x},${y}`);
        }
      }
    }
  });
});
