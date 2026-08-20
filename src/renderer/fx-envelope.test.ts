import { describe, expect, it } from 'vitest';
import type { FxWindow } from '../types';
import { envelope } from './fx-envelope';

const linear = (over: Partial<FxWindow> = {}): FxWindow => ({
  inDelay: 0, inFrames: 0, outFrames: 0, easing: 'linear', ...over,
});

describe('envelope', () => {
  it('returns 1 when there is no window', () => {
    expect(envelope(undefined, 0, 60, true)).toBe(1);
    expect(envelope(undefined, 30, 60, true)).toBe(1);
  });

  it('returns 1 for a zero-length layer', () => {
    expect(envelope(linear({ inFrames: 10 }), 0, 0, true)).toBe(1);
  });

  it('ramps 0 to 1 across the entrance', () => {
    const w = linear({ inFrames: 10 });
    expect(envelope(w, 0, 60, true)).toBe(0);
    expect(envelope(w, 5, 60, true)).toBeCloseTo(0.5);
    expect(envelope(w, 10, 60, true)).toBe(1);
    expect(envelope(w, 40, 60, true)).toBe(1);
  });

  it('holds at 0 through inDelay, then ramps', () => {
    const w = linear({ inDelay: 6, inFrames: 10 });
    expect(envelope(w, 0, 60, true)).toBe(0);
    expect(envelope(w, 5, 60, true)).toBe(0);
    expect(envelope(w, 6, 60, true)).toBe(0);
    expect(envelope(w, 11, 60, true)).toBeCloseTo(0.5);
    expect(envelope(w, 16, 60, true)).toBe(1);
  });

  it('ignores inDelay when there is no entrance', () => {
    expect(envelope(linear({ inDelay: 20 }), 0, 60, true)).toBe(1);
  });

  it('ramps 1 to 0 across the exit, reaching 0 on the last rendered frame', () => {
    // duration 60 -> frames 0..59, lastFrame 59, outStart 49
    const w = linear({ outFrames: 10 });
    expect(envelope(w, 40, 60, true)).toBe(1);
    expect(envelope(w, 49, 60, true)).toBe(1);
    expect(envelope(w, 54, 60, true)).toBeCloseTo(0.5);
    expect(envelope(w, 59, 60, true)).toBe(0);
  });

  it('applies entrance and exit together', () => {
    const w = linear({ inFrames: 10, outFrames: 10 });
    expect(envelope(w, 0, 60, true)).toBe(0);
    expect(envelope(w, 10, 60, true)).toBe(1);
    expect(envelope(w, 30, 60, true)).toBe(1);
    expect(envelope(w, 59, 60, true)).toBe(0);
  });

  it('multiplies rather than mins, so overlapping windows never reach full', () => {
    // duration 12 -> lastFrame 11, outStart 1. Entrance and exit overlap.
    const w = linear({ inFrames: 10, outFrames: 10 });
    const mid = envelope(w, 6, 12, true);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it('preserves easing overshoot when clamp is false', () => {
    const w = linear({ inFrames: 10, easing: 'ease-out-back' });
    const peak = Math.max(
      ...[6, 7, 8, 9].map((f) => envelope(w, f, 60, false)),
    );
    expect(peak).toBeGreaterThan(1);
  });

  it('clips overshoot when clamp is true', () => {
    const w = linear({ inFrames: 10, easing: 'ease-out-back' });
    for (let f = 0; f <= 20; f++) {
      const v = envelope(w, f, 60, true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
