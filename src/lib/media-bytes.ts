import { readFile } from '@tauri-apps/plugin-fs';
import { resolveAssetPath } from './asset-manager';

/** Files above this are still read whole, with a warning: they stay in memory while in use. */
const LARGE_FILE_BYTES = 500 * 1024 * 1024;

function isUrl(src: string): boolean {
  return /^(https?|blob|data):/.test(src);
}

/**
 * Read a media file into a Blob. Project assets and absolute paths go through
 * plugin-fs, because a filesystem path is not a URL the webview can load;
 * http(s), blob and data URLs are fetched.
 */
export async function loadMediaBlob(src: string, projectDir: string | null): Promise<Blob> {
  if (isUrl(src)) {
    const response = await fetch(src);
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${src}`);
    return response.blob();
  }
  const bytes = await readFile(await resolveAssetPath(src, projectDir));
  if (bytes.byteLength > LARGE_FILE_BYTES) {
    console.warn(`${src} is ${Math.round(bytes.byteLength / 1048576)} MB and is held in memory while in use`);
  }
  return new Blob([bytes]);
}

/** Media read for one project folder, one read per source; concurrent requests share it. */
export class MediaBlobCache {
  private blobs = new Map<string, Promise<Blob>>();

  constructor(private readonly projectDir: string | null) {}

  get(src: string): Promise<Blob> {
    let blob = this.blobs.get(src);
    if (!blob) {
      const loading = loadMediaBlob(src, this.projectDir);
      // A failed read isn't kept, so a fixed file can be tried again.
      loading.catch(() => {
        if (this.blobs.get(src) === loading) this.blobs.delete(src);
      });
      this.blobs.set(src, loading);
      blob = loading;
    }
    return blob;
  }

  clear(): void {
    this.blobs.clear();
  }
}
