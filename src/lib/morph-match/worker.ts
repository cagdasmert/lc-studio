// Auto-match runs here so the 1–3 s of inference never blocks the editor.
import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import { extractFeatures } from './features';
import { matchFeatures } from './match';
import type { WorkerRequest, WorkerResponse } from './protocol';

// One thread: multi-threaded WASM needs cross-origin isolation, which would
// change how every cross-origin resource in the app loads.
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = { wasm: wasmUrl };

let session: ort.InferenceSession | null = null;

function post(msg: WorkerResponse): void {
  (self as unknown as Worker).postMessage(msg);
}

self.addEventListener('message', async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  try {
    if (msg.type === 'load') {
      session ??= await ort.InferenceSession.create(new Uint8Array(msg.model));
      post({ type: 'loaded' });
      return;
    }
    if (!session) throw new Error('Auto-match model is not loaded');
    post({ type: 'progress', value: 0.05 });
    const fa = await extractFeatures(session, ort.Tensor, msg.a);
    post({ type: 'progress', value: 0.5 });
    const fb = await extractFeatures(session, ort.Tensor, msg.b);
    post({ type: 'progress', value: 0.95 });
    post({ type: 'result', pairs: matchFeatures(fa, fb, msg.view) });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
});
