// Shared helpers for the acceptance scripts in this folder. They generate the
// spec §7 test media into test-media/, write small .lcs projects, run the
// debug app with LCS_E2E set (src-tauri/src/e2e.rs, src/lib/e2e.ts), and
// inspect the outputs with ffprobe, ffmpeg and node-canvas.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const { createCanvas, loadImage } = createRequire(import.meta.url)('canvas');

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const MEDIA = join(ROOT, 'test-media');
export const W = 1080;
export const H = 1920;

const SIZE = `${W}x${H}`;
// Spec §7, plus -pix_fmt yuv420p on the testsrc clips (libx264 would pick
// 4:4:4, which WebCodecs on macOS can't decode) and the F1 extras.
const RECIPES = {
  'frame-id.mp4': ['-f', 'lavfi', '-i', `nullsrc=s=${SIZE}:r=30:d=4,format=yuv444p,geq=lum='16+mod(N,30)*7':cb=128:cr=128`,
    '-c:v', 'libx264', '-crf', '12', '-pix_fmt', 'yuv420p', '-g', '30'],
  'music.wav': ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=20'],
  'tone.wav': ['-f', 'lavfi', '-i', 'sine=frequency=880:duration=3'],
  'clip-with-audio.mp4': ['-f', 'lavfi', '-i', `testsrc=size=${SIZE}:rate=30:duration=3`,
    '-f', 'lavfi', '-i', 'sine=frequency=660:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest'],
  'clip-silent.mp4': ['-f', 'lavfi', '-i', `testsrc=size=${SIZE}:rate=30:duration=3`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p'],
  'long-clip.mp4': ['-f', 'lavfi', '-i', `testsrc2=size=${SIZE}:rate=30:duration=15`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p'],
  'still.png': ['-f', 'lavfi', '-i', `testsrc2=size=${SIZE}:rate=1`, '-frames:v', '1'],
  'poster.png': ['-f', 'lavfi', '-i', `color=c=0xff0000:s=${SIZE}`, '-frames:v', '1'],
  'prores.mov': ['-f', 'lavfi', '-i', `testsrc=size=${SIZE}:rate=30:duration=2`, '-c:v', 'prores_ks', '-profile:v', '1'],
};

/** Generate any missing test media. */
export function ensureMedia(...names) {
  mkdirSync(MEDIA, { recursive: true });
  for (const name of names) {
    const out = join(MEDIA, name);
    if (!existsSync(out)) execFileSync('ffmpeg', ['-v', 'error', '-y', ...RECIPES[name], out], { stdio: 'inherit' });
  }
}

// ── Projects ─────────────────────────────────────────

export function layer(type, id, extra = {}) {
  return {
    id, name: id, type, startFrame: 0, endFrame: 1, x: W / 2, y: H / 2, width: W, height: H,
    scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, anchorX: 0.5, anchorY: 0.5, zIndex: 0,
    blendMode: 'normal', effects: [], visible: true, locked: false, keyframes: {}, ...extra,
  };
}
export const videoLayer = (id, src, extra = {}) =>
  layer('video', id, { src, startTime: 0, endTime: 0, playbackRate: 1, muted: true, ...extra });
export const audioLayer = (id, src, extra = {}) =>
  layer('audio', id, { src, width: 0, height: 0, startTime: 0, endTime: 0, volume: 1, fadeInFrames: 0, fadeOutFrames: 0, ...extra });
export const imageLayer = (id, src, extra = {}) =>
  layer('image', id, { src, fitMode: 'cover', borderRadius: 0, ...extra });
export const scene = (id, durationFrames, layers) => ({
  id, label: id, durationFrames, backgroundColor: '#000000', layers, transition: 'none', transitionDurationFrames: 0,
});

/** Write `<dir>/<name>.lcs`, copying `assets` from test-media/ into its assets/ folder. */
export function writeProject(dir, name, { width = W, height = H, fps = 30, scenes }, assets = []) {
  const project = join(dir, `${name}.lcs`);
  rmSync(project, { recursive: true, force: true });
  mkdirSync(join(project, 'assets'), { recursive: true });
  for (const asset of assets) copyFileSync(join(MEDIA, asset), join(project, 'assets', asset));
  const composition = { id: name, name, scenes, output: { id: 'custom', label: 'Custom', width, height, fps } };
  writeFileSync(join(project, 'project.json'), JSON.stringify({ version: 3, savedAt: new Date().toISOString(), composition }, null, 2));
  return project;
}

/** A fresh, empty folder under test-media/e2e/. */
export function workDir(name) {
  const dir = join(MEDIA, 'e2e', name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ── Running the app ──────────────────────────────────

const devServerUp = () => fetch('http://localhost:1420').then(() => true, () => false);

async function ensureDevServer() {
  if (await devServerUp()) return null;
  const vite = spawn(join(ROOT, 'node_modules', '.bin', 'vite'), [], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    if (await devServerUp()) return vite;
    await new Promise((r) => setTimeout(r, 300));
  }
  vite.kill();
  throw new Error('the Vite dev server did not come up on :1420');
}

/** Run the debug app on `jobs` (src/lib/e2e.ts) in `dir`, and return its results. */
export async function runApp(dir, jobs, timeoutMs = 15 * 60_000) {
  const script = join(dir, 'script.json');
  const resultFile = join(dir, 'script.result.json');
  writeFileSync(script, JSON.stringify({ jobs }, null, 2));
  rmSync(resultFile, { force: true });

  execFileSync('cargo', ['build', '--manifest-path', join(ROOT, 'src-tauri', 'Cargo.toml')], { stdio: 'inherit' });
  const vite = await ensureDevServer();
  try {
    const app = spawn(join(ROOT, 'src-tauri', 'target', 'debug', 'local-content-studio'), [], {
      env: { ...process.env, LCS_E2E: script },
      stdio: 'inherit',
    });
    await new Promise((res, rej) => {
      const timer = setTimeout(() => { app.kill(); rej(new Error(`the app did not finish within ${timeoutMs / 1000} s`)); }, timeoutMs);
      app.on('exit', () => { clearTimeout(timer); res(); });
      app.on('error', (e) => { clearTimeout(timer); rej(e); });
    });
  } finally {
    vite?.kill();
  }
  if (!existsSync(resultFile)) throw new Error('the app exited without writing results');
  return JSON.parse(readFileSync(resultFile, 'utf8'));
}

// ── Inspecting outputs ───────────────────────────────

/** ffprobe's streams: [{ codec_type, codec_name, duration }]. */
export function streams(file) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,duration', '-of', 'json', file]);
  return JSON.parse(out).streams.map((s) => ({ ...s, duration: Number(s.duration) }));
}

/** Silent stretches [{ start, end }] of a file's audio, optionally through a narrow band filter. */
export function silences(file, { band, noise = band ? '-40dB' : '-50dB' } = {}) {
  const filters = [];
  if (band) filters.push(`bandpass=f=${band}:width_type=q:w=8`, `bandpass=f=${band}:width_type=q:w=8`);
  filters.push(`silencedetect=n=${noise}:d=0.1`);
  const { stderr } = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', filters.join(','), '-f', 'null', '-'], { encoding: 'utf8' });
  const found = [];
  let start = null;
  for (const m of stderr.matchAll(/silence_(start|end): ([\d.]+)/g)) {
    if (m[1] === 'start') start = Number(m[2]);
    else { found.push({ start, end: Number(m[2]) }); start = null; }
  }
  if (start !== null) found.push({ start, end: Infinity });
  return found;
}

/** Whether a tone in `band` Hz is audible at second `t`. */
export const audibleAt = (file, band, t) => !silences(file, { band }).some((g) => g.start <= t && t <= g.end);

async function imageData(file) {
  const img = await loadImage(file);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, img.width, img.height);
}

/** [r, g, b, a] of one pixel of an image file. */
export async function pixel(file, x = W / 2, y = H / 2) {
  const { data, width } = await imageData(file);
  const i = (Math.round(y) * width + Math.round(x)) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

/** Every decoded pixel of an image, for exact comparison. */
export async function pngPixels(file) {
  return Buffer.from((await imageData(file)).data);
}

/**
 * The source frame number (mod 30) a frame-ID clip pixel shows. The clip's
 * luma is 16 + 7·id in limited range, which decodes to grey ≈ 7·id·255/219.
 */
export const frameId = (grey) => Math.round((grey * 219) / 255 / 7);

/** Print PASS/FAIL rows and set the exit code. */
export function report(rows) {
  for (const r of rows) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id}  ${r.detail ?? ''}`);
  const failed = rows.filter((r) => !r.ok).length;
  console.log(failed ? `${failed} check(s) failed` : `all ${rows.length} checks passed`);
  process.exitCode = failed ? 1 : 0;
}
