// @vitest-environment node
//
// VHS scene FX, FX pack spec A4.1–A4.4.

import { beforeAll, describe, expect, it } from 'vitest';
import { createCanvas } from 'canvas';
import { bitmap, installCanvasDocument } from '../test-utils/node-canvas';
import { drawCompositionFrame } from './compositor';
import { applyScenePostFx, applyShake } from './scene-fx';
import { applyVhs, creaseBand, vhsIsIdentity } from './scene-vhs';
import { release, renderSceneSurface, sceneNeedsSurface } from './scene-surface';
import type { MediaCache } from './media-cache';
import type { Composition, ImageLayerData, Scene, SceneFxDef, VhsFx } from '../types';

beforeAll(installCanvasDocument);

const W = 240;
const H = 200;

/** Schema defaults from SCENE_FX_SPECS.vhs. */
const vhs = (over: Partial<VhsFx> = {}): VhsFx => ({
  type: 'vhs', wave: 6, jitter: 1.5, bleed: 3, switching: 0.6, switchingHeight: 0.06,
  crease: 0.3, saturation: 0.8, barrel: 0, ...over,
});
const off = (over: Partial<VhsFx> = {}) =>
  vhs({ wave: 0, jitter: 0, bleed: 0, switching: 0, switchingHeight: 0, crease: 0, saturation: 1, ...over });

const picture = bitmap(W, H, (ctx) => {
  for (let x = 0; x < W; x += 12) {
    ctx.fillStyle = `hsl(${x * 3},80%,50%)`;
    ctx.fillRect(x, 0, 12, H);
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(40, 60, 160, 30);
});
const media = new Map([['pic', picture]]) as unknown as MediaCache;

const photo: ImageLayerData = {
  id: 'pic', name: 'pic', type: 'image', src: 'pic', fitMode: 'fill', borderRadius: 0,
  startFrame: 0, endFrame: 60, x: W / 2, y: H / 2, width: W, height: H, scaleX: 1, scaleY: 1, rotation: 0,
  opacity: 1, anchorX: 0.5, anchorY: 0.5, zIndex: 0, blendMode: 'normal', effects: [], visible: true, locked: false, keyframes: {},
};

const scene = (sceneFx: SceneFxDef[]): Scene => ({
  id: 's', label: 's', durationFrames: 60, backgroundColor: '#202020', layers: [photo], sceneFx,
  transition: 'none', transitionDurationFrames: 0,
});

function render(sceneFx: SceneFxDef[], frame = 7): Uint8ClampedArray {
  const composition: Composition = { id: 'c', name: 'c', scenes: [scene(sceneFx)], output: { id: 'o', label: 'o', width: W, height: H, fps: 30 } };
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
  drawCompositionFrame(ctx, composition, frame, media);
  return ctx.getImageData(0, 0, W, H).data;
}

const same = (a: Uint8ClampedArray, b: Uint8ClampedArray) => a.length === b.length && a.every((v, i) => v === b[i]);

describe('VHS scene FX', () => {
  it('A4.1 with every amount at 0 and saturation 1 the output is the scene without VHS', () => {
    expect(vhsIsIdentity(off())).toBe(true);
    expect(sceneNeedsSurface(scene([off()]))).toBe(false);
    for (const frame of [0, 7, 33]) expect(same(render([off()], frame), render([], frame))).toBe(true);
  });

  it('changes the picture with the defaults, and needs a surface', () => {
    expect(sceneNeedsSurface(scene([vhs()]))).toBe(true);
    expect(same(render([vhs()]), render([]))).toBe(false);
  });

  it('A4.2 two renders are identical, at several frames', () => {
    for (const frame of [0, 12, 45]) expect(same(render([vhs()], frame), render([vhs()], frame))).toBe(true);
  });

  it('A4.3 head switching alone leaves every row above the bottom 10% alone', () => {
    const plain = render([]);
    const out = render([off({ switching: 1, switchingHeight: 0.1 })]);
    const top = H * 0.9;
    let changedBelow = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W * 4; x++) {
        const i = y * W * 4 + x;
        if (y < top && out[i] !== plain[i]) throw new Error(`row ${y} changed`);
        if (y >= top && out[i] !== plain[i]) changedBelow++;
      }
    }
    expect(changedBelow).toBeGreaterThan(0);
  });

  it('the crease is a 6–14 px band that travels and wraps', () => {
    const tops = new Set<number>();
    for (let f = 0; f < 200; f++) {
      const { top, size } = creaseBand(f, 1920);
      expect(size).toBeGreaterThanOrEqual(6);
      expect(size).toBeLessThanOrEqual(14);
      expect(top).toBeGreaterThanOrEqual(-size);
      expect(top).toBeLessThan(1920);
      tops.add(Math.round(top));
    }
    expect(tops.size).toBeGreaterThan(100);
  });

  it('saturation 0 turns the picture grey', () => {
    const out = render([off({ saturation: 0 })]);
    for (let i = 0; i < out.length; i += 4) {
      expect(Math.abs(out[i] - out[i + 1])).toBeLessThanOrEqual(1);
      expect(Math.abs(out[i + 1] - out[i + 2])).toBeLessThanOrEqual(1);
    }
  });

  it('A4.4 VHS moves with the shake, and grain stays where it is today', () => {
    const shake = { type: 'shake', amplitude: 10, frequency: 8, decayFrames: 0 } as const;
    const grain = { type: 'grain', amount: 0.3, scale: 2 } as const;
    const fx = vhs();
    const frame = 9;
    const got = render([shake, fx, grain], frame);

    // Expected, by hand: the VHS'd scene surface drawn under the shake
    // transform, then today's grain overlay on top, outside the shake.
    const surface = renderSceneSurface(scene([fx]), frame, W, H, media);
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
    ctx.save();
    applyShake(ctx, shake, frame, 30, W, H);
    ctx.drawImage(surface, 0, 0);
    ctx.restore();
    applyScenePostFx(ctx, [shake, fx, grain], frame, W, H);
    release(surface);
    expect(same(got, ctx.getImageData(0, 0, W, H).data)).toBe(true);

    // And the VHS really is under the shake: without the shake the frame differs.
    expect(same(got, render([fx, grain], frame))).toBe(false);
  });

  it('wave alone moves each row by a whole number of pixels, holding its edge pixel', () => {
    const plain = render([]);
    const out = render([off({ wave: 12 })]);
    let moved = 0;
    for (let y = 0; y < H; y++) {
      const row = (d: Uint8ClampedArray, x: number) => Array.from(d.subarray((y * W + x) * 4, (y * W + x) * 4 + 4)).join();
      const shift = [...Array(41).keys()].map((k) => k - 20).find((s) =>
        [...Array(W).keys()].every((x) => row(out, x) === row(plain, Math.min(W - 1, Math.max(0, x + s)))));
      expect(shift).not.toBeUndefined();
      if (shift !== 0) moved++;
    }
    expect(moved).toBeGreaterThan(H / 2);
  });

  it('leaves a canvas untouched when it changes nothing', () => {
    const c = createCanvas(4, 4);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#123456';
    ctx.fillRect(0, 0, 4, 4);
    const before = ctx.getImageData(0, 0, 4, 4).data;
    applyVhs(c as unknown as HTMLCanvasElement, off(), 3);
    expect(same(ctx.getImageData(0, 0, 4, 4).data, before)).toBe(true);
  });
});
