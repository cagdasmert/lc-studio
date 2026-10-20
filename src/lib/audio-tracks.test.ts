import { describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import type { AudioLayerData, Composition, Layer, Scene, VideoLayerData } from '../types';

vi.mock('@tauri-apps/plugin-fs', () => ({ readFile: vi.fn() }));
vi.mock('./asset-manager', () => ({
  resolveAssetPath: async (src: string, dir: string | null) =>
    dir && src.startsWith('assets/') ? `${dir}/${src}` : src,
}));

const { audioTiming, buildAudioTracks, collectAudibleLayers, hasAudioTrack } = await import('./audio-tracks');

const base = {
  name: 'l', x: 0, y: 0, width: 0, height: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1,
  anchorX: 0.5, anchorY: 0.5, zIndex: 0, blendMode: 'normal' as const, effects: [],
  visible: true, locked: false, keyframes: {},
};

function audio(id: string, extra: Partial<AudioLayerData>): AudioLayerData {
  return {
    ...base, id, type: 'audio', src: `assets/${id}.wav`, startFrame: 0, endFrame: 30,
    startTime: 0, endTime: 0, volume: 1, fadeInFrames: 0, fadeOutFrames: 0, ...extra,
  };
}

function video(id: string, extra: Partial<VideoLayerData>): VideoLayerData {
  return {
    ...base, id, type: 'video', src: `assets/${id}.mp4`, startFrame: 0, endFrame: 30,
    startTime: 0, endTime: 0, playbackRate: 1, muted: false, ...extra,
  };
}

function scene(durationFrames: number, layers: Layer[]): Scene {
  return {
    id: `s${durationFrames}`, label: 's', durationFrames, backgroundColor: '#000',
    layers, transition: 'none', transitionDurationFrames: 0,
  };
}

function comp(...scenes: Scene[]): Composition {
  return { id: 'c', name: 'c', scenes, output: { id: 'o', label: 'o', width: 360, height: 640, fps: 30 } };
}

// Spec A2.1: scene 1 (2 s) music from 10 s in; scene 2 (3 s) tone at frame 15 with a 15-frame fade-in.
const a21 = comp(
  scene(60, [audio('music', { endFrame: 60, startTime: 10 })]),
  scene(90, [audio('tone', { startFrame: 15, endFrame: 90, fadeInFrames: 15, endTime: 3 })]),
);

describe('audioTiming', () => {
  it('places a layer after the earlier scenes', () => {
    expect(audioTiming(audio('tone', { startFrame: 15, endFrame: 90, fadeInFrames: 15, fadeOutFrames: 6, volume: 0.5 }), 60, 90, 30)).toEqual({
      timelineOffsetSecs: 2.5, sourceStartSecs: 0, durationSecs: 2.5, volume: 0.5,
      fadeInSecs: 0.5, fadeOutSecs: 0.2, playbackRate: 1,
    });
  });

  it('shortens to the source range divided by the speed', () => {
    const t = audioTiming(video('v', { endFrame: 90, startTime: 1, endTime: 3, playbackRate: 2 }), 0, 90, 30);
    expect(t.durationSecs).toBe(1);
    expect(t.playbackRate).toBe(2);
    expect(t.sourceStartSecs).toBe(1);
  });

  it('ignores an endTime that is not after startTime', () => {
    expect(audioTiming(audio('m', { endFrame: 60, startTime: 10, endTime: 2 }), 0, 60, 30).durationSecs).toBe(2);
  });

  it('gives video sound full volume and no fades', () => {
    const t = audioTiming(video('v', {}), 0, 30, 30);
    expect([t.volume, t.fadeInSecs, t.fadeOutSecs]).toEqual([1, 0, 0]);
  });

  it('stops at the end of its scene', () => {
    expect(audioTiming(audio('m', { endFrame: 200 }), 0, 60, 30).durationSecs).toBe(2);
  });
});

describe('collectAudibleLayers', () => {
  it('keeps visible audio layers and unmuted video layers', () => {
    const c = comp(scene(30, [
      audio('a', {}),
      audio('hidden', { visible: false }),
      video('loud', { muted: false }),
      video('quiet', { muted: true }),
      audio('never', { startFrame: 40, endFrame: 50 }),
    ]));
    expect(collectAudibleLayers(c).map((a) => a.layer.id)).toEqual(['a', 'loud']);
  });
});

describe('buildAudioTracks', () => {
  it('builds the A2.1 tracks', async () => {
    expect(await buildAudioTracks(a21, '/p/x.lcs', async () => true)).toEqual([
      {
        path: '/p/x.lcs/assets/music.wav', startTimeSecs: 10, durationSecs: 2, volume: 1,
        timelineOffsetSecs: 0, fadeInSecs: 0, fadeOutSecs: 0, playbackRate: 1,
      },
      {
        path: '/p/x.lcs/assets/tone.wav', startTimeSecs: 0, durationSecs: 2.5, volume: 1,
        timelineOffsetSecs: 2.5, fadeInSecs: 0.5, fadeOutSecs: 0, playbackRate: 1,
      },
    ]);
  });

  it('drops video layers whose file has no sound, probing each file once', async () => {
    const c = comp(scene(30, [
      video('silent', {}), video('silent2', { src: 'assets/silent.mp4' }), video('loud', {}),
    ]));
    const probe = vi.fn(async (src: string) => !src.includes('silent'));
    const tracks = await buildAudioTracks(c, '/p', probe);
    expect(tracks.map((t) => t.path)).toEqual(['/p/assets/loud.mp4']);
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it('treats an unreadable video file as silent', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const c = comp(scene(30, [video('broken', {})]));
    expect(await buildAudioTracks(c, '/p', async () => { throw new Error('nope'); })).toEqual([]);
    warn.mockRestore();
  });
});

describe('hasAudioTrack', () => {
  const media = (name: string) => `test-media/${name}`;
  const have = existsSync(media('clip-with-audio.mp4')) && existsSync(media('clip-silent.mp4'));

  it.skipIf(!have)('reads the audio track from the container', async () => {
    const blob = (name: string) => new Blob([readFileSync(media(name))]);
    expect(await hasAudioTrack(blob('clip-with-audio.mp4'))).toBe(true);
    expect(await hasAudioTrack(blob('clip-silent.mp4'))).toBe(false);
  });
});
