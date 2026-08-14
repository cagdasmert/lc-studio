import { registerCustomFont } from './font-manager';

const BUNNY_BASE = 'https://fonts.bunny.net';

export interface OnlineFontEntry {
  id: string;       // slug: "open-sans"
  family: string;   // display name: "Open Sans"
  category: string; // "sans-serif" | "serif" | "monospace" | "display" | "handwriting"
  weights: number[];
}

let _catalog: OnlineFontEntry[] | null = null;
const _loadedPreviews = new Set<string>();

export async function fetchFontCatalog(): Promise<OnlineFontEntry[]> {
  if (_catalog) return _catalog;

  const resp = await fetch(`${BUNNY_BASE}/list`);
  if (!resp.ok) throw new Error(`Font catalog unavailable (${resp.status})`);

  const raw = await resp.json() as Record<string, unknown>;

  _catalog = Object.entries(raw)
    .map(([id, info]) => {
      const d = info as { family?: string; category?: string; weights?: number[] };
      return {
        id,
        family: d.family ?? id,
        category: d.category ?? 'sans-serif',
        weights: Array.isArray(d.weights) ? d.weights : [400],
      };
    })
    .sort((a, b) => a.family.localeCompare(b.family));

  return _catalog;
}

/**
 * Inject a <link> stylesheet for a font from the CDN so it can be previewed
 * without downloading. Non-blocking, idempotent.
 */
export function loadFontPreview(id: string): void {
  if (_loadedPreviews.has(id)) return;
  _loadedPreviews.add(id);

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `${BUNNY_BASE}/css?family=${encodeURIComponent(id)}:400&display=swap`;
  document.head.appendChild(link);
}

/**
 * Download the regular (400) weight of a font from Bunny Fonts CDN,
 * save it into the project's assets/fonts/, and register it for immediate use.
 */
export async function downloadFont(
  id: string,
  family: string,
  projectDir: string | null,
): Promise<void> {
  // Fetch the CSS to discover the actual woff2 URL
  const cssResp = await fetch(
    `${BUNNY_BASE}/css?family=${encodeURIComponent(id)}:400&display=swap`,
  );
  if (!cssResp.ok) throw new Error(`Could not fetch font CSS for "${family}"`);

  const css = await cssResp.text();

  // Prefer the latin subset block; fall back to the first woff2 in the file
  const latinMatch = css.match(/\/\* latin \*\/[\s\S]*?url\(([^)'"]+\.woff2)/);
  const anyMatch   = css.match(/url\(([^)'"]+\.woff2)/);
  const fontUrl = latinMatch?.[1] ?? anyMatch?.[1];
  if (!fontUrl) throw new Error(`No woff2 URL found for "${family}"`);

  // Download the binary
  const fontResp = await fetch(fontUrl);
  if (!fontResp.ok) throw new Error(`Font download failed for "${family}" (${fontResp.status})`);

  const bytes = new Uint8Array(await fontResp.arrayBuffer());
  const filename = `${id}-regular.woff2`;

  // Save to project if one is open
  let storedPath = filename;
  if (projectDir) {
    const { mkdir, writeFile } = await import('@tauri-apps/plugin-fs');
    const { join } = await import('@tauri-apps/api/path');
    const fontsDir = await join(projectDir, 'assets', 'fonts');
    await mkdir(fontsDir, { recursive: true });
    await writeFile(await join(fontsDir, filename), bytes);
    storedPath = `assets/fonts/${filename}`;
  }

  // Register in browser via FontFace API
  const blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'font/woff2' }));
  const face = new FontFace(family, `url(${blobUrl})`);
  await face.load();
  document.fonts.add(face);

  // Track in the custom fonts registry so it appears in FontPicker
  registerCustomFont(family, storedPath);
}
