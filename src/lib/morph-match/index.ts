import { resolveResource } from '@tauri-apps/api/path';
import { readFile } from '@tauri-apps/plugin-fs';
import type { MorphPair } from '../../types';
import type { MorphView } from '../../renderer/morph-field';
import { inputSize, type Pixels } from './features';
import type { WorkerRequest, WorkerResponse } from './protocol';

export const MODEL_RESOURCE = 'models/dinov2-small-int8.onnx';

export class ModelMissingError extends Error {
  constructor() {
    super('Auto-match unavailable — model not found (run `npm run fetch-models` in dev)');
    this.name = 'ModelMissingError';
  }
}

/** The model is read from the app bundle, which needs the Tauri runtime. */
export function autoMatchAvailable(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

let worker: Worker | null = null;
let ready: Promise<void> | null = null;

function resetWorker(): void {
  worker?.terminate();
  worker = null;
  ready = null;
}

function abortError(): DOMException {
  return new DOMException('Auto-match cancelled', 'AbortError');
}

/** Send one request and wait for its final reply, relaying progress. */
function call(
  w: Worker,
  msg: WorkerRequest,
  transfer: Transferable[],
  onProgress?: (p: number) => void,
  signal?: AbortSignal,
): Promise<WorkerResponse> {
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent<WorkerResponse>) => {
      if (e.data.type === 'progress') { onProgress?.(e.data.value); return; }
      cleanup();
      if (e.data.type === 'error') reject(new Error(e.data.message));
      else resolve(e.data);
    };
    const onError = (e: ErrorEvent) => {
      cleanup();
      resetWorker();
      reject(new Error(e.message || 'Auto-match worker crashed'));
    };
    const onAbort = () => {
      cleanup();
      resetWorker();
      reject(abortError());
    };
    function cleanup() {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
    }
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    signal?.addEventListener('abort', onAbort);
    w.postMessage(msg, transfer);
  });
}

async function readModel(): Promise<ArrayBuffer> {
  let bytes: Uint8Array;
  try {
    bytes = await readFile(await resolveResource(MODEL_RESOURCE));
  } catch {
    throw new ModelMissingError();
  }
  return bytes.slice().buffer;
}

/** The worker, with the model loaded. Loading happens once per session. */
async function ensureWorker(signal?: AbortSignal): Promise<Worker> {
  if (!worker || !ready) {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker = w;
    ready = readModel()
      .then((model) => call(w, { type: 'load', model }, [model], undefined, signal))
      .then(() => undefined);
    ready.catch(() => { if (worker === w) resetWorker(); });
  }
  await ready;
  if (!worker) throw abortError();
  return worker;
}

/** Downscale to the model's input size; transparent areas read as neutral grey. */
function toPixels(bitmap: ImageBitmap): Pixels {
  const { w, h } = inputSize(bitmap.width, bitmap.height);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  return { data: ctx.getImageData(0, 0, w, h).data, width: w, height: h };
}

/** New auto pairs for A → B. Merging with existing pairs is the caller's job. */
export async function autoMatch(
  a: ImageBitmap,
  b: ImageBitmap,
  view: MorphView,
  opts: { onProgress?: (p: number) => void; signal?: AbortSignal } = {},
): Promise<MorphPair[]> {
  if (opts.signal?.aborted) throw abortError();
  const w = await ensureWorker(opts.signal);
  const pa = toPixels(a);
  const pb = toPixels(b);
  const res = await call(
    w, { type: 'match', a: pa, b: pb, view },
    [pa.data.buffer as ArrayBuffer, pb.data.buffer as ArrayBuffer],
    opts.onProgress, opts.signal,
  );
  if (res.type !== 'result') throw new Error('Unexpected reply from the auto-match worker');
  return res.pairs;
}
