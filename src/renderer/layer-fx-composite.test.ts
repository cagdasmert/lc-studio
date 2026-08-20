// @vitest-environment node
//
// The only test in the suite that needs a real 2D context. `compositeLayerFx`
// is handed the *scene* canvas, not a private one, so every compositing op it
// runs lands on the background and on every lower-zIndex layer already drawn.
// A test that composites onto a fresh, empty canvas cannot see that — an
// erase against nothing looks exactly like an erase against something. So the
// destination here is deliberately non-empty.
//
// node-canvas provides the context; `document` is shimmed rather than pulling
// in jsdom, because the renderer's only DOM dependency is
// `document.createElement('canvas')`.

import { beforeAll, describe, expect, it } from 'vitest';
import { createCanvas } from 'canvas';
import { compositeLayerFx } from './layer-fx';
import type { GlitchFx, LayerFxDef } from '../types';

beforeAll(() => {
  (globalThis as unknown as { document: unknown }).document = {
    createElement(tag: string) {
      if (tag !== 'canvas') throw new Error(`unexpected element <${tag}>`);
      return createCanvas(1, 1);
    },
  };
});

const DEST = 200;
const LAYER = 80;
/** Where the layer's top-left corner sits on the destination. */
const AT = 60;

/** Schema defaults from LAYER_FX_SPECS.glitch. */
function glitchFx(over: Partial<GlitchFx> = {}): GlitchFx {
  return {
    type: 'glitch', bands: 12, maxOffset: 30, channelShift: 6, probability: 0.25, ...over,
  };
}

/** Opaque red background — anything the layer erases shows up as a hole. */
function destination(): { canvas: ReturnType<typeof createCanvas>; ctx: CanvasRenderingContext2D } {
  const canvas = createCanvas(DEST, DEST);
  const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, DEST, DEST);
  return { canvas, ctx };
}

/** A solid green square, padded the way drawLayerAtFrame pads a bitmap FX layer. */
function layerBitmap(pad: number): HTMLCanvasElement {
  const c = createCanvas(LAYER + pad * 2, LAYER + pad * 2);
  const cx = c.getContext('2d');
  cx.fillStyle = '#00ff00';
  cx.fillRect(pad, pad, LAYER, LAYER);
  return c as unknown as HTMLCanvasElement;
}

function pixels(canvas: ReturnType<typeof createCanvas>): Uint8ClampedArray {
  return canvas.getContext('2d').getImageData(0, 0, DEST, DEST).data;
}

function composite(fx: LayerFxDef[], frame: number, pad: number) {
  const { canvas, ctx } = destination();
  ctx.save();
  ctx.translate(AT, AT);
  compositeLayerFx(ctx, layerBitmap(pad), fx, pad, frame, 60, 'none');
  ctx.restore();
  return { canvas, data: pixels(canvas) };
}

describe('compositeLayerFx does not erase its destination', () => {
  // 36 px of padding: maxOffset 30 + channelShift 6, per fxPadding().
  const pad = 36;

  // Frames chosen after checking they actually tear: at probability 0.25,
  // hash(frame, band, 4001) < 0.25 for at least one of the 12 bands.
  for (const frame of [3, 7, 11, 19]) {
    it(`leaves the background fully opaque at default probability (frame ${frame})`, () => {
      const { data } = composite([glitchFx()], frame, pad);
      let transparent = 0;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 255) transparent++;
      }
      expect(transparent).toBe(0);
    });
  }

  it('leaves the background fully opaque with every band tearing', () => {
    const { data } = composite([glitchFx({ probability: 1 })], 7, pad);
    let transparent = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 255) transparent++;
    }
    expect(transparent).toBe(0);
  });

  it('leaves red intact outside the layer footprint', () => {
    // The layer's reach. compositeLayerFx translates by -pad before drawing,
    // so the padded bitmap lands at (AT - pad) and spans LAYER + pad * 2.
    const lo = AT - pad;
    const hi = AT + LAYER + pad;
    const { data } = composite([glitchFx({ probability: 1 })], 7, pad);
    let touched = 0;
    for (let y = 0; y < DEST; y++) {
      for (let x = 0; x < DEST; x++) {
        if (x >= lo && x < hi && y >= lo && y < hi) continue;
        const i = (y * DEST + x) * 4;
        if (data[i] !== 255 || data[i + 1] !== 0 || data[i + 2] !== 0 || data[i + 3] !== 255) {
          touched++;
        }
      }
    }
    expect(touched).toBe(0);
  });

  it('still tears: some layer pixels move sideways', () => {
    // Compare against the same layer with the effect switched off. If the two
    // are identical the "no erase" assertions above would pass vacuously.
    const off = composite([], 7, pad).data;
    const on = composite([glitchFx({ probability: 1 })], 7, pad).data;
    let differing = 0;
    for (let i = 0; i < on.length; i += 4) {
      if (on[i] !== off[i] || on[i + 1] !== off[i + 1] || on[i + 2] !== off[i + 2]) differing++;
    }
    expect(differing).toBeGreaterThan(500);
  });

  it('is frame-deterministic', () => {
    const a = composite([glitchFx()], 7, pad).data;
    const b = composite([glitchFx()], 7, pad).data;
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

describe('compositeLayerFx with no FX', () => {
  it('draws the bitmap and nothing else', () => {
    const { data } = composite([], 0, 0);
    // Inside the layer: green. Outside: untouched red.
    const at = (x: number, y: number) => {
      const i = (y * DEST + x) * 4;
      return [data[i], data[i + 1], data[i + 2], data[i + 3]];
    };
    expect(at(AT + 10, AT + 10)).toEqual([0, 255, 0, 255]);
    expect(at(5, 5)).toEqual([255, 0, 0, 255]);
  });
});
