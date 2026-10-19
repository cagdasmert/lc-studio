import { describe, expect, it } from 'vitest';
import { parseDefault, parseUniformDefaults, withOverrides } from './uniforms';
import { GL_TRANSITION_SOURCES, GL_TRANSITION_TYPES, shaderProgress, transitionDefaults, wrapGlTransition } from './transitions';

describe('parseDefault', () => {
  it('reads floats, ints, bools and vectors, splatting a single vector argument', () => {
    expect(parseDefault('float', ' 0.7')).toEqual({ type: 'float', value: 0.7 });
    expect(parseDefault('int', '3')).toEqual({ type: 'int', value: 3 });
    expect(parseDefault('bool', 'true')).toEqual({ type: 'int', value: 1 });
    expect(parseDefault('ivec2', 'ivec2(4)')).toEqual({ type: 'ivec2', value: [4, 4] });
    expect(parseDefault('vec4', 'vec4(0.0, 0.0, 0.0, 1.0)')).toEqual({ type: 'vec4', value: [0, 0, 0, 1] });
  });

  it('rejects what it cannot read', () => {
    expect(parseDefault('float', 'abc')).toBeNull();
    expect(parseDefault('int', '2.5')).toBeNull();
    expect(parseDefault('vec3', 'vec3(1, 2)')).toBeNull();
    expect(parseDefault('ivec2', 'ivec2(1.5)')).toBeNull();
    expect(parseDefault('sampler2D', 'x')).toBeNull();
  });
});

describe('the gl-transitions shaders', () => {
  it('give typed defaults, GridFlip included (ivec2 and vec4)', () => {
    expect(parseUniformDefaults(GL_TRANSITION_SOURCES['grid-flip'])).toEqual({
      size: { type: 'ivec2', value: [4, 4] },
      pause: { type: 'float', value: 0.1 },
      dividerWidth: { type: 'float', value: 0.05 },
      bgcolor: { type: 'vec4', value: [0, 0, 0, 1] },
      randomness: { type: 'float', value: 0.1 },
    });
    expect(parseUniformDefaults(GL_TRANSITION_SOURCES.cube)).toEqual({
      persp: { type: 'float', value: 0.7 }, unzoom: { type: 'float', value: 0.3 },
      reflection: { type: 'float', value: 0.4 }, floating: { type: 'float', value: 3 },
    });
    expect(transitionDefaults('crosswarp')).toEqual({});
  });

  it('keep their Author and License headers', () => {
    for (const source of Object.values(GL_TRANSITION_SOURCES)) {
      expect(source).toMatch(/\/\/ Author: /);
      expect(source).toMatch(/\/\/ License: (MIT|BSD 3 Clause)/);
    }
  });

  it('are wrapped per the gl-transitions spec', () => {
    const wrapped = wrapGlTransition(GL_TRANSITION_SOURCES.crosswarp);
    expect(wrapped).toContain('uniform sampler2D from, to;');
    expect(wrapped).toContain('uniform float progress, ratio;');
    expect(wrapped).toContain('gl_FragColor = transition(v_uv);');
  });

  it('cover every GL transition but ascii-sweep, which is lc-studio’s own', () => {
    expect([...Object.keys(GL_TRANSITION_SOURCES), 'ascii-sweep'].sort()).toEqual([...GL_TRANSITION_TYPES].sort());
  });
});

describe('withOverrides', () => {
  const defaults = parseUniformDefaults(GL_TRANSITION_SOURCES['grid-flip']);

  it('overrides float uniforms only, and ignores unknown names', () => {
    const out = withOverrides(defaults, { pause: 0.2, size: 9, nope: 1, randomness: Number.NaN });
    expect(out.pause).toEqual({ type: 'float', value: 0.2 });
    expect(out.size).toEqual(defaults.size);
    expect(out.randomness).toEqual(defaults.randomness);
    expect(out).not.toHaveProperty('nope');
  });

  it('returns the defaults when there are no overrides', () => {
    expect(withOverrides(defaults, undefined)).toBe(defaults);
  });
});

describe('shaderProgress', () => {
  it('passes progress through, except page-curl, which starts with its curl off the page', () => {
    expect(shaderProgress('cube', 0.3)).toBe(0.3);
    // page-curl: amount = p × 1.66 − 0.16 must be ≤ −0.43 at the start (the
    // corner (1, 1) rotated sits at y ≈ −0.268; flat needs y − amount > 1/(2π)).
    const amount = (p: number) => p * 1.66 - 0.16;
    expect(amount(shaderProgress('page-curl', 0))).toBeLessThan(-0.268 - 1 / (2 * Math.PI));
    expect(shaderProgress('page-curl', 1)).toBeCloseTo(1, 12);
    const a = shaderProgress('page-curl', 0.25) - shaderProgress('page-curl', 0);
    const b = shaderProgress('page-curl', 0.5) - shaderProgress('page-curl', 0.25);
    expect(a).toBeCloseTo(b, 12); // still linear
  });
});
