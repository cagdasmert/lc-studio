// CL3 acceptance (docs/superpowers/specs/2026-10-28-headless-cli-design.md §7):
// `automatch` from the command line.
//   A3.1 B is A scaled and shifted by a known transform: the auto pairs follow it (median
//        error ≤ 0.03, ≥ 90 % within 0.06; DINOv2's 14 px patches are 0.031 of this image's
//        height and 0.056 of its width, and look-alike shapes give a few outliers, as in the
//        editor); a manual pair survives and auto pairs keep clear of it
//   A3.2 without --write project.json is byte-identical; with it, only that layer's
//        pairs and savedAt change
//   A3.3 with the model moved away: exit 1, model-missing
//   R3.1 an ambiguous name, a layer without a morph and an unknown one are refused
//
//   node scripts/e2e/cli3-automatch.mjs
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { MEDIA, ROOT, ensureDevServer, imageLayer, report, runCli, scene, workDir, writeProject } from './lib.mjs';

const { createCanvas, loadImage } = createRequire(import.meta.url)('canvas');
const dir = workDir('cli3-automatch');
const rows = [];
const row = (id, ok, detail = '') => rows.push({ id, ok: !!ok, detail });

// A: distinct shapes at seeded positions, nothing repeated, so every feature has one true match
// (testsrc2's colour bars repeat, and any matcher is ambiguous on them).
const [IW, IH] = [1080, 1920];
{
  const c = createCanvas(IW, IH);
  const ctx = c.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, IW, IH);
  sky.addColorStop(0, '#1f3b57');
  sky.addColorStop(1, '#c97b3a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, IW, IH);
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = 0; i < 48; i++) {
    const [x, y, r] = [60 + rand() * (IW - 120), 60 + rand() * (IH - 120), 30 + rand() * 70];
    ctx.fillStyle = `hsl(${Math.floor(rand() * 360)}, ${50 + rand() * 50}%, ${35 + rand() * 40}%)`;
    ctx.beginPath();
    const sides = 3 + (i % 5);
    for (let k = 0; k < sides; k++) {
      const t = (k / sides) * Math.PI * 2 + rand();
      ctx.lineTo(x + Math.cos(t) * r, y + Math.sin(t) * r * (0.6 + rand() * 0.8));
    }
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${20 + Math.floor(rand() * 30)}px sans-serif`;
    ctx.fillText(String.fromCharCode(65 + (i % 26)) + i, x - r / 2, y);
  }
  writeFileSync(join(MEDIA, 'shapes.png'), c.toBuffer('image/png'));
}
const A = await loadImage(join(MEDIA, 'shapes.png'));

// B = A scaled by S about its centre and shifted by (DX, DY) px, on grey.
const S = 0.85;
const DX = 60;
const DY = -80;
{
  const c = createCanvas(IW, IH);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, IW, IH);
  ctx.translate(IW / 2 + DX, IH / 2 + DY);
  ctx.scale(S, S);
  ctx.drawImage(A, -IW / 2, -IH / 2);
  writeFileSync(join(MEDIA, 'shifted.png'), c.toBuffer('image/png'));
}
/** Where a point of A (0–1 of A) lands in B (0–1 of B). */
const transform = ({ x, y }) => ({ x: (IW / 2 + (x * IW - IW / 2) * S + DX) / IW, y: (IH / 2 + (y * IH - IH / 2) * S + DY) / IH });

const W = 540;
const H = 960;
const MANUAL = { id: 'm1', a: { x: 0.5, y: 0.5 }, b: { x: 0.5, y: 0.5 }, source: 'manual' };
const morphLayer = (id, name, extra = {}) => imageLayer(id, 'assets/shapes.png', {
  name, endFrame: 60, x: W / 2, y: H / 2, width: W, height: H,
  morph: { target: 'assets/shifted.png', pairs: [MANUAL], progress: 0 }, ...extra,
});
const project = writeProject(dir, 'automatch', { width: W, height: H, fps: 30, scenes: [scene('s', 60, [morphLayer('morph', 'Before / after')])] }, ['shapes.png', 'shifted.png']);
const names = writeProject(dir, 'names', {
  width: W, height: H, fps: 30, scenes: [scene('s', 60, [
    morphLayer('swap-1', 'Swap'), morphLayer('swap-2', 'Swap'), imageLayer('photo', 'assets/shapes.png', { name: 'Photo', endFrame: 60 }),
  ])],
}, ['shapes.png', 'shifted.png']);
const json = join(project, 'project.json');

/** Paths at which two JSON values differ. */
function diff(a, b, path = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((k) => diff(a[k], b[k], `${path}/${k}`));
  }
  return [path];
}

const vite = await ensureDevServer();
try {
  // ── A3.1, and A3.2 without --write
  {
    const before = readFileSync(json);
    const r = await runCli(['automatch', project, '--layer', 'Before / after'], { timeoutMs: 180_000 });
    const layer = r.result?.data?.layers?.[0];
    const pairs = layer?.pairs ?? [];
    const auto = pairs.filter((p) => p.source === 'auto');
    const errors = auto.map((p) => {
      const want = transform(p.a);
      return Math.max(Math.abs(p.b.x - want.x), Math.abs(p.b.y - want.y));
    });
    const sorted = [...errors].sort((x, y) => x - y);
    const median = sorted[Math.floor((sorted.length - 1) / 2)] ?? Infinity;
    const within = (t) => errors.filter((e) => e <= t).length;
    row('A3.1 exit 0, the layer found by name', r.code === 0 && layer?.layerId === 'morph', `exit ${r.code} in ${(r.ms / 1000).toFixed(1)} s${r.result?.error ? `: ${r.result.error}` : ''}`);
    row('A3.1 the auto pairs follow the transform: median ≤ 0.03, ≥ 90 % within 0.06',
      auto.length >= 8 && median <= 0.03 && within(0.06) >= 0.9 * auto.length,
      `${auto.length} auto pairs: median ${median.toFixed(4)}, ${within(0.03)} within 0.03, ${within(0.06)} within 0.06, worst ${sorted[sorted.length - 1]?.toFixed(4)}`);
    // Keys come back sorted (serde_json), so compare values, not text.
    row('A3.1 the manual pair survives unchanged', isDeepStrictEqual(pairs.find((p) => p.id === 'm1'), MANUAL));
    const near = (u, v) => Math.hypot(u.x - v.x, u.y - v.y) < 0.04;
    row('A3.1 no auto pair within 0.04 of the manual one', !auto.some((p) => near(p.a, MANUAL.a) || near(p.b, MANUAL.b)));
    row('A3.1 counts and written match', layer?.auto === auto.length && layer?.manual === 1 && layer?.written === false, JSON.stringify({ auto: layer?.auto, manual: layer?.manual, written: layer?.written }));
    row('A3.2 without --write, project.json is byte-identical', readFileSync(json).equals(before));
  }

  // ── A3.2 with --write
  {
    const before = JSON.parse(readFileSync(json, 'utf8'));
    const r = await runCli(['automatch', project, '--layer', 'morph', '--write'], { timeoutMs: 180_000 });
    const after = JSON.parse(readFileSync(json, 'utf8'));
    const changed = diff(before, after);
    const onlyPairs = changed.every((p) => p === '/savedAt' || p.startsWith('/composition/scenes/0/layers/0/morph/pairs'));
    row('A3.2 --write changes only that layer\'s pairs and savedAt', r.code === 0 && onlyPairs && changed.includes('/savedAt') && changed.some((p) => p.includes('/morph/pairs')),
      `exit ${r.code}; changed: ${[...new Set(changed.map((p) => p.replace(/\/pairs\/.*/, '/pairs/…')))].join(', ')}`);
    row('A3.2 the written pairs are the result\'s, and it says so', isDeepStrictEqual(after.composition.scenes[0].layers[0].morph.pairs, r.result?.data?.layers?.[0]?.pairs) && r.result?.data?.layers?.[0]?.written === true);
  }

  // ── R3.1
  {
    let r = await runCli(['automatch', names, '--layer', 'Swap']);
    row('R3.1 an ambiguous name → exit 1, lists the ids', r.code === 1 && /names 2 layers.*swap-1, swap-2/.test(r.result?.error ?? ''), r.result?.error);
    r = await runCli(['automatch', names, '--layer', 'Photo']);
    row('R3.1 a layer without a morph → exit 1', r.code === 1 && /has no morph/.test(r.result?.error ?? ''), r.result?.error);
    r = await runCli(['automatch', names, '--layer', 'nope']);
    row('R3.1 an unknown layer → exit 1', r.code === 1 && /no layer has the id or name "nope"/.test(r.result?.error ?? ''), r.result?.error);
  }

  // ── A3.3: the debug build reads the model from target/debug/models/.
  {
    const model = join(ROOT, 'src-tauri', 'target', 'debug', 'models', 'dinov2-small-int8.onnx');
    if (!existsSync(model)) {
      row('A3.3 model missing → model-missing', false, `no model at ${model}: run npm run fetch-models and build`);
    } else {
      renameSync(model, `${model}.away`);
      try {
        const r = await runCli(['automatch', project, '--layer', 'morph']);
        row('A3.3 model missing → exit 1, model-missing', r.code === 1 && r.result?.issues?.some((i) => i.code === 'model-missing'), `exit ${r.code}: ${r.result?.error}`);
      } finally {
        renameSync(`${model}.away`, model);
      }
    }
  }
} finally {
  vite?.kill();
}
report(rows);
