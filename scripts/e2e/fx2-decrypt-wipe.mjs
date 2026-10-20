// FX pack P2 (docs/superpowers/specs/2026-10-19-fx-pack-design.md): the
// decrypt reveal and the wipe's glowing front with sparks, in real exports.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { layer, pngPixels, report, runApp, scene, workDir, writeProject } from './lib.mjs';

const dir = workDir('fx2-decrypt-wipe');
const FRAMES = 50;
const win = (inFrames) => ({ inDelay: 0, inFrames, outFrames: 0, easing: 'ease-out-cubic' });

function project(name, withFx) {
  const title = layer('text', 'title', {
    endFrame: FRAMES, y: 600, width: 1000, height: 340, content: 'ACCESS GRANTED', fontSize: 120,
    fontFamily: 'sans-serif', fontWeight: 'bold', fontStyle: 'normal', color: '#e8fff2', align: 'center',
    verticalAlign: 'middle', lineHeight: 1.2, letterSpacing: 0, maxWidth: 0, textStroke: null, textShadow: null,
    layerFx: withFx ? [{
      type: 'decrypt', cell: 14, charset: 'cipher', color: '#7CFFB2', tint: 0.6, scrambleFrames: 2,
      order: 'sweep', angle: 0, stagger: 0.7, edgeGlow: 0.6, window: win(30),
    }] : [],
  });
  const card = layer('shape', 'card', {
    endFrame: FRAMES, y: 1200, width: 800, height: 400, shapeType: 'rounded-rect', fill: '#2a4dff',
    stroke: '', strokeWidth: 0, cornerRadius: 40,
    layerFx: withFx ? [{
      type: 'wipe', shape: 'linear', angle: 0, softness: 20, edgeGlow: 40, edgeColor: '#ff6a3d', sparks: 0.6, window: win(24),
    }] : [],
  });
  return writeProject(dir, name, { scenes: [{ ...scene('s', FRAMES, [title, card]), backgroundColor: '#0b0f14' }] });
}

const withFx = project('fx', true);
const plain = project('plain', false);
const out = (n) => join(dir, n);
const results = await runApp(dir, [
  { kind: 'render', project: plain, format: 'png-sequence', output: out('plain') },
  { kind: 'render', project: withFx, format: 'png-sequence', output: out('fx-1') },
  { kind: 'render', project: withFx, format: 'png-sequence', output: out('fx-2') },
]);
const rows = results.filter((r) => !r.ok).map((r) => ({ id: `render ${r.job.output}`, ok: false, detail: r.error }));
const frame = (folder, f) => join(out(folder), `frame-${String(f).padStart(4, '0')}.png`);

if (rows.length === 0) {
  rows.push({
    id: 'export time (WKWebView)', ok: true,
    detail: `${(results[1].ms / FRAMES).toFixed(1)} ms/frame with decrypt + wipe edge vs ${(results[0].ms / FRAMES).toFixed(1)} without`,
  });
  const differ = [];
  for (const f of readdirSync(out('fx-1')).filter((n) => n.endsWith('.png'))) {
    if (!(await pngPixels(join(out('fx-1'), f))).equals(await pngPixels(join(out('fx-2'), f)))) differ.push(f);
  }
  rows.push({ id: 'two exports are identical (glyphs and sparks included)', ok: differ.length === 0, detail: differ.join(', ') });

  // Once both entrances and the last sparks are over, the frame matches the
  // plain render within ±1 (the bitmap path rounds antialiased edges).
  const [a, b] = [await pngPixels(frame('fx-1', 46)), await pngPixels(frame('plain', 46))];
  let worst = 0;
  for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]));
  rows.push({ id: 'settled frame equals the plain render (±1)', ok: worst <= 1, detail: `max difference ${worst}` });
  const mid = await pngPixels(frame('fx-1', 12));
  rows.push({ id: 'mid-entrance frame differs from the plain render', ok: !mid.equals(await pngPixels(frame('plain', 12))) });
}
report(rows);
