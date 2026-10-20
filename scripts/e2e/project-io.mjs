// Saving a project and importing an asset write files through plugin-fs.
// This checks both in the real app by looking at the files on disk: Save
// swallows a failed asset copy with a console warning, so a resolved
// promise alone proves nothing.
import { copyFileSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { MEDIA, ensureMedia, imageLayer, report, runApp, scene, workDir, writeProject } from './lib.mjs';

ensureMedia('poster.png');
const dir = workDir('project-io');
const outside = join(dir, 'outside.png'); // a file the user picked from elsewhere
copyFileSync(join(MEDIA, 'poster.png'), outside);
const project = writeProject(dir, 'p', { width: 64, height: 64, scenes: [
  scene('s', 3, [imageLayer('img', outside, { endFrame: 3 })]),
] });

// Beside the e2e folder, so outside every scope the app was granted.
const outsideScope = join(dir, '..', 'project-io-outside-scope.txt');
rmSync(outsideScope, { force: true });

const [res] = await runApp(dir, [{ kind: 'save', project, importFrom: outside, outsideScope }]);
const data = res?.data ?? {};
const saved = JSON.parse(readFileSync(join(project, 'project.json'), 'utf8')).composition;
const src = saved.scenes[0].layers[0].src;
const assets = readdirSync(join(project, 'assets'));

report([
  { id: 'job ran', ok: !!res?.ok, detail: res?.error ?? '' },
  {
    id: 'asset import copies the file into assets/', detail: data.importError ?? data.imported,
    ok: !data.importError && !!data.imported && existsSync(join(project, data.imported)),
  },
  { id: 'Save writes project.json', ok: !data.saveError && saved.name === 'saved by e2e', detail: data.saveError ?? saved.name },
  {
    id: 'Save bundles the outside image', detail: `${src}; assets/: ${assets.join(', ')}`,
    ok: src.startsWith('assets/') && existsSync(join(project, src)),
  },
  {
    id: 'writes outside the granted folders are still refused', detail: data.outsideError ?? 'write succeeded',
    ok: !!data.outsideError && !existsSync(outsideScope),
  },
]);
