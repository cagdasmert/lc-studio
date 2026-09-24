import type { Vec2 } from '../renderer/fit';

export interface PaneView { zoom: number; panX: number; panY: number }
export const DEFAULT_VIEW: PaneView = { zoom: 1, panX: 0, panY: 0 };

/** screen = box · s + (x, y), in CSS px. */
export interface PaneXf { s: number; x: number; y: number }

const MARGIN = 16;
const MIN_ZOOM = 1;
const MAX_ZOOM = 16;

/** How a pane shows the layer box: fitted with a margin, then zoomed and panned. */
export function paneXf(cw: number, ch: number, boxW: number, boxH: number, v: PaneView): PaneXf {
  const fit = Math.max(1e-6, Math.min((cw - 2 * MARGIN) / boxW, (ch - 2 * MARGIN) / boxH));
  const s = fit * v.zoom;
  return { s, x: (cw - boxW * s) / 2 + v.panX, y: (ch - boxH * s) / 2 + v.panY };
}

export function toBox(xf: PaneXf, sx: number, sy: number): Vec2 {
  return { x: (sx - xf.x) / xf.s, y: (sy - xf.y) / xf.s };
}

export function toScreen(xf: PaneXf, p: Vec2): Vec2 {
  return { x: p.x * xf.s + xf.x, y: p.y * xf.s + xf.y };
}

/** Zoom by `factor` about the cursor, keeping the box point under it still. */
export function zoomAt(
  cw: number, ch: number, boxW: number, boxH: number,
  v: PaneView, sx: number, sy: number, factor: number,
): PaneView {
  const p = toBox(paneXf(cw, ch, boxW, boxH, v), sx, sy);
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.zoom * factor));
  const base = paneXf(cw, ch, boxW, boxH, { zoom, panX: 0, panY: 0 });
  return { zoom, panX: sx - (p.x * base.s + base.x), panY: sy - (p.y * base.s + base.y) };
}

/** The id of the point nearest (sx, sy) within `radius`, or null. */
export function hitPoint(
  points: readonly { id: string; x: number; y: number }[],
  sx: number, sy: number, radius: number,
): string | null {
  let best: string | null = null;
  let bestD = radius;
  for (const p of points) {
    const d = Math.hypot(p.x - sx, p.y - sy);
    if (d <= bestD) { bestD = d; best = p.id; }
  }
  return best;
}
