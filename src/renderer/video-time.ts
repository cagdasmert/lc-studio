import type { Composition, Layer, VideoLayerData } from '../types';
import { resolveFrame, transitionAt } from './compositor';

/** Pulls a clamped endTime back far enough that the held frame is the one before endTime. */
const END_EPSILON = 1e-3;
/** Nudges every lookup into its frame, so float error never lands on the frame before. */
const LOOKUP_EPSILON = 1e-4;

/**
 * The source time a video layer shows at `frameInLayer`:
 * startTime + frameInLayer / fps × playbackRate. With an endTime after
 * startTime the clip holds its last frame before endTime from then on.
 */
export function sourceTimeFor(
  layer: Pick<VideoLayerData, 'startTime' | 'endTime' | 'playbackRate'>,
  frameInLayer: number,
  fps: number,
): number {
  const rate = layer.playbackRate > 0 ? layer.playbackRate : 1;
  let t = layer.startTime + (frameInLayer / fps) * rate;
  if (layer.endTime > layer.startTime) {
    t = Math.min(Math.max(t, layer.startTime), layer.endTime - END_EPSILON);
  }
  return t + LOOKUP_EPSILON;
}

/** One video frame a composition frame draws. */
export interface VideoDraw {
  layerId: string;
  src: string;
  sourceTime: number;
}

function addActiveVideo(layers: Layer[], frameInScene: number, fps: number, draws: VideoDraw[]): void {
  for (const layer of layers) {
    if (layer.type !== 'video' || !layer.visible) continue;
    if (frameInScene < layer.startFrame || frameInScene >= layer.endFrame) continue;
    draws.push({
      layerId: layer.id,
      src: layer.src,
      sourceTime: sourceTimeFor(layer, frameInScene - layer.startFrame, fps),
    });
  }
}

/**
 * The video frames drawCompositionFrame draws at `globalFrame`, mirroring it:
 * the current scene's visible, active video layers, plus — during a
 * transition — the incoming scene's, frozen at its frame 0. Echo stamps reuse
 * the current frame, so they add nothing.
 */
export function collectVideoDraws(composition: Composition, globalFrame: number): VideoDraw[] {
  const { sceneIndex, frameInScene } = resolveFrame(composition, globalFrame);
  if (sceneIndex < 0) return [];
  const { fps } = composition.output;
  const draws: VideoDraw[] = [];
  addActiveVideo(composition.scenes[sceneIndex].layers, frameInScene, fps, draws);
  const transition = transitionAt(composition, sceneIndex, frameInScene);
  if (transition) addActiveVideo(transition.incoming.layers, 0, fps, draws);
  return draws;
}
