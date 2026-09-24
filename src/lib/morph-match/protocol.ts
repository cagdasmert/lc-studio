import type { MorphPair } from '../../types';
import type { MorphView } from '../../renderer/morph-field';
import type { Pixels } from './features';

export type WorkerRequest =
  | { type: 'load'; model: ArrayBuffer }
  | { type: 'match'; a: Pixels; b: Pixels; view: MorphView };

export type WorkerResponse =
  | { type: 'loaded' }
  | { type: 'progress'; value: number }
  | { type: 'result'; pairs: MorphPair[] }
  | { type: 'error'; message: string };
