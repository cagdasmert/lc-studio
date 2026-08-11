import type { Composition, Layer, ImageLayerData, VideoLayerData, AudioLayerData } from '../types';

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
    scene.layers.forEach((layer: Layer) => {
      if (layer.type === 'image') {
        const img = layer as ImageLayerData;
        if (img.src) {
          refs.push({
            path: img.src,
            type: 'image',
            layerName: layer.name,
            sceneLabel: scene.label,
            sceneIndex,
            layerId: layer.id,
          });
        }
      } else if (layer.type === 'video') {
        const vid = layer as VideoLayerData;
        if (vid.src) {
          refs.push({
            path: vid.src,
            type: 'video',
            layerName: layer.name,
            sceneLabel: scene.label,
            sceneIndex,
            layerId: layer.id,
          });
        }
      } else if (layer.type === 'audio') {
        const aud = layer as AudioLayerData;
        if (aud.src) {
          refs.push({
            path: aud.src,
            type: 'audio',
            layerName: layer.name,
            sceneLabel: scene.label,
            sceneIndex,
            layerId: layer.id,
          });
        }
      }
    });
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
