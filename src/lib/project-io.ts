import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import type { Composition } from '../types';

const PROJECT_EXTENSION = 'lcs.json';
const PROJECT_VERSION = 2;

interface ProjectFile {
  version: number;
  savedAt: string;
  composition: Composition;
}

const RECENT_KEY = 'lcs:recentProjects';
const MAX_RECENT = 10;

export async function saveProjectAs(composition: Composition): Promise<string | null> {
  const path = await save({
    title: 'Save project',
    defaultPath: `${composition.name}.${PROJECT_EXTENSION}`,
    filters: [{ name: 'Local Content Studio Project', extensions: [PROJECT_EXTENSION] }],
  });
  if (!path) return null;

  try {
    await writeProjectFile(path, composition);
  } catch (err) {
    throw new Error(`Failed to save project: ${err instanceof Error ? err.message : String(err)}`);
  }
  addToRecent(path, composition.name);
  return path;
}

export async function saveProject(path: string, composition: Composition): Promise<void> {
  try {
    await writeProjectFile(path, composition);
  } catch (err) {
    throw new Error(`Failed to save project: ${err instanceof Error ? err.message : String(err)}`);
  }
  addToRecent(path, composition.name);
}

export async function openProject(): Promise<{ path: string; composition: Composition } | null> {
  const path = await open({
    title: 'Open project',
    multiple: false,
    filters: [{ name: 'Local Content Studio Project', extensions: [PROJECT_EXTENSION] }],
  });
  if (!path) return null;

  const composition = await readProjectFile(path);
  addToRecent(path, composition.name);
  return { path, composition };
}

export async function loadProjectFromPath(path: string): Promise<Composition> {
  const composition = await readProjectFile(path);
  addToRecent(path, composition.name);
  return composition;
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
