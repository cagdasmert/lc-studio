import type { Scene, Layer } from '../types';
import { resolveAssetPath } from '../lib/asset-manager';

export type MediaCache = Map<string, ImageBitmap>;

export function createMediaCache(): MediaCache {
  return new Map();
}

export async function loadImage(
  cache: MediaCache,
  src: string,
  resolvedSrc?: string,
): Promise<void> {
  if (cache.has(src)) return;

  const loadUrl = resolvedSrc ?? src;

  try {
    // Works for blob URLs, data URLs, http URLs, and asset:// URLs
    const response = await fetch(loadUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    cache.set(src, bitmap);
  } catch {
    // Fallback: try loading via Image element (handles more URL schemes)
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error(`Failed to load image: ${loadUrl}`));
        img.src = loadUrl;
      });
      const bitmap = await createImageBitmap(img);
      cache.set(src, bitmap);
    } catch {
      // If it's a local file path, try reading via fs plugin
      try {
        const { readFile } = await import('@tauri-apps/plugin-fs');
        const bytes = await readFile(loadUrl);
        const blob = new Blob([bytes]);
        const bitmap = await createImageBitmap(blob);
        cache.set(src, bitmap);
      } catch {
        console.warn(`Could not load image: ${src}`);
      }
    }
  }
}

function getImageSources(layers: Layer[]): string[] {
  const sources: string[] = [];
  for (const layer of layers) {
    if (layer.type === 'image' && layer.src) {
      sources.push(layer.src);
    }
  }
  return sources;
}

export async function preloadScene(
  cache: MediaCache,
  scene: Scene,
  projectDir?: string | null,
): Promise<void> {
  const sources = getImageSources(scene.layers);
  await Promise.all(
    sources.map(async (src) => {
      if (cache.has(src)) return;
      const resolved = await resolveAssetPath(src, projectDir ?? null);
      await loadImage(cache, src, resolved);
    }),
  );
}

export async function preloadComposition(
  cache: MediaCache,
  scenes: Scene[],
  projectDir?: string | null,
): Promise<void> {
  for (const scene of scenes) {
    await preloadScene(cache, scene, projectDir);
  }
}

export function clearCache(cache: MediaCache): void {
  for (const bitmap of cache.values()) {
    bitmap.close();
  }
  cache.clear();
}
