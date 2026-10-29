// CL1 acceptance (docs/superpowers/specs/2026-10-28-headless-cli-design.md §5):
// `stills` from the command line.
//   A1.2 stills at --scale 1 are byte-identical to the same frames of a PNG-sequence render
//   A1.3 --frames auto picks R1.2's frames; the sheet has the expected grid and labelled strips
//   R1.3 frames outside the video → exit 1 naming the range
//   R1.4 stills replace only their own files
//
//   node scripts/e2e/cli1-stills.mjs
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { ensureDevServer, ensureMedia, imageLayer, layer, report, runCli, scene, workDir, writeProject } from './lib.mjs';

const { loadImage, createCanvas } = createRequire(import.meta.url)('canvas');
ensureMedia('still.png', 'poster.png');
const dir = workDir('cli1-stills');
const out = (name) => join(dir, name);
const rows = [];
const row = (id, ok, detail = '') => rows.push({ id, ok: !!ok, detail });

const W = 540;
const H = 960;
const text = (id, content, extra = {}) => layer('text', id, {
  x: W / 2, y: 200, width: W - 60, height: 120, content, fontSize: 64, fontFamily: 'sans-serif', fontWeight: 'bold',
  fontStyle: 'normal', color: '#ffffff', align: 'center', verticalAlign: 'middle', lineHeight: 1.2, letterSpacing: 0,
  maxWidth: 0, textStroke: null, textShadow: null, ...extra,
});
const track = (...pairs) => ({ keyframes: pairs.map(([frame, value]) => ({ frame, value, easing: 'linear' })) });

// Frames 0–29 (a 12-frame cube out from 18), 30–49 (a morph over the whole scene), 50–89 (a fade set, but nothing follows).
const project = writeProject(dir, 'stills', {
  width: W, height: H, fps: 30, scenes: [
    { ...scene('hook', 30, [
      imageLayer('photo', 'assets/still.png', { endFrame: 30, x: W / 2, y: H / 2, width: W, height: H }),
      text('t', 'STOP SCROLLING', { endFrame: 30, zIndex: 1 }),
    ]), label: 'Hook', transition: 'cube', transitionDurationFrames: 12 },
    { ...scene('morph', 20, [
      imageLayer('m', 'assets/still.png', {
        endFrame: 20, x: W / 2, y: H / 2, width: W, height: H,
        morph: { target: 'assets/poster.png', pairs: [], progress: 0 }, keyframes: { morphProgress: track([0, 0], [19, 1]) },
      }),
    ]), label: 'Before → after', transition: 'none', transitionDurationFrames: 0 },
    { ...scene('end', 40, [text('u', 'LINK IN BIO', { endFrame: 40, y: 700, color: '#ffe14d' })]),
      label: 'End card', backgroundColor: '#2a1050', transition: 'fade', transitionDurationFrames: 15 },
  ],
}, ['still.png', 'poster.png']);

const AUTO = [[12, 'hook'], [17, 'settled'], [24, 'transition'], [39, 'morph'], [49, 'settled'], [89, 'settled']];
const pngs = (d) => (existsSync(d) ? readdirSync(d).filter((f) => f.endsWith('.png')).sort() : []);

const vite = await ensureDevServer();
try {
  // ── A1.2
  {
    const render = await runCli(['render', project, '--out', out('sequence')]);
    const r = await runCli(['stills', project, '--out', out('exact'), '--frames', '0,45,89', '--scale', '1']);
    const names = ['frame-0000.png', 'frame-0045.png', 'frame-0089.png'];
    const differ = names.filter((f) => !existsSync(join(out('exact'), f)) || !readFileSync(join(out('exact'), f)).equals(readFileSync(join(out('sequence'), f))));
    row('A1.2 stills at --scale 1 byte-identical to the PNG-sequence frames 0, 45, 89',
      render.code === 0 && r.code === 0 && differ.length === 0,
      `render exit ${render.code}, stills exit ${r.code}${r.result?.error ? ` (${r.result.error})` : ''}, differ: ${differ.join(', ') || 'none'}`);
    const listed = r.result?.data?.frames?.map((f) => [f.frame, f.why, f.file.split('/').pop()]);
    row('A1.2 the result lists each still', JSON.stringify(listed) === JSON.stringify(names.map((n, i) => [[0, 45, 89][i], 'requested', n])), JSON.stringify(listed));
  }

  // ── A1.3 and R1.4
  {
    mkdirSync(out('auto'), { recursive: true });
    writeFileSync(join(out('auto'), 'notes.txt'), 'mine');
    const r = await runCli(['stills', project, '--out', out('auto')]);
    const got = r.result?.data?.frames?.map((f) => [f.frame, f.why]);
    row('A1.3 --frames auto picks R1.2\'s frames', r.code === 0 && JSON.stringify(got) === JSON.stringify(AUTO), `exit ${r.code}: ${JSON.stringify(got)}`);
    const scenes = r.result?.data?.frames?.map((f) => f.sceneLabel);
    row('A1.3 each still names its scene', JSON.stringify(scenes) === JSON.stringify(['Hook', 'Hook', 'Hook', 'Before → after', 'Before → after', 'End card']), JSON.stringify(scenes));

    const files = readdirSync(out('auto')).sort();
    const want = [...AUTO.map(([f]) => `frame-${String(f).padStart(4, '0')}.png`), 'notes.txt', 'sheet.png'].sort();
    row('R1.4 only the stills, the sheet and what was already there', JSON.stringify(files) === JSON.stringify(want) && readFileSync(join(out('auto'), 'notes.txt'), 'utf8') === 'mine', files.join(', '));

    const frame = await loadImage(join(out('auto'), 'frame-0012.png'));
    row('A1.3 frame PNGs at the default --scale 0.5', frame.width === W / 2 && frame.height === H / 2, `${frame.width}×${frame.height}`);

    // 4 columns (portrait), 2 rows of 135×240 thumbnails with 40 px strips and 8 px gutters.
    const sheetPath = r.result?.data?.sheet;
    if (sheetPath && existsSync(sheetPath)) {
      const sheet = await loadImage(sheetPath);
      const [tw, th] = [W / 4, H / 4];
      const ok = sheet.width === 4 * tw + 5 * 8 && sheet.height === 2 * (th + 40) + 3 * 8;
      row('A1.3 sheet grid: 4 columns × 2 rows', ok, `${sheet.width}×${sheet.height}`);
      const c = createCanvas(sheet.width, sheet.height);
      const ctx = c.getContext('2d');
      ctx.drawImage(sheet, 0, 0);
      const strip = ctx.getImageData(8, 8 + th, tw, 40).data;
      const colours = new Set();
      for (let i = 0; i < strip.length; i += 4) colours.add(`${strip[i]},${strip[i + 1]},${strip[i + 2]}`);
      const bg = ctx.getImageData(2, 2, 1, 1).data;
      row('A1.3 the first strip has a label on it (many colours, not the background)', colours.size > 10 && !colours.has(`${bg[0]},${bg[1]},${bg[2]}`), `${colours.size} colours`);
    } else {
      row('A1.3 sheet.png written', false, String(sheetPath));
    }
  }

  // ── R1.3
  {
    const r = await runCli(['stills', project, '--out', out('range'), '--frames', '0,90']);
    row('R1.3 a frame outside the video → exit 1, naming the range', r.code === 1 && /frames run 0–89/.test(r.result?.error ?? ''), `exit ${r.code}: ${r.result?.error}`);
    row('R1.3 … and no stills written', pngs(out('range')).length === 0);
  }
} finally {
  vite?.kill();
}
report(rows);
