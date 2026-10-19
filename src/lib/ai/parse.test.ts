import { describe, expect, it } from 'vitest';
import { parseGenerationResponse } from './parse';
import { convertGeneratedScenes } from './generate';
import { LAYER_FX_SPECS } from '../fx-schema';
import { TRANSITION_TYPES } from '../transition-options';

// A0.4: a canned model response with valid FX, an unknown FX type,
// out-of-range numbers, a bad select value, a bad colour and an unknown
// transition.
const RESPONSE = JSON.stringify([
  {
    label: 'Intro',
    durationSeconds: 2,
    backgroundColor: '#101010',
    sceneFx: [
      { type: 'vignette', amount: 0.4, radius: 0.5 },
      { type: 'grain', amount: 7, scale: 0 },      // both out of range
      { type: 'lens-flare', amount: 1 },             // unknown
    ],
    transition: 'spin-cube',
    layers: [
      {
        name: 'Title', type: 'text', content: 'Hello', x: 540, y: 400, width: 900, height: 120,
        layerFx: [
          {
            type: 'wipe', shape: 'diagonal', angle: 720, softness: 20,   // bad select, angle too big
            window: { inDelay: 3, inFrames: 18, outFrames: 6, easing: 'ease-out-back' },
          },
          { type: 'glow', color: 'hotpink', radius: 30, intensity: 2, pulseFrames: 0 }, // bad colour
          { type: 'sparkle-storm', density: 3 },                                         // unknown
          { type: 'pixelate', maxBlock: 30, window: { inDelay: -1, inFrames: 4.5, outFrames: 0, easing: 'zoomy' } },
          { type: 'outline', color: '#ff0000', width: 'thick' },                          // non-numeric width
        ],
      },
    ],
  },
  {
    label: 'Next', durationSeconds: 2, backgroundColor: '#202020', transition: 'wipe-vertical',
    layers: [{ name: 'Bar', type: 'shape', shapeType: 'rect', x: 540, y: 960, width: 400, height: 10 }],
  },
]);

describe('parseGenerationResponse: FX and transitions (A0.4)', () => {
  const { scenes } = parseGenerationResponse(RESPONSE, 'full-composition');
  const [intro, next] = scenes!;
  const fx = intro.layers[0].layerFx!;

  it('keeps only known layer FX, in order', () => {
    expect(fx.map((f) => f.type)).toEqual(['wipe', 'glow', 'pixelate', 'outline']);
  });

  it('clamps numbers and drops a bad select value, keeping a valid window', () => {
    expect(fx[0]).toEqual({
      type: 'wipe', shape: 'linear', angle: 360, softness: 20,
      edgeGlow: 0, edgeColor: '#ff6a3d', sparks: 0,
      window: { inDelay: 3, inFrames: 18, outFrames: 6, easing: 'ease-out-back' },
    });
  });

  it('drops a bad colour back to the default', () => {
    expect(fx[1]).toEqual({ type: 'glow', color: '#e94560', radius: 30, intensity: 2, pulseFrames: 0 });
  });

  it('replaces an invalid window with the default one', () => {
    expect(fx[2]).toEqual({ ...LAYER_FX_SPECS.pixelate.defaults, maxBlock: 30 });
    expect(fx[2].window).not.toBe(LAYER_FX_SPECS.pixelate.defaults.window);
  });

  it('ignores a non-numeric number field', () => {
    expect(fx[3]).toEqual({ type: 'outline', color: '#ff0000', width: 6 });
  });

  it('validates scene FX the same way', () => {
    expect(intro.sceneFx).toEqual([
      { type: 'vignette', amount: 0.4, radius: 0.5 },
      { type: 'grain', amount: 1, scale: 1 },
    ]);
  });

  it('turns an unknown transition into fade and keeps a known one', () => {
    expect(intro.transition).toBe('fade');
    expect(next.transition).toBe('wipe-vertical');
  });

  it('leaves layers and scenes without FX alone', () => {
    expect(next.sceneFx).toBeUndefined();
    expect(next.layers[0].layerFx).toBeUndefined();
  });

  it('carries the FX into real scenes', () => {
    const [s1, s2] = convertGeneratedScenes(scenes!, 30);
    expect(s1.layers[0].layerFx).toEqual(fx);
    expect(s1.sceneFx).toEqual(intro.sceneFx);
    expect(s1.transition).toBe('fade');
    expect(s2.transition).toBe('wipe-vertical');
    expect(s2.layers[0].layerFx).toBeUndefined();
    expect(s2.sceneFx).toBeUndefined();
  });

  it('accepts every transition in the shared list', () => {
    for (const t of TRANSITION_TYPES) {
      const raw = JSON.stringify([{ label: 'x', transition: t, layers: [{ name: 'a', type: 'shape' }] }]);
      expect(parseGenerationResponse(raw, 'add-scenes').scenes![0].transition).toBe(t);
    }
  });
});

describe('parseGenerationResponse: lens layers (R3.6)', () => {
  const raw = JSON.stringify([{
    label: 'Lens', durationSeconds: 2, backgroundColor: '#000000', transition: 'cut',
    layers: [
      { name: 'Product', type: 'shape', x: 540, y: 960, width: 600, height: 600 },
      {
        name: 'Magnifier', type: 'lens', x: 300, y: 960, width: 300, height: 300,
        shape: 'hexagon', feather: 500, intensity: 0.7, mode: 'magnify', magnify: 9, ink: 'red',
        ring: { color: '#00ffcc', width: 6 },
        layerFx: [{ type: 'glow', color: '#ffffff', radius: 10, intensity: 1, pulseFrames: 0 }],
        animation: [{ property: 'x', from: 300, to: 780, startFrame: 0, endFrame: 50, easing: 'ease-in-out' }],
      },
      { name: 'Bad mode', type: 'lens', x: 1, y: 1, width: 10, height: 10, mode: 'x-ray', ring: null },
    ],
  }]);
  const { scenes } = parseGenerationResponse(raw, 'full-composition');
  const [product, magnifier, bad] = scenes![0].layers;

  it('validates lens fields on the lens defaults', () => {
    expect(magnifier.type).toBe('lens');
    expect(magnifier.lens).toMatchObject({
      shape: 'circle', feather: 120, intensity: 0.7, mode: 'magnify', magnify: 6,
      ring: { color: '#00ffcc', width: 6 },
    });
    expect(magnifier.lens!.ink).toBeUndefined();
    expect(magnifier.layerFx).toBeUndefined();
    expect(product.lens).toBeUndefined();
  });

  it('falls back to the default mode and honours ring: null', () => {
    expect(bad.lens!.mode).toBe('magnify');
    expect(bad.lens!.ring).toBeNull();
  });

  it('converts into a real lens layer, above the layer listed before it', () => {
    const [scene] = convertGeneratedScenes(scenes!, 30);
    const lens = scene.layers[1];
    expect(lens.type).toBe('lens');
    expect(lens.zIndex).toBeGreaterThan(scene.layers[0].zIndex);
    if (lens.type === 'lens') {
      expect(lens.magnify).toBe(6);
      expect(lens.keyframes.x.keyframes.map((k) => k.value)).toEqual([300, 780]);
    }
  });
});
