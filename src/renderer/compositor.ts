import type { Composition, Scene } from '../types';
import type { MediaCache } from './media-cache';
import type { PreparedVideoFrames } from './draw-video';
import { drawScene, drawSceneBackground } from './draw';
import { drawTransition } from './transitions';
import { applyShake, applyScenePostFx, hasShake } from './scene-fx';

export function getTotalFrames(composition: Composition): number {
  return composition.scenes.reduce((sum, s) => sum + s.durationFrames, 0);
}

export function resolveFrame(
  composition: Composition,
  globalFrame: number,
): { sceneIndex: number; frameInScene: number } {
  if (composition.scenes.length === 0) {
    return { sceneIndex: -1, frameInScene: 0 };
  }

  let remaining = globalFrame;
  for (let i = 0; i < composition.scenes.length; i++) {
    const scene = composition.scenes[i];
    if (remaining < scene.durationFrames) {
      return { sceneIndex: i, frameInScene: remaining };
    }
    remaining -= scene.durationFrames;
  }
  const last = composition.scenes.length - 1;
  return {
    sceneIndex: last,
    frameInScene: composition.scenes[last].durationFrames - 1,
  };
}

/**
 * The transition playing at this frame of a scene, if any. Transitions run
 * over the outgoing scene's last frames and show the incoming scene frozen
 * at its frame 0.
 */
export function transitionAt(
  composition: Composition,
  sceneIndex: number,
  frameInScene: number,
): { incoming: Scene; progress: number } | null {
  const scene = composition.scenes[sceneIndex];
  const incoming = composition.scenes[sceneIndex + 1];
  const duration = scene.transitionDurationFrames || 0;
  const start = scene.durationFrames - duration;
  if (!incoming || scene.transition === 'none' || scene.transition === 'cut' || duration <= 0 || frameInScene < start) {
    return null;
  }
  return { incoming, progress: (frameInScene - start) / duration };
}

export function drawCompositionFrame(
  ctx: CanvasRenderingContext2D,
  composition: Composition,
  globalFrame: number,
  mediaCache: MediaCache,
  videoFrames?: PreparedVideoFrames,
): void {
  const { width, height, fps } = composition.output;
  const { sceneIndex, frameInScene } = resolveFrame(composition, globalFrame);
  if (sceneIndex < 0) {
    ctx.clearRect(0, 0, width, height);
    return;
  }
  const scene = composition.scenes[sceneIndex];

  const transition = transitionAt(composition, sceneIndex, frameInScene);

  // Camera shake displaces everything, so it wraps the whole scene draw —
  // including transitions — while the overlay FX go on top afterwards.
  const shake = hasShake(scene.sceneFx);
  ctx.save();
  if (shake) applyShake(ctx, shake, frameInScene, fps, width, height);

  if (transition) {
    drawSceneBackground(ctx, transition.incoming, width, height, mediaCache);

    drawTransition(
      ctx, scene, transition.incoming, frameInScene, transition.progress,
      scene.transition, width, height, mediaCache, fps, videoFrames,
    );
  } else {
    drawScene(ctx, scene, frameInScene, width, height, mediaCache, fps, videoFrames);
  }

  ctx.restore();

  applyScenePostFx(ctx, scene.sceneFx, frameInScene, width, height);
}
