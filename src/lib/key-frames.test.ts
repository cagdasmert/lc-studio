// CLI spec A1.1: the frames `stills --frames auto` and `check` look at.
import { describe, expect, it } from 'vitest';
import type { Composition } from '../types';
import { autoKeyFrames, keyFramesFor } from './key-frames';

const scene = (label: string, durationFrames: number, transition: string, transitionDurationFrames: number, layers: unknown[] = []) =>
  ({ id: label, label, durationFrames, transition, transitionDurationFrames, layers, backgroundColor: '#000' });

// A morphing image from scene frame 5, its morphProgress keyframes at layer frames 0 and 20.
const morph = {
  type: 'image', id: 'm', startFrame: 5, endFrame: 40, morph: { target: 'b.png', pairs: [], progress: 0 },
  keyframes: { morphProgress: { keyframes: [{ frame: 0, value: 0, easing: 'linear' }, { frame: 20, value: 1, easing: 'linear' }] } },
};

const composition = (scenes: unknown[]) =>
  ({ id: 'c', name: 'c', output: { id: 'x', label: 'x', width: 540, height: 960, fps: 30 }, scenes }) as unknown as Composition;

// Frames 0–9 (shorter than the hook frame), 10–49 (a 12-frame cube out, starting at 38), 50–79 (a fade set, but nothing follows).
const fixture = composition([
  scene('Hook', 10, 'none', 0),
  scene('Product', 40, 'cube', 12, [morph]),
  scene('End card', 30, 'fade', 15),
]);

describe('auto key frames', () => {
  it('picks the hook, settled frames, the transition middle, the morph middle and the end', () => {
    expect(autoKeyFrames(fixture)).toEqual([
      { frame: 9, why: 'hook', scene: 0, sceneLabel: 'Hook' },       // clamped: scene 1 is only 10 frames; also its settled frame
      { frame: 25, why: 'morph', scene: 1, sceneLabel: 'Product' },  // 10 + 5 + (0 + 20) / 2
      { frame: 37, why: 'settled', scene: 1, sceneLabel: 'Product' }, // the frame before the cube starts at 38
      { frame: 44, why: 'transition', scene: 1, sceneLabel: 'Product' }, // 38 + 12 / 2
      { frame: 79, why: 'settled', scene: 2, sceneLabel: 'End card' }, // the last scene's fade is ignored; also the end
    ]);
  });

  it('treats a cut, or a transition with no frames, as none', () => {
    const cuts = composition([scene('A', 30, 'cut', 10), scene('B', 30, 'fade', 0), scene('C', 30, 'none', 0)]);
    expect(autoKeyFrames(cuts).map((k) => [k.frame, k.why])).toEqual([[12, 'hook'], [29, 'settled'], [59, 'settled'], [89, 'settled']]);
  });

  it('picks hook and end from a one-scene video', () => {
    expect(autoKeyFrames(composition([scene('Only', 60, 'none', 0)])).map((k) => [k.frame, k.why])).toEqual([[12, 'hook'], [59, 'settled']]);
  });

  it('returns nothing for an empty video', () => {
    expect(autoKeyFrames(composition([]))).toEqual([]);
  });
});

describe('requested frames', () => {
  it('keeps explicit frames, sorted and deduplicated, with their scenes', () => {
    expect(keyFramesFor(fixture, [50, 0, 50]).map((k) => [k.frame, k.why, k.sceneLabel])).toEqual([[0, 'requested', 'Hook'], [50, 'requested', 'End card']]);
  });

  it('refuses frames outside the video and says the range', () => {
    expect(() => keyFramesFor(fixture, [5, 80])).toThrow('frame 80 is outside the video: frames run 0–79');
  });

  it('expands all', () => {
    expect(keyFramesFor(fixture, 'all')).toHaveLength(80);
  });
});
