/**
 * Bitmap glyphs for effects that draw characters (decrypt, and later the
 * ASCII lens and transition). Each glyph is a 5×5 bitmap packed into a 25-bit
 * integer: bit `row × 5 + col`, row 0 at the top, col 0 at the left. They
 * never depend on installed fonts, so every webview draws the same pixels.
 *
 * The shapes are original to lc-studio.
 */

/** Pack five rows of '#' (lit) and '.' (dark). */
export function glyph(rows: string[]): number {
  let bits = 0;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (rows[r][c] === '#') bits |= 1 << (r * 5 + c);
    }
  }
  return bits >>> 0;
}

/** How many of a glyph's 25 pixels are lit. */
export function litCount(bits: number): number {
  let n = 0;
  for (let b = bits >>> 0; b; b >>>= 1) n += b & 1;
  return n;
}

/** Density ramp, blank to full block, ordered by lit-pixel count. */
export const RAMP: readonly number[] = [
  ['.....', '.....', '.....', '.....', '.....'], // 0
  ['.....', '.....', '..#..', '.....', '.....'], // 1
  ['.....', '..#..', '.....', '..#..', '.....'], // 2
  ['.....', '.....', '.###.', '.....', '.....'], // 3
  ['.....', '..#..', '.###.', '..#..', '.....'], // 5
  ['.....', '#####', '.....', '#####', '.....'], // 10
  ['#.#.#', '.#.#.', '#.#.#', '.#.#.', '#.#.#'], // 13
  ['.#.#.', '#####', '.#.#.', '#####', '.#.#.'], // 16
  ['.###.', '#####', '#####', '#####', '.###.'], // 21
  ['#####', '#####', '#####', '#####', '#####'], // 25
].map(glyph);

const ZERO = glyph(['.###.', '#..##', '#.#.#', '##..#', '.###.']);
const ONE = glyph(['..#..', '.##..', '..#..', '..#..', '.###.']);

/** Letter-, digit- and symbol-like shapes for scrambling cipher text. */
export const CIPHER: readonly number[] = [
  ['.###.', '#...#', '#####', '#...#', '#...#'], // A
  ['####.', '#...#', '####.', '#...#', '####.'], // B
  ['.####', '#....', '#....', '#....', '.####'], // C
  ['####.', '#...#', '#...#', '#...#', '####.'], // D
  ['#####', '#....', '####.', '#....', '#####'], // E
  ['#####', '#....', '####.', '#....', '#....'], // F
  ['.####', '#....', '#..##', '#...#', '.###.'], // G
  ['#...#', '#...#', '#####', '#...#', '#...#'], // H
  ['#####', '..#..', '..#..', '..#..', '#####'], // I
  ['..###', '...#.', '...#.', '#..#.', '.##..'], // J
  ['#..#.', '#.#..', '##...', '#.#..', '#..#.'], // K
  ['#....', '#....', '#....', '#....', '#####'], // L
  ['#...#', '##.##', '#.#.#', '#...#', '#...#'], // M
  ['#...#', '##..#', '#.#.#', '#..##', '#...#'], // N
  ['####.', '#...#', '####.', '#....', '#....'], // P
  ['.###.', '#...#', '#.#.#', '#..#.', '.##.#'], // Q
  ['####.', '#...#', '####.', '#..#.', '#...#'], // R
  ['.####', '#....', '.###.', '....#', '####.'], // S
  ['#####', '..#..', '..#..', '..#..', '..#..'], // T
  ['#...#', '#...#', '#...#', '#...#', '.###.'], // U
  ['#...#', '#...#', '.#.#.', '.#.#.', '..#..'], // V
  ['#...#', '#...#', '#.#.#', '##.##', '#...#'], // W
  ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'], // X
  ['#...#', '.#.#.', '..#..', '..#..', '..#..'], // Y
  ['#####', '...#.', '..#..', '.#...', '#####'], // Z
  ['.###.', '#...#', '..##.', '.#...', '#####'], // 2
  ['####.', '....#', '.###.', '....#', '####.'], // 3
  ['#..#.', '#..#.', '#####', '...#.', '...#.'], // 4
  ['.###.', '#....', '####.', '#...#', '.###.'], // 6
  ['#####', '....#', '...#.', '..#..', '..#..'], // 7
  ['.###.', '#...#', '.###.', '#...#', '.###.'], // 8
  ['##.##', '.....', '##.##', '.....', '##.##'], // ::
  ['..#..', '#.#.#', '.###.', '#.#.#', '..#..'], // *
  ['#...#', '...#.', '..#..', '.#...', '#...#'], // %
  ['.##..', '#..#.', '.##..', '#..#.', '.##.#'], // &
  ['..#..', '.#.#.', '#...#', '.....', '.....'], // ^
].map(glyph).concat([ZERO, ONE]);

/** The two digits, for the decrypt 'binary' charset. */
export const BINARY: readonly number[] = [ZERO, ONE];

/**
 * Draw `bits` into an RGBA buffer viewed as Uint32 (one pixel per element),
 * scaled to a `cellPx` square at (x, y), nearest-neighbour. Lit pixels get
 * `rgba` (a packed little-endian RGBA value); dark ones are left alone.
 * Pixels outside the buffer are clipped.
 */
export function drawGlyph(
  buf: Uint32Array, bufW: number, x: number, y: number, cellPx: number, bits: number, rgba: number,
): void {
  const bufH = Math.floor(buf.length / bufW);
  for (let py = 0; py < cellPx; py++) {
    const ty = y + py;
    if (ty < 0 || ty >= bufH) continue;
    const row = Math.min(4, Math.floor((py * 5) / cellPx));
    for (let px = 0; px < cellPx; px++) {
      const tx = x + px;
      if (tx < 0 || tx >= bufW) continue;
      const col = Math.min(4, Math.floor((px * 5) / cellPx));
      if (bits & (1 << (row * 5 + col))) buf[ty * bufW + tx] = rgba;
    }
  }
}

/** Pack r, g, b, a (0–255) the way a little-endian Uint32 view of ImageData reads them. */
export function packRgba(r: number, g: number, b: number, a: number): number {
  return ((a & 255) << 24 | (b & 255) << 16 | (g & 255) << 8 | (r & 255)) >>> 0;
}
