// FX pack P1 (docs/superpowers/specs/2026-10-19-fx-pack-design.md): the
// disintegrate reveal in real exports. A 1080×1920 title assembles from dust
// and a logo blows away into it; the same project without the FX gives the
// time it costs in WKWebView (A1.7).
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { layer, pixel, pngPixels, report, runApp, scene, workDir, writeProject } from './lib.mjs';

const dir = workDir('fx1-disintegrate');
const FRAMES = 60;
const dust = (extra = {}) => ({
  type: 'disintegrate', grain: 2, scatter: 180, angle: -30, spread: 0.35, gravity: -40,
  sweep: 0, stagger: 0.6, fade: 1, ...extra,
});

function project(name, withFx) {
  const title = layer('text', 'title', {
    endFrame: FRAMES, y: 700, width: 1000, height: 240, content: 'DUST TITLE', fontSize: 150,
    fontFamily: 'sans-serif', fontWeight: 'bold', fontStyle: 'normal', color: '#ffffff', align: 'center',
    verticalAlign: 'middle', lineHeight: 1.2, letterSpacing: 0, maxWidth: 0, textStroke: null, textShadow: null,
    layerFx: withFx ? [dust({ window: { inDelay: 0, inFrames: 24, outFrames: 0, easing: 'ease-out-cubic' } })] : [],
  });
  const logo = layer('shape', 'logo', {
    endFrame: FRAMES, y: 1200, width: 360, height: 360, shapeType: 'star', fill: '#ffb000',
    stroke: '#ffffff', strokeWidth: 8, cornerRadius: 0,
    layerFx: withFx ? [dust({ angle: 20, gravity: 60, sweep: 180, window: { inDelay: 0, inFrames: 0, outFrames: 30, easing: 'ease-in-cubic' } })] : [],
  });
  return writeProject(dir, name, { scenes: [{ ...scene('s', FRAMES, [title, logo]), backgroundColor: '#14141f' }] });
}

const withFx = project('dust', true);
const plain = project('plain', false);
const out = (n) => join(dir, n);
const results = await runApp(dir, [
  { kind: 'render', project: plain, format: 'png-sequence', output: out('plain') },
  { kind: 'render', project: withFx, format: 'png-sequence', output: out('dust-1') },
  { kind: 'render', project: withFx, format: 'png-sequence', output: out('dust-2') },
]);
const rows = results.filter((r) => !r.ok).map((r) => ({ id: `render ${r.job.output}`, ok: false, detail: r.error }));
const frame = (folder, f) => join(out(folder), `frame-${String(f).padStart(4, '0')}.png`);

if (rows.length === 0) {
  const [plainMs, dustMs] = [results[0].ms, results[1].ms];
  rows.push({
    id: 'A1.7 export time (WKWebView)', ok: true,
    detail: `${(dustMs / FRAMES).toFixed(1)} ms/frame with disintegrate vs ${(plainMs / FRAMES).toFixed(1)} without (${FRAMES} frames, 1080×1920)`,
  });

  const differ = [];
  for (const f of readdirSync(out('dust-1')).filter((n) => n.endsWith('.png'))) {
    if (!(await pngPixels(join(out('dust-1'), f))).equals(await pngPixels(join(out('dust-2'), f)))) differ.push(f);
  }
  rows.push({ id: 'two exports are identical', ok: differ.length === 0, detail: differ.join(', ') });

  // Frame 0: env 0, so the title is fully transparent — only the background shows.
  const bg = await pixel(frame('plain', 0), 30, 30);
  const titleAt0 = await pngPixels(frame('dust-1', 0));
  let lit = 0;
  for (let y = 580; y < 820; y++) for (let x = 40; x < 1040; x++) {
    const i = (y * 1080 + x) * 4;
    if (titleAt0[i] !== bg[0] || titleAt0[i + 1] !== bg[1] || titleAt0[i + 2] !== bg[2]) lit++;
  }
  rows.push({ id: 'title invisible at env 0', ok: lit === 0, detail: `${lit} non-background pixels` });

  // After the entrance (frame 24+) the title matches the plain render; before the exit the logo does too.
  // Within ±1: any bitmap FX draws the layer through an offscreen canvas,
  // which rounds antialiased edges by one step against the direct draw.
  const [a, b] = [await pngPixels(frame('dust-1', 26)), await pngPixels(frame('plain', 26))];
  let worst = 0;
  for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]));
  rows.push({ id: 'settled frame equals the plain render (±1)', ok: worst <= 1, detail: `max difference ${worst}` });
  const midway = (await pngPixels(frame('dust-1', 12))).equals(await pngPixels(frame('plain', 12)));
  rows.push({ id: 'entrance frame differs from the plain render', ok: !midway });
}
report(rows);
