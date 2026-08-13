import type { Scene, VideoLayerData } from '../types';
import { resolveAssetPath } from '../lib/asset-manager';

/**
 * Manages HTMLVideoElement instances for video layers.
 * Each video source gets one shared element.
 */
export class VideoCache {
  private videos = new Map<string, HTMLVideoElement>();
  private loading = new Map<string, Promise<void>>();

  async load(src: string, projectDir?: string | null): Promise<HTMLVideoElement> {
    const existing = this.videos.get(src);
    if (existing) return existing;

    // Deduplicate concurrent loads
    let pending = this.loading.get(src);
    if (!pending) {
      pending = this._doLoad(src, projectDir);
      this.loading.set(src, pending);
    }
    await pending;
    return this.videos.get(src)!;
  }

  private async _doLoad(src: string, projectDir?: string | null): Promise<void> {
    const resolved = await resolveAssetPath(src, projectDir ?? null);

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.muted = true; // Required for programmatic play
    video.playsInline = true;
    video.src = resolved;

    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error(`Failed to load video: ${src}`));
    });

    this.videos.set(src, video);
    this.loading.delete(src);
  }

  get(src: string): HTMLVideoElement | undefined {
    return this.videos.get(src);
  }

  /**
   * Seek a video to an exact time and wait for the frame to be ready.
   */
  async seekTo(src: string, timeSecs: number): Promise<HTMLVideoElement | null> {
    const video = this.videos.get(src);
    if (!video) return null;

    // Only seek if we're not already at this time (within a frame's precision)
    if (Math.abs(video.currentTime - timeSecs) > 0.01) {
      video.currentTime = timeSecs;
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
      });
    }

    return video;
  }

  async preloadScene(scene: Scene, projectDir?: string | null): Promise<void> {
    const videoLayers = scene.layers.filter(
      (l): l is VideoLayerData => l.type === 'video' && l.visible,
    );
    await Promise.all(videoLayers.map((l) => this.load(l.src, projectDir)));
  }

  clear(): void {
    for (const video of this.videos.values()) {
      video.pause();
      video.removeAttribute('src');
      video.load(); // Release resources
    }
    this.videos.clear();
    this.loading.clear();
  }
}
