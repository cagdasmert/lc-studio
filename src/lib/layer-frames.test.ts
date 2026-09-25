// Keyframe frames count from the layer's startFrame (the renderer resolves
// tracks at frameInScene - startFrame); the editor's playhead and timeline
// count from the scene's start. A layer from scene frame 20 to 50:

import { describe, expect, it } from 'vitest';
import { clampToLayer, isInLayer, toLayerFrame, toSceneFrame } from './layer-frames';

const layer = { startFrame: 20, endFrame: 50 };

describe('layer frames', () => {
  it('converts the playhead to the layer frame a keyframe is stored at, and back', () => {
    expect(toLayerFrame(layer, 30)).toBe(10);
    expect(toSceneFrame(layer, 10)).toBe(30);
    expect(toLayerFrame({ startFrame: 0, endFrame: 90 }, 30)).toBe(30);
  });

  it('matches the frames the renderer draws the layer on', () => {
    // draw.ts skips the layer unless startFrame <= frameInScene < endFrame.
    expect(isInLayer(layer, toLayerFrame(layer, 19))).toBe(false);
    expect(isInLayer(layer, toLayerFrame(layer, 20))).toBe(true);
    expect(isInLayer(layer, toLayerFrame(layer, 49))).toBe(true);
    expect(isInLayer(layer, toLayerFrame(layer, 50))).toBe(false);
  });

  it('clamps a dragged keyframe to the layer', () => {
    expect(clampToLayer(layer, -5)).toBe(0);
    expect(clampToLayer(layer, 12)).toBe(12);
    expect(clampToLayer(layer, 40)).toBe(29);
  });
});
