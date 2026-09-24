// @vitest-environment node
//
// Drawn through drawSceneLayers, the entry the preview and exporter use. The
// layer starts at scene frame 5 so layer frames differ from scene frames.
import { beforeAll, describe, expect, it } from 'vitest';
import { createCanvas } from 'canvas';
import { drawSceneLayers } from './draw';
import type { MediaCache } from './media-cache';
import type { ImageLayerData, Scene } from '../types';
import { installCanvasDocument, solid } from '../test-utils/node-canvas';

beforeAll(installCanvasDocument);

const S = 40;
const START = 5;

function layer(over: Partial<ImageLayerData> = {}): ImageLayerData {
  return {
    id: 'l1', name: 'img', type: 'image', startFrame: START, endFrame: START + 30,
    x: 0, y: 0, width: S, height: S, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1,
    anchorX: 0, anchorY: 0, zIndex: 0, blendMode: 'normal', effects: [],
    visible: true, locked: false, src: 'a.png', fitMode: 'fill', borderRadius: 0,
    morph: { target: 'b.png', pairs: [], progress: 0 },
    keyframes: {
      morphProgress: { keyframes: [
        { frame: 0, value: 0, easing: 'linear' },
        { frame: 10, value: 1, easing: 'linear' },
      ] },
    },
    ...over,
  };
}

function centre(l: ImageLayerData, frameInScene: number, media: MediaCache): number[] {
  const scene: Scene = {
    id: 's', label: 's', durationFrames: 60, backgroundColor: '#000',
    layers: [l], transition: 'cut', transitionDurationFrames: 0,
  };
  const canvas = createCanvas(S, S);
  drawSceneLayers(canvas.getContext('2d') as unknown as CanvasRenderingContext2D, scene, frameInScene, S, S, media);
  return Array.from(canvas.getContext('2d').getImageData(20, 20, 1, 1).data);
}

const both = (): MediaCache => new Map([['a.png', solid(S, S, '#ff0000')], ['b.png', solid(S, S, '#0000ff')]]);

describe('image layer morph', () => {
  it('shows image A at the start of the morphProgress track', () => {
    expect(centre(layer(), START, both())).toEqual([255, 0, 0, 255]);
  });

  it('shows image B once the track reaches 1', () => {
    expect(centre(layer(), START + 10, both())).toEqual([0, 0, 255, 255]);
  });

  it('falls back to image A while the target is not loaded', () => {
    const onlyA: MediaCache = new Map([['a.png', solid(S, S, '#ff0000')]]);
    expect(centre(layer(), START + 10, onlyA)).toEqual([255, 0, 0, 255]);
  });

  it('uses the static progress when there is no track', () => {
    const l = layer({ keyframes: {}, morph: { target: 'b.png', pairs: [], progress: 1 } });
    expect(centre(l, START, both())).toEqual([0, 0, 255, 255]);
  });

  it('tints the morphed content, not the plain image', () => {
    // Multiplying by magenta keeps red red and blue blue, so at t = 1 the
    // tint path must show B. It draws the content twice (colour, then mask).
    const l = layer({ tintColor: '#ff00ff', tintBlend: 'multiply' });
    expect(centre(l, START + 10, both())).toEqual([0, 0, 255, 255]);
  });
});
