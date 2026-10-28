/**
 * Runs one command-line job in the webview and hands the result to Rust,
 * whose cli_finish prints it and exits (src-tauri/src/cli.rs). The result's
 * shape is §3 of docs/superpowers/specs/2026-10-28-headless-cli-design.md.
 */
import { invoke } from '@tauri-apps/api/core';
import type { Composition, ExportFormat, QualityPreset } from '../../types';
import { getTotalFrames } from '../../renderer/compositor';
import { glAvailable } from '../../renderer/gl/context';
import { checkFfmpeg } from '../tauri-bridge';
import { openForRender, renderProject } from '../render-project';
import { renderWarnings, type Issue } from './issues';
import { renderStills, type StillsOptions } from './stills';

/** The job as cli_job sends it: the parsed arguments, already checked by Rust. */
export interface RenderJob {
  command: 'render';
  schema: number;
  app: string;
  project: string;
  out: string;
  format: ExportFormat;
  quality: QualityPreset;
}
export interface StillsJob extends StillsOptions {
  command: 'stills';
  schema: number;
  app: string;
  project: string;
}
export type CliJob = RenderJob | StillsJob;

export interface CliResult {
  schema: number;
  app: string;
  command: CliJob['command'];
  project: string;
  ok: boolean;
  error: string | null;
  ms: number;
  composition: { width: number; height: number; fps: number; frames: number; seconds: number; gl: boolean } | null;
  issues: Issue[];
  data: unknown;
}

type Progress = (done: number, total: number, stage: string) => void;

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

function summary(composition: Composition): CliResult['composition'] {
  const { width, height, fps } = composition.output;
  const frames = getTotalFrames(composition);
  return { width, height, fps, frames, seconds: frames / fps, gl: glAvailable() };
}

async function render(job: RenderJob, result: CliResult, progress: Progress): Promise<void> {
  await renderProject({
    project: job.project,
    output: job.out,
    format: job.format,
    quality: job.quality,
    onProgress: (done, total) => progress(done, total, 'render'),
    beforeRender: async ({ path, composition }) => {
      result.composition = summary(composition);
      result.issues.push(...(await renderWarnings(composition, path)));
      if (job.format === 'png-sequence') return;
      try {
        await checkFfmpeg();
      } catch (err) {
        result.issues.push({ severity: 'error', code: 'ffmpeg-missing', message: `FFmpeg not found: ${message(err)}` });
        throw new Error(`FFmpeg is needed for ${job.format} (e.g. \`brew install ffmpeg\`); a PNG sequence renders without it`);
      }
    },
  });
  result.data = { output: job.out, format: job.format, quality: job.quality };
}

async function stills(job: StillsJob, result: CliResult, progress: Progress): Promise<void> {
  const { path, composition } = await openForRender(job.project);
  result.composition = summary(composition);
  result.issues.push(...(await renderWarnings(composition, path)));
  result.data = await renderStills(composition, path, job, (done, total) => progress(done, total, 'stills'));
}

export async function runCliJob(job: CliJob): Promise<void> {
  const t0 = performance.now();
  const result: CliResult = {
    schema: job.schema, app: job.app, command: job.command, project: job.project,
    ok: false, error: null, ms: 0, composition: null, issues: [], data: null,
  };

  // Progress at most every 250 ms (Rust prints at most once a second), and a
  // heartbeat for steps without progress, such as loading media.
  let lastSent = 0;
  const progress: Progress = (done, total, stage) => {
    const now = performance.now();
    if (done !== total && now - lastSent < 250) return;
    lastSent = now;
    invoke('cli_progress', { done, total, stage }).catch(() => {});
  };
  const heartbeat = setInterval(() => progress(0, 0, 'heartbeat'), 5000);

  let finished = false;
  const finish = async () => {
    if (finished) return;
    finished = true;
    clearInterval(heartbeat);
    result.ms = Math.round(performance.now() - t0);
    await invoke('cli_finish', { result: JSON.stringify(result) });
  };
  // An error that escapes the job still ends the run, rather than leaving it to the watchdog.
  const escaped = (err: unknown) => {
    if (finished) return;
    result.ok = false;
    result.error = `uncaught: ${message(err)}`;
    void finish();
  };
  window.addEventListener('error', (e) => {
    if (!/ResizeObserver loop/.test(e.message)) escaped(e.error ?? e.message);
  });
  window.addEventListener('unhandledrejection', (e) => escaped(e.reason));

  try {
    switch (job.command) {
      case 'render':
        await render(job, result, progress);
        break;
      case 'stills':
        await stills(job, result, progress);
        break;
    }
    result.ok = true;
  } catch (err) {
    result.error = message(err);
  }
  await finish();
}
