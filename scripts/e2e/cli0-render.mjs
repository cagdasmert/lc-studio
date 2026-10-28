// CL0 acceptance (docs/superpowers/specs/2026-10-28-headless-cli-design.md §4):
// the debug app as a command-line renderer.
//   A0.2 render → an MP4 with the fixture's size, fps, frame count and audio; stdout is the result
//   A0.3 a CLI PNG sequence is byte-identical to the e2e render job's
//   A0.4 failure paths and their exit codes
//   A0.5 R0.10 (a) hidden render within 4× the visible e2e render, plus 3 s
//               (b) with --long: every minute of a 6+ minute render within 15 % of the first
//               (c) same frames: A0.3, which renders a GL transition
//
//   node scripts/e2e/cli0-render.mjs [--long]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  audioLayer, buildDebug, devServerUp, ensureDevServer, ensureMedia, imageLayer, layer, report, runApp, runCli, scene,
  workDir, writeProject,
} from './lib.mjs';

const LONG = process.argv.includes('--long');
ensureMedia('still.png', 'music.wav');
const dir = workDir('cli0-render');
const out = (name) => join(dir, name);
const rows = [];
const row = (id, ok, detail = '') => rows.push({ id, ok: !!ok, detail });

const text = (id, content, w, extra = {}) => layer('text', id, {
  x: w / 2, y: 300, width: w - 60, height: 120, content, fontSize: 64, fontFamily: 'sans-serif', fontWeight: 'bold',
  fontStyle: 'normal', color: '#ffffff', align: 'center', verticalAlign: 'middle', lineHeight: 1.2, letterSpacing: 0,
  maxWidth: 0, textStroke: null, textShadow: null, ...extra,
});

// 540×960, 60 frames: a photo and a title, a cube (GL) transition, a second scene, and music.
const W = 540;
const H = 960;
const basic = writeProject(dir, 'basic', {
  width: W, height: H, fps: 30, scenes: [
    { ...scene('a', 30, [
      imageLayer('photo', 'assets/still.png', { endFrame: 30, x: W / 2, y: H / 2, width: W, height: H }),
      text('t', 'COMMAND LINE', W, { endFrame: 30, zIndex: 1 }),
      audioLayer('music', 'assets/music.wav', { endFrame: 30 }),
    ]), transition: 'cube', transitionDurationFrames: 20 },
    { ...scene('b', 30, [text('u', 'RENDERED', W, { endFrame: 30, y: 600, color: '#ffe14d' })]), backgroundColor: '#2a1050' },
  ],
}, ['still.png', 'music.wav']);

// fx-gl.mjs's A5.7 project: 15 s, 1080×1920, a GL transition between each of five scenes.
const longScenes = (transitions) => transitions.concat('none').map((t, i) => ({
  ...scene(`s${i}`, 90, [imageLayer(`p${i}`, 'assets/still.png', { endFrame: 90 }), text(`t${i}`, `SCENE ${i + 1}`, 1080, {
    endFrame: 90, y: 1500, height: 200, fontSize: 120, zIndex: 1 })]),
  transition: t, transitionDurationFrames: t === 'none' ? 0 : 20,
}));
const GL = ['cube', 'page-curl', 'film-burn', 'ascii-sweep'];
const longGl = writeProject(dir, 'long-gl', { scenes: longScenes(GL) }, ['still.png']);

/** Video stream facts from ffprobe, counting the frames. */
function videoFacts(file) {
  const json = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries',
    'stream=width,height,r_frame_rate,nb_read_frames', '-of', 'json', file], { encoding: 'utf8' });
  const s = JSON.parse(json).streams[0];
  return { width: s.width, height: s.height, fps: s.r_frame_rate, frames: Number(s.nb_read_frames) };
}
const audioStreams = (file) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries',
  'stream=codec_name', '-of', 'json', file], { encoding: 'utf8' })).streams.length;
const sec = (ms) => `${(ms / 1000).toFixed(2)} s`;

buildDebug();

