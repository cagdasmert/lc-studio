// @vitest-environment node
//
// Runs the real bundled model. Skipped when it has not been fetched
// (`npm run fetch-models`).
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { createCanvas } from 'canvas';
import * as ort from 'onnxruntime-web';
import { extractFeatures, type Pixels } from './features';
import { matchFeatures } from './match';
import { hash } from '../../renderer/noise';

const MODEL = 'src-tauri/resources/models/dinov2-small-int8.onnx';
const S = 448;
const SHIFT = 56; // 4 patches

/** A busy, distinctive picture: gradient ground, varied shapes. */
function scene(offsetX: number): Pixels {
  const c = createCanvas(S, S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#777777';
  ctx.fillRect(0, 0, S, S);
  ctx.translate(offsetX, 0);
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, '#203060');
  g.addColorStop(1, '#c08040');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 60; i++) {
    const x = hash(i, 1) * S, y = hash(i, 2) * S, r = 8 + hash(i, 3) * 30;
    ctx.fillStyle = `hsl(${Math.floor(hash(i, 4) * 360)}, 70%, ${35 + Math.floor(hash(i, 5) * 40)}%)`;
    ctx.beginPath();
    if (i % 3 === 0) ctx.rect(x - r, y - r / 2, r * 2, r);
    else ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return { data: ctx.getImageData(0, 0, S, S).data as unknown as Uint8ClampedArray, width: S, height: S };
}

describe.skipIf(!existsSync(MODEL))('DINOv2 auto-match on a shifted copy', () => {
  it('recovers the shift to within one patch', async () => {
    const session = await ort.InferenceSession.create(readFileSync(MODEL));
    const A = await extractFeatures(session, ort.Tensor, scene(0));
    const B = await extractFeatures(session, ort.Tensor, scene(SHIFT));
    const view = { fitMode: 'fill' as const, sizeA: { w: S, h: S }, sizeB: { w: S, h: S }, boxW: S, boxH: S };
    const pairs = matchFeatures(A, B, view);
    expect(pairs.length).toBeGreaterThanOrEqual(10);
    const dx = pairs.map((p) => p.b.x - p.a.x).sort((p, q) => p - q);
    const median = dx[dx.length >> 1];
    expect(Math.abs(median - SHIFT / S)).toBeLessThan(1 / 32);
  }, 60_000);
});
