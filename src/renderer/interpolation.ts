import type { KeyframeTrack, LayerBase, ResolvedTransform } from '../types';
import { getEasing } from './easing';

// ── Numeric interpolation ──────────────────────────────

export function interpolateNumeric(
  track: KeyframeTrack<number>,
  frame: number,
): number {
  const kfs = track.keyframes;
  if (kfs.length === 0) return 0;
  if (kfs.length === 1) return kfs[0].value;

  // Before first keyframe — hold
  if (frame <= kfs[0].frame) return kfs[0].value;

  // After last keyframe — hold
  if (frame >= kfs[kfs.length - 1].frame) return kfs[kfs.length - 1].value;

  // Find bounding keyframes
  let lo = 0;
  for (let i = 1; i < kfs.length; i++) {
    if (kfs[i].frame >= frame) {
      lo = i - 1;
      break;
    }
  }
  const hi = lo + 1;

  const k0 = kfs[lo];
  const k1 = kfs[hi];
  const span = k1.frame - k0.frame;
  if (span === 0) return k1.value;

  const t = (frame - k0.frame) / span;
  const easeFn = getEasing(k0.easing, k0.easingParams);
  const eased = easeFn(t);

  // Lerp — note: spring/elastic easing can overshoot, so no clamping
  return k0.value + (k1.value - k0.value) * eased;
}

// ── Color interpolation ────────────────────────────────

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3
    ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
    : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' +
    clamp(r).toString(16).padStart(2, '0') +
    clamp(g).toString(16).padStart(2, '0') +
    clamp(b).toString(16).padStart(2, '0');
}

export function interpolateColor(
  track: KeyframeTrack<string>,
  frame: number,
): string {
  const kfs = track.keyframes;
  if (kfs.length === 0) return '#000000';
  if (kfs.length === 1) return kfs[0].value;

  if (frame <= kfs[0].frame) return kfs[0].value;
  if (frame >= kfs[kfs.length - 1].frame) return kfs[kfs.length - 1].value;

  let lo = 0;
  for (let i = 1; i < kfs.length; i++) {
    if (kfs[i].frame >= frame) {
      lo = i - 1;
      break;
    }
  }
  const hi = lo + 1;

  const k0 = kfs[lo];
  const k1 = kfs[hi];
  const span = k1.frame - k0.frame;
  if (span === 0) return k1.value;

  const t = (frame - k0.frame) / span;
  const easeFn = getEasing(k0.easing, k0.easingParams);
  const eased = Math.max(0, Math.min(1, easeFn(t)));

  const [r0, g0, b0] = parseHex(k0.value);
  const [r1, g1, b1] = parseHex(k1.value);

  return toHex(
    r0 + (r1 - r0) * eased,
    g0 + (g1 - g0) * eased,
    b0 + (b1 - b0) * eased,
  );
}

// ── Property resolution ────────────────────────────────

export function resolveNumericProperty(
  keyframes: Record<string, KeyframeTrack>,
  propertyName: string,
  frame: number,
  defaultValue: number,
): number {
  const track = keyframes[propertyName];
  if (!track || track.keyframes.length === 0) return defaultValue;
  return interpolateNumeric(track, frame);
}

export function resolveColorProperty(
  keyframes: Record<string, KeyframeTrack<string>>,
  propertyName: string,
  frame: number,
  defaultValue: string,
): string {
  const track = keyframes[propertyName];
  if (!track || track.keyframes.length === 0) return defaultValue;
  return interpolateColor(track, frame);
}

// ── Full layer transform resolution ────────────────────

export function resolveLayerTransform(
  layer: LayerBase,
  frameInLayer: number,
): ResolvedTransform {
  const kf = layer.keyframes;
  return {
    x: resolveNumericProperty(kf, 'x', frameInLayer, layer.x),
    y: resolveNumericProperty(kf, 'y', frameInLayer, layer.y),
    width: resolveNumericProperty(kf, 'width', frameInLayer, layer.width),
    height: resolveNumericProperty(kf, 'height', frameInLayer, layer.height),
    scaleX: resolveNumericProperty(kf, 'scaleX', frameInLayer, layer.scaleX),
    scaleY: resolveNumericProperty(kf, 'scaleY', frameInLayer, layer.scaleY),
    rotation: resolveNumericProperty(kf, 'rotation', frameInLayer, layer.rotation),
    opacity: resolveNumericProperty(kf, 'opacity', frameInLayer, layer.opacity),
    anchorX: resolveNumericProperty(kf, 'anchorX', frameInLayer, layer.anchorX),
    anchorY: resolveNumericProperty(kf, 'anchorY', frameInLayer, layer.anchorY),
  };
}
