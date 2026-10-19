// @vitest-environment node
//
// Transitions composite two whole scene surfaces (FX pack spec A0.1–A0.3):
// the outgoing scene keeps its background, and dissolve swaps block by block.

import { beforeAll, describe, expect, it } from 'vitest';
import { createCanvas } from 'canvas';
import { installCanvasDocument } from '../test-utils/node-canvas';
import { drawCompositionFrame } from './compositor';
import { dissolveBlock } from './transitions';
import { acquire, release, renderSceneSurface, sceneNeedsSurface } from './scene-surface';
import type { MediaCache } from './media-cache';
import type { Composition, Scene, TransitionType } from '../types';

beforeAll(installCanvasDocument);

const W = 360;
const H = 640;
const DURATION = 60;
const TRANSITION = 30;
/** The middle transition frame: progress 0.5. */
const MID = DURATION - TRANSITION + TRANSITION / 2;
const FIRST = DURATION - TRANSITION;
const noMedia = { get: () => null } as unknown as MediaCache;

const scene = (id: string, color: string, transition: TransitionType = 'none'): Scene => ({
  id, label: id, durationFrames: DURATION, backgroundColor: color, layers: [],
  transition, transitionDurationFrames: transition === 'none' ? 0 : TRANSITION,
});

function frame(transition: TransitionType, globalFrame: number): Uint8ClampedArray {
  const composition: Composition = {
    id: 'c', name: 'c',
    scenes: [scene('red', '#ff0000', transition), scene('blue', '#0000ff')],
    output: { id: 'o', label: 'o', width: W, height: H, fps: 30 },
  };
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
  drawCompositionFrame(ctx, composition, globalFrame, noMedia);
  return ctx.getImageData(0, 0, W, H).data;
}

const at = (data: Uint8ClampedArray, x: number, y: number) => {
  const i = (y * W + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
};
const RED = [255, 0, 0, 255];
const BLUE = [0, 0, 255, 255];

/** Every pixel in [x0, x1) × all rows has this colour. */
function allColumns(data: Uint8ClampedArray, x0: number, x1: number, rgba: number[]): boolean {
  for (let y = 0; y < H; y++) {
    for (let x = x0; x < x1; x++) {
      const p = at(data, x, y);
      if (p.some((v, k) => v !== rgba[k])) return false;
    }
  }
  return true;
}

describe('scene surfaces', () => {
  it('reuses pooled canvases by size, cleared', () => {
    const a = acquire(20, 10);
    a.getContext('2d')!.fillRect(0, 0, 20, 10);
    release(a);
    const b = acquire(20, 10);
    expect(b).toBe(a);
    expect(Array.from(b.getContext('2d')!.getImageData(5, 5, 1, 1).data)).toEqual([0, 0, 0, 0]);
    expect(acquire(21, 10)).not.toBe(a);
    release(b);
  });

  it('draws the background and layers with an identity transform', () => {
    const s = scene('s', '#00ff00');
    const surface = renderSceneSurface(s, 0, W, H, noMedia);
    expect(surface.width).toBe(W);
    expect(surface.height).toBe(H);
    const data = surface.getContext('2d')!.getImageData(0, 0, W, H).data;
    expect(at(data, 0, 0)).toEqual([0, 255, 0, 255]);
    expect(at(data, W - 1, H - 1)).toEqual([0, 255, 0, 255]);
    release(surface);
  });

  it('no existing feature needs a surface', () => {
    expect(sceneNeedsSurface(scene('s', '#000000'))).toBe(false);
  });
});

describe('transitions keep both backgrounds', () => {
  it('A0.1 fade: the middle frame is half red, half blue', () => {
    const [r, g, b] = at(frame('fade', MID), W / 2, H / 2);
    expect(Math.abs(r - 128)).toBeLessThanOrEqual(3);
    expect(g).toBeLessThanOrEqual(3);
    expect(Math.abs(b - 127)).toBeLessThanOrEqual(3);
  });

  it('A0.2 slide-left: red on the left, blue on the right', () => {
    const data = frame('slide-left', MID);
    expect(allColumns(data, 0, W / 2, RED)).toBe(true);
    expect(allColumns(data, W / 2, W, BLUE)).toBe(true);
  });

  it('A0.2 wipe-horizontal: blue on the left, red on the right', () => {
    const data = frame('wipe-horizontal', MID);
    expect(allColumns(data, 0, W / 2, BLUE)).toBe(true);
    expect(allColumns(data, W / 2, W, RED)).toBe(true);
  });

  it('wipe-vertical and the other slides keep the outgoing background too', () => {
    expect(at(frame('wipe-vertical', MID), W / 2, H - 1)).toEqual(RED);
    expect(at(frame('slide-right', MID), W - 1, H / 2)).toEqual(RED);
    expect(at(frame('slide-up', MID), W / 2, 0)).toEqual(RED);
    expect(at(frame('slide-down', MID), W / 2, H - 1)).toEqual(RED);
  });

  it('zoom still draws the outgoing scene over the incoming one', () => {
    const [r, , b] = at(frame('zoom-in', MID), W / 2, H / 2);
    expect(r).toBeGreaterThan(100);
    expect(b).toBeGreaterThan(100);
  });
});

describe('GPU transitions without WebGL', () => {
  it('render as a fade (node-canvas has no WebGL)', () => {
    for (const type of ['cube', 'page-curl', 'ascii-sweep'] as const) {
      const a = frame(type, MID);
      const b = frame('fade', MID);
      expect(a.every((v, i) => v === b[i])).toBe(true);
    }
  });
});

describe('A0.3 dissolve', () => {
  const block = dissolveBlock(W, H);

  it('sizes blocks from the short side: 8 px at 1080 wide, at least 4', () => {
    expect(dissolveBlock(1080, 1920)).toBe(8);
    expect(block).toBe(4);
  });

  it('at progress 0.5, 45–55% of the blocks are blue and every block is one colour', () => {
    const data = frame('dissolve', MID);
    let blue = 0;
    let total = 0;
    for (let by = 0; by < H / block; by++) {
      for (let bx = 0; bx < W / block; bx++) {
        const first = at(data, bx * block, by * block);
        expect([RED, BLUE]).toContainEqual(first);
        for (let y = by * block; y < (by + 1) * block; y++) {
          for (let x = bx * block; x < (bx + 1) * block; x++) {
            const p = at(data, x, y);
            if (p.some((v, k) => v !== first[k])) throw new Error(`block ${bx},${by} is not one colour`);
          }
        }
        total++;
        if (first[2] === 255) blue++;
      }
    }
    expect(blue / total).toBeGreaterThanOrEqual(0.45);
    expect(blue / total).toBeLessThanOrEqual(0.55);
  });

  it('two renders are identical', () => {
    const a = frame('dissolve', MID);
    const b = frame('dissolve', MID);
    expect(a.every((v, i) => v === b[i])).toBe(true);
  });

  it('the first transition frame is all red', () => {
    expect(allColumns(frame('dissolve', FIRST), 0, W, RED)).toBe(true);
  });
});
