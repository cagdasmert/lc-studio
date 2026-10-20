// @vitest-environment node
//
// Lens layers, FX pack spec A3.1–A3.5 and A3.7. A3.6 (preview matches
// export) is the `preview` e2e job in scripts/e2e/fx3-lens.mjs.

import { beforeAll, describe, expect, it } from 'vitest';
import { createCanvas } from 'canvas';
import { bitmap, installCanvasDocument } from '../test-utils/node-canvas';
import { drawCompositionFrame } from './compositor';
import { motionPathAt } from './motion-path';
import { RAMP } from './glyphs';
import type { MediaCache } from './media-cache';
import type { Composition, ImageLayerData, Layer, LensLayerData, MotionPathDef, ShapeLayerData } from '../types';

beforeAll(installCanvasDocument);

const W = 400;
const H = 400;

const base = (id: string, zIndex: number) => ({
  id, name: id, startFrame: 0, endFrame: 30, x: W / 2, y: H / 2, width: W, height: H,
  scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, anchorX: 0.5, anchorY: 0.5, zIndex,
  blendMode: 'normal' as const, effects: [], visible: true, locked: false, keyframes: {},
});

/** 10-px squares, each a different colour, so a position can be read back from a colour. */
const checker = bitmap(W, H, (ctx) => {
  for (let y = 0; y < H / 10; y++) {
    for (let x = 0; x < W / 10; x++) {
      ctx.fillStyle = `rgb(${x * 6},${y * 6},${(x + y) % 2 ? 200 : 60})`;
      ctx.fillRect(x * 10, y * 10, 10, 10);
    }
  }
});
const media = new Map([['checker', checker]]) as unknown as MediaCache;

const checkerLayer = (): ImageLayerData => ({ ...base('checker', 0), type: 'image', src: 'checker', fitMode: 'fill', borderRadius: 0 });

const lens = (over: Partial<LensLayerData> = {}): LensLayerData => ({
  ...base('lens', 5), type: 'lens', x: 205, y: 205, width: 160, height: 160,
  shape: 'circle', cornerRadius: 0, feather: 0, intensity: 1, ring: null,
  mode: 'magnify', magnify: 2, block: 20, ditherLevels: 3, cell: 10, ...over,
});

const square = (id: string, zIndex: number, over: Partial<ShapeLayerData> = {}): ShapeLayerData => ({
  ...base(id, zIndex), type: 'shape', width: 20, height: 20, shapeType: 'rect', fill: '#00ff00',
  stroke: '', strokeWidth: 0, cornerRadius: 0, ...over,
});

function render(layers: Layer[], frame = 0): Uint8ClampedArray {
  const composition: Composition = {
    id: 'c', name: 'c',
    scenes: [{ id: 's', label: 's', durationFrames: 30, backgroundColor: '#000000', layers, transition: 'none', transitionDurationFrames: 0 }],
    output: { id: 'o', label: 'o', width: W, height: H, fps: 30 },
  };
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
  drawCompositionFrame(ctx, composition, frame, media);
  return ctx.getImageData(0, 0, W, H).data;
}

const px = (d: Uint8ClampedArray, x: number, y: number) => Array.from(d.subarray((y * W + x) * 4, (y * W + x) * 4 + 4));
const near = (a: number[], b: number[], tol: number) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
const same = (a: Uint8ClampedArray, b: Uint8ClampedArray) => a.every((v, i) => v === b[i]);

