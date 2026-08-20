import { describe, expect, it } from 'vitest';
import { LAYER_FX_SPECS } from '../lib/fx-schema';
import { REVEAL_FX } from './layer-fx';
import type { LayerFxType } from '../types';

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
