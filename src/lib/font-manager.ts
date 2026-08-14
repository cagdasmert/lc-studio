import { open } from '@tauri-apps/plugin-dialog';
import { readFile, exists } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';

// Curated fallback for when Local Font Access API is unavailable
const FALLBACK_FONTS = [
  '-apple-system', 'Arial', 'Arial Black', 'Arial Narrow', 'BlinkMacSystemFont',
  'Bookman', 'Comic Sans MS', 'Courier New', 'Garamond', 'Georgia',
  'Helvetica', 'Helvetica Neue', 'Impact', 'Lucida Console',
  'Palatino', 'Roboto', 'Segoe UI', 'Tahoma', 'Times New Roman',
  'Trebuchet MS', 'Verdana', 'cursive', 'monospace', 'sans-serif', 'serif',
].sort((a, b) => a.localeCompare(b));

let _systemFontsCache: string[] | null = null;
const _customFonts = new Map<string, string>(); // family → filePath

export interface CustomFont {
  family: string;
  filePath: string; // relative path within project, or absolute for unsaved
}

/** Load installed system fonts via Local Font Access API, falling back to a curated list. */
export async function loadSystemFonts(): Promise<string[]> {
  if (_systemFontsCache) return _systemFontsCache;

  if ('queryLocalFonts' in window) {
    try {
      type FontData = { family: string };
      const fonts = await (window as unknown as { queryLocalFonts: () => Promise<FontData[]> }).queryLocalFonts();
      const families = [...new Set(fonts.map((f) => f.family))].sort((a, b) =>
        a.localeCompare(b),
      );
      _systemFontsCache = families;
      return families;
    } catch {
      // Permission denied or API unavailable — fall through to curated list
    }
  }

  _systemFontsCache = FALLBACK_FONTS;
  return _systemFontsCache;
}

export function getCustomFonts(): CustomFont[] {
  return Array.from(_customFonts.entries()).map(([family, filePath]) => ({ family, filePath }));
}

/** Open a file dialog to pick a font, copy it into the project, and register it. */
export async function importFontFile(projectDir: string | null): Promise<CustomFont | null> {
  const selected = await open({
    title: 'Import Font',
    filters: [{ name: 'Font Files', extensions: ['ttf', 'otf', 'woff', 'woff2'] }],
    multiple: false,
  });
  if (!selected) return null;

  const absPath = Array.isArray(selected) ? selected[0] : selected;
  if (!absPath) return null;

  const filename = absPath.split(/[/\\]/).pop() ?? 'font';
  const family = filename.replace(/\.(ttf|otf|woff2?)$/i, '').replace(/[-_]/g, ' ').trim();

  await registerFontFromAbsPath(family, absPath);

  let storedPath = absPath;
  if (projectDir) {
    const { mkdir, copyFile } = await import('@tauri-apps/plugin-fs');
    const fontsDir = await join(projectDir, 'assets', 'fonts');
    await mkdir(fontsDir, { recursive: true });
    const destPath = await join(fontsDir, filename);
    await copyFile(absPath, destPath);
    storedPath = `assets/fonts/${filename}`;
  }

  _customFonts.set(family, storedPath);
  return { family, filePath: storedPath };
}

/** Scan a project's assets/fonts/ directory and register all found fonts. Called on project open. */
export async function loadProjectFonts(projectDir: string): Promise<void> {
  const { readDir } = await import('@tauri-apps/plugin-fs');
  const fontsDir = await join(projectDir, 'assets', 'fonts');

  const hasFontsDir = await exists(fontsDir);
  if (!hasFontsDir) return;

  try {
    const entries = await readDir(fontsDir);
    await Promise.allSettled(
      entries
        .filter((e) => e.name && /\.(ttf|otf|woff2?)$/i.test(e.name))
        .map(async (e) => {
          const absPath = await join(fontsDir, e.name!);
          const family = e.name!.replace(/\.(ttf|otf|woff2?)$/i, '').replace(/[-_]/g, ' ').trim();
          await registerFontFromAbsPath(family, absPath);
          _customFonts.set(family, `assets/fonts/${e.name!}`);
        }),
    );
  } catch {
    // Non-critical — fonts just won't be available
  }
}

async function registerFontFromAbsPath(family: string, absolutePath: string): Promise<void> {
  const bytes = await readFile(absolutePath);
  const blob = new Blob([bytes]);
  const url = URL.createObjectURL(blob);
  const face = new FontFace(family, `url(${url})`);
  await face.load();
  document.fonts.add(face);
}
