// FX pack P3 (docs/superpowers/specs/2026-10-19-fx-pack-design.md): lens
// layers in the real app. A3.6: the preview's centre pixel equals the PNG
// export's at three frames of a scene with a moving lens. Also exports a
// showcase of the four modes over a test image, for review by eye.
import { join } from 'node:path';
import { ensureMedia, imageLayer, layer, pixel, pngPixels, report, runApp, scene, workDir, writeProject } from './lib.mjs';

ensureMedia('still.png');
const dir = workDir('fx3-lens');
const FRAMES = 30;
const COLORS = ['#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#46f0f0', '#f032e6', '#bcf60c'];

const lens = (id, extra) => layer('lens', id, {
  endFrame: FRAMES, width: 600, height: 600, zIndex: 10,
  shape: 'rect', cornerRadius: 0, feather: 0, intensity: 1, ring: null,
  mode: 'magnify', magnify: 3, block: 24, ditherLevels: 3, cell: 12, ...extra,
});

// 120-px vertical stripes under a ×2 magnifier sliding from x 250 to 830. The
// centre pixel shows the source at (lens x + 540) / 2: stripes 3, 4 and 5 at
// frames 4, 15 and 26, each at least 15 px from a stripe edge.
const stripes = COLORS.map((fill, i) => layer('shape', `stripe-${i}`, {
  endFrame: FRAMES, x: 60 + i * 120, width: 120, height: 1920, zIndex: i,
  shapeType: 'rect', fill, stroke: '', strokeWidth: 0, cornerRadius: 0,
}));
const sweep = lens('sweep', {
  magnify: 2,
  keyframes: { x: { keyframes: [{ frame: 0, value: 250, easing: 'linear' }, { frame: FRAMES - 1, value: 830, easing: 'linear' }] } },
});
const a36 = writeProject(dir, 'a36', { scenes: [scene('s', FRAMES, [...stripes, sweep])] });

const showcase = writeProject(dir, 'showcase', { scenes: [scene('s', FRAMES, [
  imageLayer('photo', 'assets/still.png', { endFrame: FRAMES, zIndex: 0 }),
  lens('magnify', { x: 290, y: 480, width: 420, height: 420, shape: 'circle', feather: 6, magnify: 2.5, ring: { color: '#ffffff', width: 6 } }),
  lens('pixelate', { x: 790, y: 480, width: 420, height: 420, shape: 'rounded-rect', cornerRadius: 60, feather: 20, mode: 'pixelate' }),
  lens('dither', { x: 290, y: 1300, width: 420, height: 420, mode: 'dither', ink: '#e8ffe0', paper: '#14281c' }),
  lens('ascii', { x: 790, y: 1300, width: 420, height: 420, shape: 'circle', mode: 'ascii', cell: 16, ring: { color: '#7cffb2', width: 4 } }),
])] }, ['still.png']);

const PREVIEW_FRAMES = [4, 15, 26];
const out = (n) => join(dir, n);
const results = await runApp(dir, [
  { kind: 'render', project: a36, format: 'png-sequence', output: out('a36') },
  { kind: 'preview', project: a36, frames: PREVIEW_FRAMES },
  { kind: 'render', project: showcase, format: 'png-sequence', output: out('showcase-1') },
  { kind: 'render', project: showcase, format: 'png-sequence', output: out('showcase-2') },
]);
const rows = results.filter((r) => !r.ok).map((r) => ({ id: `${r.job.kind} ${r.job.project}`, ok: false, detail: r.error }));
const frame = (folder, f) => join(out(folder), `frame-${String(f).padStart(4, '0')}.png`);

if (rows.length === 0) {
  const preview = results[1].data.pixels;
  const seen = new Set();
  for (const f of PREVIEW_FRAMES) {
    const exported = await pixel(frame('a36', f));
    const shown = preview.find((p) => p.frame === f).rgba;
    seen.add(exported.join());
    rows.push({ id: `A3.6 frame ${f}: preview centre pixel equals the export's`, ok: shown.join() === exported.join(), detail: `preview ${shown} export ${exported}` });
  }
  rows.push({ id: 'A3.6 the lens moves: the three frames show different stripes', ok: seen.size === 3, detail: [...seen].join(' | ') });

  let differ = 0;
  for (let f = 0; f < FRAMES; f += 7) {
    if (!(await pngPixels(frame('showcase-1', f))).equals(await pngPixels(frame('showcase-2', f)))) differ++;
  }
  rows.push({ id: 'showcase exports are identical (all four modes)', ok: differ === 0 });
  rows.push({ id: 'export time (WKWebView)', ok: true, detail: `${(results[2].ms / FRAMES).toFixed(1)} ms/frame with four 420-px lenses at 1080×1920` });
}
report(rows);
