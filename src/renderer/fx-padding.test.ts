import { describe, expect, it } from 'vitest';
import type { LayerFxDef } from '../types';
import { REVEAL_FX, fxPadding } from './layer-fx';

describe('fxPadding', () => {
  it('is zero for an empty or absent stack', () => {
    expect(fxPadding(undefined)).toBe(0);
    expect(fxPadding([])).toBe(0);
  });

  it('takes the maximum across decorations, not the sum', () => {
    const fx: LayerFxDef[] = [
      { type: 'glow', color: '#fff', radius: 10, intensity: 1, pulseFrames: 0 },
      { type: 'long-shadow', color: '#000', distance: 100, angle: 45, fade: 0.7 },
    ];
    expect(fxPadding(fx)).toBe(104); // long-shadow 100+4 beats glow 10*2
  });

  it('adds reveal displacement on top of decoration padding', () => {
    // Slice moves content out by up to `travel`, consuming that margin, so a
    // glow stacked on it needs its own room beyond where the bands land.
    // Taking one max across both would give 60 and clip the bloom on the
    // displaced side until the reveal finished.
    const slice: LayerFxDef = {
      type: 'slice', bands: 10, direction: 'horizontal',
      order: 'sequential', travel: 60, stagger: 0.5,
    };
    const glow: LayerFxDef = {
      type: 'glow', color: '#fff', radius: 12, intensity: 1, pulseFrames: 0,
    };
    expect(fxPadding([slice])).toBe(60);
    expect(fxPadding([glow])).toBe(24);
    expect(fxPadding([slice, glow])).toBe(84);
  });

  it('still takes the maximum among several reveals', () => {
    const wide: LayerFxDef = {
      type: 'slice', bands: 4, direction: 'vertical',
      order: 'random', travel: 90, stagger: 0,
    };
    // pixelate and wipe stay inside the layer box and contribute nothing.
    const pixelate: LayerFxDef = { type: 'pixelate', maxBlock: 40, flicker: 0.6, fade: 0.4 };
    expect(fxPadding([wide, pixelate])).toBe(90);
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

  it('takes glitch padding from its parameters, not the envelope', () => {
    const base = { type: 'glitch', bands: 12, maxOffset: 30, channelShift: 6, probability: 0.25 } as const;
    const withWindow: LayerFxDef[] = [{
      ...base,
      window: { inDelay: 0, inFrames: 10, outFrames: 0, easing: 'linear' },
    }];
    expect(fxPadding([{ ...base }])).toBe(36);
    expect(fxPadding(withWindow)).toBe(36);
  });
});

describe('REVEAL_FX', () => {
  it('does not yet contain any of the original five effects', () => {
    for (const t of ['echo', 'rgb-split', 'shine', 'glow', 'long-shadow']) {
      expect(REVEAL_FX).not.toContain(t);
    }
  });
});
