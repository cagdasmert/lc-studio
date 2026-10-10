import { beforeAll, describe, expect, it } from 'vitest';
import { createCanvas } from 'canvas';
import type { Composition, ResolvedTransform, VideoLayerData } from '../types';
import { installCanvasDocument, rgba, solid } from '../test-utils/node-canvas';
import { drawCompositionFrame } from './compositor';
import { drawVideoLayer, type PreparedVideoFrames } from './draw-video';

beforeAll(installCanvasDocument);

const layer: VideoLayerData = {
  id: 'v', name: 'v', type: 'video', src: 'assets/v.mp4', startFrame: 0, endFrame: 30,
  x: 50, y: 50, width: 100, height: 100, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1,
  anchorX: 0.5, anchorY: 0.5, zIndex: 0, blendMode: 'normal', effects: [], visible: true,
  locked: false, keyframes: {}, startTime: 0, endTime: 0, playbackRate: 1, muted: true,
};

const box = (width: number, height: number): ResolvedTransform => ({
  x: 0, y: 0, width, height, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, anchorX: 0, anchorY: 0, skewX: 0, skewY: 0,
});

/** A 2:1 frame: red left half, blue right half. */
const frame = (() => {
  const f = createCanvas(200, 100);
  const ctx = f.getContext('2d');
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, 100, 100);
  ctx.fillStyle = '#0000ff';
  ctx.fillRect(100, 0, 100, 100);
  return f as unknown as HTMLCanvasElement;
})();

const prepared = (id: string, image: HTMLCanvasElement): PreparedVideoFrames => ({ get: (l) => (l === id ? image : undefined) });

function target(w: number, h: number) {
  const c = createCanvas(w, h);
  return { canvas: c as unknown as HTMLCanvasElement, ctx: c.getContext('2d') as unknown as CanvasRenderingContext2D };
}

describe('drawVideoLayer', () => {
  it('cover-fits the prepared frame and clips it to the layer box', () => {
    const { canvas, ctx } = target(200, 100);
    drawVideoLayer(ctx, layer, box(100, 100), prepared('v', frame));
    // Scaled to 200×100 and centred: x 0–50 shows red, 50–100 blue, nothing past the box.
    expect(rgba(canvas, 25, 50)).toEqual([255, 0, 0, 255]);
    expect(rgba(canvas, 75, 50)).toEqual([0, 0, 255, 255]);
    expect(rgba(canvas, 150, 50)).toEqual([0, 0, 0, 0]);
  });

  it('draws nothing when no frame is prepared', () => {
    const { canvas, ctx } = target(100, 100);
    drawVideoLayer(ctx, layer, box(100, 100), prepared('other', frame));
    expect(rgba(canvas, 50, 50)).toEqual([0, 0, 0, 0]);
  });
});

describe('drawCompositionFrame', () => {
  const comp: Composition = {
    id: 'c', name: 'c',
    output: { id: 'o', label: 'o', width: 100, height: 100, fps: 30 },
    scenes: [{ id: 's', label: 's', durationFrames: 30, backgroundColor: '#000000', layers: [layer], transition: 'none', transitionDurationFrames: 0 }],
  };

  it('draws video layers from the prepared frames', () => {
    const { canvas, ctx } = target(100, 100);
    drawCompositionFrame(ctx, comp, 0, new Map(), prepared('v', solid(100, 100, '#00ff00') as unknown as HTMLCanvasElement));
    expect(rgba(canvas, 50, 50)).toEqual([0, 255, 0, 255]);
  });

  it('leaves video layers out without them', () => {
    const { canvas, ctx } = target(100, 100);
    drawCompositionFrame(ctx, comp, 0, new Map());
    expect(rgba(canvas, 50, 50)).toEqual([0, 0, 0, 255]);
  });
});
