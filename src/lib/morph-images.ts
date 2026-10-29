/**
 * A morph's two images, decoded the way the renderer decodes them. The morph
 * editor and command-line auto-match both load them here.
 */
import { createMediaCache, loadImage } from '../renderer/media-cache';
import { resolveAssetPath } from './asset-manager';

export async function loadMorphImages(
  src: string,
  target: string,
  projectDir: string | null,
): Promise<{ a: ImageBitmap | undefined; b: ImageBitmap | undefined }> {
  const cache = createMediaCache();
  await Promise.all([src, target].filter(Boolean).map(async (s) => loadImage(cache, s, await resolveAssetPath(s, projectDir))));
  return { a: cache.get(src), b: cache.get(target) };
}
