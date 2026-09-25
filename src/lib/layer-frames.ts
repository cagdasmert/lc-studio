import type { LayerBase } from '../types';

// Keyframe frames count from the layer's startFrame — the renderer resolves
// tracks at frameInScene - startFrame — while the editor's playhead and
// keyframe timeline count from the scene's start. The UI converts here.

type LayerSpan = Pick<LayerBase, 'startFrame' | 'endFrame'>;

export function toLayerFrame(layer: LayerSpan, frameInScene: number): number {
  return frameInScene - layer.startFrame;
}

export function toSceneFrame(layer: LayerSpan, frameInLayer: number): number {
  return frameInLayer + layer.startFrame;
}

/** Whether the layer is drawn at this layer frame (endFrame is exclusive). */
export function isInLayer(layer: LayerSpan, frameInLayer: number): boolean {
  return frameInLayer >= 0 && frameInLayer < layer.endFrame - layer.startFrame;
}

export function clampToLayer(layer: LayerSpan, frameInLayer: number): number {
  return Math.max(0, Math.min(layer.endFrame - layer.startFrame - 1, frameInLayer));
}
