// Acceptance checks A1.1–A1.7 (spec §2.3): video layers exported and
// previewed through the real app. Frame-ID clip pixels say which source
// frame was drawn.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { H, W, ensureMedia, frameId, imageLayer, pixel, pngPixels, report, runApp, scene, videoLayer, workDir, writeProject } from './lib.mjs';

ensureMedia('frame-id.mp4', 'long-clip.mp4', 'still.png', 'poster.png', 'prores.mov');
const dir = workDir('f1-video');
const clip = (id, extra = {}) => videoLayer(id, 'assets/frame-id.mp4', { startFrame: 10, endFrame: 40, ...extra });
const half = (top) => ({ height: H / 2, y: top ? H / 4 : (3 * H) / 4 });

const p = {
  a11: writeProject(dir, 'a11', { scenes: [scene('s', 45, [clip('v', { startTime: 0.5 })])] }, ['frame-id.mp4']),
  a11x2: writeProject(dir, 'a11x2', { scenes: [scene('s', 45, [clip('v', { startTime: 0.5, playbackRate: 2 })])] }, ['frame-id.mp4']),
  a14: writeProject(dir, 'a14', { scenes: [scene('s', 45, [
    clip('top', { startTime: 0.5, ...half(true) }),
    clip('bottom', { startTime: 1.2, ...half(false), zIndex: 1 }),
  ])] }, ['frame-id.mp4']),
  a15: writeProject(dir, 'a15', { scenes: [scene('s', 60, [clip('v', { startTime: 0.5, endTime: 1.0, endFrame: 60 })])] }, ['frame-id.mp4']),
  a16: writeProject(dir, 'a16', { scenes: [scene('s', 3, [
    imageLayer('poster', 'assets/poster.png', { endFrame: 3 }),
    videoLayer('v', 'assets/prores.mov', { endFrame: 3, zIndex: 1 }),
  ])] }, ['poster.png', 'prores.mov']),
  a17v: writeProject(dir, 'a17v', { scenes: [scene('s', 450, [videoLayer('v', 'assets/long-clip.mp4', { endFrame: 450 })])] }, ['long-clip.mp4']),
  a17i: writeProject(dir, 'a17i', { scenes: [scene('s', 450, [imageLayer('i', 'assets/still.png', { endFrame: 450 })])] }, ['still.png']),
};

const out = (name) => join(dir, name);
const results = await runApp(dir, [
  { kind: 'render', project: p.a11, format: 'png-sequence', output: out('a11-1') },
  { kind: 'render', project: p.a11, format: 'png-sequence', output: out('a11-2') },
  { kind: 'render', project: p.a11x2, format: 'png-sequence', output: out('a11x2') },
  { kind: 'render', project: p.a14, format: 'png-sequence', output: out('a14') },
  { kind: 'render', project: p.a15, format: 'png-sequence', output: out('a15') },
  { kind: 'render', project: p.a16, format: 'png-sequence', output: out('a16') },
  { kind: 'render', project: p.a17v, format: 'mp4', output: out('a17v.mp4') },
  { kind: 'render', project: p.a17i, format: 'mp4', output: out('a17i.mp4') },
  { kind: 'preview', project: p.a11, frames: [10, 20, 39] },
  { kind: 'preview', project: p.a16, frames: [0] },
]);
const rows = results.filter((r) => !r.ok).map((r) => ({ id: `${r.job.kind} ${r.job.output ?? r.job.project}`, ok: false, detail: r.error }));
const result = (pred) => results.find(pred);
const frameFile = (folder, f) => join(out(folder), `frame-${String(f).padStart(4, '0')}.png`);
const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);

async function idsMatch(id, folder, frames, expected, y = H / 2) {
  const bad = [];
  for (const f of frames) {
    const grey = (await pixel(frameFile(folder, f), W / 2, y))[0];
    if (frameId(grey) !== expected(f) % 30) bad.push(`frame ${f}: grey ${grey} → ${frameId(grey)}, want ${expected(f) % 30}`);
  }
  rows.push({ id, ok: bad.length === 0, detail: bad.slice(0, 4).join('; ') || `${frames.length} frames` });
}

await idsMatch('A1.1 rate 1', 'a11-1', range(10, 40), (f) => 15 + (f - 10));
await idsMatch('A1.1 rate 2', 'a11x2', range(10, 40), (f) => 15 + 2 * (f - 10));

{
  const files = readdirSync(out('a11-1')).filter((f) => f.endsWith('.png')).sort();
  const differ = [];
  for (const f of files) {
    if (!(await pngPixels(join(out('a11-1'), f))).equals(await pngPixels(join(out('a11-2'), f)))) differ.push(f);
  }
  rows.push({ id: 'A1.2 two exports identical', ok: files.length === 45 && differ.length === 0, detail: `${files.length} frames, ${differ.length} differ ${differ.slice(0, 3)}` });
}

{
  const preview = result((r) => r.job.kind === 'preview' && r.job.project === p.a11);
  const bad = [];
  for (const { frame, rgba } of preview?.data?.pixels ?? []) {
    const exported = (await pixel(frameFile('a11-1', frame)))[0];
    if (Math.abs(rgba[0] - exported) > 2) bad.push(`frame ${frame}: preview ${rgba[0]}, export ${exported}`);
  }
  rows.push({
    id: 'A1.3 preview matches export', detail: bad.join('; ') || JSON.stringify(preview?.data?.pixels),
    ok: !!preview?.ok && preview.data.pixels.length === 3 && bad.length === 0,
  });
}

await idsMatch('A1.4 top layer', 'a14', range(10, 40), (f) => 15 + (f - 10), H / 4);
await idsMatch('A1.4 bottom layer', 'a14', range(10, 40), (f) => 36 + (f - 10), (3 * H) / 4);
await idsMatch('A1.5 holds the last frame', 'a15', range(10, 60), (f) => Math.min(15 + (f - 10), 29));

{
  const render = result((r) => r.job.output === out('a16'));
  const preview = result((r) => r.job.kind === 'preview' && r.job.project === p.a16);
  const [r, g, b] = render?.ok ? await pixel(frameFile('a16', 1)) : [];
  rows.push({ id: 'A1.6 export succeeds and shows the poster', ok: !!render?.ok && r > 240 && g < 15 && b < 15, detail: `rgb ${r},${g},${b}` });
  rows.push({
    id: 'A1.6 warning shown', detail: String(preview?.data?.warning),
    ok: preview?.data?.warning === "1 video layer can't be decoded; convert it to H.264 MP4",
  });
}

{
  const v = result((r) => r.job.output === out('a17v.mp4'));
  const i = result((r) => r.job.output === out('a17i.mp4'));
  const ratio = v.ms / i.ms;
  rows.push({
    id: 'A1.7 export time ≤ ~2× image', ok: v.ok && i.ok && ratio <= 2.2,
    detail: `video ${(v.ms / 1000).toFixed(1)} s, image ${(i.ms / 1000).toFixed(1)} s, ratio ${ratio.toFixed(2)}`,
  });
}

report(rows);
