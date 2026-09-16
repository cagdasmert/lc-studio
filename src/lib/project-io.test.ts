import { describe, expect, it, vi, beforeEach } from 'vitest';

// Order of Tauri calls, so we can assert scope is granted before any read.
const calls: string[] = [];

const invoke = vi.fn((command: string, args?: Record<string, unknown>) => {
  calls.push(`invoke:${command}:${String(args?.path)}`);
  return Promise.resolve(String(args?.path));
});

const project = JSON.stringify({
  version: 3,
  savedAt: '2026-01-01T00:00:00.000Z',
  composition: {
    id: 'c', name: 'Launch', output: { id: 'tiktok', label: 'TikTok', width: 1080, height: 1920, fps: 30 },
    scenes: [],
  },
});

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (command: string, args?: Record<string, unknown>) => invoke(command, args),
}));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));
vi.mock('@tauri-apps/api/path', () => ({
  join: (...parts: string[]) => Promise.resolve(parts.join('/')),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: (p: string) => { calls.push(`read:${p}`); return Promise.resolve(project); },
  writeTextFile: (p: string) => { calls.push(`write:${p}`); return Promise.resolve(); },
  exists: (p: string) => Promise.resolve(p.endsWith('.lcs/project.json')),
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  save: vi.fn(() => Promise.resolve('/Users/me/Documents/Launch.lcs')),
}));
vi.mock('./asset-manager', () => ({
  ensureProjectDir: (p: string) => { calls.push(`mkdir:${p}`); return Promise.resolve(); },
  bundleAssets: (c: unknown) => Promise.resolve(c),
}));
vi.mock('./font-manager', () => ({ loadProjectFonts: () => Promise.resolve() }));

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
});

const { loadProjectFromPath, saveProjectAs } = await import('./project-io');

describe('project folder file access', () => {
  beforeEach(() => {
    calls.length = 0;
    invoke.mockClear();
  });

  it('grants the .lcs folder before reading project.json when a folder is opened', async () => {
    await loadProjectFromPath('/Users/me/Documents/Launch.lcs');
    const grant = calls.indexOf('invoke:allow_project_dir:/Users/me/Documents/Launch.lcs');
    const read = calls.indexOf('read:/Users/me/Documents/Launch.lcs/project.json');
    expect(grant).toBeGreaterThanOrEqual(0);
    expect(read).toBeGreaterThan(grant);
  });

  it('grants the enclosing folder when project.json itself is opened', async () => {
    await loadProjectFromPath('/Users/me/Documents/Launch.lcs/project.json');
    expect(calls).toContain('invoke:allow_project_dir:/Users/me/Documents/Launch.lcs');
  });

  it('does not ask for folder access for a legacy flat .lcs.json file', async () => {
    await loadProjectFromPath('/Users/me/Documents/old.lcs.json');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('grants a new project folder before creating it on Save As', async () => {
    await saveProjectAs({ id: 'c', name: 'Launch', scenes: [], output: { id: 'tiktok', label: 'TikTok', width: 1080, height: 1920, fps: 30 } });
    const grant = calls.indexOf('invoke:allow_project_dir:/Users/me/Documents/Launch.lcs');
    const mkdir = calls.indexOf('mkdir:/Users/me/Documents/Launch.lcs');
    expect(grant).toBeGreaterThanOrEqual(0);
    expect(mkdir).toBeGreaterThan(grant);
  });
});
