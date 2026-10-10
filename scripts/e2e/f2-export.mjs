// Acceptance checks A2.1–A2.3 (spec §3.3): MP4 exports through the real app,
// inspected with ffprobe and ffmpeg. A2.4 is `cargo test`.
import { join } from 'node:path';
import { audibleAt, audioLayer, ensureMedia, report, runApp, scene, silences, streams, videoLayer, workDir, writeProject } from './lib.mjs';

ensureMedia('music.wav', 'tone.wav', 'clip-with-audio.mp4', 'clip-silent.mp4');
const dir = workDir('f2-export');
const size = { width: 360, height: 640, fps: 30 };
const FRAME = 1 / 30;
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const projects = {
  // A2.1: scene 1 (2 s) music from 10 s in; scene 2 (3 s) tone at frame 15 with a 15-frame fade-in.
  a21: writeProject(dir, 'a21', { ...size, scenes: [
    scene('s1', 60, [audioLayer('music', 'assets/music.wav', { endFrame: 60, startTime: 10 })]),
    scene('s2', 90, [audioLayer('tone', 'assets/tone.wav', { startFrame: 15, endFrame: 90, fadeInFrames: 15 })]),
  ] }, ['music.wav', 'tone.wav']),
  // A2.2: a 3 s tone under a 5 s video.
  a22: writeProject(dir, 'a22', { ...size, scenes: [
    scene('s1', 150, [audioLayer('tone', 'assets/tone.wav', { endFrame: 150 })]),
  ] }, ['tone.wav']),
  // A2.3: unmuted video with sound + music; muted video + music; unmuted silent video + music.
  a23a: writeProject(dir, 'a23a', { ...size, scenes: [scene('s1', 90, [
    videoLayer('clip', 'assets/clip-with-audio.mp4', { endFrame: 90, muted: false }),
    audioLayer('music', 'assets/music.wav', { endFrame: 90 }),
  ])] }, ['clip-with-audio.mp4', 'music.wav']),
  a23b: writeProject(dir, 'a23b', { ...size, scenes: [scene('s1', 90, [
    videoLayer('clip', 'assets/clip-with-audio.mp4', { endFrame: 90, muted: true }),
    audioLayer('music', 'assets/music.wav', { endFrame: 90 }),
  ])] }, ['clip-with-audio.mp4', 'music.wav']),
  a23c: writeProject(dir, 'a23c', { ...size, scenes: [scene('s1', 90, [
    videoLayer('clip', 'assets/clip-silent.mp4', { endFrame: 90, muted: false }),
    audioLayer('music', 'assets/music.wav', { endFrame: 90 }),
  ])] }, ['clip-silent.mp4', 'music.wav']),
};

const out = (name) => join(dir, `${name}.mp4`);
const results = await runApp(dir, Object.entries(projects).map(([name, project]) => (
  { kind: 'render', project, format: 'mp4', output: out(name) }
)));
const ok = (name) => results.find((r) => r.job.output === out(name))?.ok;
const rows = results.filter((r) => !r.ok).map((r) => ({ id: `render ${r.job.output}`, ok: false, detail: r.error }));

if (ok('a21')) {
  const s = streams(out('a21'));
  const video = s.find((x) => x.codec_type === 'video');
  const audio = s.filter((x) => x.codec_type === 'audio');
  rows.push({
    id: 'A2.1 one AAC stream, video length', detail: JSON.stringify(s),
    ok: audio.length === 1 && audio[0].codec_name === 'aac' && near(audio[0].duration, video.duration, FRAME),
  });
  const gaps = silences(out('a21'));
  const gap = gaps.find((g) => g.start > 1.5 && g.start < 3);
  rows.push({ id: 'A2.1 tone starts at 2.5 s', ok: !!gap && near(gap.end, 2.5, FRAME), detail: JSON.stringify(gaps) });
  const music = silences(out('a21'), { band: 440 });
  rows.push({
    id: 'A2.1 music only 0–2 s', detail: JSON.stringify(music),
    ok: music.length === 1 && near(music[0].start, 2, 0.1) && music[0].end > 4.9,
  });
}
if (ok('a22')) {
  const s = streams(out('a22'));
  const video = s.find((x) => x.codec_type === 'video');
  const audio = s.find((x) => x.codec_type === 'audio');
  rows.push({
    id: 'A2.2 short audio keeps the 5 s video, padded to match', detail: JSON.stringify(s),
    ok: near(video.duration, 5, FRAME) && near(audio.duration, video.duration, FRAME),
  });
}
if (ok('a23a')) {
  rows.push({ id: 'A2.3 video sound audible', ok: audibleAt(out('a23a'), 660, 1.5) });
  rows.push({ id: 'A2.3 music audible with it', ok: audibleAt(out('a23a'), 440, 1.5) });
}
if (ok('a23b')) {
  rows.push({ id: 'A2.3 muted video silent', ok: !audibleAt(out('a23b'), 660, 1.5) });
  rows.push({ id: 'A2.3 music still audible', ok: audibleAt(out('a23b'), 440, 1.5) });
}
rows.push({
  id: 'A2.3 silent video file still exports', detail: ok('a23c') ? '' : 'render failed',
  ok: !!ok('a23c') && streams(out('a23c')).filter((x) => x.codec_type === 'audio').length === 1,
});
report(rows);
