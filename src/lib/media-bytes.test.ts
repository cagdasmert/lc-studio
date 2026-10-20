import { beforeEach, describe, expect, it, vi } from 'vitest';

const readFile = vi.fn(async (_path: string) => new Uint8Array([1, 2, 3]));
vi.mock('@tauri-apps/plugin-fs', () => ({ readFile: (path: string) => readFile(path) }));
vi.mock('./asset-manager', () => ({
  resolveAssetPath: async (src: string, dir: string | null) =>
    dir && src.startsWith('assets/') ? `${dir}/${src}` : src,
}));

const { loadMediaBlob, MediaBlobCache } = await import('./media-bytes');

describe('loadMediaBlob', () => {
  beforeEach(() => readFile.mockClear());

  it('reads project assets from the filesystem, not by fetching a path', async () => {
    const blob = await loadMediaBlob('assets/clip.mp4', '/p/x.lcs');
    expect(readFile).toHaveBeenCalledWith('/p/x.lcs/assets/clip.mp4');
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('reads absolute paths as they are', async () => {
    await loadMediaBlob('/media/clip.mp4', '/p/x.lcs');
    expect(readFile).toHaveBeenCalledWith('/media/clip.mp4');
  });

  it('fetches http URLs', async () => {
    const fetchMock = vi.fn(async (_url: string) => new Response(new Uint8Array([9])));
    vi.stubGlobal('fetch', fetchMock);
    const blob = await loadMediaBlob('https://example.com/a.mp4', null);
    expect(fetchMock).toHaveBeenCalledWith('https://example.com/a.mp4');
    expect(readFile).not.toHaveBeenCalled();
    expect(blob.size).toBe(1);
    vi.unstubAllGlobals();
  });
});

describe('MediaBlobCache', () => {
  beforeEach(() => readFile.mockClear());

  it('reads each source once, even for concurrent requests', async () => {
    const cache = new MediaBlobCache('/p/x.lcs');
    const [a, b] = await Promise.all([cache.get('assets/a.mp4'), cache.get('assets/a.mp4')]);
    expect(a).toBe(b);
    expect(readFile).toHaveBeenCalledTimes(1);
  });

  it('retries a source whose read failed', async () => {
    const cache = new MediaBlobCache('/p/x.lcs');
    readFile.mockRejectedValueOnce(new Error('denied'));
    await expect(cache.get('assets/a.mp4')).rejects.toThrow('denied');
    await expect(cache.get('assets/a.mp4')).resolves.toBeInstanceOf(Blob);
    expect(readFile).toHaveBeenCalledTimes(2);
  });

  it('forgets everything on clear', async () => {
    const cache = new MediaBlobCache(null);
    await cache.get('/a.mp4');
    cache.clear();
    await cache.get('/a.mp4');
    expect(readFile).toHaveBeenCalledTimes(2);
  });
});
