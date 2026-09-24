import { describe, expect, it } from 'vitest';
import {
  addPair, clearAuto, disableMorph, enableMorph, mergeAuto, movePoint, predictPartner,
} from './morph-edit';
import type { MorphView } from '../renderer/morph-field';
import type { ImageLayerData, MorphPair } from '../types';

const square: MorphView = {
  fitMode: 'fill', sizeA: { w: 100, h: 100 }, sizeB: { w: 100, h: 100 }, boxW: 100, boxH: 100,
};

const auto = (id: string, a: [number, number], b: [number, number]): MorphPair =>
  ({ id, a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] }, source: 'auto', confidence: 0.8 });
const manual = (id: string, a: [number, number], b: [number, number]): MorphPair =>
  ({ id, a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] }, source: 'manual' });

describe('predictPartner', () => {
  it('predicts the same spot when nothing is matched yet', () => {
    const p = predictPartner([], square, 'a', { x: 0.3, y: 0.6 });
    expect(p.x).toBeCloseTo(0.3, 9);
    expect(p.y).toBeCloseTo(0.6, 9);
  });

  it('predicts the partner of an existing point exactly', () => {
    const p = predictPartner([manual('m', [0.5, 0.5], [0.6, 0.5])], square, 'a', { x: 0.5, y: 0.5 });
    expect(p).toEqual({ x: 0.6, y: 0.5 });
  });

  it('works through different fits', () => {
    // box 100². A 200×100 contain → rect (0,25,100,50); B 100×200 → (25,0,50,100).
    // uv_a (0.25,0.5) → box (25,50) → uv_b ((25−25)/50, 50/100) = (0, 0.5).
    const view: MorphView = { fitMode: 'contain', sizeA: { w: 200, h: 100 }, sizeB: { w: 100, h: 200 }, boxW: 100, boxH: 100 };
    const p = predictPartner([], view, 'a', { x: 0.25, y: 0.5 });
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.y).toBeCloseTo(0.5, 9);
  });

  it('predicts from B back to A', () => {
    const p = predictPartner([manual('m', [0.5, 0.5], [0.6, 0.5])], square, 'b', { x: 0.6, y: 0.5 });
    expect(p).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe('addPair', () => {
  it('adds a manual pair with the clicked point on the clicked side', () => {
    const pairs = addPair([], square, 'b', { x: 0.2, y: 0.7 }, 'new');
    expect(pairs).toHaveLength(1);
    expect(pairs[0].id).toBe('new');
    expect(pairs[0].source).toBe('manual');
    expect(pairs[0].b).toEqual({ x: 0.2, y: 0.7 });
    expect(pairs[0].a.x).toBeCloseTo(0.2, 9);
  });
});

describe('movePoint', () => {
  it('moves one side and makes an auto pair manual', () => {
    const [moved] = movePoint([auto('p', [0.1, 0.1], [0.2, 0.2])], 'p', 'b', { x: 0.3, y: 0.3 });
    expect(moved.a).toEqual({ x: 0.1, y: 0.1 });
    expect(moved.b).toEqual({ x: 0.3, y: 0.3 });
    expect(moved.source).toBe('manual');
    expect('confidence' in moved).toBe(false);
  });
});

describe('clearAuto', () => {
  it('keeps only manual pairs', () => {
    const pairs = [auto('x', [0, 0], [0, 0]), manual('m', [1, 1], [1, 1])];
    expect(clearAuto(pairs).map((p) => p.id)).toEqual(['m']);
  });
});

describe('mergeAuto', () => {
  it('replaces old auto pairs, keeps manual ones, and skips auto pairs next to manual ones', () => {
    const existing = [auto('old', [0.9, 0.9], [0.9, 0.9]), manual('m', [0.5, 0.5], [0.5, 0.5])];
    const incoming = [
      auto('nearA', [0.51, 0.5], [0.1, 0.1]),   // a within 0.04 of the manual a
      auto('nearB', [0.1, 0.1], [0.5, 0.52]),   // b within 0.04 of the manual b
      auto('free', [0.2, 0.2], [0.25, 0.2]),
    ];
    expect(mergeAuto(existing, incoming).map((p) => p.id)).toEqual(['m', 'free']);
  });
});

function img(): ImageLayerData {
  return {
    id: 'l', name: 'l', type: 'image', startFrame: 10, endFrame: 40,
    x: 0, y: 0, width: 100, height: 100, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1,
    anchorX: 0, anchorY: 0, zIndex: 0, blendMode: 'normal', effects: [],
    visible: true, locked: false, src: 'a.png', fitMode: 'cover', borderRadius: 0,
    keyframes: { opacity: { keyframes: [{ frame: 0, value: 1, easing: 'linear' }] } },
  };
}

describe('enableMorph / disableMorph', () => {
  it('seeds a 0 → 1 ease-in-out track over the layer’s own frames', () => {
    const patch = enableMorph(img(), 'b.png');
    expect(patch.morph).toEqual({ target: 'b.png', pairs: [], progress: 0 });
    expect(patch.keyframes?.morphProgress.keyframes).toEqual([
      { frame: 0, value: 0, easing: 'ease-in-out' },
      { frame: 29, value: 1, easing: 'linear' },
    ]);
    expect(patch.keyframes?.opacity).toBeDefined();
  });

  it('removes the morph and its track, and nothing else', () => {
    const on = { ...img(), ...enableMorph(img(), 'b.png') } as ImageLayerData;
    const patch = disableMorph(on);
    expect(patch.morph).toBeNull();
    expect(Object.keys(patch.keyframes ?? {})).toEqual(['opacity']);
  });
});
