import type { TransitionType } from '../../../types';
import type { ProgramDef } from '../pass';
import { parseUniformDefaults, type Uniforms } from '../uniforms';
import { RAMP } from '../../glyphs';
import cube from './cube';
import doorway from './doorway';
import gridFlip from './grid-flip';
import waterDrop from './water-drop';
import crosswarp from './crosswarp';
import glitchDisplace from './glitch-displace';
import filmBurn from './film-burn';
import pageCurl from './page-curl';
import asciiSweep from './ascii-sweep';

/** The transitions drawn by a shader. Mirrors `gpu: true` in transition-options.ts; a test keeps them in sync. */
export const GL_TRANSITION_TYPES = [
  'cube', 'doorway', 'grid-flip', 'water-drop', 'crosswarp', 'glitch-displace', 'film-burn', 'page-curl', 'ascii-sweep',
] as const satisfies readonly TransitionType[];

export type GlTransitionType = typeof GL_TRANSITION_TYPES[number];

export function isGlTransition(type: TransitionType): type is GlTransitionType {
  return (GL_TRANSITION_TYPES as readonly string[]).includes(type);
}

/** The gl-transitions shaders, by lc-studio transition type. */
export const GL_TRANSITION_SOURCES: Record<Exclude<GlTransitionType, 'ascii-sweep'>, string> = {
  cube, doorway, 'grid-flip': gridFlip, 'water-drop': waterDrop, crosswarp,
  'glitch-displace': glitchDisplace, 'film-burn': filmBurn, 'page-curl': pageCurl,
};

/**
 * The gl-transitions spec's wrapper, in GLSL ES 1.00 (which WebGL2 accepts):
 * `from`/`to` samplers, `progress` and `ratio`, getFromColor/getToColor, and
 * gl_FragColor = transition(uv).
 */
export function wrapGlTransition(source: string): string {
  return `precision highp float;
uniform sampler2D from, to;
uniform float progress, ratio;
varying vec2 v_uv;
vec4 getFromColor(vec2 uv) { return texture2D(from, uv); }
vec4 getToColor(vec2 uv) { return texture2D(to, uv); }
${source}
void main() { gl_FragColor = transition(v_uv); }
`;
}

const programs = new Map<GlTransitionType, ProgramDef>();

export function transitionProgram(type: GlTransitionType): ProgramDef {
  let p = programs.get(type);
  if (!p) {
    p = type === 'ascii-sweep'
      ? { name: 'transition:ascii-sweep', version: '300 es', fragment: asciiSweep, samplers: ['u_from', 'u_to'] }
      : { name: `transition:${type}`, version: '100', fragment: wrapGlTransition(GL_TRANSITION_SOURCES[type]), samplers: ['from', 'to'] };
    programs.set(type, p);
  }
  return p;
}

/** ascii-sweep's own parameters (float uniforms, as with the shaders' `// =` defaults). */
export const ASCII_SWEEP_DEFAULTS: Uniforms = {
  u_cell: { type: 'float', value: 16 },
  u_band: { type: 'float', value: 0.3 },
  u_surge: { type: 'float', value: 0.8 },
};

/** Each transition's uniform defaults, from its shader's `// = value` comments. */
export function transitionDefaults(type: GlTransitionType): Uniforms {
  return type === 'ascii-sweep' ? ASCII_SWEEP_DEFAULTS : parseUniformDefaults(GL_TRANSITION_SOURCES[type]);
}

/**
 * The shader progress for a transition progress (still linear). InvertedPageCurl
 * starts with its corner already curled onto the page at progress 0 (its
 * `amount` starts at −0.16, and the curl is off the page only below about
 * −0.43), so lc-studio starts it a little earlier, at amount −0.44, for the
 * first frame to be the outgoing scene. The others run 0 → 1 as they are.
 */
export function shaderProgress(type: GlTransitionType, progress: number): number {
  if (type === 'page-curl') {
    const start = (-0.44 + 0.16) / 1.66; // amount = progress × 1.66 − 0.16
    return start + (1 - start) * progress;
  }
  return progress;
}

/** The uniforms every frame of a transition sets, besides the shader's own parameters. */
export function frameUniforms(type: GlTransitionType, progress: number, width: number, height: number): Uniforms {
  if (type === 'ascii-sweep') {
    return {
      u_progress: { type: 'float', value: progress },
      u_resolution: { type: 'vec2', value: [width, height] },
      u_ramp: { type: 'uint[]', value: [...RAMP] },
    };
  }
  return { progress: { type: 'float', value: shaderProgress(type, progress) }, ratio: { type: 'float', value: width / height } };
}
