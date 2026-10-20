import { getGl, glCanvas, glGeneration } from './context';
import type { UniformValue, Uniforms } from './uniforms';

/**
 * One full-screen GL pass, copied onto a 2D canvas.
 *
 * Inputs are uploaded as textures (premultiplied, no colour-space
 * conversion, flipped so uv (0,0) is the bottom-left as GL expects), one
 * full-screen triangle is drawn into a w×h viewport at the bottom-left of the
 * shared GL canvas, and that region is drawImage'd onto `target` at (dx, dy)
 * in the same task, under whatever transform `target` has.
 *
 * Shaders follow lc-studio's uniform convention (GLSL ES 3.00): u_progress,
 * u_frame (int), u_fps, u_resolution, u_seed, plus their own parameters.
 * Time never comes from a clock. gl-transitions shaders are GLSL ES 1.00 and
 * get their own wrapper (gl/transitions/index.ts).
 */

export interface ProgramDef {
  /** Cache key; one compiled program per name. */
  name: string;
  /** '300 es' sources start with `#version 300 es` and use `out vec4 o_color`; '100' sources write gl_FragColor. */
  version: '100' | '300 es';
  fragment: string;
  /** Sampler uniform names, bound to texture units 0, 1, … in this order, one per input. */
  samplers: string[];
}

const VERTEX_100 = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() { v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const VERTEX_300 = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() { v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;

interface Compiled {
  program: WebGLProgram;
  locations: Map<string, WebGLUniformLocation | null>;
}

let cacheGeneration = -1;
let programs = new Map<string, Compiled>();
let textures: WebGLTexture[] = [];
/** Each texture's allocated size, so same-size uploads reuse its storage (texSubImage2D). */
let textureSizes: string[] = [];
/** The caller's key for what each texture holds; an unchanged key skips the upload. */
let textureKeys: (string | null)[] = [];
let triangle: WebGLBuffer | null = null;

export class GlCompileError extends Error {}

function compile(gl: WebGL2RenderingContext, def: ProgramDef): Compiled {
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new GlCompileError(`${def.name}: ${log}`);
    }
    return s;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, shader(gl.VERTEX_SHADER, def.version === '100' ? VERTEX_100 : VERTEX_300));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, def.fragment));
  gl.bindAttribLocation(program, 0, 'a_pos');
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new GlCompileError(`${def.name}: ${gl.getProgramInfoLog(program)}`);
  }
  return { program, locations: new Map() };
}

function programFor(gl: WebGL2RenderingContext, def: ProgramDef): Compiled {
  if (cacheGeneration !== glGeneration()) {
    // A new (or restored) context: every GL object from before is gone.
    cacheGeneration = glGeneration();
    programs = new Map();
    textures = [];
    textureSizes = [];
    textureKeys = [];
    triangle = null;
  }
  let p = programs.get(def.name);
  if (!p) {
    p = compile(gl, def);
    programs.set(def.name, p);
  }
  return p;
}

function location(gl: WebGL2RenderingContext, p: Compiled, name: string): WebGLUniformLocation | null {
  if (!p.locations.has(name)) p.locations.set(name, gl.getUniformLocation(p.program, name));
  return p.locations.get(name) ?? null;
}

function setUniform(gl: WebGL2RenderingContext, loc: WebGLUniformLocation, u: UniformValue): void {
  switch (u.type) {
    case 'float': gl.uniform1f(loc, u.value); break;
    case 'int': gl.uniform1i(loc, u.value); break;
    case 'vec2': gl.uniform2fv(loc, u.value); break;
    case 'vec3': gl.uniform3fv(loc, u.value); break;
    case 'vec4': gl.uniform4fv(loc, u.value); break;
    case 'ivec2': gl.uniform2iv(loc, u.value); break;
    case 'ivec3': gl.uniform3iv(loc, u.value); break;
    case 'ivec4': gl.uniform4iv(loc, u.value); break;
    case 'mat3': gl.uniformMatrix3fv(loc, false, u.value); break;
    case 'uint[]': gl.uniform1uiv(loc, new Uint32Array(u.value)); break;
    case 'vec4[]': gl.uniform4fv(loc, u.value); break;
    case 'float[]': gl.uniform1fv(loc, u.value); break;
  }
}

/** Whether texture unit `unit` already holds `key` at w×h, so its input can be skipped (passed as null). */
export function textureHolds(unit: number, key: string | null, w: number, h: number): boolean {
  return key !== null && getGl() !== null && cacheGeneration === glGeneration()
    && textureKeys[unit] === key && textureSizes[unit] === `${w}x${h}`;
}

/**
 * Run `def` over `inputs` and draw the w×h result onto `target` at (dx, dy).
 * Returns false, drawing nothing, when GL is unavailable; the caller falls back.
 *
 * `keys` optionally names what each input holds. When texture unit i already
 * holds the same key, its upload is skipped: uploading a 1080×1920 canvas
 * costs about 5 ms in WKWebView, and a transition's incoming scene is frozen,
 * so it is the same on every frame. Pass null for inputs that change. An
 * input may itself be null when textureHolds() said its unit already holds it.
 */
export function runPassInto(
  target: CanvasRenderingContext2D,
  dx: number, dy: number, w: number, h: number,
  def: ProgramDef,
  inputs: (HTMLCanvasElement | ImageBitmap | null)[],
  uniforms: Uniforms,
  keys: (string | null)[] = [],
): boolean {
  const gl = getGl();
  const canvas = glCanvas();
  if (!gl || !canvas || w <= 0 || h <= 0) return false;
  const p = programFor(gl, def);
  // A skipped (null) input must still be in its texture.
  if (inputs.some((input, i) => input === null && textureKeys[i] !== (keys[i] ?? null))) return false;

  // The GL canvas grows to the largest size asked for and never shrinks.
  if (canvas.width < w) canvas.width = w;
  if (canvas.height < h) canvas.height = h;

  gl.useProgram(p.program);
  gl.viewport(0, 0, w, h);
  gl.disable(gl.BLEND);

  if (!triangle) {
    triangle = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, triangle);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, triangle);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  inputs.forEach((input, i) => {
    let tex = textures[i];
    if (!tex) {
      tex = gl.createTexture()!;
      textures[i] = tex;
    }
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const key = keys[i] ?? null;
    const size = input ? `${input.width}x${input.height}` : textureSizes[i];
    if (!input || (key !== null && textureKeys[i] === key && textureSizes[i] === size)) {
      // Already holds exactly this input.
    } else if (textureSizes[i] !== size) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, input);
      textureSizes[i] = size;
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, input);
    }
    textureKeys[i] = key;
    const loc = location(gl, p, def.samplers[i]);
    if (loc) gl.uniform1i(loc, i);
  });

  for (const [name, value] of Object.entries(uniforms)) {
    const loc = location(gl, p, name);
    if (loc) setUniform(gl, loc, value);
  }

  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  // The viewport sits at the bottom-left in GL, which is the bottom of the
  // canvas as an image: rows height − h … height.
  target.drawImage(canvas, 0, canvas.height - h, w, h, dx, dy, w, h);
  return true;
}
