import type { Composition } from '../types';
import { TRANSITION_LABELS, needsGpu } from './transition-options';
import { GPU_LENS_MODES, LENS_SPECS } from './fx-schema';

/**
 * What in a composition needs WebGL2: GPU transitions, refract and ripple
 * lenses, and VHS tube curvature. The Render panel lists these when WebGL2 is
 * unavailable, since each then renders without it (transitions as fades,
 * those lenses unchanged, curvature skipped).
 */
export function gpuFeatureUses(composition: Composition): string[] {
  const out: string[] = [];
  composition.scenes.forEach((scene, i) => {
    const name = `Scene ${i + 1} “${scene.label}”`;
    if (needsGpu(scene.transition) && i < composition.scenes.length - 1 && scene.transitionDurationFrames > 0) {
      out.push(`${name}: ${TRANSITION_LABELS[scene.transition]} transition`);
    }
    for (const layer of scene.layers) {
      if (layer.type === 'lens' && layer.visible && GPU_LENS_MODES.includes(layer.mode)) {
        out.push(`${name}: lens “${layer.name}” (${LENS_SPECS[layer.mode].label})`);
      }
    }
    const vhs = scene.sceneFx?.find((f) => f.type === 'vhs');
    if (vhs && vhs.type === 'vhs' && vhs.barrel > 0) out.push(`${name}: VHS tube curvature`);
  });
  return out;
}

/** The Render panel's warning when WebGL2 is missing, or null if nothing needs it. */
export function gpuWarning(uses: string[]): string | null {
  if (uses.length === 0) return null;
  return `WebGL2 is unavailable, so these effects will render without it — GPU transitions as fades, Glass and Ripple lenses unchanged, VHS curvature skipped: ${uses.join('; ')}.`;
}
