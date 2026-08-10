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
    // Try fetching as a URL (works for Tauri asset:// protocol and blob URLs)
    const response = await fetch(src);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    cache.set(src, bitmap);
  } catch {
    // Fallback: try loading via Image element
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      img.src = src;
    });
    const bitmap = await createImageBitmap(img);
    cache.set(src, bitmap);
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
