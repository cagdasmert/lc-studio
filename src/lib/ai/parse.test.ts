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
