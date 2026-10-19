import { runPassInto, type ProgramDef } from './gl/pass';

/**
 * VHS tube curvature (`barrel`), drawn by WebGL2 after the 2D VHS passes:
 * the picture bulges like a CRT face, black outside the tube. Without WebGL it
 * is skipped, and the Render panel says so.
 */
const BARREL: ProgramDef = {
  name: 'vhs:barrel', version: '300 es', samplers: ['u_src'],
  fragment: `#version 300 es
precision highp float;
uniform sampler2D u_src;
uniform vec2 u_resolution;
uniform float u_k;   // curvature: barrel × 0.35
in vec2 v_uv;
out vec4 o_color;
void main() {
  vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
  vec2 d = (v_uv - 0.5) * aspect;
  // Sample further out the further from the centre: the corners fall off the tube.
  vec2 uv = 0.5 + d * (1.0 + u_k * dot(d, d)) / aspect;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) { o_color = vec4(0.0, 0.0, 0.0, 1.0); return; }
  o_color = texture(u_src, uv);
}`,
};

/** Bend `surface` in place. Returns false (leaving it alone) without WebGL. */
export function applyVhsBarrel(surface: HTMLCanvasElement, barrel: number): boolean {
  if (barrel <= 0) return true;
  const ctx = surface.getContext('2d');
  if (!ctx) return false;
  return runPassInto(ctx, 0, 0, surface.width, surface.height, BARREL, [surface], {
    u_resolution: { type: 'vec2', value: [surface.width, surface.height] },
    u_k: { type: 'float', value: Math.min(1, barrel) * 0.35 },
  });
}
