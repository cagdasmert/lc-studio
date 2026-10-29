/**
 * Open a project and render it the way the Render panel exports it. Shared by
 * the command line (src/lib/cli/) and the e2e `render` job. Both draw straight
 * after loading, so the project's bundled fonts are awaited first, and neither
 * adds the project to the recent list. Command-line stills open with
 * openForRender too.
 */
import type { Composition, ExportFormat, QualityPreset } from '../types';
import { renderComposition } from '../renderer/capture';
import { loadProjectFromPath } from './project-io';

export interface OpenedProject {
  path: string;
  composition: Composition;
}

/** Open a project to draw from at once: fonts registered, kept out of the recent list. */
export function openForRender(project: string): Promise<OpenedProject> {
  return loadProjectFromPath(project, { recent: false, awaitFonts: true });
}

export async function renderProject(opts: {
  project: string;
  output: string;
  format: ExportFormat;
  quality: QualityPreset;
  onProgress?: (current: number, total: number) => void;
  /** Runs after loading and before the first frame; throw to stop. */
  beforeRender?: (opened: OpenedProject) => Promise<void>;
}): Promise<OpenedProject> {
  const opened = await openForRender(opts.project);
  await opts.beforeRender?.(opened);
  await renderComposition(opened.composition, opts.output, opts.onProgress, opts.format, opts.quality, opened.path);
  return opened;
}
