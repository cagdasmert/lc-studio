// CL2 acceptance (docs/superpowers/specs/2026-10-28-headless-cli-design.md §6):
// `check` from the command line, one fixture per kind of issue.
//   A2.2 each fixture gets its issue, with the right exit code and no hang
//   A2.4 check writes nothing
//   R2.9 its run time on the fx-regression fixture (auto frames), printed
//
//   node scripts/e2e/cli2-check.mjs
import { createHash } from 'node:crypto';
import { cpSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { MEDIA, ensureDevServer, ensureMedia, imageLayer, layer, report, runCli, scene, videoLayer, workDir, writeProject } from './lib.mjs';

const { createCanvas } = createRequire(import.meta.url)('canvas');
ensureMedia('still.png', 'prores.mov');
const dir = workDir('cli2-check');
const rows = [];
const row = (id, ok, detail = '') => rows.push({ id, ok: !!ok, detail });

const W = 540;
const H = 960;
const text = (id, content, extra = {}) => layer('text', id, {
  x: W / 2, y: 200, width: 480, height: 120, content, fontSize: 64, fontFamily: 'sans-serif', fontWeight: 'bold',
  fontStyle: 'normal', color: '#ffffff', align: 'center', verticalAlign: 'middle', lineHeight: 1.2, letterSpacing: 0,
  maxWidth: 0, textStroke: null, textShadow: null, endFrame: 30, ...extra,
});
const photo = (extra = {}) => imageLayer('photo', 'assets/still.png', { endFrame: 30, x: W / 2, y: H / 2, width: W, height: H, ...extra });
const project = (name, scenes, assets = ['still.png'], output = { width: W, height: H, fps: 30 }) =>
  writeProject(dir, name, { ...output, scenes }, assets);
const two = (layersA, layersB = [text('b', 'NEXT', { y: 600 })]) => [
  { ...scene('a', 30, layersA), label: 'Hook', transition: 'cube', transitionDurationFrames: 12 },
  { ...scene('b', 30, layersB), label: 'End', backgroundColor: '#2a1050' },
];

// "WIDE" fits its box as wrapping measures it, but 40 px letter spacing draws it wider.
const ctx = createCanvas(10, 10).getContext('2d');
ctx.font = 'bold 64px sans-serif';
const wide = Math.ceil(ctx.measureText('WIDE').width * 1.15);

const P = {
  clean: project('clean', two([photo(), text('t', 'HELLO', { zIndex: 1 })])),
  overflow: project('overflow', two([
    photo(),
    text('long', 'THIS HEADLINE IS FAR TOO LONG FOR ITS BOX', { width: 300, height: 80, zIndex: 1 }),
    text('spaced', 'WIDE', { width: wide, height: 100, y: 500, letterSpacing: 40, zIndex: 2 }),
  ])),
  missing: project('missing', two([photo(), imageLayer('gone', 'assets/nope.png', { endFrame: 30, width: 200, height: 200, zIndex: 1 })])),
  prores: project('prores', two([photo(), videoLayer('clip', 'assets/prores.mov', { endFrame: 30, zIndex: 1 })]), ['still.png', 'prores.mov']),
  fonts: project('fonts', two([
    photo(),
    text('unknown', 'HI', { fontFamily: 'Definitely Not A Font', zIndex: 1 }),
    text('invalid', 'HI', { fontFamily: '1990s Grotesk', y: 500, zIndex: 2 }),
  ])),
  shorthand: project('shorthand', two([photo()]), ['still.png'], { width: W, height: H, fps: 30 }),
  crash: project('crash', two([photo(), text('broken', null, { zIndex: 1 })])),
};
// The skill's shorthand output, which lc-studio's own loader accepts and then trips over.
{
  const file = join(P.shorthand, 'project.json');
  const doc = JSON.parse(readFileSync(file, 'utf8'));
  doc.composition.output = 'tiktok';
  writeFileSync(file, JSON.stringify(doc, null, 2));
}
cpSync(join(MEDIA, 'e2e', 'fx-regression', 'fx-regression.lcs'), join(dir, 'fx-regression.lcs'), { recursive: true });

/** path → content hash and mtime, for every file under the fixtures. */
function snapshot() {
  const out = {};
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else out[p] = `${createHash('sha1').update(readFileSync(p)).digest('hex')}@${st.mtimeMs}`;
    }
  };
  walk(dir);
  return out;
}

