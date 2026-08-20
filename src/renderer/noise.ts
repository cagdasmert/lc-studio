/**
 * Deterministic pseudo-randomness for effects.
 *
 * Effects must never call Math.random(): the preview and the FFmpeg render
 * draw the same frame at different times, and a project re-opened tomorrow
 * has to look like it did today. Everything here is a pure function of its
 * integer inputs, so frame N always produces the same values.
 */

/** Hash any number of integers to a float in [0, 1). */
export function hash(...values: number[]): number {
  let h = 2166136261 >>> 0;
  for (const v of values) {
    // Fold the value in as 32 bits, then avalanche (FNV-1a + xorshift)
    let x = Math.imul(Math.round(v), 374761393) >>> 0;
    x = (x ^ (x >>> 15)) >>> 0;
    h = Math.imul(h ^ x, 16777619) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
  }
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Hash to a float in [-1, 1). */
export function signedHash(...values: number[]): number {
  return hash(...values) * 2 - 1;
}

/**
 * Smooth 1D value noise in [-1, 1] — successive t values move continuously
 * instead of flickering, which is what shake and wobble want.
 */
export function smoothNoise(t: number, seed = 0): number {
  const i = Math.floor(t);
  const f = t - i;
  const a = signedHash(i, seed);
  const b = signedHash(i + 1, seed);
  // Smoothstep between the two lattice points
  const u = f * f * (3 - 2 * f);
  return a * (1 - u) + b * u;
}
