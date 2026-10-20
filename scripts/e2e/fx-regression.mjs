// FX pack regression check (docs/superpowers/specs/2026-10-19-fx-pack-design.md,
// A0.5). A fixture project that uses text, shapes, an image, every layer FX
// and scene FX that existed before the FX pack, cuts, and zoom transitions is
// exported as a PNG sequence and compared, pixel for pixel, with a baseline.
//
//   node scripts/e2e/fx-regression.mjs --baseline   # export the baseline (on the old code)
//   node scripts/e2e/fx-regression.mjs              # export again and compare
//
// The baseline lives in test-media/fx-regression-baseline/, outside the work
// folder, so later runs don't wipe it.
import { existsSync, mkdirSync, readdirSync, rmSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { MEDIA, ensureMedia, imageLayer, layer, pngPixels, report, runApp, scene, workDir, writeProject } from './lib.mjs';

const W = 360;
const H = 640;
const BASELINE = join(MEDIA, 'fx-regression-baseline');
const makeBaseline = process.argv.includes('--baseline');

ensureMedia('still.png');
const dir = workDir('fx-regression');

const win = (inFrames, outFrames = 0) => ({ inDelay: 2, inFrames, outFrames, easing: 'ease-out-cubic' });
const track = (...pairs) => ({ keyframes: pairs.map(([frame, value]) => ({ frame, value, easing: 'ease-in-out' })) });

// lib.mjs centres layers for 1080×1920, so every layer here sets its own x/y.
const text = (id, content, extra = {}) => layer('text', id, {
  x: W / 2, y: H / 2, width: 300, height: 80, content, fontSize: 40, fontFamily: 'sans-serif', fontWeight: 'bold', fontStyle: 'normal',
  color: '#ffffff', align: 'center', verticalAlign: 'middle', lineHeight: 1.2, letterSpacing: 0, maxWidth: 0,
  textStroke: null, textShadow: null, ...extra,
});
const shape = (id, shapeType, fill, extra = {}) => layer('shape', id, {
  x: W / 2, y: H / 2, width: 120, height: 120, shapeType, fill, stroke: '', strokeWidth: 0, cornerRadius: 16, ...extra,
});

const scenes = [
  {
    ...scene('s1', 30, [
      imageLayer('photo', 'assets/still.png', {
        endFrame: 30, x: W / 2, y: 470, width: 260, height: 180, zIndex: 0,
        layerFx: [{ type: 'pixelate', maxBlock: 40, flicker: 0.6, fade: 0.4, window: win(14) }],
      }),
      text('title', 'REGRESSION', {
        endFrame: 30, y: 120, zIndex: 1,
        layerFx: [
          { type: 'glow', color: '#e94560', radius: 18, intensity: 2, pulseFrames: 20 },
          { type: 'shine', color: '#ffffff', width: 60, angle: 20, periodFrames: 24, intensity: 0.8 },
          { type: 'rgb-split', offset: 5, angle: 30, jitter: 0.5 },
        ],
      }),
      shape('mover', 'rounded-rect', '#3fa7ff', {
        endFrame: 30, y: 280, zIndex: 2, keyframes: { x: track([0, 80], [29, 280]) },
        layerFx: [
          { type: 'echo', count: 4, frameGap: 2, decay: 0.6 },
          { type: 'long-shadow', color: '#000000', distance: 30, angle: 45, fade: 0.7 },
        ],
      }),
    ]),
    backgroundType: 'linear-gradient',
    backgroundGradient: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#1b1f3a' }, { offset: 1, color: '#5a1e4a' }] },
    sceneFx: [{ type: 'grain', amount: 0.15, scale: 2 }, { type: 'vignette', amount: 0.5, radius: 0.45 }],
    transition: 'zoom-in', transitionDurationFrames: 10,
  },
  {
    ...scene('s2', 30, [
      text('sliced', 'SLICE IN', {
        endFrame: 30, y: 140, zIndex: 0,
        layerFx: [
          { type: 'slice', bands: 8, direction: 'horizontal', order: 'center-out', travel: 60, stagger: 0.5, window: win(14) },
          { type: 'outline', color: '#ffcc00', width: 4 },
        ],
      }),
      shape('wiped', 'rect', '#2ecc71', {
        endFrame: 30, x: 100, y: 320, zIndex: 1,
        layerFx: [{ type: 'wipe', shape: 'linear', angle: 30, softness: 40, window: win(16, 8) }],
      }),
      shape('iris', 'circle', '#ff7a00', {
        endFrame: 30, x: 260, y: 320, zIndex: 2,
        layerFx: [{ type: 'wipe', shape: 'iris', angle: 0, softness: 20, window: win(16) }],
      }),
      shape('torn', 'rect', '#9b59b6', {
        endFrame: 30, y: 500, width: 280, height: 90, zIndex: 3,
        layerFx: [{ type: 'glitch', bands: 12, maxOffset: 30, channelShift: 6, probability: 0.4 }],
      }),
    ]),
    backgroundColor: '#102a43',
    sceneFx: [{ type: 'scanlines', amount: 0.25, spacing: 4, rollSpeed: 1 }, { type: 'shake', amplitude: 6, frequency: 10, decayFrames: 20 }],
    transition: 'cut', transitionDurationFrames: 0,
  },
  {
    ...scene('s3', 30, [
      shape('blob-a', 'circle', '#ff4fa3', {
        endFrame: 30, x: 140, y: 260, zIndex: 0, keyframes: { x: track([0, 120], [29, 200]) },
        layerFx: [{ type: 'gooey', blur: 8, contrast: 30 }],
      }),
      shape('zoomer', 'star', '#ffe14d', {
        endFrame: 30, x: 240, y: 260, zIndex: 1,
        layerFx: [{ type: 'zoom', from: 0.6, fade: 1, window: win(12) }],
      }),
      text('doors', 'BARN DOORS', {
        endFrame: 30, y: 460, zIndex: 2,
        layerFx: [{ type: 'wipe', shape: 'barn', angle: 0, softness: 30, window: win(14) }],
      }),
    ]),
    backgroundColor: '#0b3d2e',
    transition: 'zoom-out', transitionDurationFrames: 10,
  },
  {
    ...scene('s4', 20, [
      text('end', 'THE END', { endFrame: 20, zIndex: 0, color: '#111111' }),
    ]),
    backgroundType: 'image', backgroundImage: 'assets/still.png', backgroundImageFit: 'cover',
    transition: 'none', transitionDurationFrames: 0,
  },
];

const project = writeProject(dir, 'fx-regression', { width: W, height: H, fps: 30, scenes }, ['still.png']);
const out = join(dir, 'frames');
const [result] = await runApp(dir, [{ kind: 'render', project, format: 'png-sequence', output: out }]);
const rows = [];
const pngs = (folder) => readdirSync(folder).filter((f) => f.endsWith('.png')).sort();

if (!result.ok) {
  rows.push({ id: 'A0.5 export', ok: false, detail: result.error });
} else if (makeBaseline) {
  rmSync(BASELINE, { recursive: true, force: true });
  mkdirSync(BASELINE, { recursive: true });
  cpSync(out, BASELINE, { recursive: true });
  rows.push({ id: 'A0.5 baseline written', ok: pngs(BASELINE).length === 110, detail: `${pngs(BASELINE).length} frames in ${BASELINE}` });
} else if (!existsSync(BASELINE)) {
  rows.push({ id: 'A0.5 baseline', ok: false, detail: `no baseline in ${BASELINE}; run with --baseline on the old code first` });
} else {
  const want = pngs(BASELINE);
  const got = pngs(out);
  rows.push({ id: 'A0.5 frame count', ok: want.length === got.length, detail: `${got.length} vs ${want.length}` });
  const differ = [];
  for (const f of want) {
    if (!got.includes(f) || !(await pngPixels(join(out, f))).equals(await pngPixels(join(BASELINE, f)))) differ.push(f);
  }
  rows.push({ id: 'A0.5 frames identical to the baseline', ok: differ.length === 0, detail: differ.length ? `differ: ${differ.join(', ')}` : `${want.length} frames` });
}
report(rows);
