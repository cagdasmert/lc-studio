import { describe, expect, it } from 'vitest';
import { gpuFeatureUses, gpuWarning } from './gpu-features';
import type { Composition, LensLayerData, Scene } from '../types';

const lens = (mode: LensLayerData['mode'], visible = true): LensLayerData => ({
  id: mode, name: `L-${mode}`, type: 'lens', startFrame: 0, endFrame: 30, x: 0, y: 0, width: 100, height: 100,
  scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, anchorX: 0.5, anchorY: 0.5, zIndex: 0, blendMode: 'normal',
  effects: [], visible, locked: false, keyframes: {},
  shape: 'circle', cornerRadius: 0, feather: 0, intensity: 1, ring: null, mode, magnify: 2, block: 8, ditherLevels: 3, cell: 8,
});
const scene = (label: string, extra: Partial<Scene> = {}): Scene => ({
  id: label, label, durationFrames: 30, backgroundColor: '#000', layers: [], transition: 'none', transitionDurationFrames: 0, ...extra,
});
const comp = (scenes: Scene[]): Composition => ({ id: 'c', name: 'c', scenes, output: { id: 'o', label: 'o', width: 10, height: 10, fps: 30 } });

describe('gpuFeatureUses', () => {
  it('names GPU transitions, refract and ripple lenses, and VHS curvature', () => {
    const uses = gpuFeatureUses(comp([
      scene('A', { transition: 'cube', transitionDurationFrames: 10, layers: [lens('refract'), lens('magnify'), lens('ripple', false)] }),
      scene('B', { transition: 'fade', transitionDurationFrames: 10, sceneFx: [{ type: 'vhs', wave: 0, jitter: 0, bleed: 0, switching: 0, switchingHeight: 0, crease: 0, saturation: 1, barrel: 0.5 }] }),
      scene('C', { transition: 'page-curl', transitionDurationFrames: 10 }), // last scene: its transition never plays
    ]));
    expect(uses).toEqual([
      'Scene 1 “A”: Cube transition',
      'Scene 1 “A”: lens “L-refract” (Glass)',
      'Scene 2 “B”: VHS tube curvature',
    ]);
  });

  it('is empty for a composition with no GPU effects, so there is no warning', () => {
    const uses = gpuFeatureUses(comp([scene('A', { transition: 'dissolve', transitionDurationFrames: 5 }), scene('B')]));
    expect(uses).toEqual([]);
    expect(gpuWarning(uses)).toBeNull();
    expect(gpuWarning(['x'])).toContain('WebGL2 is unavailable');
  });
});
