import type { Layer } from '../types';

export interface AssetRef {
  kind: 'image' | 'video' | 'audio';
  get(): string;
  set(value: string): void;
}

/**
 * Every asset path a layer points at: its own `src`, plus an image's morph
 * target. Saving, bundling, preloading and the asset panel all walk this one
 * list, so a new asset field only has to be added here.
 */
export function assetRefs(layer: Layer): AssetRef[] {
  const refs: AssetRef[] = [];
  if (layer.type === 'image' || layer.type === 'video' || layer.type === 'audio') {
    const l = layer;
    refs.push({ kind: l.type, get: () => l.src, set: (v) => { l.src = v; } });
  }
  if (layer.type === 'image' && layer.morph) {
    const morph = layer.morph;
    refs.push({ kind: 'image', get: () => morph.target, set: (v) => { morph.target = v; } });
  }
  return refs;
}
