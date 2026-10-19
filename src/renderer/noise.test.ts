import { describe, expect, it } from 'vitest';
import { hash, hash4, signedHash } from './noise';

describe('hash', () => {
  it('returns the same value for the same inputs', () => {
    expect(hash(12, 7)).toBe(hash(12, 7));
  });

  it('returns different values for different inputs', () => {
    expect(hash(12, 7)).not.toBe(hash(12, 8));
  });

  it('stays in [0, 1)', () => {
    for (let i = 0; i < 500; i++) {
      const v = hash(i, i * 31);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('signedHash', () => {
  it('stays in [-1, 1)', () => {
    for (let i = 0; i < 500; i++) {
      const v = signedHash(i, 4001);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('hash4', () => {
  it('equals hash with four arguments, exactly', () => {
    for (let a = -3; a < 40; a += 7) for (let b = 0; b < 1920; b += 113) for (const c of [0, 1, 29, 4111]) for (const d of [24, 25, 28, 29]) {
      expect(hash4(a, b, c, d)).toBe(hash(a, b, c, d));
    }
    expect(hash4(1.6, 2.4, -0.5, 7)).toBe(hash(1.6, 2.4, -0.5, 7));
  });
});
