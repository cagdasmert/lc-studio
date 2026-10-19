import { describe, expect, it } from 'vitest';
import { buildMessages } from './prompts';
import { LAYER_FX_TYPES, SCENE_FX_TYPES } from '../fx-schema';
import { TRANSITION_TYPES } from '../transition-options';

const output = { id: 'o', label: 'o', width: 1080, height: 1920, fps: 30 };
const system = buildMessages('full-composition', 'a promo', output)[0].content;

describe('the full-composition system prompt (A0.4)', () => {
  it('names every layer FX', () => {
    for (const t of LAYER_FX_TYPES) expect(system).toContain(`- ${t} (`);
  });

  it('names every scene FX', () => {
    for (const t of SCENE_FX_TYPES) expect(system).toContain(`- ${t} (`);
  });

  it('names every transition except none', () => {
    for (const t of TRANSITION_TYPES.filter((x) => x !== 'none')) expect(system).toContain(`"${t}"`);
  });

  it('explains reveal windows and shows FX in the example', () => {
    for (const key of ['inDelay', 'inFrames', 'outFrames', 'easing']) expect(system).toContain(`"${key}"`);
    expect(system).toContain('"layerFx": [');
    expect(system).toContain('"sceneFx": [');
  });
});
