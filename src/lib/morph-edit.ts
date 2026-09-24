import type { ImageLayerData, KeyframeTrack, MorphPair, MorphPoint } from '../types';
import { boxToUv, fitRect, uvToBox } from '../renderer/fit';
import { mlsRigid, morphControls, type MorphView } from '../renderer/morph-field';

/** Auto-match never places a pair this close (UV) to a manual point. */
export const MANUAL_CLEARANCE = 0.04;

export function newPairId(): string {
  return `pair-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Where a point clicked on one image most likely sits on the other: push it
 * through the warp the existing pairs (and pinned border) already define.
 */
export function predictPartner(
  pairs: readonly MorphPair[],
  view: MorphView,
  side: 'a' | 'b',
  uv: MorphPoint,
): MorphPoint {
  const { pA, pB } = morphControls(view, pairs);
  const rA = fitRect(view.fitMode, view.sizeA.w, view.sizeA.h, view.boxW, view.boxH);
  const rB = fitRect(view.fitMode, view.sizeB.w, view.sizeB.h, view.boxW, view.boxH);
  if (side === 'a') return boxToUv(mlsRigid(uvToBox(uv, rA), pA, pB), rB);
  return boxToUv(mlsRigid(uvToBox(uv, rB), pB, pA), rA);
}

export function addPair(
  pairs: readonly MorphPair[],
  view: MorphView,
  side: 'a' | 'b',
  uv: MorphPoint,
  id: string,
): MorphPair[] {
  const partner = predictPartner(pairs, view, side, uv);
  const pair: MorphPair = side === 'a'
    ? { id, a: uv, b: partner, source: 'manual' }
    : { id, a: partner, b: uv, source: 'manual' };
  return [...pairs, pair];
}

/** Moving a point makes the pair the user's: manual, with no auto confidence. */
export function movePoint(
  pairs: readonly MorphPair[],
  id: string,
  side: 'a' | 'b',
  to: MorphPoint,
): MorphPair[] {
  return pairs.map((p) => p.id !== id ? p : {
    id: p.id,
    a: side === 'a' ? to : p.a,
    b: side === 'b' ? to : p.b,
    source: 'manual',
  });
}

export function deletePair(pairs: readonly MorphPair[], id: string): MorphPair[] {
  return pairs.filter((p) => p.id !== id);
}

export function clearAuto(pairs: readonly MorphPair[]): MorphPair[] {
  return pairs.filter((p) => p.source === 'manual');
}

/** Fresh auto pairs replace old ones; manual pairs always survive, untouched. */
export function mergeAuto(existing: readonly MorphPair[], incoming: readonly MorphPair[]): MorphPair[] {
  const manual = clearAuto(existing);
  const near = (u: MorphPoint, v: MorphPoint) => Math.hypot(u.x - v.x, u.y - v.y) < MANUAL_CLEARANCE;
  const kept = incoming.filter((p) => !manual.some((m) => near(m.a, p.a) || near(m.b, p.b)));
  return [...manual, ...kept];
}

/** Turn a morph on, with a 0 → 1 track across the layer so it works at once. */
export function enableMorph(layer: ImageLayerData, target: string): Partial<ImageLayerData> {
  const last = Math.max(1, layer.endFrame - layer.startFrame - 1);
  const track: KeyframeTrack = {
    keyframes: [
      { frame: 0, value: 0, easing: 'ease-in-out' },
      { frame: last, value: 1, easing: 'linear' },
    ],
  };
  return {
    morph: { target, pairs: [], progress: 0 },
    keyframes: { ...layer.keyframes, morphProgress: track },
  };
}

export function disableMorph(layer: ImageLayerData): Partial<ImageLayerData> {
  const keyframes = { ...layer.keyframes };
  delete keyframes.morphProgress;
  return { morph: null, keyframes };
}