// ── A0.4 first: with nothing on :1420, a debug build's frontend never loads.
if (await devServerUp()) {
  row('A0.4 Vite down → exit 2 within 35 s', true, 'skipped: something is already serving :1420');
} else {
  const r = await runCli(['render', basic, '--out', out('no-vite.mp4')], { timeoutMs: 60_000 });
  row('A0.4 Vite down → exit 2 within 35 s, says why', r.code === 2 && r.ms < 35_000 && /did not load/.test(r.result?.error ?? ''),
    `exit ${r.code} after ${sec(r.ms)}: ${r.result?.error}`);
}
const vite = await ensureDevServer();

try {
  // ── A0.2
  {
    const r = await runCli(['render', basic, '--out', out('basic.mp4'), '--result', out('basic.result.json')]);
    const doc = r.result ?? {};
    row('A0.2 exit 0, stdout is a result with ok and schema 1', r.code === 0 && doc.ok === true && doc.schema === 1 && doc.command === 'render',
      `exit ${r.code}, ok ${doc.ok}, schema ${doc.schema}${doc.error ? `, error: ${doc.error}` : ''}`);
    const file = existsSync(out('basic.result.json')) ? JSON.parse(readFileSync(out('basic.result.json'), 'utf8')) : null;
    row('A0.2 --result holds the same document', JSON.stringify(file) === JSON.stringify(r.result));
    const c = doc.composition ?? {};
    row('A0.2 the result describes the composition', c.width === W && c.height === H && c.fps === 30 && c.frames === 60 && c.seconds === 2,
      JSON.stringify(c));
    if (existsSync(out('basic.mp4'))) {
      const v = videoFacts(out('basic.mp4'));
      row('A0.2 ffprobe: 540×960, 30 fps, 60 frames', v.width === W && v.height === H && v.fps === '30/1' && v.frames === 60, JSON.stringify(v));
      row('A0.2 ffprobe: the music is in it', audioStreams(out('basic.mp4')) === 1);
    } else {
      row('A0.2 the MP4 exists', false);
    }
    row('A0.2 progress on stderr', r.lines.some((l) => l.text === '[lcs] render 60/60 (100%)'), r.lines.map((l) => l.text).join(' | ').slice(0, 200));
  }

  // ── A0.3
  {
    const [job] = await runApp(dir, [{ kind: 'render', project: basic, format: 'png-sequence', output: out('e2e-frames') }]);
    const r = await runCli(['render', basic, '--out', out('cli-frames')]);
    const list = (d) => (existsSync(d) ? readdirSync(d).filter((f) => f.endsWith('.png')).sort() : []);
    const want = list(out('e2e-frames'));
    const got = list(out('cli-frames'));
    const differ = want.filter((f) => !got.includes(f) || !readFileSync(join(out('cli-frames'), f)).equals(readFileSync(join(out('e2e-frames'), f))));
    row('A0.3 CLI PNG sequence byte-identical to the e2e job\'s (incl. a GL transition)',
      job.ok && r.code === 0 && want.length === 60 && got.length === 60 && differ.length === 0,
      `e2e ${job.ok ? want.length : job.error} frames, CLI exit ${r.code} ${got.length} frames, ${differ.length} differ${differ.length ? `: ${differ.slice(0, 5).join(', ')}` : ''}`);
  }

  // ── A0.4
  {
    mkdirSync(out('not-a-project'), { recursive: true });
    let r = await runCli(['render', out('not-a-project'), '--out', out('x.mp4')]);
    row('A0.4 not a project → exit 2 before any window', r.code === 2 && r.ms < 3000 && /not an lc-studio project/.test(r.result?.error ?? ''),
      `exit ${r.code} after ${sec(r.ms)}: ${r.result?.error}`);

    mkdirSync(join(basic, '.draft'), { recursive: true });
    writeFileSync(join(basic, '.draft', 'draft.json'), JSON.stringify({ draft: { name: 'x', output: 'tiktok', scenes: [] } }));
    r = await runCli(['render', join(basic, '.draft', 'draft.json'), '--out', out('x.mp4')]);
    row('A0.4 a draft → exit 2, points at lcs.py build', r.code === 2 && /this is a draft.*lcs\.py build/.test(r.result?.error ?? ''), r.result?.error);

    r = await runCli(['render', basic, '--out', out('basic.mp4')]);
    row('A0.4 existing --out without --force → exit 2', r.code === 2 && /--force/.test(r.result?.error ?? ''), r.result?.error);

    r = await runCli(['render', basic, '--out', out('no-ffmpeg.mp4')], { env: { PATH: '/usr/bin:/bin' } });
    row('A0.4 no FFmpeg on PATH → exit 1, ffmpeg-missing', r.code === 1 && r.result?.ok === false && r.result.issues.some((i) => i.code === 'ffmpeg-missing'),
      `exit ${r.code}: ${r.result?.error}`);
    row('A0.4 … and no output file', !existsSync(out('no-ffmpeg.mp4')));

    r = await runCli(['render', basic, '--out', out('x.mp4'), '--fps', '60']);
    row('A0.4 unknown option → exit 2, usage on stderr', r.code === 2 && r.stderr.includes('unknown option --fps') && r.stderr.includes('Usage:'));

    // (A bare project path is a GUI launch; cli.rs's unit tests cover that without opening a window.)
    r = await runCli(['--help']);
    row('A0.1 --help → exit 0, usage on stdout', r.code === 0 && r.stdout.startsWith('Usage:'));
  }

  // ── A0.5 (a)
  {
    const [job] = await runApp(dir, [{ kind: 'render', project: longGl, format: 'mp4', output: out('long-gl-e2e.mp4') }]);
    const r = await runCli(['render', longGl, '--out', out('long-gl-cli.mp4')]);
    const ok = job.ok && r.code === 0;
    row('A0.5 (a) hidden CLI render ≤ 4× the visible e2e render + 3 s', ok && r.ms <= 4 * job.ms + 3000,
      ok ? `CLI ${sec(r.ms)} wall (${sec(r.result.ms)} in the job) vs e2e ${sec(job.ms)}: ${(r.ms / job.ms).toFixed(2)}× wall, ${(r.result.ms / job.ms).toFixed(2)}× job` : `${job.error ?? ''} ${r.result?.error ?? ''}`);
    if (ok) {
      const v = videoFacts(out('long-gl-cli.mp4'));
      row('A0.5 (c) the CLI MP4 has every frame', v.frames === 450 && v.width === 1080 && v.height === 1920, JSON.stringify(v));
      row('A0.5 the result says WebGL2 was available', r.result.composition.gl === true);
    }
  }

  // ── A0.5 (b): 38 copies of long-gl's 450 frames, about 6.5 minutes hidden.
  if (LONG) {
    const file = JSON.parse(readFileSync(join(longGl, 'project.json'), 'utf8'));
    const scenes = [];
    for (let i = 0; i < 38; i++) {
      for (const [k, s] of file.composition.scenes.entries()) {
        scenes.push({ ...s, id: `${s.id}-${i}`, transition: GL[k % GL.length], transitionDurationFrames: 20 });
      }
    }
    scenes[scenes.length - 1] = { ...scenes[scenes.length - 1], transition: 'none', transitionDurationFrames: 0 };
    const longRun = writeProject(dir, 'long-run', { scenes }, ['still.png']);
    const r = await runCli(['render', longRun, '--out', out('long-run.mp4')], { timeoutMs: 30 * 60_000 });
    const marks = r.lines.map((l) => ({ ms: l.ms, frame: Number(/render (\d+)\//.exec(l.text)?.[1]) })).filter((m) => m.frame);
    const fps = [];
    for (let minute = 1; ; minute++) {
      const end = marks.findLast((m) => m.ms <= minute * 60_000);
      const start = marks.findLast((m) => m.ms <= (minute - 1) * 60_000) ?? marks[0];
      if (!end || end === marks[marks.length - 1] || end === start) break;
      fps.push((end.frame - start.frame) / ((end.ms - start.ms) / 1000));
    }
    row('A0.5 (b) 6+ full minutes, each within 15 % of the first', r.code === 0 && fps.length >= 6 && fps.every((f) => f >= 0.85 * fps[0]),
      `exit ${r.code}, ${sec(r.ms)}, fps per minute: ${fps.map((f) => f.toFixed(1)).join(', ')}`);
  }
} finally {
  vite?.kill();
}
report(rows);
