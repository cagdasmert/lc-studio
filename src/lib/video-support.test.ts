import { describe, expect, it, vi } from 'vitest';
import type { Composition, VideoLayerData } from '../types';

vi.mock('./media-bytes', () => ({ loadMediaBlob: async (src: string) => new Blob([src]) }));
const opened: string[] = [];
vi.mock('../renderer/video-frames', () => ({
  openMediabunnySink: async (blob: Blob) => {
    const src = await blob.text();
    opened.push(src);
    if (src.endsWith('.mov')) throw new Error('prores');
    return { dispose: () => {} };
  },
}));

const { countUndecodableVideoLayers, undecodableWarning, videoSourcesKey } = await import('./video-support');

const video = (id: string, src: string, visible = true) =>
  ({ id, type: 'video', src, visible } as unknown as VideoLayerData);
const comp = (...layers: VideoLayerData[]) => ({
  scenes: [{ layers }], output: { fps: 30 },
} as unknown as Composition);

describe('undecodable video warning', () => {
  it('counts visible layers whose file the webview cannot decode, probing each file once', async () => {
    const c = comp(video('a', 'assets/a.mp4'), video('b', 'assets/b.mov'), video('c', 'assets/b.mov'), video('d', 'assets/d.mov', false));
    expect(await countUndecodableVideoLayers(c, '/p')).toBe(2);
    expect(opened.filter((s) => s === 'assets/b.mov')).toHaveLength(1);
  });

  it('words the warning', () => {
    expect(undecodableWarning(0)).toBeNull();
    expect(undecodableWarning(1)).toBe("1 video layer can't be decoded; convert it to H.264 MP4");
    expect(undecodableWarning(2)).toBe("2 video layers can't be decoded; convert them to H.264 MP4");
  });

  it('keys on the visible video layers and their files only', () => {
    expect(videoSourcesKey(comp(video('a', 'x.mp4'), video('b', 'y.mp4', false)))).toBe('a:x.mp4');
  });
});
