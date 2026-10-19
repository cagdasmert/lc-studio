// FX pack P5 (docs/superpowers/specs/2026-10-19-fx-pack-design.md): the
// WebGL2 pass in the real app.
//   A5.1 an identity pass round-trips a test image
//   A5.2 the GPU hash equals the CPU hash
//   A5.3 every GL transition: first frame = outgoing scene, deterministic, then the incoming scene
//   A5.4 with disableGl: exports work, a GL transition is a crossfade, the warning names everything
//   A5.5 refract: outside unchanged, sample offset = strength × ρ / R (the dome's normal)
//   A5.6 ripple: nothing before the impulse, then the strongest displacement on the ring front
//   A5.7 a 15 s export with GL transitions takes at most 1.3× the one with fades
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { MEDIA, ensureMedia, imageLayer, layer, pngPixels, report, runApp, scene, workDir, writeProject } from './lib.mjs';

const { createCanvas } = createRequire(import.meta.url)('canvas');
ensureMedia('still.png');
const dir = workDir('fx-gl');

// A 256×256 coordinate ramp: red = x, green = y, so a pixel's colour says where it was sampled from.
const RAMP = 'ramp.png';
{
  const c = createCanvas(256, 256);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const i = (y * 256 + x) * 4;
    img.data[i] = x; img.data[i + 1] = y; img.data[i + 2] = 128; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  mkdirSync(MEDIA, { recursive: true });
  writeFileSync(join(MEDIA, RAMP), c.toBuffer('image/png'));
}

const W = 540;
const H = 960;
const size = { width: W, height: H, fps: 30 };
const out = (n) => join(dir, n);
const frameFile = (folder, f) => join(out(folder), `frame-${String(f).padStart(4, '0')}.png`);
const GL_TRANSITIONS = ['cube', 'doorway', 'grid-flip', 'water-drop', 'crosswarp', 'glitch-displace', 'film-burn', 'page-curl', 'ascii-sweep'];
const text = (id, content, extra = {}) => layer('text', id, {
  x: W / 2, y: 300, width: 480, height: 120, content, fontSize: 64, fontFamily: 'sans-serif', fontWeight: 'bold',
  fontStyle: 'normal', color: '#ffffff', align: 'center', verticalAlign: 'middle', lineHeight: 1.2, letterSpacing: 0,
  maxWidth: 0, textStroke: null, textShadow: null, ...extra,
});
const lensLayer = (id, extra) => layer('lens', id, {
  x: W / 2, y: H / 2, width: 200, height: 200, zIndex: 5, shape: 'circle', cornerRadius: 0, feather: 0, intensity: 1,
  ring: null, mode: 'refract', magnify: 2, block: 8, ditherLevels: 3, cell: 12, ...extra,
});

// A5.3: scene A (30 frames, transition over its last 20) into scene B.
const twoScenes = (transition, frames = 30) => [
  { ...scene('a', frames, [imageLayer('photo', 'assets/still.png', { endFrame: frames, x: W / 2, y: H / 2, width: W, height: H }), text('t', 'OUTGOING', { endFrame: frames })]),
    transition, transitionDurationFrames: transition === 'none' ? 0 : 20 },
  { ...scene('b', 20, [text('u', 'INCOMING', { endFrame: 20, y: 600, color: '#ffe14d' })]), backgroundColor: '#2a1050' },
];
const projects = { ref: writeProject(dir, 'ref', { ...size, scenes: twoScenes('none') }, ['still.png']) };
for (const t of GL_TRANSITIONS) projects[t] = writeProject(dir, t, { ...size, scenes: twoScenes(t) }, ['still.png']);

// A5.4: a GL transition, a refract lens and VHS curvature, with GL off; and the same with a fade.
const fallbackScenes = (transition) => {
  const [a, b] = twoScenes(transition);
  return [
    { ...a, layers: [...a.layers, lensLayer('glass', { name: 'Glass lens' })], sceneFx: [{ type: 'vhs', wave: 0, jitter: 0, bleed: 0, switching: 0, switchingHeight: 0, crease: 0, saturation: 1, barrel: 0.6 }] },
    b,
  ];
};
projects.fallbackCube = writeProject(dir, 'fallback-cube', { ...size, scenes: fallbackScenes('cube') }, ['still.png']);
projects.fallbackFade = writeProject(dir, 'fallback-fade', { ...size, scenes: fallbackScenes('fade') }, ['still.png']);

// A5.5 / A5.6: lenses over the ramp, centred on it.
const ramp = (frames) => imageLayer('ramp', `assets/${RAMP}`, { endFrame: frames, x: W / 2, y: H / 2, width: 256, height: 256, fitMode: 'fill' });
const X0 = W / 2 - 128;
const Y0 = H / 2 - 128;
const STRENGTH = 30;
const RADIUS = 100;
projects.rampPlain = writeProject(dir, 'ramp-plain', { ...size, scenes: [scene('s', 40, [ramp(40)])] }, [RAMP]);
projects.refract = writeProject(dir, 'refract', { ...size, scenes: [scene('s', 40, [ramp(40),
  lensLayer('glass', { endFrame: 40, width: RADIUS * 2, height: RADIUS * 2, strength: STRENGTH, dispersion: 0, highlight: 0 })])] }, [RAMP]);
