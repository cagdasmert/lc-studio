import { describe, expect, it, vi } from 'vitest';
import { VideoFrameCache, type DecodedFrame, type FrameSink } from './video-frames';
import type { VideoDraw } from './video-time';

const FPS = 30;
/** As sourceTimeFor would ask for source frame n. */
const at = (n: number) => n / FPS + 1e-4;

/** A 30 fps clip of `count` frames whose canvases carry their frame index. */
function fakeSink(count = 120) {
  const seeks: number[] = [];
  const state = { disposed: false, broken: false };
  const frame = (i: number): DecodedFrame => ({
    canvas: { index: i } as unknown as HTMLCanvasElement, timestamp: i / FPS, duration: 1 / FPS,
  });
  const sink: FrameSink = {
    startTime: 0,
    endTime: count / FPS,
    async *frames(start) {
      seeks.push(start);
      if (state.broken) throw new Error('decode error');
      for (let i = Math.floor(start * FPS + 1e-9); i < count; i++) yield frame(i);
    },
    dispose() { state.disposed = true; },
  };
  return { sink, seeks, state };
}

function cacheOver(...sinks: ReturnType<typeof fakeSink>[]) {
  const queue = sinks.map((s) => s.sink);
  const open = vi.fn(async () => {
    const next = queue.shift();
    if (!next) throw new Error('no sink left');
    return next;
  });
  const load = vi.fn(async (src: string) => new Blob([src]));
  return { cache: new VideoFrameCache(load, open), open, load };
}

const draw = (layerId: string, sourceTime: number, src = 'clip.mp4'): VideoDraw => ({ layerId, src, sourceTime });
const shown = (cache: VideoFrameCache, id: string) => (cache.get(id) as unknown as { index: number } | undefined)?.index;

describe('VideoFrameCache', () => {
  it('decodes consecutive frames exactly, seeking once', async () => {
    const s = fakeSink();
    const { cache } = cacheOver(s);
    for (let k = 0; k < 30; k++) {
      await cache.prepare([draw('a', at(15 + k))]);
      expect(shown(cache, 'a')).toBe(15 + k);
    }
    expect(s.seeks).toEqual([at(15)]);
  });

  it('decodes forward through skipped frames at double speed', async () => {
    const s = fakeSink();
    const { cache } = cacheOver(s);
    for (let k = 0; k < 30; k++) {
      await cache.prepare([draw('a', at(15 + 2 * k))]);
      expect(shown(cache, 'a')).toBe(15 + 2 * k);
    }
    expect(s.seeks).toHaveLength(1);
  });

  it('seeks for a backward jump', async () => {
    const s = fakeSink();
    const { cache } = cacheOver(s);
    await cache.prepare([draw('a', at(60))]);
    await cache.prepare([draw('a', at(15))]);
    expect(shown(cache, 'a')).toBe(15);
    expect(s.seeks).toHaveLength(2);
  });

  it('seeks for a jump of more than two seconds', async () => {
    const s = fakeSink();
    const { cache } = cacheOver(s);
    await cache.prepare([draw('a', at(0))]);
    await cache.prepare([draw('a', at(90))]);
    expect(shown(cache, 'a')).toBe(90);
    expect(s.seeks).toHaveLength(2);
  });

  it('gives each layer its own decoder (A1.4)', async () => {
    const s1 = fakeSink();
    const s2 = fakeSink();
    const { cache, open } = cacheOver(s1, s2);
    for (let k = 0; k < 10; k++) {
      await cache.prepare([draw('top', at(15 + k)), draw('bottom', at(36 + k))]);
      expect([shown(cache, 'top'), shown(cache, 'bottom')]).toEqual([15 + k, 36 + k]);
    }
    expect(open).toHaveBeenCalledTimes(2);
    expect(s1.seeks).toHaveLength(1);
    expect(s2.seeks).toHaveLength(1);
  });

  it('holds the last frame past the end of the track', async () => {
    const { cache } = cacheOver(fakeSink());
    await cache.prepare([draw('a', 10)]);
    expect(shown(cache, 'a')).toBe(119);
  });

  it('remembers files it cannot open, and warns once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const open = vi.fn(async (): Promise<FrameSink> => { throw new Error('the file has no video track'); });
    const cache = new VideoFrameCache(async () => new Blob([]), open);
    for (let i = 0; i < 3; i++) expect(await cache.prepare([draw('a', at(i), 'bad.mov')])).toBe(false);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.failures().get('bad.mov')).toMatch(/no video track/);
    expect(open).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('reports whether a layer\'s prepared frame changed', async () => {
    const { cache } = cacheOver(fakeSink());
    expect(await cache.prepare([draw('a', at(15))])).toBe(true);
    expect(await cache.prepare([draw('a', at(15) + 0.01)])).toBe(false);
    expect(await cache.prepare([draw('a', at(16))])).toBe(true);
  });

  it('drops superseded requests while scrubbing', async () => {
    const { cache } = cacheOver(fakeSink());
    const first = cache.prepare([draw('a', at(30))]);
    const second = cache.prepare([draw('a', at(60))]);
    await Promise.all([first, second]);
    expect(shown(cache, 'a')).toBe(60);
  });

  it('clears a layer\'s frame when decoding fails, rather than keep a stale one', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const s = fakeSink();
    const { cache } = cacheOver(s);
    await cache.prepare([draw('a', at(15))]);
    s.state.broken = true;
    await cache.prepare([draw('a', at(90))]);
    expect(cache.get('a')).toBeUndefined();
    warn.mockRestore();
  });

  it('closes decoders of layers that are gone', async () => {
    const s = fakeSink();
    const { cache } = cacheOver(s);
    await cache.prepare([draw('a', at(15))]);
    cache.retain(new Set(['other']));
    expect(s.state.disposed).toBe(true);
    expect(cache.get('a')).toBeUndefined();
  });

  it('can be used again after dispose', async () => {
    const s1 = fakeSink();
    const s2 = fakeSink();
    const { cache } = cacheOver(s1, s2);
    await cache.prepare([draw('a', at(15))]);
    cache.dispose();
    expect(s1.state.disposed).toBe(true);
    expect(cache.get('a')).toBeUndefined();
    await cache.prepare([draw('a', at(20))]);
    expect(shown(cache, 'a')).toBe(20);
  });
});
