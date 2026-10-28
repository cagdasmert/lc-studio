/**
 * `check` on the command line: what lc-studio itself finds wrong with a
 * project, measured by the app rather than guessed
 * (docs/superpowers/specs/2026-10-28-headless-cli-design.md §6). It writes nothing.
 */
import { exists } from '@tauri-apps/plugin-fs';
import type { Composition, Layer, TextLayerData } from '../../types';
import { createFrameRenderer } from '../../renderer/capture';
import { resolveLayerAt } from '../../renderer/draw';
import { drawnLineWidth, layoutText } from '../../renderer/draw-text';
import { glAvailable } from '../../renderer/gl/context';
import { assetRefs } from '../asset-refs';
import { resolveAssetPath } from '../asset-manager';
import { gpuFeatureUses, gpuWarning } from '../gpu-features';
import { keyFramesFor } from '../key-frames';
import { checkFfmpeg } from '../tauri-bridge';
import { countUndecodableVideoLayers, undecodableWarning } from '../video-support';
import { useStore } from '../../store';
import type { Issue } from './issues';

type Where = Pick<Issue, 'scene' | 'sceneLabel' | 'layerId' | 'layerName'>;

const where = (composition: Composition, sceneIndex: number, layer?: Layer): Where => ({
  scene: sceneIndex,
  sceneLabel: composition.scenes[sceneIndex].label,
  ...(layer ? { layerId: layer.id, layerName: layer.name } : {}),
});
const named = (w: Where) => `scene ${(w.scene ?? 0) + 1} (${w.sceneLabel})${w.layerName ? ` › ${w.layerName}` : ''}`;
const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

const positive = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0;

/**
 * Whether the composition has the shape everything else assumes. Shorthand
 * values (such as `"output": "tiktok"`) load fine and crash later.
 */
export function shapeProblems(composition: unknown): string[] {
  const c = composition as Partial<Composition> | null;
  if (!c || typeof c !== 'object') return ['the composition is not an object'];
  const problems: string[] = [];
  const o = c.output as unknown as Record<string, unknown> | undefined;
  if (!o || typeof o !== 'object' || !positive(o.width) || !positive(o.height) || !positive(o.fps)) {
    problems.push(`output must be an object with a width, height and fps above 0, not ${JSON.stringify(c.output)}`);
  }
  if (!Array.isArray(c.scenes)) return [...problems, 'scenes must be a list'];
  c.scenes.forEach((s, i) => {
    if (!s || typeof s !== 'object') return void problems.push(`scene ${i + 1} is not an object`);
    if (!Number.isInteger(s.durationFrames) || s.durationFrames <= 0) problems.push(`scene ${i + 1}: durationFrames must be a whole number above 0, not ${JSON.stringify(s.durationFrames)}`);
    if (!Array.isArray(s.layers)) return void problems.push(`scene ${i + 1}: layers must be a list`);
    s.layers.forEach((l, j) => {
      if (!l || typeof l !== 'object' || typeof l.type !== 'string') problems.push(`scene ${i + 1}, layer ${j + 1}: not a layer (no type)`);
      else if (!l.keyframes || typeof l.keyframes !== 'object') problems.push(`scene ${i + 1}, layer ${j + 1} (${l.name}): keyframes must be an object`);
    });
  });
  return problems;
}

/** Every media file the project points at that isn't there, or that the app may not read. */
async function missingMedia(composition: Composition, projectDir: string): Promise<Issue[]> {
  const issues: Issue[] = [];
  const checked = new Map<string, string | null>();
  const probe = async (src: string): Promise<string | null> => {
    if (!checked.has(src)) {
      let problem: string | null = null;
      try {
        if (!(await exists(await resolveAssetPath(src, projectDir)))) problem = 'not found';
      } catch {
        problem = 'outside the project folder, where lc-studio may not read it (bundle it into assets/)';
      }
      checked.set(src, problem);
    }
    return checked.get(src)!;
  };
  for (const [i, scene] of composition.scenes.entries()) {
    const sources: [string, Layer | undefined][] = [];
    if (scene.backgroundType === 'image' && scene.backgroundImage) sources.push([scene.backgroundImage, undefined]);
    for (const layer of scene.layers) for (const ref of assetRefs(layer)) sources.push([ref.get(), layer]);
    for (const [src, layer] of sources) {
      if (!src || /^(https?|blob|data):/.test(src)) continue;
      const problem = await probe(src);
      if (!problem) continue;
      const w = where(composition, i, layer);
      issues.push({ severity: 'error', code: 'media-missing', message: `${named(w)}${layer ? '' : ' background'}: ${src} is ${problem}`, ...w });
    }
  }
  return issues;
}

