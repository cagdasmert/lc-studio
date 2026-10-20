import type { LensLayerData } from '../types';
import { runPassInto, type ProgramDef } from './gl/pass';
import type { Uniforms } from './gl/uniforms';
import { liveImpulses, MAX_LIVE_IMPULSES, RIPPLE_DEFAULTS } from './lens-ripple';
import type { Matrix } from './lens';

/**
 * The lens modes that need WebGL2: 'refract' (a glass dome) and 'ripple'
 * (rings from impulses). Both displace where each pixel of the snapshot is
 * sampled from, in the lens's own coordinates, so rotation and scale carry
 * through. Without WebGL they pass the backdrop through unchanged.
 */

export const REFRACT_DEFAULTS = { strength: 24, dispersion: 0.3, highlight: 0.4 };

// Shared head: the fragment's position in snapshot pixels (y down) and in the
// lens's local box, and a sampler that maps local coordinates back.
const HEAD = `#version 300 es
precision highp float;
uniform sampler2D u_src;
uniform vec2 u_res;     // snapshot size, px
uniform mat3 u_m;       // lens local px -> snapshot px
uniform mat3 u_minv;    // snapshot px -> lens local px
uniform vec2 u_size;    // lens box, local px
out vec4 o_color;
vec2 snapPx() { return vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y); }
vec2 toLocal(vec2 p) { return (u_minv * vec3(p, 1.0)).xy; }
vec4 sampleLocal(vec2 local) {
  vec2 p = (u_m * vec3(local, 1.0)).xy;
  return texture(u_src, vec2(p.x / u_res.x, 1.0 - p.y / u_res.y));
}
`;

const REFRACT: ProgramDef = {
  name: 'lens:refract', version: '300 es', samplers: ['u_src'],
  fragment: `${HEAD}
uniform float u_circle;     // 1 = circle (radius min(w, h) / 2), 0 = box
uniform float u_strength;   // px, already × intensity
uniform float u_dispersion; // 0–1
uniform float u_highlight;  // 0–1
void main() {
  vec2 local = toLocal(snapPx());
  vec2 half_ = u_size * 0.5;
  vec2 radius = u_circle > 0.5 ? vec2(min(half_.x, half_.y)) : half_;
  vec2 n = (local - half_) / radius;   // the dome's normal, xy part: 0 at the centre, 1 at the rim
  float r = length(n);
  if (r > 1.0) n /= r;
  // Sample along the normal, towards the centre: a glass dome magnifies.
  vec2 d = -u_strength * n;
  float k = u_dispersion * 0.5;
  vec4 g = sampleLocal(local + d);
  vec4 c = vec4(sampleLocal(local + d * (1.0 + k)).r, g.g, sampleLocal(local + d * (1.0 - k)).b, g.a);
  vec3 N = normalize(vec3(n, sqrt(max(0.0, 1.0 - min(r, 1.0) * min(r, 1.0)))));
  float spec = u_highlight * pow(max(dot(N, normalize(vec3(-0.45, -0.55, 0.7))), 0.0), 24.0);
  c.rgb = min(c.rgb + spec * c.a, vec3(c.a));
  o_color = c;
}`,
};

const RIPPLE: ProgramDef = {
  name: 'lens:ripple', version: '300 es', samplers: ['u_src'],
  fragment: `${HEAD}
uniform vec4 u_imp[${MAX_LIVE_IMPULSES}]; // x, y (local px), age (frames), unused
uniform int u_count;
uniform float u_amplitude;  // px of height, already × intensity
uniform float u_wavelength; // px
uniform float u_speed;      // px per frame
uniform float u_decay;      // per frame
uniform float u_refraction; // px of displacement per unit of slope
const float TAU = 6.283185307179586;
void main() {
  vec2 local = toLocal(snapPx());
  vec2 disp = vec2(0.0);
  for (int i = 0; i < ${MAX_LIVE_IMPULSES}; i++) {
    if (i >= u_count) break;
    vec2 dv = local - u_imp[i].xy;
    float r = length(dv);
    float front = u_speed * u_imp[i].z;
    float behind = front - r;
    // Rings live within two wavelengths behind the front, fading towards the back.
    if (r < 1e-3 || behind < 0.0 || behind > 2.0 * u_wavelength) continue;
    float height = u_amplitude * exp(-u_decay * u_imp[i].z) * (1.0 - behind / (2.0 * u_wavelength));
    float slope = height * (TAU / u_wavelength) * cos(TAU * (r - front) / u_wavelength);
    disp += slope * u_refraction * dv / r;
  }
  o_color = sampleLocal(local + disp);
}`,
};

