/**
 * `stills` on the command line: chosen frames as PNGs plus one labelled
 * contact sheet, so an agent can look at a whole video in one image
 * (docs/superpowers/specs/2026-10-28-headless-cli-design.md, R1.1). Frames
 * are drawn by the export renderer, and at scale 1 their files are
 * byte-identical to a PNG-sequence export's.
 */
import { writeFile } from '@tauri-apps/plugin-fs';
import type { Composition } from '../../types';
import { createFrameRenderer, encodePng, framePngName } from '../../renderer/capture';
import { getTotalFrames } from '../../renderer/compositor';
import { keyFramesFor, type KeyFrame } from '../key-frames';

export interface StillsOptions {
  out: string;
  frames: 'auto' | 'all' | number[];
  scale: number;
  sheetScale: number;
}

export interface Still extends KeyFrame {
  file: string;
}

/** Beyond this many frames there's no sheet (it would pass WebKit's canvas size limit); the files are still written. */
export const SHEET_MAX_FRAMES = 60;
const GUTTER = 8;
const STRIP = 40;
const SHEET_BG = '#0e0e10';
const STRIP_BG = '#24242b';

/** `source` scaled by `scale`; the source itself at 1, so its bytes match an export's. */
function scaled(source: HTMLCanvasElement, scale: number): HTMLCanvasElement {
  if (scale === 1) return source;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** `text`, cut with an ellipsis to fit `width` in the context's font. */
function fit(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);
  return `${cut}…`;
}

export async function renderStills(
  composition: Composition,
  projectDir: string | null,
  opts: StillsOptions,
  onProgress: (done: number, total: number) => void,
): Promise<{ sheet: string | null; frames: Still[] }> {
  const picks = keyFramesFor(composition, opts.frames);
  const total = getTotalFrames(composition);
  const { width, height, fps } = composition.output;

  // Up to 4 columns for portrait output, 3 for landscape; a strip under each frame.
  const thumbW = Math.max(1, Math.round(width * opts.sheetScale));
  const thumbH = Math.max(1, Math.round(height * opts.sheetScale));
  const cols = Math.max(1, Math.min(picks.length, height >= width ? 4 : 3));
  const rows = Math.ceil(picks.length / cols);
  let sheet: CanvasRenderingContext2D | null = null;
  if (picks.length && picks.length <= SHEET_MAX_FRAMES) {
    const canvas = document.createElement('canvas');
    canvas.width = cols * thumbW + (cols + 1) * GUTTER;
    canvas.height = rows * (thumbH + STRIP) + (rows + 1) * GUTTER;
    sheet = canvas.getContext('2d');
    if (!sheet) throw new Error('2D canvas unavailable');
    sheet.fillStyle = SHEET_BG;
    sheet.fillRect(0, 0, canvas.width, canvas.height);
    sheet.imageSmoothingQuality = 'high';
  }

  const frames: Still[] = [];
  const renderer = await createFrameRenderer(composition, projectDir);
  try {
    for (const [i, pick] of picks.entries()) {
      await renderer.draw(pick.frame);
      const file = `${opts.out}/${framePngName(pick.frame, total)}`;
      await writeFile(file, await encodePng(scaled(renderer.canvas, opts.scale)));
      frames.push({ ...pick, file });

      if (sheet) {
        const x = GUTTER + (i % cols) * (thumbW + GUTTER);
        const y = GUTTER + Math.floor(i / cols) * (thumbH + STRIP + GUTTER);
        sheet.drawImage(renderer.canvas, x, y, thumbW, thumbH);
        sheet.fillStyle = STRIP_BG;
        sheet.fillRect(x, y + thumbH, thumbW, STRIP);
        // Frame and why it was picked first: they matter most when a narrow cell cuts the text.
        sheet.font = '600 13px system-ui, sans-serif';
        sheet.fillStyle = '#ffffff';
        sheet.fillText(fit(sheet, `#${pick.frame} · ${pick.why}`, thumbW - 12), x + 6, y + thumbH + 16);
        sheet.font = '12px system-ui, sans-serif';
        sheet.fillStyle = '#c4c4d0';
        sheet.fillText(fit(sheet, `${(pick.frame / fps).toFixed(2)} s · ${pick.scene + 1} ${pick.sceneLabel}`, thumbW - 12), x + 6, y + thumbH + 33);
      }
      onProgress(i + 1, picks.length);
    }
  } finally {
    renderer.dispose();
  }

  if (!sheet) return { sheet: null, frames };
  const sheetFile = `${opts.out}/sheet.png`;
  await writeFile(sheetFile, await encodePng(sheet.canvas));
  return { sheet: sheetFile, frames };
}
