import type { WipeFx } from '../types';
import { hash, signedHash } from './noise';

/**
 * The wipe reveal's optional front: a hot glowing line along the edge
 * (`edgeGlow`) and sparks drifting off it (`sparks`). Both are off when their
 * field is absent or 0, so wipes from before these fields render as they did.
 */

/** Where the wipe front is at progress t, as a distance from the bitmap centre (iris: a radius). */
export function wipeFrontAt(fx: WipeFx, t: number, w: number, h: number): number {
  const soft = Math.max(0, fx.softness);
  if (fx.shape === 'iris') {
    const r = t * (Math.hypot(w, h) / 2 + soft);
    return (Math.max(0, r - soft) + r) / 2;
  }
  const { span } = axis(fx.angle, w, h);
  const softEdge = Math.max(soft, 0.01);
  if (fx.shape === 'barn') {
    // Mirrors applyWipe's barn gradient: the front is the middle of each door's ramp.
    const reach = Math.max(t * (span / 2 + softEdge), 0.01);
    const ramp = Math.min(0.5, softEdge / (2 * reach));
    return reach * (1 - ramp);
  }
  return -span / 2 + t * (span + softEdge) - softEdge / 2;
}

function axis(angle: number, w: number, h: number) {
  const rad = (angle * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  return {
    dx, dy,
    span: Math.abs(w * dx) + Math.abs(h * dy),
    cross: Math.abs(w * dy) + Math.abs(h * dx),
  };
}

function rgba(hex: string, a: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map((c) => c + c).join('');
  const v = parseInt(h.slice(0, 6), 16) || 0;
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}

const edgeColor = (fx: WipeFx) => fx.edgeColor ?? '#ff6a3d';

/**
 * A band of `edgeColor` with its bright core on the front, falling off over
 * `edgeGlow` px on the revealed side. Added with 'lighter', and only where
 * `out` (the revealed bitmap) has pixels.
 */
export function drawWipeGlow(out: HTMLCanvasElement, fx: WipeFx, t: number): void {
  const g = fx.edgeGlow ?? 0;
  if (g <= 0 || t <= 0 || t >= 1) return;
  const w = out.width;
  const h = out.height;
  const band = document.createElement('canvas');
  band.width = w;
  band.height = h;
  const bctx = band.getContext('2d');
  const octx = out.getContext('2d');
  if (!bctx || !octx) return;

  const on = rgba(edgeColor(fx), 1);
  const off = rgba(edgeColor(fx), 0);
  const F = wipeFrontAt(fx, t, w, h);
  const cx = w / 2;
  const cy = h / 2;
  let grad: CanvasGradient;

  if (fx.shape === 'iris') {
    if (F <= 0) return;
    const R = F + 2;
    grad = bctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    grad.addColorStop(Math.max(0, F - g) / R, off);
    grad.addColorStop(F / R, on);
    grad.addColorStop(1, off);
  } else {
    const { dx, dy } = axis(fx.angle, w, h);
    const at = (d: number): [number, number] => [cx + dx * d, cy + dy * d];
    if (fx.shape === 'barn') {
      // Two fronts at ±F, each glowing inwards, towards the revealed centre.
      const L = 2 * (F + 2);
      const pos = (d: number) => (d + F + 2) / L;
      const inner = Math.max(0, F - g);
      grad = bctx.createLinearGradient(...at(-(F + 2)), ...at(F + 2));
      grad.addColorStop(0, off);
      grad.addColorStop(pos(-F), on);
      grad.addColorStop(pos(-inner), off);
      grad.addColorStop(pos(inner), off);
      grad.addColorStop(pos(F), on);
      grad.addColorStop(1, off);
    } else {
      // Revealed side is behind the front, at smaller distances.
      grad = bctx.createLinearGradient(...at(F - g), ...at(F + 2));
      grad.addColorStop(0, off);
      grad.addColorStop(g / (g + 2), on);
      grad.addColorStop(1, off);
    }
  }

  bctx.fillStyle = grad;
  bctx.fillRect(0, 0, w, h);
  bctx.globalCompositeOperation = 'destination-in';
  bctx.drawImage(out, 0, 0);

  octx.save();
  octx.globalCompositeOperation = 'lighter';
  octx.drawImage(band, 0, 0);
  octx.restore();
}

/**
 * Sparks, closed form: spark i spawns at a hashed frame inside the entrance
 * window, on the front where it was at that frame (`envAt` is the pure
 * envelope), drifts along the wipe direction with hashed jitter, and lives
 * 6–14 frames. Drawn as 1–3 px dots with 'lighter', clipped to the layer box
 * (the bitmap minus `pad`).
 *
 * A spark moves at 0.3–1.3× the front's own speed at its spawn frame, so
 * some trail the edge and some fly off ahead of it, and
 * it only spawns where `src` (the unwiped layer) has content, so text doesn't
 * spark in the gaps between letters.
 */
export function drawWipeSparks(
  out: HTMLCanvasElement,
  src: HTMLCanvasElement,
  fx: WipeFx,
  frameInLayer: number,
  envAt: (frame: number) => number,
  pad: number,
): void {
  const count = Math.round(Math.max(0, Math.min(1, fx.sparks ?? 0)) * 80);
  const win = fx.window;
  if (count === 0 || !win || win.inFrames <= 0) return;
  const w = out.width;
  const h = out.height;
  const ctx = out.getContext('2d');
  const sctx = src.getContext('2d');
  if (!ctx || !sctx) return;
  const alpha = sctx.getImageData(0, 0, w, h).data;
  const hasContent = (x: number, y: number) => {
    const xi = Math.round(x); const yi = Math.round(y);
    return xi >= 0 && yi >= 0 && xi < w && yi < h && alpha[(yi * w + xi) * 4 + 3] > 0;
  };
  const { dx, dy, cross } = axis(fx.angle, w, h);
  const cx = w / 2;
  const cy = h / 2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(pad, pad, w - pad * 2, h - pad * 2);
  ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = edgeColor(fx);

  for (let i = 0; i < count; i++) {
    const spawn = win.inDelay + Math.floor(hash(i, 31) * win.inFrames);
    const life = 6 + Math.floor(hash(i, 37) * 9);
    const age = frameInLayer - spawn;
    if (age < 0 || age >= life) continue;

    const clampT = (frame: number) => Math.max(0, Math.min(1, envAt(frame)));
    const F = wipeFrontAt(fx, clampT(spawn), w, h);
    const frontSpeed = Math.abs(wipeFrontAt(fx, clampT(spawn + 1), w, h) - F);
    const speed = Math.max(1.5, frontSpeed) * (0.3 + hash(i, 34));
    const drift = signedHash(i, 36);
    let bx: number; let by: number; // spawn point
    let vx: number; let vy: number; // per-frame drift
    if (fx.shape === 'iris') {
      const a = hash(i, 32) * Math.PI * 2;
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      bx = cx + ux * F; by = cy + uy * F;
      vx = ux * speed - uy * drift; vy = uy * speed + ux * drift;
    } else {
      const side = fx.shape === 'barn' && hash(i, 33) < 0.5 ? -1 : 1;
      const along = (hash(i, 32) - 0.5) * cross;
      bx = cx + dx * side * F - dy * along; by = cy + dy * side * F + dx * along;
      vx = dx * side * speed - dy * drift; vy = dy * side * speed + dx * drift;
    }
    if (!hasContent(bx, by)) continue;
    let x = bx + vx * age;
    let y = by + vy * age;
    x += signedHash(i, frameInLayer, 35) * 0.6;
    y += signedHash(i, frameInLayer, 39) * 0.6;
    const size = 1 + Math.floor(hash(i, 38) * 3);
    ctx.globalAlpha = 1 - age / life;
    ctx.fillRect(Math.round(x - size / 2), Math.round(y - size / 2), size, size);
  }
  ctx.restore();
}
