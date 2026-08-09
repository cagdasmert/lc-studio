import type { Composition } from '../types';
import { drawScene } from './draw';

const FADE_OVERLAP_FRAMES = 15;

export function getTotalFrames(composition: Composition): number {
  return composition.scenes.reduce((sum, s) => sum + s.durationFrames, 0);
}

export function resolveFrame(
  composition: Composition,
  globalFrame: number,
): { sceneIndex: number; frameInScene: number } {
  let remaining = globalFrame;
  for (let i = 0; i < composition.scenes.length; i++) {
    const scene = composition.scenes[i];
    if (remaining < scene.durationFrames) {
      return { sceneIndex: i, frameInScene: remaining };
    }
    remaining -= scene.durationFrames;
  }
  // Clamp to last frame of last scene
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
): void {
  const { width, height } = composition.output;
  const { sceneIndex, frameInScene } = resolveFrame(composition, globalFrame);
  const scene = composition.scenes[sceneIndex];

  // Check if we're in a fade transition zone at the end of this scene
  const nextScene = composition.scenes[sceneIndex + 1];
  const isInFadeZone =
    nextScene &&
    scene.transition === 'fade' &&
    frameInScene >= scene.durationFrames - FADE_OVERLAP_FRAMES;

  if (isInFadeZone) {
    const fadeProgress =
      (frameInScene - (scene.durationFrames - FADE_OVERLAP_FRAMES)) /
      FADE_OVERLAP_FRAMES;

    // Draw outgoing scene
    ctx.globalAlpha = 1 - fadeProgress;
    drawScene(ctx, scene, frameInScene, width, height);

    // Draw incoming scene on top
    ctx.globalAlpha = fadeProgress;
    drawScene(ctx, nextScene, 0, width, height);

    ctx.globalAlpha = 1;
  } else {
    drawScene(ctx, scene, frameInScene, width, height);
  }
}
