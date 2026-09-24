import type { ImageFitMode } from '../types';

export interface Vec2 { x: number; y: number }
export interface Size { w: number; h: number }
export interface Rect { x: number; y: number; w: number; h: number }

/**
 * Where a sw×sh bitmap lands inside a dw×dh box under a fit mode. The one
 * definition shared by the image drawer, the morph warp and the morph editor,
 * so a point placed in the editor lands on the same pixel in the render.
 */
export function fitRect(fitMode: ImageFitMode, sw: number, sh: number, dw: number, dh: number): Rect {
  switch (fitMode) {
    case 'fill':
      return { x: 0, y: 0, w: dw, h: dh };
    case 'contain':
    case 'cover': {
      const scale = fitMode === 'contain'
        ? Math.min(dw / sw, dh / sh)
        : Math.max(dw / sw, dh / sh);
      const w = sw * scale;
      const h = sh * scale;
      return { x: (dw - w) / 2, y: (dh - h) / 2, w, h };
    }
    case 'none':
      return { x: (dw - sw) / 2, y: (dh - sh) / 2, w: sw, h: sh };
  }
}

export function uvToBox(uv: Vec2, r: Rect): Vec2 {
  return { x: r.x + uv.x * r.w, y: r.y + uv.y * r.h };
}

export function boxToUv(p: Vec2, r: Rect): Vec2 {
  return { x: (p.x - r.x) / r.w, y: (p.y - r.y) / r.h };
}
