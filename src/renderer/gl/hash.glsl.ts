/**
 * An exact GLSL ES 3.00 port of `hash` in src/renderer/noise.ts, for shaders
 * that need the same deterministic randomness as the 2D renderer. uint
 * multiplication wraps mod 2³², like Math.imul; inputs are rounded the way
 * Math.round rounds (half up), not with GLSL's round(), whose tie-breaking is
 * implementation-defined.
 *
 * Paste into a '300 es' shader; it defines lcsHash1 … lcsHash4, returning a
 * float in [0, 1) equal to hash(a, …) to within float precision.
 */
export const HASH_GLSL = `
uint lcsFold(uint h, float v) {
  uint x = uint(int(floor(v + 0.5))) * 374761393u;
  x = x ^ (x >> 15u);
  h = (h ^ x) * 16777619u;
  return h ^ (h >> 13u);
}
float lcsFinish(uint h) { return float(h ^ (h >> 16u)) / 4294967296.0; }
float lcsHash1(float a) { return lcsFinish(lcsFold(2166136261u, a)); }
float lcsHash2(float a, float b) { return lcsFinish(lcsFold(lcsFold(2166136261u, a), b)); }
float lcsHash3(float a, float b, float c) { return lcsFinish(lcsFold(lcsFold(lcsFold(2166136261u, a), b), c)); }
float lcsHash4(float a, float b, float c, float d) { return lcsFinish(lcsFold(lcsFold(lcsFold(lcsFold(2166136261u, a), b), c), d)); }
`;
