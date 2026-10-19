import { describe, expect, it } from 'vitest';
import { BINARY, CIPHER, RAMP, drawGlyph, glyph, litCount, packRgba } from './glyphs';

describe('glyph table (A2.1)', () => {
  for (const [name, set] of [['RAMP', RAMP], ['CIPHER', CIPHER]] as const) {
    it(`${name}: every glyph is distinct and fits in 25 bits`, () => {
      expect(new Set(set).size).toBe(set.length);
      for (const g of set) {
        expect(Number.isInteger(g)).toBe(true);
        expect(g).toBeGreaterThanOrEqual(0);
        expect(g).toBeLessThan(2 ** 25);
      }
    });
  }

  it('RAMP runs from blank to full block, ordered by lit count', () => {
    const counts = RAMP.map(litCount);
    expect(counts[0]).toBe(0);
    expect(counts[counts.length - 1]).toBe(25);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThan(counts[i - 1]);
    expect(RAMP.length).toBeGreaterThanOrEqual(8);
  });

  it('CIPHER has about 36 glyphs, none blank, and BINARY comes from it', () => {
    expect(CIPHER.length).toBeGreaterThanOrEqual(34);
    expect(CIPHER.every((g) => litCount(g) > 0)).toBe(true);
    for (const g of BINARY) expect(CIPHER).toContain(g);
  });

  it('packs bit row × 5 + col, row 0 at the top, col 0 at the left', () => {
    expect(glyph(['#....', '.....', '.....', '.....', '.....'])).toBe(1);
    expect(glyph(['.....', '.....', '.....', '.....', '....#'])).toBe(2 ** 24);
    expect(glyph(['.#...', '.....', '.....', '.....', '.....'])).toBe(2);
    expect(glyph(['.....', '#....', '.....', '.....', '.....'])).toBe(32);
  });
});

describe('drawGlyph', () => {
  it('scales a glyph to a cell, nearest-neighbour, and clips to the buffer', () => {
    const W = 12;
    const buf = new Uint32Array(W * 12);
    const ink = packRgba(10, 20, 30, 255);
    const corner = glyph(['#....', '.....', '.....', '.....', '....#']);
    drawGlyph(buf, W, 0, 0, 10, corner, ink);
    expect(buf[0]).toBe(ink);
    expect(buf[1 * W + 1]).toBe(ink);   // the top-left glyph pixel covers 2×2
    expect(buf[2 * W + 2]).toBe(0);
    expect(buf[9 * W + 9]).toBe(ink);   // bottom-right
    drawGlyph(buf, W, 8, 8, 10, corner, ink); // runs off the edge: no throw, clipped
    expect(buf[8 * W + 8]).toBe(ink);
  });

  it('packs little-endian RGBA', () => {
    const px = new Uint8ClampedArray(new Uint32Array([packRgba(1, 2, 3, 4)]).buffer);
    expect(Array.from(px)).toEqual([1, 2, 3, 4]);
  });
});
