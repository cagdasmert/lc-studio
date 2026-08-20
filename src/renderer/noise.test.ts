import { describe, expect, it } from 'vitest';
import { hash, signedHash } from './noise';

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
