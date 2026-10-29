/**
 * The frames of a composition worth looking at, for `stills` and `check` on
 * the command line (docs/superpowers/specs/2026-10-28-headless-cli-design.md,
 * R1.2). Frames are 0-based global frames.
 */
import type { Composition } from '../types';
import { getTotalFrames, resolveFrame, transitionAt } from '../renderer/compositor';

export type KeyFrameWhy = 'hook' | 'settled' | 'transition' | 'morph' | 'end' | 'requested';

export interface KeyFrame {
  frame: number;
  why: KeyFrameWhy;
  scene: number;
  sceneLabel: string;
}

/** The frame by which the hook should read: 0.4 s at 30 fps. */
const HOOK_FRAME = 12;

/**
 * hook: frame 12 of scene 1 (its last frame if shorter). settled: each
 * scene's last frame before its outgoing transition starts, or its last
 * frame. transition: the middle of each outgoing transition. morph: halfway
 * between the first and last morphProgress keyframe of each morphing image.
 * end: the last frame. A frame picked twice keeps its first reason.
 */
export function autoKeyFrames(composition: Composition): KeyFrame[] {
  const total = getTotalFrames(composition);
  if (total === 0) return [];
  const picks: [number, KeyFrameWhy][] = [[Math.min(HOOK_FRAME, composition.scenes[0].durationFrames - 1), 'hook']];
  const morphs: [number, KeyFrameWhy][] = [];
  let start = 0;
  composition.scenes.forEach((scene, i) => {
    const d = scene.durationFrames;
    // The renderer's own rule for whether a transition plays (none on the last scene, none for cuts).
    if (transitionAt(composition, i, d - 1)) {
      const from = Math.max(0, d - (scene.transitionDurationFrames || 0));
      picks.push([start + Math.max(0, from - 1), 'settled']);
      picks.push([start + from + Math.floor((d - from) / 2), 'transition']);
    } else {
      picks.push([start + d - 1, 'settled']);
    }
    for (const layer of scene.layers) {
      const keys = layer.type === 'image' && layer.morph ? layer.keyframes.morphProgress?.keyframes : undefined;
      if (!keys?.length) continue;
      const frames = keys.map((k) => k.frame);
      const mid = Math.floor((Math.min(...frames) + Math.max(...frames)) / 2);
      morphs.push([start + Math.min(d - 1, Math.max(0, layer.startFrame + mid)), 'morph']);
    }
    start += d;
  });
  return withScenes(composition, [...picks, ...morphs, [total - 1, 'end']]);
}

/** `auto`, `all`, or explicit frames, which must lie inside the video. */
export function keyFramesFor(composition: Composition, spec: 'auto' | 'all' | number[]): KeyFrame[] {
  if (spec === 'auto') return autoKeyFrames(composition);
  const total = getTotalFrames(composition);
  const frames = spec === 'all' ? Array.from({ length: total }, (_, i) => i) : spec;
  const outside = frames.filter((f) => f < 0 || f >= total);
  if (outside.length) {
    throw new RangeError(`frame ${outside.join(', ')} is outside the video: frames run 0–${total - 1}`);
  }
  return withScenes(composition, frames.map((f) => [f, 'requested']));
}

/** First reason per frame wins; sorted; with each frame's scene. */
function withScenes(composition: Composition, picks: [number, KeyFrameWhy][]): KeyFrame[] {
  const seen = new Map<number, KeyFrameWhy>();
  for (const [frame, why] of picks) if (!seen.has(frame)) seen.set(frame, why);
  return [...seen.entries()]
    .sort(([a], [b]) => a - b)
    .map(([frame, why]) => {
      const { sceneIndex } = resolveFrame(composition, frame);
      return { frame, why, scene: sceneIndex, sceneLabel: composition.scenes[sceneIndex].label };
    });
}