const GENERIC_FONTS = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded']);

/**
 * Font families text layers use that the canvas can't draw: not bundled or
 * installed (it falls back silently), or not a name it accepts unquoted
 * (it keeps the previous font). Run after the project's fonts are registered.
 */
function fontProblems(composition: Composition, ctx: CanvasRenderingContext2D): Issue[] {
  const users = new Map<string, Where[]>();
  composition.scenes.forEach((scene, i) => {
    for (const layer of scene.layers) {
      if (layer.type === 'text' && typeof layer.fontFamily === 'string' && !GENERIC_FONTS.has(layer.fontFamily.trim().toLowerCase())) {
        users.set(layer.fontFamily, [...(users.get(layer.fontFamily) ?? []), where(composition, i, layer)]);
      }
    }
  });
  const width = (font: string) => {
    ctx.font = font;
    return ctx.measureText('mmmmmmmmmlli1WQ@#').width;
  };
  const issues: Issue[] = [];
  for (const [family, layers] of users) {
    ctx.font = '10px serif';
    const before = ctx.font;
    ctx.font = `64px ${family}`;
    const invalid = ctx.font === before;
    const missing = !invalid && width(`64px ${family}, monospace`) === width('64px monospace') && width(`64px ${family}, serif`) === width('64px serif');
    if (!invalid && !missing) continue;
    const list = layers.map(named).join('; ');
    issues.push({
      severity: 'warn', code: 'font-missing', ...layers[0],
      message: invalid
        ? `"${family}" isn't a font name the canvas accepts as written, so its text keeps whatever font was set before (${list})`
        : `"${family}" isn't bundled in assets/fonts/ or installed, so its text draws in a fallback font (${list})`,
    });
  }
  return issues;
}

const LAYOUT_TRACKS = ['fontSize', 'letterSpacing', 'lineHeight', 'width', 'height'];

/** Text layers whose text doesn't fit their box, measured with the renderer's own layout. */
function textOverflow(composition: Composition, ctx: CanvasRenderingContext2D): Issue[] {
  const issues: Issue[] = [];
  let sceneStart = 0;
  for (const [i, scene] of composition.scenes.entries()) {
    for (const layer of scene.layers) {
      if (layer.type !== 'text' || !layer.visible) continue;
      try {
        const overflow = layerOverflow(composition, i, sceneStart, layer as TextLayerData, ctx);
        if (overflow) issues.push(overflow);
      } catch (err) {
        // A layer the renderer can't lay out (say, content that isn't text) fails to draw too: say so here, once.
        const w = where(composition, i, layer);
        issues.push({ severity: 'error', code: 'draw', ...w, message: `${named(w)}: its text can't be laid out: ${message(err)}` });
      }
    }
    sceneStart += scene.durationFrames;
  }
  return issues;
}

/** The first frame at which a text layer's text doesn't fit its box, as an issue. */
function layerOverflow(composition: Composition, i: number, sceneStart: number, layer: TextLayerData, ctx: CanvasRenderingContext2D): Issue | null {
  const last = Math.max(0, layer.endFrame - layer.startFrame - 1);
  const frames = new Set([0]);
  for (const key of LAYOUT_TRACKS) {
    for (const k of layer.keyframes[key]?.keyframes ?? []) frames.add(Math.min(last, Math.max(0, k.frame)));
  }
  for (const f of [...frames].sort((a, b) => a - b)) {
    const box = resolveLayerAt(layer, f);
    const layout = layoutText(ctx, layer, box, f);
    const widths = layout.lines.map((line) => drawnLineWidth(ctx, line, layout.letterSpacing, layout.perChar));
    const widest = Math.max(0, ...widths);
    if (widest <= box.width + 1 && layout.height <= box.height + 1) continue;
    const line = layout.lines[widths.indexOf(widest)] ?? '';
    const w = where(composition, i, layer);
    const parts = [];
    if (widest > box.width + 1) parts.push(`its widest line is ${Math.ceil(widest)} px ("${line}")`);
    if (layout.height > box.height + 1) parts.push(`its ${layout.lines.length} lines are ${Math.ceil(layout.height)} px tall`);
    return {
      severity: 'warn', code: 'text-overflow', frame: sceneStart + layer.startFrame + f, ...w,
      message: `${named(w)}: text doesn't fit its ${Math.round(box.width)}×${Math.round(box.height)} box at layer frame ${f}: ${parts.join(', and ')}`,
    };
  }
  return null;
}

