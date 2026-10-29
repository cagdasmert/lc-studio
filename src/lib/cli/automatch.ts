/**
 * `automatch` on the command line: DINOv2 morph pairs for image layers,
 * merged with manual pairs exactly as Edit points… → Auto-match does
 * (docs/superpowers/specs/2026-10-28-headless-cli-design.md §7).
 */
import { join } from '@tauri-apps/api/path';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import type { Composition, ImageLayerData, MorphPair } from '../../types';
import { autoMatch } from '../morph-match';
import { mergeAuto, morphViewFor } from '../morph-edit';
import { loadMorphImages } from '../morph-images';

export interface MatchedLayer {
  layerId: string;
  layerName: string;
  pairs: MorphPair[];
  auto: number;
  manual: number;
  written: boolean;
}

/** The layers to match: the one `layer` names (an id first, then a name), or every image layer with a morph. */
export function pickMorphLayers(composition: Composition, layer: string | null): ImageLayerData[] {
  const all = composition.scenes.flatMap((s) => s.layers);
  if (layer === null) {
    const morphs = all.filter((l): l is ImageLayerData => l.type === 'image' && !!l.morph);
    if (!morphs.length) throw new Error('no image layer has a morph to match (turn one on in lc-studio, or give the layer a "morph")');
    return morphs;
  }
  const byId = all.filter((l) => l.id === layer);
  const found = byId.length ? byId : all.filter((l) => l.name === layer);
  if (!found.length) throw new Error(`no layer has the id or name "${layer}"`);
  if (found.length > 1) throw new Error(`"${layer}" names ${found.length} layers; pass one of their ids: ${found.map((l) => l.id).join(', ')}`);
  const [one] = found;
  if (one.type !== 'image' || !one.morph) throw new Error(`"${one.name}" has no morph to match`);
  return [one];
}

/** Replace only these layers' pairs, and savedAt, in project.json, re-read first so nothing else changes. */
async function writePairs(projectDir: string, matched: MatchedLayer[]): Promise<void> {
  const path = await join(projectDir, 'project.json');
  const file = JSON.parse(await readTextFile(path));
  const pairs = new Map(matched.map((m) => [m.layerId, m.pairs]));
  for (const scene of file.composition.scenes) {
    for (const layer of scene.layers) {
      if (layer.morph && pairs.has(layer.id)) layer.morph.pairs = pairs.get(layer.id);
    }
  }
  file.savedAt = new Date().toISOString();
  await writeTextFile(path, JSON.stringify(file, null, 2));
}

export async function runAutomatch(
  composition: Composition,
  projectDir: string,
  opts: { layer: string | null; write: boolean },
  progress: (done: number, total: number) => void,
): Promise<{ layers: MatchedLayer[] }> {
  const layers = pickMorphLayers(composition, opts.layer);
  const total = layers.length * 100;
  const matched: MatchedLayer[] = [];
  for (const [i, layer] of layers.entries()) {
    const morph = layer.morph!;
    const { a, b } = await loadMorphImages(layer.src, morph.target, projectDir);
    if (!a || !b) throw new Error(`"${layer.name}": couldn't load ${a ? morph.target : layer.src}`);
    const incoming = await autoMatch(a, b, morphViewFor(layer, a, b), {
      onProgress: (p) => progress(i * 100 + Math.round(p * 100), total),
    });
    const pairs = mergeAuto(morph.pairs, incoming);
    const manual = pairs.filter((p) => p.source === 'manual').length;
    matched.push({ layerId: layer.id, layerName: layer.name, pairs, auto: pairs.length - manual, manual, written: false });
    progress((i + 1) * 100, total);
  }
  if (opts.write) {
    await writePairs(projectDir, matched);
    for (const m of matched) m.written = true;
  }
  return { layers: matched };
}
