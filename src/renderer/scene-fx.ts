import type { SceneFxDef, GrainFx, VignetteFx, ScanlinesFx, ShakeFx } from '../types';
import { hash, smoothNoise } from './noise';

/**
 * Scene FX treat the whole frame. `shake` is a transform applied before the
 * scene is drawn; the rest are overlays applied after.
 */

function getFx<T extends SceneFxDef['type']>(
  fx: SceneFxDef[] | undefined,
  type: T,
): Extract<SceneFxDef, { type: T }> | undefined {
  return fx?.find((f) => f.type === type) as Extract<SceneFxDef, { type: T }> | undefined;
}

/**
 * Offset the frame along two out-of-phase noise curves. The frame is also
 * scaled up slightly so the shake never exposes an empty edge.
 * Call inside a save()/restore() that wraps the scene draw.
 */
export function applyShake(
  ctx: CanvasRenderingContext2D,
  fx: ShakeFx,
  frameInScene: number,
  fps: number,
  width: number,
  height: number,
): void {
  const decay = fx.decayFrames > 0
    ? Math.max(0, 1 - frameInScene / fx.decayFrames)
    : 1;
  const amplitude = fx.amplitude * decay;
  if (amplitude <= 0) return;

  const t = (frameInScene / fps) * fx.frequency;
  const dx = smoothNoise(t, 1) * amplitude;
  const dy = smoothNoise(t, 2) * amplitude;
  // A little rotation sells the impact more than translation alone
  const rot = smoothNoise(t, 3) * amplitude * 0.0006;

  const overscan = 1 + (amplitude * 2) / Math.min(width, height);
  ctx.translate(width / 2 + dx, height / 2 + dy);
  ctx.rotate(rot);
  ctx.scale(overscan, overscan);
  ctx.translate(-width / 2, -height / 2);
}

export function hasShake(fx: SceneFxDef[] | undefined): ShakeFx | undefined {
  return getFx(fx, 'shake');
}

// Noise tiles are expensive to build and identical between frames, so keep
// one per (size, amount) and move it around instead of regenerating.
const grainTiles = new Map<string, HTMLCanvasElement>();
const GRAIN_TILE = 256;

function getGrainTile(scale: number, amount: number): HTMLCanvasElement {
  const key = `${scale}:${amount.toFixed(2)}`;
  const cached = grainTiles.get(key);
  if (cached) return cached;

  const cells = Math.max(1, Math.floor(GRAIN_TILE / scale));
  const tile = document.createElement('canvas');
  tile.width = cells;
  tile.height = cells;
  const ctx = tile.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(cells, cells);
    for (let i = 0; i < cells * cells; i++) {
      const v = Math.floor(hash(i, 9137) * 255);
      img.data[i * 4] = v;
      img.data[i * 4 + 1] = v;
      img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = Math.floor(amount * 255);
    }
    ctx.putImageData(img, 0, 0);
  }
  grainTiles.set(key, tile);
  return tile;
}

function drawGrain(
  ctx: CanvasRenderingContext2D,
  fx: GrainFx,
  frame: number,
  width: number,
  height: number,
): void {
  if (fx.amount <= 0) return;
  const scale = Math.max(1, fx.scale);
  const tile = getGrainTile(scale, fx.amount);
  const tileSize = tile.width * scale;

  // Shift the tile every frame so the grain crawls like real film
  const ox = -Math.floor(hash(frame, 11) * tileSize);
  const oy = -Math.floor(hash(frame, 12) * tileSize);

  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.imageSmoothingEnabled = false;
  for (let y = oy; y < height; y += tileSize) {
    for (let x = ox; x < width; x += tileSize) {
      ctx.drawImage(tile, x, y, tileSize, tileSize);
    }
  }
  ctx.restore();
}

function drawVignette(
  ctx: CanvasRenderingContext2D,
  fx: VignetteFx,
  width: number,
  height: number,
): void {
  if (fx.amount <= 0) return;
  const cx = width / 2;
  const cy = height / 2;
  const outer = Math.sqrt(cx * cx + cy * cy);
  const grad = ctx.createRadialGradient(cx, cy, outer * fx.radius, cx, cy, outer);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, `rgba(0,0,0,${Math.min(1, fx.amount)})`);

  ctx.save();
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function drawScanlines(
  ctx: CanvasRenderingContext2D,
  fx: ScanlinesFx,
  frame: number,
  width: number,
  height: number,
): void {
  if (fx.amount <= 0) return;
  const spacing = Math.max(2, fx.spacing);
  const thickness = Math.max(1, Math.floor(spacing / 2));
  const roll = fx.rollSpeed !== 0
    ? ((frame * fx.rollSpeed) % spacing + spacing) % spacing
    : 0;

  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${Math.min(1, fx.amount)})`;
  for (let y = roll - spacing; y < height; y += spacing) {
    ctx.fillRect(0, y, width, thickness);
  }
  ctx.restore();
}

/** Overlays, drawn after the scene is composited. */
export function applyScenePostFx(
  ctx: CanvasRenderingContext2D,
  fx: SceneFxDef[] | undefined,
  frameInScene: number,
  width: number,
  height: number,
): void {
  if (!fx || fx.length === 0) return;

  for (const f of fx) {
    switch (f.type) {
      case 'scanlines': drawScanlines(ctx, f, frameInScene, width, height); break;
      case 'grain': drawGrain(ctx, f, frameInScene, width, height); break;
      case 'vignette': drawVignette(ctx, f, width, height); break;
      case 'shake': break; // applied as a pre-transform
    }
  }
}
