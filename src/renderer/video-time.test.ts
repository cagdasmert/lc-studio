import { describe, expect, it } from 'vitest';
import type { Composition, Layer, Scene, TransitionType, VideoLayerData } from '../types';
import { collectVideoDraws, sourceTimeFor } from './video-time';

const FPS = 30;
const frameAt = (t: number) => Math.floor(t * FPS);

function video(id: string, extra: Partial<VideoLayerData> = {}): VideoLayerData {
  return {
    id, name: id, type: 'video', src: `assets/${id}.mp4`, startFrame: 0, endFrame: 30,
    x: 0, y: 0, width: 100, height: 100, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1,
    anchorX: 0.5, anchorY: 0.5, zIndex: 0, blendMode: 'normal', effects: [], visible: true,
    locked: false, keyframes: {}, startTime: 0, endTime: 0, playbackRate: 1, muted: true, ...extra,
  };
}

function scene(id: string, durationFrames: number, layers: Layer[], transition: TransitionType = 'none', transitionDurationFrames = 0): Scene {
  return { id, label: id, durationFrames, backgroundColor: '#000', layers, transition, transitionDurationFrames };
}

const comp = (...scenes: Scene[]): Composition =>
  ({ id: 'c', name: 'c', scenes, output: { id: 'o', label: 'o', width: 100, height: 100, fps: FPS } });

describe('sourceTimeFor', () => {
  it('lands on source frame startTime·fps + n (A1.1, rate 1)', () => {
    const layer = video('v', { startTime: 0.5 });
    for (let n = 0; n < 30; n++) expect(frameAt(sourceTimeFor(layer, n, FPS))).toBe(15 + n);
  });

  it('steps two source frames per frame at rate 2', () => {
    const layer = video('v', { startTime: 0.5, playbackRate: 2 });
    for (let n = 0; n < 30; n++) expect(frameAt(sourceTimeFor(layer, n, FPS))).toBe(15 + 2 * n);
  });

  it('holds the last frame before endTime (A1.5)', () => {
    const layer = video('v', { startTime: 0.5, endTime: 1.0 });
    expect(frameAt(sourceTimeFor(layer, 14, FPS))).toBe(29);
    expect(frameAt(sourceTimeFor(layer, 15, FPS))).toBe(29);
    expect(frameAt(sourceTimeFor(layer, 49, FPS))).toBe(29);
  });

  it('ignores an endTime that is not after startTime', () => {
    expect(frameAt(sourceTimeFor(video('v', { startTime: 2, endTime: 1 }), 30, FPS))).toBe(90);
  });
});

describe('collectVideoDraws', () => {
  it('lists the visible video layers active at the frame', () => {
    const c = comp(scene('s1', 60, [
      video('a', { startFrame: 10, endFrame: 40, startTime: 0.5 }),
      video('hidden', { visible: false }),
      video('later', { startFrame: 50, endFrame: 60 }),
    ]));
    const draws = collectVideoDraws(c, 20);
    expect(draws.map((d) => d.layerId)).toEqual(['a']);
    expect(draws[0].src).toBe('assets/a.mp4');
    expect(frameAt(draws[0].sourceTime)).toBe(25);
  });

  it('offsets later scenes by the earlier ones', () => {
    const c = comp(scene('s1', 30, []), scene('s2', 30, [video('b')]));
    expect(collectVideoDraws(c, 35).map((d) => [d.layerId, frameAt(d.sourceTime)])).toEqual([['b', 5]]);
  });

  it('adds the incoming scene at its frame 0 during a transition', () => {
    const c = comp(
      scene('s1', 30, [video('out', { startTime: 1 })], 'fade', 10),
      scene('s2', 30, [video('in', { startTime: 2 }), video('late', { startFrame: 5 })]),
    );
    expect(collectVideoDraws(c, 19).map((d) => d.layerId)).toEqual(['out']);
    const draws = collectVideoDraws(c, 25);
    expect(draws.map((d) => [d.layerId, frameAt(d.sourceTime)])).toEqual([['out', 55], ['in', 60]]);
  });

  it('ignores cuts', () => {
    const c = comp(scene('s1', 30, [], 'cut', 10), scene('s2', 30, [video('in')]));
    expect(collectVideoDraws(c, 25)).toEqual([]);
  });

  it('is empty for an empty composition', () => {
    expect(collectVideoDraws(comp(), 0)).toEqual([]);
  });
});
