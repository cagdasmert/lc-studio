/**
 * Command-line runs (`local-content-studio render …`, src-tauri/src/cli.rs).
 * On startup the app asks Rust for a job; a normal launch has none, and the
 * runner (./run) is only loaded when there is one.
 */
import { invoke } from '@tauri-apps/api/core';
import type { CliJob } from './run';

let started = false;
let active = false;

/** True while a command-line job runs. Autosave stays off. */
export function cliActive(): boolean {
  return active;
}

export async function runCliIfRequested(): Promise<void> {
  // StrictMode mounts twice in development; run once. Outside Tauri there's no job.
  if (started || !('__TAURI_INTERNALS__' in window)) return;
  started = true;
  const job = await invoke<CliJob | null>('cli_job');
  if (!job) return;
  active = true;
  try {
    const { runCliJob } = await import('./run');
    await runCliJob(job);
  } catch (err) {
    // The runner's chunk didn't load: report that instead of waiting for the watchdog.
    const error = `the runner failed to start: ${err instanceof Error ? err.message : String(err)}`;
    const result = { schema: job.schema, app: job.app, command: job.command, project: job.project, ok: false, error, issues: [] };
    await invoke('cli_finish', { result: JSON.stringify(result, null, 2) });
  }
}
