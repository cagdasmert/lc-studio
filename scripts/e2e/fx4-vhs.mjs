// FX pack P4 (docs/superpowers/specs/2026-10-19-fx-pack-design.md): the VHS
// scene FX in real exports, with shake and grain, fading into a clean scene
// that must keep its own look through the transition.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ensureMedia, imageLayer, layer, pngPixels, report, runApp, scene, workDir, writeProject } from './lib.mjs';

ensureMedia('still.png');
const dir = workDir('fx4-vhs');
const FRAMES = 40;
const title = layer('text', 'title', {
  endFrame: FRAMES, y: 1500, width: 1000, height: 200, content: 'PLAY ▶ 1987', fontSize: 120,
  fontFamily: 'sans-serif', fontWeight: 'bold', fontStyle: 'normal', color: '#ffffff', align: 'center',
  verticalAlign: 'middle', lineHeight: 1.2, letterSpacing: 0, maxWidth: 0, textStroke: null, textShadow: null, zIndex: 1,
});
const VHS = { type: 'vhs', wave: 6, jitter: 1.5, bleed: 3, switching: 0.6, switchingHeight: 0.06, crease: 0.3, saturation: 0.8, barrel: 0 };

function project(name, withVhs) {
  return writeProject(dir, name, { scenes: [
    {
      ...scene('tape', FRAMES, [imageLayer('photo', 'assets/still.png', { endFrame: FRAMES }), title]),
      sceneFx: [{ type: 'shake', amplitude: 4, frequency: 6, decayFrames: 0 }, ...(withVhs ? [VHS] : []), { type: 'grain', amount: 0.12, scale: 2 }],
      transition: 'fade', transitionDurationFrames: 10,
    },
    { ...scene('clean', 20, [imageLayer('photo2', 'assets/still.png', { endFrame: 20 })]), backgroundColor: '#000000' },
  ] }, ['still.png']);
}

const withVhs = project('vhs', true);
const plain = project('plain', false);
const out = (n) => join(dir, n);
const results = await runApp(dir, [
  { kind: 'render', project: plain, format: 'png-sequence', output: out('plain') },
  { kind: 'render', project: withVhs, format: 'png-sequence', output: out('vhs-1') },
  { kind: 'render', project: withVhs, format: 'png-sequence', output: out('vhs-2') },
]);
const rows = results.filter((r) => !r.ok).map((r) => ({ id: `render ${r.job.output}`, ok: false, detail: r.error }));
const frame = (folder, f) => join(out(folder), `frame-${String(f).padStart(4, '0')}.png`);

if (rows.length === 0) {
  const total = FRAMES + 20;
  rows.push({ id: 'export time (WKWebView)', ok: true, detail: `${(results[1].ms / total).toFixed(1)} ms/frame with VHS vs ${(results[0].ms / total).toFixed(1)} without (1080×1920)` });
  const differ = [];
  for (const f of readdirSync(out('vhs-1')).filter((n) => n.endsWith('.png'))) {
    if (!(await pngPixels(join(out('vhs-1'), f))).equals(await pngPixels(join(out('vhs-2'), f)))) differ.push(f);
  }
  rows.push({ id: 'A4.2 two exports are identical', ok: differ.length === 0, detail: differ.join(', ') });
  rows.push({ id: 'the VHS scene looks different', ok: !(await pngPixels(frame('vhs-1', 10))).equals(await pngPixels(frame('plain', 10))) });
  // After the transition the clean scene is untouched by the VHS scene's FX.
  rows.push({ id: 'the next scene keeps its own (clean) look', ok: (await pngPixels(frame('vhs-1', 45))).equals(await pngPixels(frame('plain', 45))) });
}
report(rows);
