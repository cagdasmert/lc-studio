/**
 * Scripted acceptance runs for scripts/e2e/. Debug builds only: the app is
 * started with LCS_E2E=<script.json> (see src-tauri/src/e2e.rs), runs the
 * script's jobs here in the real webview, hands the results back and quits.
 * App.tsx loads this module behind import.meta.env.DEV, so production
 * bundles never include it.
 */
import { invoke } from '@tauri-apps/api/core';
import { writeFile, writeTextFile } from '@tauri-apps/plugin-fs';
import type { ExportFormat, QualityPreset } from '../types';
import { renderProject } from './render-project';
import { AudioEngine } from '../renderer/audio';
import { getTotalFrames } from '../renderer/compositor';
import { MediaBlobCache } from './media-bytes';
import { useStore } from '../store';
import { loadProjectFromPath, removeFromRecent, saveProject } from './project-io';
import { copyAssetToProject } from './asset-manager';
import { getGl, setGlDisabled } from '../renderer/gl/context';
import { runPassInto, type ProgramDef } from '../renderer/gl/pass';
import { HASH_GLSL } from '../renderer/gl/hash.glsl';
import { hash } from '../renderer/noise';

export type E2eJob =
  | { kind: 'render'; project: string; format: ExportFormat; output: string; quality?: QualityPreset; disableGl?: boolean }
  | { kind: 'preview'; project: string; frames: number[]; disableGl?: boolean }
  | { kind: 'gl' }
  | { kind: 'preview-audio'; project: string; output: string }
  | { kind: 'play'; project: string; seconds: number }
  | { kind: 'save'; project: string; importFrom: string; outsideScope: string };

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

/** The Render panel's warnings (joined), once the video probe has had time to finish. */
async function renderWarning(): Promise<string | null> {
  let text = '';
  for (let i = 0; i < 20; i++) {
    text = [...document.querySelectorAll('.render-warning')].map((e) => e.textContent ?? '').join('\n');
    if (text && i >= 4) return text;
    await sleep(250);
  }
  return text || null;
}

const IDENTITY: ProgramDef = {
  name: 'e2e:identity', version: '300 es', samplers: ['u_src'],
  fragment: `#version 300 es
precision highp float;
uniform sampler2D u_src;
in vec2 v_uv;
out vec4 o_color;
void main() { o_color = texture(u_src, v_uv); }`,
};

const HASH_GRID: ProgramDef = {
  name: 'e2e:hash', version: '300 es', samplers: [],
  fragment: `#version 300 es
precision highp float;
${HASH_GLSL}
out vec4 o_color;
void main() {
  vec2 p = floor(gl_FragCoord.xy);
  o_color = vec4(lcsHash3(p.x - 32.0, p.y * 7.0 - 100.0, 77.0), lcsHash2(p.x * 13.0, p.y), lcsHash4(p.x, p.y, 4111.0, -3.0), 1.0);
}`,
};

/** A5.1 and A5.2: an identity pass round-trips a test image; the GPU hash matches the CPU one. */
function glChecks() {
  if (!getGl()) return { available: false };
  const N = 64;
  const src = document.createElement('canvas');
  src.width = N; src.height = N;
  const sctx = src.getContext('2d')!;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    sctx.fillStyle = `rgba(${x * 4},${y * 4},${(x * y) % 256},${y < 32 ? 1 : ((x * 4) % 256) / 255})`;
    sctx.fillRect(x, y, 1, 1);
  }
  const want = sctx.getImageData(0, 0, N, N).data;
  const out = document.createElement('canvas');
  out.width = N; out.height = N;
  const octx = out.getContext('2d')!;
  runPassInto(octx, 0, 0, N, N, IDENTITY, [src], {});
  const got = octx.getImageData(0, 0, N, N).data;
  let opaque = 0; let translucent = 0;
  for (let i = 0; i < got.length; i += 4) {
    const err = Math.max(...[0, 1, 2, 3].map((k) => Math.abs(got[i + k] - want[i + k])));
    if (want[i + 3] === 255) opaque = Math.max(opaque, err);
    else if (want[i + 3] >= 32) translucent = Math.max(translucent, err);
  }

  const h = document.createElement('canvas');
  h.width = N; h.height = N;
  const hctx = h.getContext('2d')!;
  runPassInto(hctx, 0, 0, N, N, HASH_GRID, [], {});
  const hd = hctx.getImageData(0, 0, N, N).data;
  let hashErr = 0;
  for (let row = 0; row < N; row++) for (let x = 0; x < N; x++) {
    const y = N - 1 - row; // GL's y runs up
    const i = (row * N + x) * 4;
    const want3 = [hash(x - 32, y * 7 - 100, 77), hash(x * 13, y), hash(x, y, 4111, -3)];
    for (let k = 0; k < 3; k++) hashErr = Math.max(hashErr, Math.abs(hd[i + k] / 255 - want3[k]));
  }
  return { available: true, identity: { opaque, translucent }, hashMaxError: hashErr };
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
    case 'gl':
      return glChecks();
    case 'render':
      // The command line's render path, so the two can't drift apart.
      await renderProject({ project: job.project, output: job.output, format: job.format, quality: job.quality ?? 'medium' });
      return undefined;
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
    case 'save': {
      // Import a file as the Add Layer dialog does, then save the project
      // (whose layer points at that file outside it, so Save must bundle it).
      // Failures are reported, not thrown, so the script can see each one.
      const { path, composition } = await openProject(job.project);
      const out: { imported?: string; importError?: string; savedSrc?: string; saveError?: string; outsideError?: string } = {};
      try {
        out.imported = await copyAssetToProject(job.importFrom, path);
      } catch (err) {
        out.importError = String(err);
      }
      try {
        const saved = await saveProject(path, { ...composition, name: 'saved by e2e' });
        out.savedSrc = (saved.composition.scenes[0].layers[0] as { src?: string }).src;
      } catch (err) {
        out.saveError = String(err);
      } finally {
        removeFromRecent(path);
      }
      // The write permissions must not reach past the runtime scope.
      try {
        await writeTextFile(job.outsideScope, 'should not be written');
      } catch (err) {
        out.outsideError = String(err);
      }
      return out;
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
    // The debug-only switch that makes getGl() return null, for fallback runs.
    setGlDisabled('disableGl' in job && !!job.disableGl);
    try {
      const data = await runJob(job);
      results.push({ job, ok: true, ms: performance.now() - start, data });
    } catch (err) {
      results.push({ job, ok: false, ms: performance.now() - start, error: String(err) });
    } finally {
      setGlDisabled(false);
    }
  }
  await invoke('e2e_finish', { result: JSON.stringify(results, null, 2) });
}
