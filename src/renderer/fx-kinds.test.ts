import { describe, expect, it } from 'vitest';
import { LAYER_FX_SPECS } from '../lib/fx-schema';
import { BITMAP_FX, REVEAL_FX } from './layer-fx';
import type { LayerFxType } from '../types';

/**
 * The renderer must not import fx-schema.ts, so `REVEAL_FX` duplicates what
 * `kind: 'reveal'` already says. These tests are the seam that keeps the two
 * copies honest, and the only file allowed to import both.
 */

describe('REVEAL_FX', () => {
  it('matches the reveal specs in fx-schema, which the renderer cannot import', () => {
    const fromSpecs = (Object.keys(LAYER_FX_SPECS) as LayerFxType[])
      .filter((t) => LAYER_FX_SPECS[t].kind === 'reveal')
      .sort();
    expect([...REVEAL_FX].sort()).toEqual(fromSpecs);
  });

  it('contains zoom', () => {
    expect(REVEAL_FX).toContain('zoom');
  });
});

describe('BITMAP_FX', () => {
  it('contains every reveal except zoom', () => {
    // A reveal missing from BITMAP_FX fails silently: hasBitmapFx returns
    // false, compositeLayerFx never runs, and the effect just does not happen.
    // Zoom is the one legitimate exclusion — it writes the resolved transform
    // and never touches the bitmap.
    const missing = REVEAL_FX.filter((t) => t !== 'zoom' && !BITMAP_FX.includes(t));
    expect(missing).toEqual([]);
  });

  it('excludes zoom, so a zoom-only layer stays on the cheap path', () => {
    expect(BITMAP_FX).not.toContain('zoom');
  });

  it('accounts for every layer FX type, so a new one cannot be forgotten', () => {
    // echo re-runs the whole layer draw from draw.ts; zoom writes the resolved
    // transform. Everything else composites from the layer bitmap. A new type
    // that belongs to none of those three groups is an unhandled case.
    const accounted = new Set<LayerFxType>([...BITMAP_FX, 'echo', 'zoom']);
    const unaccounted = (Object.keys(LAYER_FX_SPECS) as LayerFxType[])
      .filter((t) => !accounted.has(t));
    expect(unaccounted).toEqual([]);
  });
});
