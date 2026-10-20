// Acceptance check A2.5 (spec §3.3): preview playback sounds like the export.
// The preview's scheduling code renders the timeline into an
// OfflineAudioContext inside the real app; band by band, its silences must
// line up with the exported MP4's. Rate stays 1: preview speed changes shift
// pitch, the export's don't.
import { join } from 'node:path';
import { audioLayer, ensureMedia, report, runApp, scene, silences, videoLayer, workDir, writeProject } from './lib.mjs';

ensureMedia('music.wav', 'tone.wav', 'clip-with-audio.mp4');
const dir = workDir('f2-preview');
const project = writeProject(dir, 'a25', { width: 360, height: 640, scenes: [
  scene('s1', 60, [audioLayer('music', 'assets/music.wav', { endFrame: 60, startTime: 10 })]),
  scene('s2', 90, [
    audioLayer('tone', 'assets/tone.wav', { startFrame: 15, endFrame: 90, fadeInFrames: 15, fadeOutFrames: 15 }),
    videoLayer('clip', 'assets/clip-with-audio.mp4', { startFrame: 30, endFrame: 90, startTime: 0.5, muted: false }),
    videoLayer('muted', 'assets/clip-with-audio.mp4', { endFrame: 30, muted: true }),
  ]),
] }, ['music.wav', 'tone.wav', 'clip-with-audio.mp4']);

const exported = join(dir, 'a25.mp4');
const preview = join(dir, 'a25-preview.wav');
const results = await runApp(dir, [
  { kind: 'render', project, format: 'mp4', output: exported },
  { kind: 'preview-audio', project, output: preview },
  { kind: 'play', project, seconds: 1 },
]);
const rows = results.filter((r) => !r.ok).map((r) => ({ id: `${r.job.kind}`, ok: false, detail: r.error }));

const END = 5; // seconds
const clamp = (g) => ({ start: Math.min(g.start, END), end: Math.min(g.end, END) });
const TOL = 0.06;

if (rows.length === 0) {
  for (const band of [undefined, 440, 660, 880]) {
    const a = silences(exported, { band }).map(clamp);
    const b = silences(preview, { band }).map(clamp);
    const same = a.length === b.length && a.every((g, i) => Math.abs(g.start - b[i].start) <= TOL && Math.abs(g.end - b[i].end) <= TOL);
    rows.push({ id: `A2.5 ${band ? `${band} Hz` : 'all'} silences match`, ok: same, detail: `export ${JSON.stringify(a)} preview ${JSON.stringify(b)}` });
  }
}
// Live playback in the workspace: pressing play from frame 0 starts the music
// now, the tone 2.5 s later and the clip's sound 3 s later (from 0.5 s in);
// the muted clip never starts.
const play = results.find((r) => r.job.kind === 'play');
if (play?.ok) {
  const starts = play.data.starts.map(([now, when, offset, duration, state]) => ({ in: when - now, offset, duration, state }));
  const want = [[0, 10, 2], [2.5, 0, 2.5], [3, 0.5, 2]];
  const match = starts.length === 3 && want.every(([dt, off, dur], i) =>
    Math.abs(starts[i].in - dt) < 0.1 && Math.abs(starts[i].offset - off) < 1e-6 && Math.abs(starts[i].duration - dur) < 1e-6);
  rows.push({ id: 'A2.5 live playback schedules every sound', ok: match, detail: JSON.stringify(starts) });
}
report(rows);