const check = async (p, extra = []) => {
  const r = await runCli(['check', p, ...extra], { timeoutMs: 120_000 });
  const issues = r.result?.issues ?? [];
  return { ...r, issues, codes: issues.map((i) => `${i.severity}:${i.code}`) };
};
const has = (r, severity, code, layerId) => r.issues.some((i) => i.severity === severity && i.code === code && (!layerId || i.layerId === layerId));

const before = snapshot();
const vite = await ensureDevServer();
try {
  let r = await check(P.clean);
  row('A2.2 clean → exit 0, nothing but notes', r.code === 0 && r.result?.ok && r.issues.every((i) => i.severity === 'note'), `exit ${r.code}: ${r.codes.join(', ') || 'no issues'}`);
  row('A2.2 clean → the cube transition is a gpu-fallback note (WebGL2 here)', has(r, 'note', 'gpu-fallback'));
  row('A2.2 clean → auto frames were drawn', JSON.stringify(r.result?.data?.drawn) === JSON.stringify([12, 17, 24, 59]), JSON.stringify(r.result?.data?.drawn));

  r = await check(P.clean, ['--frames', 'all']);
  row('A2.2 --frames all draws every frame', r.code === 0 && r.result?.data?.drawn?.length === 60, `${r.result?.data?.drawn?.length} frames in ${(r.ms / 1000).toFixed(1)} s`);

  r = await check(P.overflow);
  const long = r.issues.find((i) => i.layerId === 'long');
  const spaced = r.issues.find((i) => i.layerId === 'spaced');
  row('A2.2 overflowing text → text-overflow on that layer, exit 0 (a warning)', r.code === 0 && long?.code === 'text-overflow', long?.message);
  row('A2.2 letter spacing that draws past the box is caught too', spaced?.code === 'text-overflow' && /widest line/.test(spaced.message), spaced?.message ?? `box ${wide} px; ${r.codes.join(', ')}`);

  r = await check(P.missing);
  row('A2.2 missing image → media-missing, exit 1', r.code === 1 && has(r, 'error', 'media-missing', 'gone'), `exit ${r.code}: ${r.issues.find((i) => i.code === 'media-missing')?.message}`);

  r = await check(P.prores);
  row('A2.2 ProRes clip → video-undecodable', has(r, 'warn', 'video-undecodable'), `exit ${r.code}: ${r.codes.join(', ')}`);

  r = await check(P.fonts);
  const unknown = r.issues.find((i) => i.code === 'font-missing' && i.layerId === 'unknown');
  const invalid = r.issues.find((i) => i.code === 'font-missing' && i.layerId === 'invalid');
  row('A2.2 unknown font family → font-missing', /isn't bundled/.test(unknown?.message ?? ''), unknown?.message);
  row('A2.2 a family the canvas can\'t parse → font-missing, says why', /accepts as written/.test(invalid?.message ?? ''), invalid?.message);

  r = await check(P.shorthand);
  row('A2.2 "output": "tiktok" → load error, exit 1, no hang', r.code === 1 && has(r, 'error', 'load') && r.ms < 60_000, `exit ${r.code} in ${(r.ms / 1000).toFixed(1)} s: ${r.issues[0]?.message}`);

  r = await check(P.crash);
  row('A2.2 a layer that crashes the renderer and editor → draw and editor errors, exit 1, no hang',
    r.code === 1 && has(r, 'error', 'draw', 'broken') && has(r, 'error', 'editor') && r.ms < 60_000,
    `exit ${r.code} in ${(r.ms / 1000).toFixed(1)} s: ${r.issues.filter((i) => i.severity === 'error').map((i) => `${i.code}: ${i.message}`).join(' | ').slice(0, 300)}`);

  r = await check(join(dir, 'fx-regression.lcs'));
  row('R2.9 check on fx-regression (auto frames) under 10 s', r.code === 0 && r.ms < 10_000, `${(r.ms / 1000).toFixed(2)} s wall (${(r.result?.ms / 1000).toFixed(2)} s in the job); ${r.codes.join(', ') || 'no issues'}`);
} finally {
  vite?.kill();
}

const after = snapshot();
const changed = Object.keys({ ...before, ...after }).filter((p) => before[p] !== after[p]);
row('A2.4 check wrote nothing under the fixtures', changed.length === 0, changed.slice(0, 5).join(', '));
report(rows);
