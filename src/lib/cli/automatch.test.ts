// CLI spec R3.1: which layers `automatch` matches.
import { describe, expect, it } from 'vitest';
import type { Composition } from '../../types';
import { pickMorphLayers } from './automatch';

const morph = { target: 'b.png', pairs: [], progress: 0 };
const composition = (layers: unknown[][]) =>
  ({ scenes: layers.map((l, i) => ({ id: `s${i}`, label: `S${i}`, durationFrames: 30, layers: l })) }) as unknown as Composition;
const c = composition([
  [{ id: 'a', name: 'Before / after', type: 'image', morph }, { id: 't', name: 'Title', type: 'text' }],
  [{ id: 'b', name: 'Swap', type: 'image', morph }, { id: 'c', name: 'Swap', type: 'image', morph }, { id: 'p', name: 'Photo', type: 'image' }],
]);
const ids = (layer: string | null) => pickMorphLayers(c, layer).map((l) => l.id);

describe('pickMorphLayers', () => {
  it('takes every image layer with a morph when none is named', () => {
    expect(ids(null)).toEqual(['a', 'b', 'c']);
  });

  it('finds a layer by id first, then by name', () => {
    expect(ids('b')).toEqual(['b']);
    expect(ids('Before / after')).toEqual(['a']);
  });

  it('refuses an ambiguous name, listing the ids', () => {
    expect(() => ids('Swap')).toThrow('"Swap" names 2 layers; pass one of their ids: b, c');
  });

  it('refuses a layer without a morph, and an unknown one', () => {
    expect(() => ids('Photo')).toThrow('"Photo" has no morph to match');
    expect(() => ids('Title')).toThrow('"Title" has no morph to match');
    expect(() => ids('nope')).toThrow('no layer has the id or name "nope"');
  });

  it('says so when nothing has a morph', () => {
    expect(() => pickMorphLayers(composition([[{ id: 'p', name: 'Photo', type: 'image' }]]), null)).toThrow('no image layer has a morph');
  });
});
