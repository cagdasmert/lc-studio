// @vitest-environment node
//
// The keyframe editor offers borderRadius (image) and strokeWidth /
// cornerRadius (shape) as animatable. These tests draw through
// drawSceneLayers — the same entry the preview and the exporter use — so they
// catch both a drawer that ignores the track and a dispatcher that hands it
// the wrong frame. Every layer starts at scene frame 5, which makes the
// layer's own timeline (keyframe frames) differ from the scene's.

import { describe, expect, it } from 'vitest';
import { createCanvas } from 'canvas';
import { drawSceneLayers } from './draw';
import type { MediaCache } from './media-cache';
import type {
  EasingType, ImageLayerData, Keyframe, Layer, LayerBase, Scene, ShapeLayerData,
} from '../types';

const SIZE = 100;
const START = 5;

function base(type: LayerBase['type']): LayerBase {
  return {
    id: 'l1', name: 'layer', type,
    startFrame: START, endFrame: START + 30,
    x: 0, y: 0, width: SIZE, height: SIZE,
    scaleX: 1, scaleY: 1, rotation: 0, opacity: 1,
    anchorX: 0, anchorY: 0,
    zIndex: 0, blendMode: 'normal', effects: [],
    visible: true, locked: false, keyframes: {},
  };
}

function track(from: number, to: number, easing: EasingType = 'linear') {
  const keyframes: Keyframe[] = [
    { frame: 0, value: from, easing },
    { frame: 10, value: to, easing: 'linear' },
  ];
  return { keyframes };
}

function imageLayer(over: Partial<ImageLayerData>): ImageLayerData {
  return { ...base('image'), type: 'image', src: 'green.png', fitMode: 'fill', borderRadius: 0, ...over };
}

function shapeLayer(over: Partial<ShapeLayerData>): ShapeLayerData {
  return {
    ...base('shape'), type: 'shape', shapeType: 'rect',
    fill: '', stroke: '', strokeWidth: 0, cornerRadius: 0, ...over,
  };
}

function greenBitmap(): ImageBitmap {
  const c = createCanvas(SIZE, SIZE);
  const cx = c.getContext('2d');
  cx.fillStyle = '#00ff00';
  cx.fillRect(0, 0, SIZE, SIZE);
  return c as unknown as ImageBitmap;
}

/** Draw the one-layer scene at `frameInScene`; return a pixel reader. */
function render(layer: Layer, frameInScene: number) {
  const scene: Scene = {
    id: 's1', label: 'scene', durationFrames: 60, backgroundColor: '#000000',
    layers: [layer], transition: 'cut', transitionDurationFrames: 0,
  };
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
  const media: MediaCache = new Map([['green.png', greenBitmap()]]);
  drawSceneLayers(ctx, scene, frameInScene, SIZE, SIZE, media);
  const px = canvas.getContext('2d');
  return (x: number, y: number) => Array.from(px.getImageData(x, y, 1, 1).data);
}

const GREEN = [0, 255, 0, 255];
const RED = [255, 0, 0, 255];
const EMPTY = [0, 0, 0, 0];

describe('keyframed image borderRadius', () => {
  // Radius 0 at layer frame 0, 50 at layer frame 10. With radius 50 on a
  // 100 px box, (1,1) is ~69 px from the corner arc's centre (50,50), so it
  // is clipped away. A dispatcher passing the scene frame (5) instead of the
  // layer frame (0) would give radius 25, which also clips (1,1).
  const layer = imageLayer({ keyframes: { borderRadius: track(0, 50) } });

  it('keeps the corner square at the start of the layer', () => {
    expect(render(layer, START)(1, 1)).toEqual(GREEN);
  });

  it('rounds the corner off once the track reaches 50', () => {
    expect(render(layer, START + 10)(1, 1)).toEqual(EMPTY);
  });
});

describe('keyframed shape cornerRadius', () => {
  const layer = shapeLayer({
    shapeType: 'rounded-rect', fill: '#00ff00',
    keyframes: { cornerRadius: track(0, 50) },
  });

  it('keeps the corner square at the start of the layer', () => {
    expect(render(layer, START)(1, 1)).toEqual(GREEN);
  });

  it('rounds the corner off once the track reaches 50', () => {
    expect(render(layer, START + 10)(1, 1)).toEqual(EMPTY);
  });

  it('clamps an overshooting easing at zero instead of throwing', () => {
    // 20 → 0 with ease-out-back: at t = 0.8 the easing is ~1.0465, so the
    // raw value is 20 − 20 × 1.0465 ≈ −0.93 — a negative radius, which
    // roundRect rejects. Clamped to 0 the corner is square.
    const overshoot = shapeLayer({
      shapeType: 'rounded-rect', fill: '#00ff00',
      keyframes: { cornerRadius: track(20, 0, 'ease-out-back') },
    });
    expect(render(overshoot, START + 8)(1, 1)).toEqual(GREEN);
  });
});

describe('keyframed shape strokeWidth', () => {
  // Stroke is centred on the rect's edge, so width w paints x ∈ [−w/2, w/2]
  // along the left side. Width 0 at layer frame 0 → nothing at (3,50);
  // width 20 at layer frame 10 → (3,50) is inside the stroke. A dispatcher
  // passing the scene frame would give width 10 at START, which also covers
  // (3,50).
  const layer = shapeLayer({
    stroke: '#ff0000', keyframes: { strokeWidth: track(0, 20) },
  });

  it('draws no stroke at the start of the layer', () => {
    expect(render(layer, START)(3, 50)).toEqual(EMPTY);
  });

  it('draws the stroke once the track reaches 20', () => {
    expect(render(layer, START + 10)(3, 50)).toEqual(RED);
  });
});
