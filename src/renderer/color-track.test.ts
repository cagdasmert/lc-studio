// @vitest-environment node
//
// Text layers animate `color` with a track of hex strings. A project that does
// so must type-check as a Composition — `npx tsc --noEmit` checks this file
// with the rest of src/ — and the renderer must still interpolate the track.

import { describe, expect, it } from 'vitest';
import { createCanvas } from 'canvas';
import { drawSceneLayers } from './draw';
import {
  isColorTrack, isNumericTrack, resolveColorProperty, resolveNumericProperty,
} from './interpolation';
import type { Composition, LayerKeyframeTrack } from '../types';

// Shaped like a project.json an author (or the lc-studio-project skill) writes.
const project = {
  id: 'p1',
  name: 'Colour caption',
  output: { id: 'square', label: 'Square', width: 100, height: 100, fps: 30 },
  scenes: [{
    id: 's1', label: 'Intro', durationFrames: 30, backgroundColor: '#000000',
    transition: 'cut', transitionDurationFrames: 0,
    layers: [{
      id: 'caption', name: 'Caption', type: 'text',
      startFrame: 0, endFrame: 30,
      x: 0, y: 0, width: 100, height: 100,
      scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, anchorX: 0, anchorY: 0,
      zIndex: 0, blendMode: 'normal', effects: [], visible: true, locked: false,
      content: 'M', fontSize: 90, fontFamily: 'sans-serif', fontWeight: 'bold', fontStyle: 'normal',
      color: '#ffffff', align: 'left', verticalAlign: 'top',
      lineHeight: 1, letterSpacing: 0, maxWidth: 0, textStroke: null, textShadow: null,
      keyframes: {
        opacity: { keyframes: [{ frame: 0, value: 1, easing: 'linear' }] },
        color: {
          keyframes: [
            { frame: 0, value: '#ff0000', easing: 'linear' },
            { frame: 10, value: '#0000ff', easing: 'linear' },
          ],
        },
      },
    }],
  }],
} satisfies Composition;

const caption = project.scenes[0].layers[0];

describe('text colour track', () => {
  it('is a colour track, not a numeric one', () => {
    expect(isColorTrack(caption.keyframes.color)).toBe(true);
    expect(isNumericTrack(caption.keyframes.color)).toBe(false);
    expect(isNumericTrack(caption.keyframes.opacity)).toBe(true);
  });

  it('rejects a track that mixes numbers and colours', () => {
    const mixed: LayerKeyframeTrack = {
      // @ts-expect-error — a track holds numbers or colours, never both
      keyframes: [
        { frame: 0, value: 0, easing: 'linear' },
        { frame: 10, value: '#ffffff', easing: 'linear' },
      ],
    };
    expect(mixed.keyframes).toHaveLength(2);
  });

  it('interpolates between the keyframes and holds past the ends', () => {
    const at = (frame: number) => resolveColorProperty(caption.keyframes, 'color', frame, caption.color);
    expect(at(0)).toBe('#ff0000');
    expect(at(5)).toBe('#800080');
    expect(at(10)).toBe('#0000ff');
    expect(at(25)).toBe('#0000ff');
  });

  it('draws the text in the interpolated colour', () => {
    // Pixels well inside a glyph are fully covered, so they carry the exact
    // fill colour; count them to see which colour the text was drawn in.
    const count = (frame: number, rgba: number[]) => {
      const canvas = createCanvas(100, 100);
      const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
      drawSceneLayers(ctx, project.scenes[0], frame, 100, 100, new Map());
      const data = canvas.getContext('2d').getImageData(0, 0, 100, 100).data;
      let n = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (rgba.every((v, j) => data[i + j] === v)) n++;
      }
      return n;
    };
    expect(count(0, [255, 0, 0, 255])).toBeGreaterThan(50);
    expect(count(5, [128, 0, 128, 255])).toBeGreaterThan(50);
    expect(count(5, [255, 0, 0, 255])).toBe(0);
  });

  it('ignores a track of the wrong kind and keeps the static value', () => {
    // Only a hand-edited file can get here; the renderer falls back rather
    // than lerping strings as numbers or parsing numbers as hex.
    expect(resolveNumericProperty({ x: caption.keyframes.color }, 'x', 5, 42)).toBe(42);
    expect(resolveColorProperty({ color: caption.keyframes.opacity }, 'color', 5, '#abcdef')).toBe('#abcdef');
  });
});
