/**
 * Issues in a command-line result (docs/superpowers/specs/2026-10-28-headless-cli-design.md §3).
 * The codes are a closed list: lcs.py maps each one, so add to it only with the spec.
 */
import type { Composition } from '../../types';
import { glAvailable } from '../../renderer/gl/context';
import { gpuFeatureUses, gpuWarning } from '../gpu-features';
import { countUndecodableVideoLayers, undecodableWarning } from '../video-support';

export type IssueCode =
  | 'load'
  | 'editor'
  | 'draw'
  | 'media-missing'
  | 'video-undecodable'
  | 'gpu-fallback'
  | 'font-missing'
  | 'text-overflow'
  | 'ffmpeg-missing'
  | 'model-missing';

export interface Issue {
  severity: 'error' | 'warn' | 'note';
  code: IssueCode;
  message: string;
  scene?: number;
  sceneLabel?: string;
  layerId?: string;
  layerName?: string;
  frame?: number | null;
}

/** The Render panel's two warnings, from the same helpers. */
export async function renderWarnings(composition: Composition, projectDir: string | null): Promise<Issue[]> {
  const issues: Issue[] = [];
  const video = undecodableWarning(await countUndecodableVideoLayers(composition, projectDir));
  if (video) issues.push({ severity: 'warn', code: 'video-undecodable', message: video });
  const uses = gpuFeatureUses(composition);
  const gpu = uses.length && !glAvailable() ? gpuWarning(uses) : null;
  if (gpu) issues.push({ severity: 'warn', code: 'gpu-fallback', message: gpu });
  return issues;
}
