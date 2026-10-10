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
import { useStore } from '../store';
import { loadProjectFromPath, removeFromRecent } from './project-io';

export type E2eJob =
  | { kind: 'render'; project: string; format: ExportFormat; output: string; quality?: QualityPreset }
  | { kind: 'preview'; project: string; frames: number[] };

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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The workspace canvas's centre pixel, once three reads in a row agree. */
async function settledCenterPixel(): Promise<number[]> {
  const reads: string[] = [];
  for (let i = 0; i < 40; i++) {
    const canvas = document.querySelector<HTMLCanvasElement>('.canvas-workspace canvas');
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      const rgba = Array.from(ctx.getImageData(canvas.width >> 1, canvas.height >> 1, 1, 1).data);
      reads.push(rgba.join());
      if (reads.length >= 3 && reads.slice(-3).every((r) => r === reads[reads.length - 1])) return rgba;
    }
    await sleep(250);
  }
  throw new Error('the workspace canvas never settled');
}

/** The Render panel's video warning, once its probe has had time to finish. */
async function renderWarning(): Promise<string | null> {
  for (let i = 0; i < 20; i++) {
    const text = document.querySelector('.render-warning')?.textContent;
    if (text) return text;
    await sleep(250);
  }
  return null;
}

async function runJob(job: E2eJob): Promise<unknown> {
  switch (job.kind) {
    case 'render': {
      const { path, composition } = await openProject(job.project);
      await renderComposition(composition, job.output, undefined, job.format, job.quality ?? 'medium', path);
      return undefined;
    }
    case 'preview': {
      // Open the project in the editor, show each frame, and read the
      // workspace canvas's centre pixel — the composition's centre.
      const { path, composition } = await openProject(job.project);
      const store = useStore.getState();
      store.setProjectPath(path);
      store.setComposition(composition);
      store.selectLayer(null);
      const pixels: { frame: number; rgba: number[] }[] = [];
      for (const frame of job.frames) {
        useStore.getState().setCurrentFrame(frame);
        await sleep(pixels.length === 0 ? 3000 : 500); // the first frame also loads the media
        pixels.push({ frame, rgba: await settledCenterPixel() });
      }
      return { pixels, warning: await renderWarning() };
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
