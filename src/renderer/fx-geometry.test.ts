import { describe, expect, it } from 'vitest';
import { bandOrderPosition, bandProgress } from './fx-geometry';

describe('bandOrderPosition', () => {
  it('returns 0 for a single band', () => {
    expect(bandOrderPosition(0, 1, 'sequential')).toBe(0);
    expect(bandOrderPosition(0, 1, 'center-out')).toBe(0);
  });

  it('spreads sequential bands evenly from 0 to 1', () => {
    expect(bandOrderPosition(0, 5, 'sequential')).toBe(0);
    expect(bandOrderPosition(2, 5, 'sequential')).toBeCloseTo(0.5);
    expect(bandOrderPosition(4, 5, 'sequential')).toBe(1);
  });

  it('puts the centre band first for an odd count', () => {
    expect(bandOrderPosition(2, 5, 'center-out')).toBe(0);
    expect(bandOrderPosition(0, 5, 'center-out')).toBe(1);
    expect(bandOrderPosition(4, 5, 'center-out')).toBe(1);
  });

  it('puts the two centre bands first for an even count', () => {
    expect(bandOrderPosition(1, 4, 'center-out')).toBe(0);
    expect(bandOrderPosition(2, 4, 'center-out')).toBe(0);
    expect(bandOrderPosition(0, 4, 'center-out')).toBe(1);
    expect(bandOrderPosition(3, 4, 'center-out')).toBe(1);
  });

  it('starts both bands together when there are only two', () => {
    // The naive |i-mid|/mid would give both 1, delaying every band there is.
    expect(bandOrderPosition(0, 2, 'center-out')).toBe(0);
    expect(bandOrderPosition(1, 2, 'center-out')).toBe(0);
  });

  it('is deterministic for random order', () => {
    expect(bandOrderPosition(3, 10, 'random')).toBe(bandOrderPosition(3, 10, 'random'));
  });

  it('stays in [0, 1] for every order and band count', () => {
    for (const order of ['sequential', 'center-out', 'random'] as const) {
      for (let bands = 1; bands <= 24; bands++) {
        for (let i = 0; i < bands; i++) {
          const v = bandOrderPosition(i, bands, order);
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe('bandProgress', () => {
  it('gives every band the same progress at zero stagger', () => {
    expect(bandProgress(0.4, 0, 0)).toBeCloseTo(0.4);
    expect(bandProgress(0.4, 1, 0)).toBeCloseTo(0.4);
  });

  it('delays later bands as stagger rises', () => {
    expect(bandProgress(0.5, 0, 0.5)).toBeGreaterThan(bandProgress(0.5, 1, 0.5));
  });

  it('clamps stagger so it never divides by zero', () => {
    expect(Number.isFinite(bandProgress(0.5, 0.5, 1))).toBe(true);
    expect(Number.isFinite(bandProgress(0.5, 0.5, 5))).toBe(true);
  });

  it('clamps output to [0, 1]', () => {
    expect(bandProgress(-1, 0, 0)).toBe(0);
    expect(bandProgress(2, 0, 0)).toBe(1);
  });
});
