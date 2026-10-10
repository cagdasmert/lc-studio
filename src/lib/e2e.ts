/**
 * Scripted acceptance runs for scripts/e2e/. Debug builds only: the app is
 * started with LCS_E2E=<script.json> (see src-tauri/src/e2e.rs), runs the
 * script's jobs here in the real webview, hands the results back and quits.
 * App.tsx loads this module behind import.meta.env.DEV, so production
 * bundles never include it.
 */
import { invoke } from '@tauri-apps/api/core';
import type { ExportFormat, QualityPreset } from '../types';
import { renderComposition } from '../renderer/capture';
import { loadProjectFromPath, removeFromRecent } from './project-io';

export type E2eJob =
  | { kind: 'render'; project: string; format: ExportFormat; output: string; quality?: QualityPreset };

export interface E2eResult {
  job: E2eJob;
  ok: boolean;
  ms: number;
  error?: string;
  data?: unknown;
}

let started = false;

async function openProject(path: string) {
  const project = await loadProjectFromPath(path);
  removeFromRecent(project.path); // keep test projects out of the recent list
  return project;
}

async function runJob(job: E2eJob): Promise<unknown> {
  switch (job.kind) {
    case 'render': {
      const { path, composition } = await openProject(job.project);
      await renderComposition(composition, job.output, undefined, job.format, job.quality ?? 'medium', path);
      return undefined;
    }
  }
}

export async function runE2eIfRequested(): Promise<void> {
  // StrictMode mounts twice in development; run once. Outside Tauri there's no script.
  if (started || !('__TAURI_INTERNALS__' in window)) return;
  started = true;
  const script = await invoke<string | null>('e2e_script');
  if (!script) return;

  const { jobs } = JSON.parse(script) as { jobs: E2eJob[] };
  const results: E2eResult[] = [];
  for (const job of jobs) {
    const start = performance.now();
    try {
      const data = await runJob(job);
      results.push({ job, ok: true, ms: performance.now() - start, data });
    } catch (err) {
      results.push({ job, ok: false, ms: performance.now() - start, error: String(err) });
    }
  }
  await invoke('e2e_finish', { result: JSON.stringify(results, null, 2) });
}
