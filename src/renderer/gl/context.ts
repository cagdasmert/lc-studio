/**
 * The one shared WebGL2 context, created lazily on a detached canvas. Every
 * GL effect goes through runPassInto (pass.ts), which draws into this canvas
 * and copies the result onto a 2D target in the same task.
 *
 * getGl() returns null when WebGL2 is missing, when the context is lost, or
 * when the e2e `disableGl` switch is on; callers then use their fallbacks.
 */

let canvas: HTMLCanvasElement | null = null;
let gl: WebGL2RenderingContext | null = null;
let lost = false;
let unavailable = false;
let disabled = false;
/** Bumped whenever the context is (re)created, so program and texture caches know to rebuild. */
let generation = 0;

const ATTRIBUTES: WebGLContextAttributes = {
  alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true,
  antialias: false, depth: false, stencil: false,
};

export function getGl(): WebGL2RenderingContext | null {
  if (disabled || lost || unavailable) return null;
  if (gl) return gl;
  try {
    if (typeof document === 'undefined') { unavailable = true; return null; }
    const c = document.createElement('canvas');
    const ctx = c.getContext?.('webgl2', ATTRIBUTES) as WebGL2RenderingContext | null | undefined;
    if (!ctx || typeof ctx.createShader !== 'function') { unavailable = true; return null; }
    c.addEventListener?.('webglcontextlost', (e) => { e.preventDefault(); lost = true; });
    c.addEventListener?.('webglcontextrestored', () => { lost = false; generation++; });
    canvas = c;
    gl = ctx;
    generation++;
    return gl;
  } catch {
    unavailable = true;
    return null;
  }
}

/** The detached canvas the context draws into (grown by pass.ts as needed). */
export function glCanvas(): HTMLCanvasElement | null {
  return canvas;
}

export function glGeneration(): number {
  return generation;
}

/** Debug only: the LCS_E2E job option `disableGl: true` forces getGl() to null. */
export function setGlDisabled(value: boolean): void {
  disabled = value;
}

export function glDisabled(): boolean {
  return disabled;
}

/** Whether GL effects will draw right now (for the Render panel's warning). */
export function glAvailable(): boolean {
  return getGl() !== null;
}
