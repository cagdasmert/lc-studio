import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile, exists } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import type { Composition } from '../types';
import { ensureProjectDir, bundleAssets } from './asset-manager';
import { loadProjectFonts } from './font-manager';

const PROJECT_JSON_FILENAME = 'project.json';
const PROJECT_VERSION = 3;

interface ProjectFile {
  version: number;
  savedAt: string;
  composition: Composition;
}

const RECENT_KEY = 'lcs:recentProjects';
const MAX_RECENT = 10;

/** Detect whether a path is a v3 project directory (ends with .lcs but not .lcs.json) */
function isV3ProjectDir(path: string): boolean {
  return path.endsWith('.lcs') && !path.endsWith('.lcs.json');
}

interface SaveResult {
  path: string;
  composition: Composition;
}

export async function saveProjectAs(composition: Composition): Promise<SaveResult | null> {
  const path = await save({
    title: 'Save project',
    defaultPath: `${composition.name}.lcs`,
    filters: [{ name: 'LCS Project', extensions: ['lcs'] }],
  });
  if (!path) return null;

  // Ensure path ends with .lcs
  const projectDir = path.endsWith('.lcs') ? path : `${path}.lcs`;

  await ensureProjectDir(projectDir);
  const bundled = await bundleAssets(composition, projectDir);
  const jsonPath = await join(projectDir, PROJECT_JSON_FILENAME);

  try {
    await writeProjectFile(jsonPath, bundled);
  } catch (err) {
    throw new Error(`Failed to save project: ${err instanceof Error ? err.message : String(err)}`);
  }

  addToRecent(projectDir, bundled.name);
  return { path: projectDir, composition: bundled };
}

export async function saveProject(
  path: string,
  composition: Composition,
): Promise<SaveResult> {
  if (isV3ProjectDir(path)) {
    // v3 directory format — bundle any new assets, write project.json
    const bundled = await bundleAssets(composition, path);
    const jsonPath = await join(path, PROJECT_JSON_FILENAME);
    try {
      await writeProjectFile(jsonPath, bundled);
    } catch (err) {
      throw new Error(`Failed to save project: ${err instanceof Error ? err.message : String(err)}`);
    }
    addToRecent(path, bundled.name);
    return { path, composition: bundled };
  }

  // v2 legacy .lcs.json — save as flat file (no bundling)
  try {
    await writeProjectFile(path, composition);
  } catch (err) {
    throw new Error(`Failed to save project: ${err instanceof Error ? err.message : String(err)}`);
  }
  addToRecent(path, composition.name);
  return { path, composition };
}

export async function openProject(): Promise<{ path: string; composition: Composition } | null> {
  // Allow selecting either .lcs.json files or project.json inside .lcs/ directories
  const path = await open({
    title: 'Open project',
    multiple: false,
    filters: [
      { name: 'LCS Project', extensions: ['lcs.json', 'json'] },
    ],
  });
  if (!path) return null;

  const result = await loadProjectFromPath(path);
  return result;
}

export async function openProjectFolder(): Promise<{ path: string; composition: Composition } | null> {
  const dir = await open({
    title: 'Open project folder',
    directory: true,
  });
  if (!dir) return null;
  const dirPath = Array.isArray(dir) ? dir[0] : dir;
  if (!dirPath) return null;

  return loadProjectFromPath(dirPath);
}

export async function loadProjectFromPath(
  path: string,
): Promise<{ path: string; composition: Composition }> {
  let jsonPath: string;
  let projectDir: string;

  if (isV3ProjectDir(path)) {
    // Path is a .lcs/ directory
    projectDir = path;
    jsonPath = await join(path, PROJECT_JSON_FILENAME);
  } else if (path.endsWith(PROJECT_JSON_FILENAME)) {
    // User selected project.json directly — derive directory
    projectDir = path.slice(0, -(`/${PROJECT_JSON_FILENAME}`.length));
    jsonPath = path;
  } else {
    // Legacy .lcs.json file
    projectDir = path;
    jsonPath = path;
  }

  // Check if the path is actually a v3 directory (has project.json inside)
  if (!path.endsWith('.json')) {
    const hasProjectJson = await exists(await join(path, PROJECT_JSON_FILENAME));
    if (hasProjectJson) {
      projectDir = path;
      jsonPath = await join(path, PROJECT_JSON_FILENAME);
    }
  }

  const composition = await readProjectFile(jsonPath);
  addToRecent(projectDir, composition.name);
  // Non-blocking: register any fonts stored in assets/fonts/
  if (isV3ProjectDir(projectDir)) {
    loadProjectFonts(projectDir).catch(() => {});
  }
  return { path: projectDir, composition };
}

async function writeProjectFile(path: string, composition: Composition): Promise<void> {
  const file: ProjectFile = {
    version: PROJECT_VERSION,
    savedAt: new Date().toISOString(),
    composition,
  };
  await writeTextFile(path, JSON.stringify(file, null, 2));
}

async function readProjectFile(path: string): Promise<Composition> {
  const text = await readTextFile(path);

  let file: ProjectFile;
  try {
    file = JSON.parse(text) as ProjectFile;
  } catch {
    throw new Error('Invalid project file: corrupted or malformed JSON');
  }

  if (!file.composition || !file.composition.scenes) {
    throw new Error('Invalid project file: missing composition data');
  }

  if (file.version === 2) {
    console.warn(
      'Opening v2 project. Image assets using blob URLs will need to be re-imported.',
    );
  }

  return file.composition;
}

// ── Recent projects (localStorage) ────────────────────

export interface RecentProject {
  path: string;
  name: string;
  openedAt: string;
}

export function getRecentProjects(): RecentProject[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentProject[];
  } catch {
    return [];
  }
}

function addToRecent(path: string, name: string): void {
  const recents = getRecentProjects().filter((r) => r.path !== path);
  recents.unshift({ path, name, openedAt: new Date().toISOString() });
  if (recents.length > MAX_RECENT) recents.length = MAX_RECENT;
  localStorage.setItem(RECENT_KEY, JSON.stringify(recents));
}

export function removeFromRecent(path: string): void {
  const recents = getRecentProjects().filter((r) => r.path !== path);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recents));
}