/** The Render panel's warnings, with the GPU one as a note when WebGL2 is there. */
async function renderNotes(composition: Composition, projectDir: string): Promise<Issue[]> {
  const issues: Issue[] = [];
  const video = undecodableWarning(await countUndecodableVideoLayers(composition, projectDir));
  if (video) issues.push({ severity: 'warn', code: 'video-undecodable', message: video });
  const uses = gpuFeatureUses(composition);
  if (uses.length && !glAvailable()) issues.push({ severity: 'warn', code: 'gpu-fallback', message: gpuWarning(uses)! });
  else if (uses.length) issues.push({ severity: 'note', code: 'gpu-fallback', message: `Uses WebGL2 (available here); without it these fall back: ${uses.join('; ')}` });
  try {
    await checkFfmpeg();
  } catch {
    issues.push({ severity: 'note', code: 'ffmpeg-missing', message: 'FFmpeg isn\'t on PATH: video exports would fail (PNG sequences and stills work)' });
  }
  return issues;
}

/** Draw each frame with the export renderer; a throw is an error at that frame. */
async function drawFrames(composition: Composition, projectDir: string, frames: number[], progress: (done: number, total: number) => void): Promise<Issue[]> {
  const issues: Issue[] = [];
  let renderer;
  try {
    renderer = await createFrameRenderer(composition, projectDir);
  } catch (err) {
    return [{ severity: 'error', code: 'draw', message: `the renderer couldn't load this project's media: ${message(err)}` }];
  }
  try {
    for (const [i, frame] of frames.entries()) {
      try {
        await renderer.draw(frame);
      } catch (err) {
        const scene = keyFramesFor(composition, [frame])[0];
        issues.push({ severity: 'error', code: 'draw', frame, scene: scene.scene, sceneLabel: scene.sceneLabel, message: `frame ${frame} (scene ${scene.scene + 1}, ${scene.sceneLabel}) doesn't draw: ${message(err)}` });
      }
      progress(i + 1, frames.length);
    }
  } finally {
    renderer.dispose();
  }
  return issues;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Open the project in the editor as Open does (autosave is off for command-line
 * runs) and see whether it survives: with no error boundary, a render error
 * unmounts the whole UI, which is the "black window" a bad project gives.
 */
async function editorCrash(composition: Composition, projectDir: string, trap: { current: ((msg: string) => void) | null }): Promise<Issue | null> {
  const errors: string[] = [];
  trap.current = (msg) => errors.push(msg);
  const workspace = () => document.querySelector('.canvas-workspace canvas');
  try {
    const store = useStore.getState();
    store.setProjectPath(projectDir);
    store.setComposition(composition);
    store.selectLayer(null);
    store.setCurrentFrame(0);
    for (let waited = 0; waited < 5000 && !workspace() && !errors.length; waited += 100) await sleep(100);
    await sleep(1000); // let effects run, and errors surface
  } finally {
    trap.current = null;
  }
  if (!errors.length && workspace()) return null;
  return {
    severity: 'error', code: 'editor',
    message: `lc-studio's editor crashes on this project${errors.length ? `: ${errors[0]}` : ' (its workspace never appeared)'}`,
  };
}

export async function runCheck(
  load: () => Promise<{ path: string; composition: Composition }>,
  frames: 'auto' | 'all' | number[],
  progress: (done: number, total: number) => void,
  trap: { current: ((msg: string) => void) | null },
  onLoaded: (composition: Composition) => void,
): Promise<{ issues: Issue[]; drawn: number[] }> {
  let opened;
  try {
    opened = await load();
  } catch (err) {
    return { issues: [{ severity: 'error', code: 'load', message: message(err) }], drawn: [] };
  }
  const { path, composition } = opened;
  const shape = shapeProblems(composition);
  if (shape.length) return { issues: shape.map((m) => ({ severity: 'error', code: 'load', message: m })), drawn: [] };
  onLoaded(composition);

  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  const picks = keyFramesFor(composition, frames).map((k) => k.frame);
  const issues = [
    ...(await missingMedia(composition, path)),
    ...fontProblems(composition, ctx),
    ...textOverflow(composition, ctx),
    ...(await renderNotes(composition, path)),
    ...(await drawFrames(composition, path, picks, progress)),
  ];
  const editor = await editorCrash(composition, path, trap);
  if (editor) issues.push(editor);
  return { issues, drawn: picks };
}