const mat3 = (m: Matrix, ox: number, oy: number): number[] =>
  // Column-major, local -> snapshot px (the snapshot starts at ox, oy on the surface).
  [m.a, m.b, 0, m.c, m.d, 0, m.e - ox, m.f - oy, 1];

function invert(m: number[]): number[] {
  const [a, b, , c, d, , e, f] = m;
  const det = a * d - b * c || 1e-9;
  return [d / det, -b / det, 0, -c / det, a / det, 0, (c * f - d * e) / det, (b * e - a * f) / det, 1];
}

/**
 * Draw `snapshot` through the refract or ripple shader into `result`.
 * Returns false when WebGL is unavailable (the caller passes the backdrop through).
 */
export function runGlLens(
  lens: LensLayerData, intensity: number, frameInLayer: number,
  snapshot: HTMLCanvasElement, result: HTMLCanvasElement,
  m: Matrix, ox: number, oy: number, w: number, h: number,
): boolean {
  const rctx = result.getContext('2d');
  if (!rctx) return false;
  const toSnap = mat3(m, ox, oy);
  const base: Uniforms = {
    u_res: { type: 'vec2', value: [snapshot.width, snapshot.height] },
    u_m: { type: 'mat3', value: toSnap },
    u_minv: { type: 'mat3', value: invert(toSnap) },
    u_size: { type: 'vec2', value: [w, h] },
  };
  if (lens.mode === 'refract') {
    return runPassInto(rctx, 0, 0, snapshot.width, snapshot.height, REFRACT, [snapshot], {
      ...base,
      u_circle: { type: 'float', value: lens.shape === 'circle' ? 1 : 0 },
      u_strength: { type: 'float', value: (lens.strength ?? REFRACT_DEFAULTS.strength) * intensity },
      u_dispersion: { type: 'float', value: lens.dispersion ?? REFRACT_DEFAULTS.dispersion },
      u_highlight: { type: 'float', value: lens.highlight ?? REFRACT_DEFAULTS.highlight },
    });
  }
  const live = liveImpulses(lens, frameInLayer);
  if (live.length === 0) {
    // Nothing rippling: the backdrop exactly as it is.
    rctx.drawImage(snapshot, 0, 0);
    return true;
  }
  const imp = new Array(MAX_LIVE_IMPULSES * 4).fill(0);
  live.forEach((i, k) => { imp[k * 4] = i.x * w; imp[k * 4 + 1] = i.y * h; imp[k * 4 + 2] = i.age; });
  const r = RIPPLE_DEFAULTS;
  return runPassInto(rctx, 0, 0, snapshot.width, snapshot.height, RIPPLE, [snapshot], {
    ...base,
    u_imp: { type: 'vec4[]', value: imp },
    u_count: { type: 'int', value: live.length },
    u_amplitude: { type: 'float', value: (lens.amplitude ?? r.amplitude) * intensity },
    u_wavelength: { type: 'float', value: Math.max(1, lens.wavelength ?? r.wavelength) },
    u_speed: { type: 'float', value: lens.speed ?? r.speed },
    u_decay: { type: 'float', value: lens.decay ?? r.decay },
    u_refraction: { type: 'float', value: lens.refraction ?? r.refraction },
  });
}