const RIPPLE = { speed: 6, amplitude: 10, wavelength: 40, decay: 0.02, refraction: 10, life: 60 };
projects.ripple = writeProject(dir, 'ripple', { ...size, scenes: [scene('s', 40, [ramp(40),
  lensLayer('drop', { endFrame: 40, shape: 'rect', width: 256, height: 256, mode: 'ripple', impulses: [{ frame: 10, x: 0.5, y: 0.5 }], ...RIPPLE })])] }, [RAMP]);

// A5.7: 15 s, 1080×1920, 5 scenes, a transition between each.
const longScenes = (transitions) => transitions.concat('none').map((t, i) => ({
  ...scene(`s${i}`, 90, [imageLayer(`p${i}`, 'assets/still.png', { endFrame: 90 }), layer('text', `t${i}`, {
    endFrame: 90, y: 1500, width: 1000, height: 200, content: `SCENE ${i + 1}`, fontSize: 120, fontFamily: 'sans-serif',
    fontWeight: 'bold', fontStyle: 'normal', color: '#ffffff', align: 'center', verticalAlign: 'middle', lineHeight: 1.2,
    letterSpacing: 0, maxWidth: 0, textStroke: null, textShadow: null, zIndex: 1 })]),
  transition: t, transitionDurationFrames: t === 'none' ? 0 : 20,
}));
projects.longGl = writeProject(dir, 'long-gl', { scenes: longScenes(['cube', 'page-curl', 'film-burn', 'ascii-sweep']) }, ['still.png']);
projects.longFade = writeProject(dir, 'long-fade', { scenes: longScenes(['fade', 'fade', 'fade', 'fade']) }, ['still.png']);

const render = (project, name, extra = {}) => ({ kind: 'render', project, format: 'png-sequence', output: out(name), ...extra });
const jobs = [
  { kind: 'gl' },
  render(projects.ref, 'ref'),
  ...GL_TRANSITIONS.flatMap((t) => [render(projects[t], `${t}-1`), render(projects[t], `${t}-2`)]),
  render(projects.fallbackCube, 'fallback-cube', { disableGl: true }),
  render(projects.fallbackFade, 'fallback-fade', { disableGl: true }),
  { kind: 'preview', project: projects.fallbackCube, frames: [0], disableGl: true },
  render(projects.rampPlain, 'ramp-plain'),
  render(projects.refract, 'refract'),
  render(projects.ripple, 'ripple'),
  { kind: 'render', project: projects.longFade, format: 'mp4', output: out('long-fade.mp4') },
  { kind: 'render', project: projects.longGl, format: 'mp4', output: out('long-gl.mp4') },
];
const results = await runApp(dir, jobs, 30 * 60_000);
const rows = results.filter((r) => !r.ok).map((r) => ({ id: `${r.job.kind} ${r.job.output ?? r.job.project ?? ''}`, ok: false, detail: r.error }));
const ok = (name) => results.find((r) => r.job.output === out(name))?.ok;

const maxDiff = (a, b) => { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i])); return m; };
const px = (d, x, y) => [0, 1, 2, 3].map((k) => d[(y * W + x) * 4 + k]);

// A5.1, A5.2
const gl = results[0].data;
if (!gl?.available) {
  rows.push({ id: 'WebGL2 available in the app', ok: false, detail: JSON.stringify(gl) });
} else {
  rows.push({ id: 'A5.1 identity: opaque pixels within ±1', ok: gl.identity.opaque <= 1, detail: `max ${gl.identity.opaque}` });
  rows.push({ id: 'A5.1 identity: alpha ≥ 32 within ±2', ok: gl.identity.translucent <= 2, detail: `max ${gl.identity.translucent}` });
  rows.push({ id: 'A5.2 GPU hash equals CPU hash to 1/255 (64×64)', ok: gl.hashMaxError <= 1 / 255 + 1e-6, detail: `max error ${(gl.hashMaxError * 255).toFixed(3)}/255` });
}

