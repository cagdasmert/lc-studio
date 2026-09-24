import type { InferenceSession, Tensor as OrtTensor } from 'onnxruntime-web';
import type { FeatureGrid } from './match';

export const PATCH = 14;
export const LONG_SIDE = 448;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

export interface Pixels { data: Uint8ClampedArray; width: number; height: number }

/** Model input size: long side 448, both sides multiples of the 14 px patch. */
export function inputSize(w: number, h: number, longSide = LONG_SIDE): { w: number; h: number } {
  const s = longSide / Math.max(w, h);
  const snap = (v: number) => Math.max(PATCH, Math.round((v * s) / PATCH) * PATCH);
  return { w: snap(w), h: snap(h) };
}

/** RGBA bytes → ImageNet-normalised planar RGB (CHW). */
export function toChw(rgba: Uint8ClampedArray, w: number, h: number): Float32Array {
  const plane = w * h;
  const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) {
      out[c * plane + i] = (rgba[i * 4 + c] / 255 - MEAN[c]) / STD[c];
    }
  }
  return out;
}

/** `last_hidden_state` rows after CLS, each L2-normalised for cosine matching. */
export function patchGrid(hidden: Float32Array, w: number, h: number, dim: number): FeatureGrid {
  const cols = w / PATCH;
  const rows = h / PATCH;
  const n = cols * rows;
  const data = new Float32Array(n * dim);
  for (let i = 0; i < n; i++) {
    const src = (i + 1) * dim;
    let norm = 0;
    for (let k = 0; k < dim; k++) norm += hidden[src + k] * hidden[src + k];
    const inv = norm > 0 ? 1 / Math.sqrt(norm) : 0;
    for (let k = 0; k < dim; k++) data[i * dim + k] = hidden[src + k] * inv;
  }
  return { cols, rows, dim, data };
}

/**
 * Run DINOv2 on one image. The Tensor constructor is passed in so the same
 * code runs on the worker's WASM build and on Node's build in tests.
 */
export async function extractFeatures(
  session: InferenceSession,
  Tensor: typeof OrtTensor,
  px: Pixels,
): Promise<FeatureGrid> {
  const input = new Tensor('float32', toChw(px.data, px.width, px.height), [1, 3, px.height, px.width]);
  const out = await session.run({ pixel_values: input });
  const hidden = out.last_hidden_state;
  return patchGrid(hidden.data as Float32Array, px.width, px.height, hidden.dims[2]);
}