describe('lens layer', () => {
  it('A3.1 a ×2 magnifier shows, at centre + r/2, what the source has at centre + r/4', () => {
    const r = 80;
    const plain = render([checkerLayer()]);
    const out = render([checkerLayer(), lens()]);
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const got = px(out, 205 + dx * r / 2, 205 + dy * r / 2);
      const want = px(plain, 205 + dx * r / 4, 205 + dy * r / 4);
      expect(near(got, want, 2)).toBe(true);
    }
  });

  for (const feather of [0, 16]) {
    for (const shape of ['circle', 'rect', 'rounded-rect'] as const) {
      it(`A3.2 leaves pixels outside the ${shape} and its feather (${feather}) alone`, () => {
        const plain = render([checkerLayer()]);
        const out = render([checkerLayer(), lens({ shape, feather, cornerRadius: 30, mode: 'pixelate' })]);
        let changedInside = 0;
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const dx = Math.abs(x + 0.5 - 205);
            const dy = Math.abs(y + 0.5 - 205);
            const outside = shape === 'circle'
              ? Math.hypot(dx, dy) > 80 + feather + 1
              : Math.max(dx, dy) > 80 + feather + 1;
            const i = (y * W + x) * 4;
            const equal = out[i] === plain[i] && out[i + 1] === plain[i + 1] && out[i + 2] === plain[i + 2];
            if (outside && !equal) throw new Error(`pixel ${x},${y} changed`);
            if (!outside && !equal) changedInside++;
          }
        }
        expect(changedInside).toBeGreaterThan(0);
      });
    }
  }

  it('A3.3 with intensity 0 the frame equals the scene without the lens', () => {
    const plain = render([checkerLayer()]);
    for (const mode of ['magnify', 'pixelate', 'dither', 'ascii'] as const) {
      expect(same(render([checkerLayer(), lens({ mode, intensity: 0, feather: 10 })]), plain)).toBe(true);
    }
  });

  it('A3.3 the intensity track overrides the static value', () => {
    const plain = render([checkerLayer()]);
    const keyed = lens({ keyframes: { intensity: { keyframes: [{ frame: 0, value: 0, easing: 'linear' }, { frame: 10, value: 1, easing: 'linear' }] } } });
    expect(same(render([checkerLayer(), keyed], 0), plain)).toBe(true);
    expect(same(render([checkerLayer(), keyed], 10), plain)).toBe(false);
  });

  it('A3.4 changes layers below it and leaves layers above it alone', () => {
    const above = square('above', 9, { x: 215, y: 215, fill: '#ff00ff' });
    const out = render([checkerLayer(), lens({ mode: 'pixelate' }), above]);
    const without = render([checkerLayer(), above]);
    for (let y = 206; y < 224; y++) for (let x = 206; x < 224; x++) expect(px(out, x, y)).toEqual(px(without, x, y));
    expect(px(out, 160, 170)).not.toEqual(px(without, 160, 170));
  });

  it('A3.5 follows a motion path: the magnified marker sits on motionPathAt, ±1 px', () => {
    const path: MotionPathDef = { points: [{ x: 100, y: 120 }, { x: 300, y: 200, cpX: 260, cpY: 60 }, { x: 180, y: 320 }] };
    const marker = square('marker', 1, { width: 4, height: 4, motionPath: path });
    const magnifier = lens({ magnify: 3, width: 60, height: 60, motionPath: path });
    for (const frame of [3, 14, 25]) {
      const out = render([marker, magnifier], frame);
      let sx = 0; let sy = 0; let n = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const [r, g, b] = px(out, x, y);
        if (g > 128 && r < 60 && b < 60) { sx += x + 0.5; sy += y + 0.5; n++; }
      }
      const want = motionPathAt(path, frame, 30);
      expect(n).toBeGreaterThan(100); // ~12×12: magnified ×3
      expect(Math.abs(sx / n - want.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(sy / n - want.y)).toBeLessThanOrEqual(1);
    }
  });

  it('draws a ring when one is set, outside the intensity', () => {
    const plain = render([checkerLayer()]);
    const out = render([checkerLayer(), lens({ intensity: 0, ring: { color: '#ffffff', width: 4 } })]);
    expect(px(out, 205 + 78, 205)).toEqual([255, 255, 255, 255]);
    expect(px(out, 205, 205)).toEqual(px(plain, 205, 205));
  });
});

describe('dither and ascii modes (A3.7)', () => {
  for (const mode of ['dither', 'ascii'] as const) {
    it(`${mode} gives identical pixels across two renders, and only ink or paper with both set`, () => {
      const l = lens({ mode, shape: 'rect', ink: '#ffffff', paper: '#102030' });
      const a = render([checkerLayer(), l]);
      expect(same(a, render([checkerLayer(), l]))).toBe(true);
      for (let y = 140; y < 270; y++) for (let x = 140; x < 270; x++) {
        const p = px(a, x, y);
        const ink = p[0] === 255 && p[1] === 255 && p[2] === 255;
        const paper = p[0] === 16 && p[1] === 32 && p[2] === 48;
        if (!ink && !paper) throw new Error(`${mode} pixel ${x},${y} is ${p}`);
      }
    });
  }

  it('dither without ink quantises each channel to its levels', () => {
    const a = render([checkerLayer(), lens({ mode: 'dither', shape: 'rect', ditherLevels: 3 })]);
    for (let y = 140; y < 270; y++) for (let x = 140; x < 270; x++) {
      for (const v of px(a, x, y).slice(0, 3)) expect([0, 127, 128, 255]).toContain(v);
    }
  });

  it('ascii cells line up with the lens cell grid, one cell centred on the lens', () => {
    const grey = bitmap(W, H, (ctx) => { ctx.fillStyle = 'rgb(128,128,128)'; ctx.fillRect(0, 0, W, H); });
    const cache = new Map([['checker', grey]]) as unknown as MediaCache;
    const cell = 10;
    for (const centre of [205, 200, 213]) {
      const composition: Composition = {
        id: 'c', name: 'c',
        scenes: [{ id: 's', label: 's', durationFrames: 30, backgroundColor: '#000', transition: 'none', transitionDurationFrames: 0,
          layers: [checkerLayer(), lens({ x: centre, y: centre, mode: 'ascii', shape: 'rect', cell, ink: '#ffffff', paper: '#000000' })] }],
        output: { id: 'o', label: 'o', width: W, height: H, fps: 30 },
      };
      const canvas = createCanvas(W, H);
      const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
      drawCompositionFrame(ctx, composition, 0, cache);
      const d = ctx.getImageData(0, 0, W, H).data;
      // rgb(128,128,128) has luminance ≈ 0.502, which picks RAMP[5]: rows 1 and 3 lit.
      const glyph = RAMP[Math.round((128 / 255) * (RAMP.length - 1))];
      const origin = centre - cell / 2;
      for (let y = centre - 60; y < centre + 60; y++) {
        for (let x = centre - 60; x < centre + 60; x++) {
          const row = Math.floor((((y - origin) % cell + cell) % cell) * 5 / cell);
          const col = Math.floor((((x - origin) % cell + cell) % cell) * 5 / cell);
          const lit = (glyph >> (row * 5 + col)) & 1;
          expect(px(d, x, y)[0]).toBe(lit ? 255 : 0);
        }
      }
    }
  });
});
