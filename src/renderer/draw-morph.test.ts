// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { renderMorph } from './draw-morph';
import { bitmap, installCanvasDocument, rgba, solid } from '../test-utils/node-canvas';
import type { MorphPair } from '../types';

beforeAll(installCanvasDocument);

const S = 40;
const RED = solid(S, S, '#ff0000');
const BLUE = solid(S, S, '#0000ff');

function draw(a: ImageBitmap, b: ImageBitmap, t: number, pairs: MorphPair[] = []) {
  return renderMorph({ a, b, fitMode: 'fill', pairs, t, width: S, height: S });
}

describe('renderMorph', () => {
  it('is (almost) image A just after t = 0', () => {
    const [r, g, b, a] = rgba(draw(RED, BLUE, 0.001), 20, 20);
    expect(r).toBeGreaterThanOrEqual(253);
    expect(g).toBe(0);
    expect(b).toBeLessThanOrEqual(2);
    expect(a).toBe(255);
  });

  it('is (almost) image B just before t = 1', () => {
    const [r, , b] = rgba(draw(RED, BLUE, 0.999), 20, 20);
    expect(r).toBeLessThanOrEqual(2);
    expect(b).toBeGreaterThanOrEqual(253);
  });

  it('cross-dissolves evenly at t = 0.5 with no pairs', () => {
    const [r, , b, a] = rgba(draw(RED, BLUE, 0.5), 20, 20);
    expect(r).toBeGreaterThanOrEqual(126);
    expect(r).toBeLessThanOrEqual(129);
    expect(b).toBeGreaterThanOrEqual(126);
    expect(b).toBeLessThanOrEqual(129);
    expect(a).toBe(255);
  });

  it('leaves no seams between triangles', () => {
    const out = draw(RED, BLUE, 0.5, [{
      id: 'p', a: { x: 0.3, y: 0.4 }, b: { x: 0.6, y: 0.5 }, source: 'manual',
    }]);
    const data = (out.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, S, S).data;
    let minAlpha = 255;
    for (let i = 3; i < data.length; i += 4) minAlpha = Math.min(minAlpha, data[i]);
    expect(minAlpha).toBeGreaterThanOrEqual(254);
  });

  it('carries a matched feature to the in-between spot', () => {
    // A red dot at (10,20) in A and at (30,20) in B, matched by one pair.
    // At t = 0.5 both warped images put their dot at (20,20).
    const dotAt = (cx: number) => bitmap(S, S, (ctx) => {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, S, S);
      ctx.fillStyle = '#ff0000'; ctx.fillRect(cx - 2, 18, 4, 4);
    });
    const out = draw(dotAt(10), dotAt(30), 0.5, [{
      id: 'dot', a: { x: 10 / S, y: 20 / S }, b: { x: 30 / S, y: 20 / S }, source: 'manual',
    }]);
    const [, gMid] = rgba(out, 20, 20);
    const [, gOld] = rgba(out, 10, 20);
    expect(gMid).toBeLessThan(80);      // red where the dot travelled to
    expect(gOld).toBeGreaterThan(200);  // white where it left
  });

  it('fades a cutout without leaving A behind where B is transparent', () => {
    // source-over would keep A fully opaque under B; the additive blend
    // leaves only (1 − t) of A: 0.01 × 255 ≈ 3.
    const clear = bitmap(S, S, () => {});
    const [, , , a] = rgba(draw(RED, clear, 0.99), 20, 20);
    expect(a).toBeLessThanOrEqual(3);
  });

  it('clamps the blend weights when the easing overshoots', () => {
    // t = 1.2: A's weight must be 0, not −0.2 (canvas ignores a negative
    // globalAlpha and would draw A at full strength).
    const clear = bitmap(S, S, () => {});
    const [, , , a] = rgba(draw(RED, clear, 1.2), 20, 20);
    expect(a).toBe(0);
  });
});
