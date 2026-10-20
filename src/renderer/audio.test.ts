import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioLayerData, Composition, Layer, Scene, VideoLayerData } from '../types';

vi.mock('@tauri-apps/plugin-fs', () => ({ readFile: vi.fn() }));
vi.mock('../lib/asset-manager', () => ({ resolveAssetPath: async (src: string) => src }));

const { AudioEngine } = await import('./audio');

class FakeParam {
  value = 1;
  events: [string, number, number][] = [];
  setValueAtTime(v: number, t: number) { this.events.push(['set', v, t]); return this; }
  linearRampToValueAtTime(v: number, t: number) { this.events.push(['ramp', v, t]); return this; }
}
class FakeSource {
  buffer: unknown = null;
  playbackRate = { value: 1 };
  started: number[] | null = null;
  stopped = false;
  disconnected = false;
  connect<T>(node: T) { return node; }
  disconnect() { this.disconnected = true; }
  start(...args: number[]) { this.started = args; }
  stop() { this.stopped = true; }
}
class FakeContext {
  currentTime = 5;
  state = 'running';
  destination = {};
  sources: FakeSource[] = [];
  gains: FakeParam[] = [];
  decodeAudioData = vi.fn(async (_bytes: ArrayBuffer): Promise<unknown> => ({ duration: 20 }));
  createBufferSource() { const s = new FakeSource(); this.sources.push(s); return s; }
  createGain() { const gain = new FakeParam(); this.gains.push(gain); return { gain, connect: <T>(n: T) => n }; }
  resume = vi.fn(async () => {});
  close = vi.fn(async () => {});
}

const base = {
  name: 'l', x: 0, y: 0, width: 0, height: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1,
  anchorX: 0.5, anchorY: 0.5, zIndex: 0, blendMode: 'normal' as const, effects: [],
  visible: true, locked: false, keyframes: {},
};
const audio = (id: string, extra: Partial<AudioLayerData>): AudioLayerData => ({
  ...base, id, type: 'audio', src: `${id}.wav`, startFrame: 0, endFrame: 30, startTime: 0, endTime: 0,
  volume: 1, fadeInFrames: 0, fadeOutFrames: 0, ...extra,
});
const video = (id: string, extra: Partial<VideoLayerData>): VideoLayerData => ({
  ...base, id, type: 'video', src: `${id}.mp4`, startFrame: 0, endFrame: 30, startTime: 0, endTime: 0,
  playbackRate: 1, muted: false, ...extra,
});
const scene = (durationFrames: number, layers: Layer[]): Scene => ({
  id: `s${durationFrames}`, label: 's', durationFrames, backgroundColor: '#000', layers, transition: 'none', transitionDurationFrames: 0,
});

// music 0–2 s from 10 s in; tone 2.5–5 s with 0.5 s fades; clip 4–5 s at double speed from 1 s in.
const comp: Composition = {
  id: 'c', name: 'c', output: { id: 'o', label: 'o', width: 10, height: 10, fps: 30 },
  scenes: [
    scene(60, [audio('music', { endFrame: 60, startTime: 10 })]),
    scene(90, [
      audio('tone', { startFrame: 15, endFrame: 90, fadeInFrames: 15, fadeOutFrames: 15 }),
      video('clip', { startFrame: 60, endFrame: 90, startTime: 1, playbackRate: 2 }),
    ]),
  ],
};

const round = (xs: number[]) => xs.map((x) => Math.round(x * 1e6) / 1e6);

let ctx: FakeContext;
let engine: InstanceType<typeof AudioEngine>;

beforeEach(async () => {
  ctx = new FakeContext();
  engine = new AudioEngine(async (src) => new Blob([src]), () => ctx as unknown as AudioContext);
  await engine.preload(comp);
});

describe('AudioEngine.schedule', () => {
  it('schedules every sound from the start', () => {
    engine.schedule(ctx as unknown as BaseAudioContext, comp, 0, 5);
    expect(ctx.sources.map((s) => round(s.started!))).toEqual([[5, 10, 2], [7.5, 0, 2.5], [9, 1, 2]]);
    expect(ctx.sources.map((s) => s.playbackRate.value)).toEqual([1, 1, 2]);
    expect(ctx.gains[1].events.map(([k, v, t]) => [k, v, Math.round(t * 1e6) / 1e6])).toEqual([
      ['set', 0, 7.5], ['ramp', 1, 8], ['set', 1, 9.5], ['ramp', 0, 10],
    ]);
  });

  it('starts mid-sound with the right offsets and envelope', () => {
    engine.schedule(ctx as unknown as BaseAudioContext, comp, 3.5, 5);
    // music has ended; tone is 1 s in; clip starts 0.5 s later.
    expect(ctx.sources.map((s) => round(s.started!))).toEqual([[5, 1, 1.5], [5.5, 1, 2]]);
    expect(ctx.gains[0].events).toEqual([['set', 1, 5], ['set', 1, 6], ['ramp', 0, 6.5]]);
  });

  it('runs faster at a faster preview speed', () => {
    engine.schedule(ctx as unknown as BaseAudioContext, comp, 0, 5, 2);
    expect(round(ctx.sources[1].started!)).toEqual([6.25, 0, 2.5]);
    expect(ctx.sources.map((s) => s.playbackRate.value)).toEqual([2, 2, 4]);
  });

  it('skips files that could not be decoded', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failing = new FakeContext();
    failing.decodeAudioData.mockRejectedValue(new Error('not audio'));
    const e = new AudioEngine(async (src) => new Blob([src]), () => failing as unknown as AudioContext);
    await e.preload(comp);
    expect(e.schedule(failing as unknown as BaseAudioContext, comp, 0, 0)).toEqual([]);
    warn.mockRestore();
  });
});

describe('AudioEngine playback', () => {
  it('decodes each file once', () => {
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(3);
  });

  it('plays from a frame on its own context and stops everything', () => {
    engine.seekTo(105, comp); // 3.5 s
    expect(ctx.sources).toHaveLength(2);
    engine.stopAll();
    expect(ctx.sources.every((s) => s.stopped && s.disconnected)).toBe(true);
  });

  it('replaces what was playing on a seek', () => {
    engine.seekTo(0, comp);
    const first = [...ctx.sources];
    engine.seekTo(105, comp);
    expect(first.every((s) => s.stopped)).toBe(true);
  });
});
