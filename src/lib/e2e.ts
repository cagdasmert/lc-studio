/**
 * Scripted acceptance runs for scripts/e2e/. Debug builds only: the app is
 * started with LCS_E2E=<script.json> (see src-tauri/src/e2e.rs), runs the
 * script's jobs here in the real webview, hands the results back and quits.
 * App.tsx loads this module behind import.meta.env.DEV, so production
 * bundles never include it.
 */
import { invoke } from '@tauri-apps/api/core';
import { writeFile } from '@tauri-apps/plugin-fs';
import type { ExportFormat, QualityPreset } from '../types';
import { renderComposition } from '../renderer/capture';
import { AudioEngine } from '../renderer/audio';
import { getTotalFrames } from '../renderer/compositor';
import { MediaBlobCache } from './media-bytes';
import { useStore } from '../store';
import { loadProjectFromPath, removeFromRecent } from './project-io';

export type E2eJob =
  | { kind: 'render'; project: string; format: ExportFormat; output: string; quality?: QualityPreset }
  | { kind: 'preview'; project: string; frames: number[] }
  | { kind: 'preview-audio'; project: string; output: string }
  | { kind: 'play'; project: string; seconds: number };

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

/** 16-bit PCM WAV of a rendered buffer. */
function encodeWav(buffer: AudioBuffer): Uint8Array {
  const channels = buffer.numberOfChannels;
  const frames = buffer.length;
  const bytes = frames * channels * 2;
  const view = new DataView(new ArrayBuffer(44 + bytes));
  const text = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + bytes, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, bytes, true);
  const data = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
  let offset = 44;
  for (let i = 0; i < frames; i++) {
    for (const channel of data) {
      const s = Math.max(-1, Math.min(1, channel[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return new Uint8Array(view.buffer);
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
    case 'play': {
      // Press play in the editor and record every sound the workspace's
      // AudioEngine starts: [context time, when, offset, duration, context state].
      const { path, composition } = await openProject(job.project);
      const store = useStore.getState();
      store.setProjectPath(path);
      store.setComposition(composition);
      store.setCurrentFrame(0);
      await sleep(2000); // the engine decodes the files
      const starts: (number | string)[][] = [];
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (this: AudioBufferSourceNode, when?: number, offset?: number, duration?: number) {
        starts.push([this.context.currentTime, when ?? 0, offset ?? 0, duration ?? -1, this.context.state]);
        return start.call(this, when, offset, duration);
      };
      try {
        useStore.getState().setPlaying(true);
        await sleep(job.seconds * 1000);
      } finally {
        useStore.getState().setPlaying(false);
        AudioBufferSourceNode.prototype.start = start;
      }
      return { starts };
    }
    case 'preview-audio': {
      // The preview's own scheduling, rendered into an OfflineAudioContext
      // instead of the speakers, so it can be compared with the export.
      const { path, composition } = await openProject(job.project);
      const blobs = new MediaBlobCache(path);
      const engine = new AudioEngine((src) => blobs.get(src));
      try {
        await engine.preload(composition);
        const seconds = getTotalFrames(composition) / composition.output.fps;
        const ctx = new OfflineAudioContext(2, Math.ceil(seconds * 48000), 48000);
        engine.schedule(ctx, composition, 0, 0);
        await writeFile(job.output, encodeWav(await ctx.startRendering()));
        return { seconds };
      } finally {
        engine.dispose();
      }
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
