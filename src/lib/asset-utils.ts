import type { Composition } from '../types';
import { assetRefs } from './asset-refs';

export interface AssetReference {
  path: string;
  type: 'image' | 'video' | 'audio';
  layerName: string;
  sceneLabel: string;
  sceneIndex: number;
  layerId: string;
}

export function scanCompositionAssets(composition: Composition): AssetReference[] {
  const refs: AssetReference[] = [];
  composition.scenes.forEach((scene, sceneIndex) => {
    for (const layer of scene.layers) {
      for (const ref of assetRefs(layer)) {
        const path = ref.get();
        if (!path) continue;
        refs.push({
          path, type: ref.kind, layerName: layer.name,
          sceneLabel: scene.label, sceneIndex, layerId: layer.id,
        });
      }
    }
  });
  return refs;
}

export interface AssetSummary {
  path: string;
  type: 'image' | 'video' | 'audio';
  usages: { sceneLabel: string; layerName: string }[];
}

export function getAssetSummaries(refs: AssetReference[]): AssetSummary[] {
  const map = new Map<string, AssetSummary>();

  for (const ref of refs) {
    const existing = map.get(ref.path);
    if (existing) {
      existing.usages.push({ sceneLabel: ref.sceneLabel, layerName: ref.layerName });
    } else {
      map.set(ref.path, {
        path: ref.path,
        type: ref.type,
        usages: [{ sceneLabel: ref.sceneLabel, layerName: ref.layerName }],
      });
    }
  }

  return Array.from(map.values());
}
