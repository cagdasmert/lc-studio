import type { Scene, Layer } from '../types';

export type MediaCache = Map<string, ImageBitmap>;

export function createMediaCache(): MediaCache {
  return new Map();
}

export async function loadImage(
  cache: MediaCache,
  src: string,
): Promise<void> {
  if (cache.has(src)) return;

  try {
    // Works for blob URLs, data URLs, http URLs, and asset:// URLs
    const response = await fetch(src);
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
        img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
        img.src = src;
      });
      const bitmap = await createImageBitmap(img);
      cache.set(src, bitmap);
    } catch {
      // If it's a local file path, try reading via fs plugin
      try {
        const { readFile } = await import('@tauri-apps/plugin-fs');
        const bytes = await readFile(src);
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
): Promise<void> {
  const sources = getImageSources(scene.layers);
  await Promise.all(sources.map((src) => loadImage(cache, src)));
}

export async function preloadComposition(
  cache: MediaCache,
  scenes: Scene[],
): Promise<void> {
  for (const scene of scenes) {
    await preloadScene(cache, scene);
  }
}

export function clearCache(cache: MediaCache): void {
  for (const bitmap of cache.values()) {
    bitmap.close();
  }
  cache.clear();
}
