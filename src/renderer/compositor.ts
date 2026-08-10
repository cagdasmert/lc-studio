import type { Composition } from '../types';
import type { MediaCache } from './media-cache';
import type { VideoCache } from './video-cache';
import { drawScene } from './draw';
import { drawTransition } from './transitions';

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

export function drawCompositionFrame(
  ctx: CanvasRenderingContext2D,
  composition: Composition,
  globalFrame: number,
  mediaCache: MediaCache,
  videoCache?: VideoCache,
): void {
  const { width, height, fps } = composition.output;
  const { sceneIndex, frameInScene } = resolveFrame(composition, globalFrame);
  if (sceneIndex < 0) {
    ctx.clearRect(0, 0, width, height);
    return;
  }
  const scene = composition.scenes[sceneIndex];

  // Check if we're in a transition zone at the end of this scene
  const nextScene = composition.scenes[sceneIndex + 1];
  const transitionDuration = scene.transitionDurationFrames || 0;
  const transitionStart = scene.durationFrames - transitionDuration;

  const isInTransition =
    nextScene &&
    scene.transition !== 'none' &&
    scene.transition !== 'cut' &&
    transitionDuration > 0 &&
    frameInScene >= transitionStart;

  if (isInTransition) {
    const progress = (frameInScene - transitionStart) / transitionDuration;

    ctx.fillStyle = nextScene.backgroundColor;
    ctx.fillRect(0, 0, width, height);

    drawTransition(
      ctx, scene, nextScene, frameInScene, progress,
      scene.transition, width, height, mediaCache, fps, videoCache,
    );
  } else {
    drawScene(ctx, scene, frameInScene, width, height, mediaCache, fps, videoCache);
  }
}
