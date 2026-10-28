// CLI spec R2.1: the composition shape `check` needs before drawing anything.
import { describe, expect, it } from 'vitest';
import { shapeProblems } from './check';

const output = { id: 'x', label: 'x', width: 1080, height: 1920, fps: 30 };
const layer = { id: 'l', name: 'Title', type: 'text', keyframes: {} };

describe('shapeProblems', () => {
  it('accepts a well-formed composition', () => {
    expect(shapeProblems({ output, scenes: [{ durationFrames: 30, layers: [layer] }] })).toEqual([]);
  });

  it('names shorthand and missing values', () => {
    expect(shapeProblems({ output: 'tiktok', scenes: [] })).toEqual(['output must be an object with a width, height and fps above 0, not "tiktok"']);
    expect(shapeProblems({ output, scenes: [{ durationFrames: 1.5, layers: [] }, { durationFrames: 30 }] })).toEqual([
      'scene 1: durationFrames must be a whole number above 0, not 1.5',
      'scene 2: layers must be a list',
    ]);
    expect(shapeProblems({ output, scenes: [{ durationFrames: 30, layers: [{ name: 'x' }, { ...layer, keyframes: null }] }] })).toEqual([
      'scene 1, layer 1: not a layer (no type)',
      'scene 1, layer 2 (Title): keyframes must be an object',
    ]);
    expect(shapeProblems({ output })).toEqual(['scenes must be a list']);
    expect(shapeProblems(null)).toEqual(['the composition is not an object']);
  });
});
