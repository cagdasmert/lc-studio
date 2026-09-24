import { createCanvas } from 'canvas';

/**
 * The renderer's only DOM dependency is document.createElement('canvas').
 * Point it at node-canvas instead of pulling jsdom into every test file.
 */
export function installCanvasDocument(): void {
  (globalThis as unknown as { document: unknown }).document = {
    createElement(tag: string) {
      if (tag !== 'canvas') throw new Error(`unexpected element <${tag}>`);
      return createCanvas(1, 1);
    },
  };
}

type Ctx = CanvasRenderingContext2D;

/** A w×h node-canvas painted by `paint`, typed as the ImageBitmap the renderer expects. */
export function bitmap(w: number, h: number, paint: (ctx: Ctx) => void): ImageBitmap {
  const c = createCanvas(w, h);
  paint(c.getContext('2d') as unknown as Ctx);
  return c as unknown as ImageBitmap;
}

export function solid(w: number, h: number, color: string): ImageBitmap {
  return bitmap(w, h, (ctx) => { ctx.fillStyle = color; ctx.fillRect(0, 0, w, h); });
}

/** [r, g, b, a] of one pixel of any canvas (node-canvas or one the renderer made). */
export function rgba(canvas: HTMLCanvasElement, x: number, y: number): number[] {
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  return Array.from(ctx.getImageData(x, y, 1, 1).data);
}
