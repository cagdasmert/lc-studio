import { describe, expect, it } from 'vitest';
import type { LayerFxDef } from '../types';
import { REVEAL_FX, fxPadding } from './layer-fx';

describe('fxPadding', () => {
  it('is zero for an empty or absent stack', () => {
    expect(fxPadding(undefined)).toBe(0);
    expect(fxPadding([])).toBe(0);
  });

  it('takes the maximum across the stack, not the sum', () => {
    const fx: LayerFxDef[] = [
      { type: 'glow', color: '#fff', radius: 10, intensity: 1, pulseFrames: 0 },
      { type: 'long-shadow', color: '#000', distance: 100, angle: 45, fade: 0.7 },
    ];
    expect(fxPadding(fx)).toBe(104); // long-shadow 100+4 beats glow 10*2
  });

  it('does not depend on the envelope', () => {
    const withWindow: LayerFxDef[] = [{
      type: 'glow', color: '#fff', radius: 30, intensity: 1, pulseFrames: 0,
      window: { inDelay: 0, inFrames: 10, outFrames: 0, easing: 'linear' },
    }];
    const without: LayerFxDef[] = [
      { type: 'glow', color: '#fff', radius: 30, intensity: 1, pulseFrames: 0 },
    ];
    expect(fxPadding(withWindow)).toBe(fxPadding(without));
  });
});

describe('REVEAL_FX', () => {
  it('does not yet contain any of the original five effects', () => {
    for (const t of ['echo', 'rgb-split', 'shine', 'glow', 'long-shadow']) {
      expect(REVEAL_FX).not.toContain(t);
    }
  });
});