// A5.3
for (const t of GL_TRANSITIONS) {
  if (!ok(`${t}-1`) || !ok(`${t}-2`) || !ok('ref')) continue;
  const first = maxDiff(await pngPixels(frameFile(`${t}-1`, 10)), await pngPixels(frameFile('ref', 10)));
  let same = true;
  for (const f of readdirSync(out(`${t}-1`)).filter((n) => n.endsWith('.png'))) {
    if (!(await pngPixels(join(out(`${t}-1`), f))).equals(await pngPixels(join(out(`${t}-2`), f)))) { same = false; break; }
  }
  const after = (await pngPixels(frameFile(`${t}-1`, 30))).equals(await pngPixels(frameFile('ref', 30)));
  const mid = (await pngPixels(frameFile(`${t}-1`, 20))).equals(await pngPixels(frameFile('ref', 20)));
  rows.push({ id: `A5.3 ${t}: first frame = outgoing (±2)`, ok: first <= 2, detail: `max difference ${first}` });
  rows.push({ id: `A5.3 ${t}: two exports identical, mid-frame differs, then the incoming scene`, ok: same && after && !mid, detail: `identical ${same}, after ${after}, mid differs ${!mid}` });
}

// A5.4
if (ok('fallback-cube') && ok('fallback-fade')) {
  let differ = 0;
  for (const f of readdirSync(out('fallback-cube')).filter((n) => n.endsWith('.png'))) {
    if (!(await pngPixels(join(out('fallback-cube'), f))).equals(await pngPixels(join(out('fallback-fade'), f)))) differ++;
  }
  rows.push({ id: 'A5.4 disableGl: the cube transition renders as the crossfade', ok: differ === 0, detail: `${differ} frames differ` });
}
const warning = results.find((r) => r.job.kind === 'preview')?.data?.warning ?? '';
rows.push({
  id: 'A5.4 the warning names the transition, the lens and the curvature', detail: warning,
  ok: warning.includes('Cube transition') && warning.includes('Glass lens') && warning.includes('VHS tube curvature'),
});

// A5.5: refract over the ramp.
if (ok('refract') && ok('ramp-plain')) {
  const plain = await pngPixels(frameFile('ramp-plain', 5));
  const glass = await pngPixels(frameFile('refract', 5));
  let changedOutside = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (Math.hypot(x + 0.5 - W / 2, y + 0.5 - H / 2) > RADIUS + 2 && maxDiff(px(glass, x, y), px(plain, x, y)) > 0) changedOutside++;
  }
  rows.push({ id: 'A5.5 refract: pixels outside the lens unchanged', ok: changedOutside === 0, detail: `${changedOutside} changed` });
  let worst = 0;
  for (const rho of [20, 50, 80]) for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
    const x = Math.round(W / 2 + dx * rho - 0.5);
    const y = Math.round(H / 2 + dy * rho - 0.5);
    const [r, g] = px(glass, x, y);
    // The ramp's pixel k is centred on k + 0.5. Expected sample: p − strength · (p − c) / R.
    const ex = x + 0.5 - X0 - STRENGTH * ((x + 0.5 - W / 2) / RADIUS);
    const ey = y + 0.5 - Y0 - STRENGTH * ((y + 0.5 - H / 2) / RADIUS);
    worst = Math.max(worst, Math.abs(r + 0.5 - ex), Math.abs(g + 0.5 - ey));
  }
  rows.push({ id: 'A5.5 refract: sample offset = strength × ρ / R, ±1 px (ρ = 20, 50, 80)', ok: worst <= 1, detail: `worst ${worst.toFixed(2)} px` });
}

// A5.6: ripple over the ramp, impulse at frame 10.
if (ok('ripple') && ok('ramp-plain')) {
  const plain = await pngPixels(frameFile('ramp-plain', 5));
  const before = await pngPixels(frameFile('ripple', 9));
  rows.push({ id: 'A5.6 ripple: before the impulse, frames equal the no-ripple render', ok: before.equals(plain) && (await pngPixels(frameFile('ripple', 0))).equals(plain) });
  for (const k of [5, 10, 15]) {
    const d = await pngPixels(frameFile('ripple', 10 + k));
    let best = -1; let at = -1;
    for (let r = 2; r < 120; r++) {
      const x = Math.round(W / 2 + r - 0.5);
      const y = H / 2;
      const [red, green] = px(d, x, y);
      const disp = Math.hypot(red - (x - X0), green - (y - Y0));
      if (disp > best) { best = disp; at = r; }
    }
    rows.push({ id: `A5.6 ripple at frame 10+${k}: strongest displacement at radius speed × k = ${RIPPLE.speed * k}, ±2`, ok: Math.abs(at - RIPPLE.speed * k) <= 2, detail: `at ${at} px, ${best.toFixed(1)} px` });
  }
}

// A5.7
const fadeRun = results.find((r) => r.job.output === out('long-fade.mp4'));
const glRun = results.find((r) => r.job.output === out('long-gl.mp4'));
if (fadeRun?.ok && glRun?.ok) {
  rows.push({ id: 'A5.7 15 s with GL transitions takes ≤ 1.3× the one with fades', ok: glRun.ms <= fadeRun.ms * 1.3, detail: `GL ${(glRun.ms / 1000).toFixed(1)} s, fades ${(fadeRun.ms / 1000).toFixed(1)} s (${(glRun.ms / fadeRun.ms).toFixed(2)}×)` });
}
report(rows);
