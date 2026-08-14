import { copyFile, mkdir, exists } from '@tauri-apps/plugin-fs';
import { join, basename } from '@tauri-apps/api/path';
import type { Composition, Layer } from '../types';

const ASSETS_DIR = 'assets';

/** Check if a src is a bundled relative asset path (e.g. "assets/logo.png") */
export function isRelativeAssetPath(src: string): boolean {
  return src.startsWith(ASSETS_DIR + '/');
}

/** Check if a src is a blob URL (ephemeral, not persistable) */
function isBlobUrl(src: string): boolean {
  return src.startsWith('blob:');
}

/** Check if a src is an absolute file path */
function isAbsolutePath(src: string): boolean {
  // Unix absolute path or Windows drive letter
  return src.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(src);
}

/**
 * Resolve a relative asset path to an absolute filesystem path.
 * If src is already absolute or a blob/http URL, returns it unchanged.
 */
export async function resolveAssetPath(
  src: string,
  projectDir: string | null,
): Promise<string> {
  if (!src || !projectDir) return src;
  if (!isRelativeAssetPath(src)) return src;
  return await join(projectDir, src);
}

/**
 * Generate a unique filename in the assets directory.
 * If "logo.png" exists, tries "logo_1.png", "logo_2.png", etc.
 */
async function uniqueAssetName(
  projectDir: string,
  fileName: string,
): Promise<string> {
  const assetsDir = await join(projectDir, ASSETS_DIR);
  const dotIdx = fileName.lastIndexOf('.');
  const name = dotIdx > 0 ? fileName.slice(0, dotIdx) : fileName;
  const ext = dotIdx > 0 ? fileName.slice(dotIdx) : '';

  let candidate = fileName;
  let counter = 0;
  while (await exists(await join(assetsDir, candidate))) {
    counter++;
    candidate = `${name}_${counter}${ext}`;
  }
  return candidate;
}

/**
 * Copy a file into {projectDir}/assets/ with deduplication.
 * Returns the relative path (e.g. "assets/logo.png").
 */
export async function copyAssetToProject(
  sourcePath: string,
  projectDir: string,
): Promise<string> {
  const assetsDir = await join(projectDir, ASSETS_DIR);

  // Ensure assets directory exists
  try {
    await mkdir(assetsDir, { recursive: true });
  } catch {
    // may already exist
  }

  const originalName = await basename(sourcePath);
  const finalName = await uniqueAssetName(projectDir, originalName);
  const destPath = await join(assetsDir, finalName);

  await copyFile(sourcePath, destPath);

  return `${ASSETS_DIR}/${finalName}`;
}

/** Create the .lcs/ project directory and assets/ subdirectory. */
export async function ensureProjectDir(projectDir: string): Promise<void> {
  await mkdir(await join(projectDir, ASSETS_DIR), { recursive: true });
}

/**
 * Deep-clone a composition and apply a rewrite function to every layer src field.
 */
export function rewriteAssetPaths(
  composition: Composition,
  fn: (src: string) => string,
): Composition {
  const clone: Composition = JSON.parse(JSON.stringify(composition));
  for (const scene of clone.scenes) {
    if (scene.backgroundImage) {
      scene.backgroundImage = fn(scene.backgroundImage);
    }
    for (const layer of scene.layers) {
      if (hasAssetSrc(layer)) {
        (layer as { src: string }).src = fn((layer as { src: string }).src);
      }
    }
  }
  return clone;
}

function hasAssetSrc(layer: Layer): boolean {
  return layer.type === 'image' || layer.type === 'video' || layer.type === 'audio';
}

/**
 * Scan composition for absolute/blob paths, copy them into project assets,
 * and return a composition with all paths rewritten to relative.
 * Skips already-relative paths. Warns about unrecoverable blob URLs.
 */
async function bundleAssetSrc(
  src: string,
  label: string,
  projectDir: string,
): Promise<string> {
  if (!src || isRelativeAssetPath(src)) return src;
  if (isBlobUrl(src)) {
    console.warn(`Cannot bundle blob URL for "${label}". Re-import this asset.`);
    return src;
  }
  if (isAbsolutePath(src)) {
    try {
      return await copyAssetToProject(src, projectDir);
    } catch (err) {
      console.warn(`Failed to bundle asset "${src}" for "${label}": ${err}`);
    }
  }
  return src;
}

export async function bundleAssets(
  composition: Composition,
  projectDir: string,
): Promise<Composition> {
  const clone: Composition = JSON.parse(JSON.stringify(composition));

  for (const scene of clone.scenes) {
    // Bundle scene background image
    if (scene.backgroundType === 'image' && scene.backgroundImage) {
      scene.backgroundImage = await bundleAssetSrc(
        scene.backgroundImage, `scene "${scene.label}" background`, projectDir,
      );
    }

    for (const layer of scene.layers) {
      if (!hasAssetSrc(layer)) continue;
      (layer as { src: string }).src = await bundleAssetSrc(
        (layer as { src: string }).src, `layer "${layer.name}"`, projectDir,
      );
    }
  }

  return clone;
}
