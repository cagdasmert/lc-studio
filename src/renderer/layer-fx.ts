import type {
  LayerFxDef, LayerFxType, RgbSplitFx, ShineFx, GlowFx, LongShadowFx, PixelateFx, SliceFx, WipeFx, GlitchFx, OutlineFx, GooeyFx,
} from '../types';
import { hash, signedHash } from './noise';
import { envelope } from './fx-envelope';
import { bandOrderPosition, bandProgress } from './fx-geometry';

/**
 * Layer FX are composited from the layer's own rendered pixels: draw the layer
 * once into an offscreen canvas, then stamp that bitmap several times with
 * offsets, tints and blend modes. Everything here works on that bitmap, in the
 * layer's local coordinate space, padded so bloom and shadows aren't clipped.
 */

/** FX that need the layer bitmap. `echo` is not here — it re-runs the whole
 *  layer draw at earlier frames, so it lives in draw.ts. */
const BITMAP_FX: LayerFxType[] = ['rgb-split', 'shine', 'glow', 'long-shadow', 'pixelate', 'slice', 'wipe', 'glitch', 'outline', 'gooey'];

/** FX whose geometry is driven by the envelope rather than merely dimmed by
 *  it. These read `env` unclamped so back/elastic easings can overshoot.
 *  Mirrors `kind: 'reveal'` in fx-schema.ts — the renderer must not import
 *  that module, so the knowledge is duplicated and a test keeps them in sync. */
export const REVEAL_FX: LayerFxType[] = ['zoom', 'pixelate', 'slice', 'wipe'];

export function getFx<T extends LayerFxDef['type']>(
  fx: LayerFxDef[] | undefined,
  type: T,
): Extract<LayerFxDef, { type: T }> | undefined {
  return fx?.find((f) => f.type === type) as Extract<LayerFxDef, { type: T }> | undefined;
}

export function hasBitmapFx(fx: LayerFxDef[] | undefined): boolean {
  return !!fx?.some((f) => BITMAP_FX.includes(f.type));
}

/** The envelope scalar for one effect on one frame. Reveals read it
 *  unclamped; continuous effects are clamped so they can't go negative. */
export function fxEnv(
  fx: LayerFxDef,
  frameInLayer: number,
  layerDuration: number,
): number {
  return envelope(
    fx.window, frameInLayer, layerDuration, !REVEAL_FX.includes(fx.type),
  );
}

/**
 * Extra room the bitmap needs around the layer so effects that reach outside
 * the layer box (bloom, extrusion, channel offsets) aren't cut off.
 */
export function fxPadding(fx: LayerFxDef[] | undefined): number {
  if (!fx) return 0;
  let pad = 0;
  for (const f of fx) {
    switch (f.type) {
      case 'glow': pad = Math.max(pad, f.radius * 2); break;
      case 'long-shadow': pad = Math.max(pad, f.distance + 4); break;
      case 'rgb-split': pad = Math.max(pad, f.offset * 2 + 4); break;
      case 'slice': pad = Math.max(pad, Math.abs(f.travel)); break;
      case 'glitch': pad = Math.max(pad, f.maxOffset + f.channelShift); break;
      case 'outline': pad = Math.max(pad, f.width + 2); break;
      case 'gooey': pad = Math.max(pad, f.blur * 2); break;
      default: break;
    }
  }
  return Math.ceil(pad);
}

function createCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/**
 * Recolour a bitmap to a flat colour, keeping its alpha — a silhouette.
 * `source-in` alone would fill the whole canvas, so the alpha mask is
 * re-applied with `destination-in`.
 */
function silhouette(src: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const out = createCanvas(src.width, src.height);
  const ctx = out.getContext('2d');
  if (!ctx) return out;
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, out.width, out.height);
  return out;
}

/** Keep a single colour channel of a bitmap, preserving its alpha. */
function channel(src: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const out = createCanvas(src.width, src.height);
  const ctx = out.getContext('2d');
  if (!ctx) return out;
  ctx.drawImage(src, 0, 0);
  // multiply by a pure channel colour, then restore the original alpha —
  // multiply on its own paints the transparent regions too.
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(src, 0, 0);
  return out;
}

function drawLongShadow(
  ctx: CanvasRenderingContext2D,
  bitmap: HTMLCanvasElement,
  fx: LongShadowFx,
): void {
  const rad = (fx.angle * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const steps = Math.max(1, Math.round(fx.distance));
  const shadow = silhouette(bitmap, fx.color);

  ctx.save();
  // Far end first so nearer slices land on top
  for (let i = steps; i >= 1; i--) {
    const t = i / steps;
    ctx.globalAlpha = Math.max(0, 1 - t * fx.fade);
    ctx.drawImage(shadow, dx * i, dy * i);
  }
  ctx.restore();
}

function drawGlow(
  ctx: CanvasRenderingContext2D,
  bitmap: HTMLCanvasElement,
  fx: GlowFx,
  frameInLayer: number,
): void {
  const pulse = fx.pulseFrames > 0
    ? 0.65 + 0.35 * Math.sin((frameInLayer / fx.pulseFrames) * Math.PI * 2)
    : 1;
  const radius = fx.radius * pulse;
  if (radius <= 0) return;

  const passes = Math.max(1, Math.round(fx.intensity));
  ctx.save();
  ctx.shadowColor = fx.color;
  ctx.shadowBlur = radius;
  // Each pass deepens the bloom; the layer itself is drawn again afterwards.
  for (let i = 0; i < passes; i++) {
    ctx.drawImage(bitmap, 0, 0);
  }
  ctx.restore();
}

function drawRgbSplit(
  ctx: CanvasRenderingContext2D,
  bitmap: HTMLCanvasElement,
  fx: RgbSplitFx,
  frameInLayer: number,
): void {
  const jitter = fx.jitter > 0
    ? 1 + signedHash(frameInLayer, 7717) * fx.jitter
    : 1;
  const offset = fx.offset * jitter;
  const rad = (fx.angle * Math.PI) / 180;
  const dx = Math.cos(rad) * offset;
  const dy = Math.sin(rad) * offset;

  const r = channel(bitmap, '#ff0000');
  const g = channel(bitmap, '#00ff00');
  const b = channel(bitmap, '#0000ff');

  ctx.save();
  // Additive recombination: where the three line up the original colour is
  // restored, where they don't you get the fringing.
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(r, -dx, -dy);
  ctx.drawImage(g, 0, 0);
  ctx.drawImage(b, dx, dy);
  ctx.restore();
}

function drawShine(
  ctx: CanvasRenderingContext2D,
  bitmap: HTMLCanvasElement,
  fx: ShineFx,
  frameInLayer: number,
): void {
  const period = Math.max(1, fx.periodFrames);
  const t = (frameInLayer % period) / period;

  const w = bitmap.width;
  const h = bitmap.height;
  const band = createCanvas(w, h);
  const bctx = band.getContext('2d');
  if (!bctx) return;

  // The band travels along `angle`, from fully off one edge to off the other.
  const rad = (fx.angle * Math.PI) / 180;
  const span = Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad));
  const travel = span + fx.width * 2;
  const centre = -fx.width + t * travel;
  const cx = w / 2 + (centre - span / 2) * Math.cos(rad);
  const cy = h / 2 + (centre - span / 2) * Math.sin(rad);
  const half = fx.width / 2;

  const grad = bctx.createLinearGradient(
    cx - Math.cos(rad) * half, cy - Math.sin(rad) * half,
    cx + Math.cos(rad) * half, cy + Math.sin(rad) * half,
  );
  grad.addColorStop(0, 'transparent');
  grad.addColorStop(0.5, fx.color);
  grad.addColorStop(1, 'transparent');

  // The band on its own, then masked to the layer's silhouette. Compositing
  // the layer's pixels in here too would double the whole layer's brightness
  // when this is added back with 'lighter'.
  bctx.fillStyle = grad;
  bctx.fillRect(0, 0, w, h);
  bctx.globalCompositeOperation = 'destination-in';
  bctx.drawImage(bitmap, 0, 0);

  ctx.save();
  ctx.globalAlpha *= Math.max(0, Math.min(1, fx.intensity));
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(band, 0, 0);
  ctx.restore();
}

function drawGlitch(
  ctx: CanvasRenderingContext2D,
  bitmap: HTMLCanvasElement,
  fx: GlitchFx,
  frameInLayer: number,
  env: number,
): void {
  const bands = Math.max(1, Math.round(fx.bands));
  const w = bitmap.width;
  const h = bitmap.height;
  const size = h / bands;

  // `cs` doesn't vary per band, so it's computed once here. The channel
  // bitmaps are built lazily, on the first band that actually tears — a
  // frame where every band fails its probability gate should pay nothing,
  // and a frame with several torn bands should pay for the two canvases once.
  const cs = fx.channelShift * env;
  let r: HTMLCanvasElement | null = null;
  let b: HTMLCanvasElement | null = null;

  ctx.save();
  for (let i = 0; i < bands; i++) {
    // Deterministic gate: the same frame always tears the same bands.
    if (hash(frameInLayer, i, 4001) >= fx.probability) continue;

    const shift = signedHash(frameInLayer, i, 4002) * fx.maxOffset * env;
    const sy = Math.floor(i * size);
    const sh = Math.min(Math.ceil(size) + 1, h - sy);
    if (sh <= 0) continue;

    // Erase the untorn band, then restamp it displaced, so the strip does
    // not appear twice.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillRect(0, sy, w, sh);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(bitmap, 0, sy, w, sh, shift, sy, w, sh);

    if (cs > 0) {
      if (!r) r = channel(bitmap, '#ff0000');
      if (!b) b = channel(bitmap, '#0000ff');
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(r, 0, sy, w, sh, shift - cs, sy, w, sh);
      ctx.drawImage(b, 0, sy, w, sh, shift + cs, sy, w, sh);
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  ctx.restore();
}

/** A reveal's output: the rewritten bitmap plus an alpha multiplier for
 *  effects that also fade. Reveals chain, each consuming the previous
 *  result's bitmap and multiplying into its alpha. */
export interface RevealResult {
  bitmap: HTMLCanvasElement;
  alpha: number;
}

function applyPixelate(
  src: HTMLCanvasElement,
  fx: PixelateFx,
  env: number,
  frameInLayer: number,
): HTMLCanvasElement {
  const t = Math.max(0, Math.min(1, env));
  const block = Math.max(1, Math.round(fx.maxBlock * (1 - t)));
  if (block <= 1) return src;

  const w = src.width;
  const h = src.height;
  const sw = Math.max(1, Math.ceil(w / block));
  const sh = Math.max(1, Math.ceil(h / block));

  // Downscale, then blow back up with smoothing off — the cheapest mosaic.
  const small = createCanvas(sw, sh);
  const sctx = small.getContext('2d');
  if (!sctx) return src;
  sctx.drawImage(src, 0, 0, sw, sh);

  const out = createCanvas(w, h);
  const octx = out.getContext('2d');
  if (!octx) return src;
  octx.imageSmoothingEnabled = false;

  // Per-block stamping costs one drawImage per block, so it is only affordable
  // while blocks are big — which is exactly when flicker is visible anyway.
  if (fx.flicker > 0 && block >= 8) {
    for (let by = 0; by < sh; by++) {
      for (let bx = 0; bx < sw; bx++) {
        // Two hashes doing two jobs. The frame-independent one gives each
        // block its own threshold, so blocks settle in a scattered order as
        // the envelope rises instead of all at once. The frame-dependent one
        // makes the not-yet-settled blocks flash rather than sit at a
        // constant dim value.
        const settled = hash(bx, by, 5501) < t;
        octx.globalAlpha = settled
          ? 1
          : 1 - fx.flicker * hash(frameInLayer, bx, by);
        octx.drawImage(small, bx, by, 1, 1, bx * block, by * block, block, block);
      }
    }
    octx.globalAlpha = 1;
  } else {
    octx.drawImage(small, 0, 0, w, h);
  }
  return out;
}

function applySlice(
  src: HTMLCanvasElement,
  fx: SliceFx,
  env: number,
): HTMLCanvasElement {
  const bands = Math.max(1, Math.round(fx.bands));
  const w = src.width;
  const h = src.height;
  const out = createCanvas(w, h);
  const octx = out.getContext('2d');
  if (!octx) return src;

  const horizontal = fx.direction === 'horizontal';
  const size = (horizontal ? h : w) / bands;

  for (let i = 0; i < bands; i++) {
    const local = bandProgress(env, bandOrderPosition(i, bands, fx.order), fx.stagger);
    if (local <= 0) continue;

    // Alternating direction is what makes this read as slicing rather than
    // as the whole layer sliding in. With a single band there's no partner
    // to alternate against, so it must degrade to a plain fade in place.
    const sign = bands > 1 ? (i % 2 === 0 ? 1 : -1) : 0;
    const shift = (1 - local) * fx.travel * sign;

    // Bands are drawn a hair oversized so rounding cannot leave seams.
    const start = i * size;
    const span = Math.ceil(size) + 1;
    const sy = horizontal ? Math.floor(start) : 0;
    const sx = horizontal ? 0 : Math.floor(start);
    const sh = horizontal ? Math.min(span, h - sy) : h;
    const sw = horizontal ? w : Math.min(span, w - sx);
    if (sw <= 0 || sh <= 0) continue;

    octx.globalAlpha = local;
    octx.drawImage(
      src,
      sx, sy, sw, sh,
      sx + (horizontal ? shift : 0), sy + (horizontal ? 0 : shift), sw, sh,
    );
  }
  octx.globalAlpha = 1;
  return out;
}

function applyWipe(
  src: HTMLCanvasElement,
  fx: WipeFx,
  env: number,
): HTMLCanvasElement {
  const t = Math.max(0, Math.min(1, env));
  if (t >= 1) return src;

  const w = src.width;
  const h = src.height;
  const out = createCanvas(w, h);
  const octx = out.getContext('2d');
  if (!octx) return src;
  octx.drawImage(src, 0, 0);

  // Build the mask, then keep only what it covers.
  const mask = createCanvas(w, h);
  const mctx = mask.getContext('2d');
  if (!mctx) return src;

  const soft = Math.max(0, fx.softness);

  if (fx.shape === 'iris') {
    const maxR = Math.hypot(w, h) / 2;
    const r = t * (maxR + soft);
    const inner = Math.max(0, r - soft);
    const grad = mctx.createRadialGradient(w / 2, h / 2, inner, w / 2, h / 2, Math.max(inner + 0.01, r));
    grad.addColorStop(0, '#fff');
    grad.addColorStop(1, 'transparent');
    mctx.fillStyle = grad;
    mctx.fillRect(0, 0, w, h);
  } else {
    const rad = (fx.angle * Math.PI) / 180;
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);
    const span = Math.abs(w * dx) + Math.abs(h * dy);
    const cx = w / 2;
    const cy = h / 2;
    // A zero-length gradient is undefined across canvas implementations, so
    // every ramp keeps a hair of length even at softness 0.
    const softEdge = Math.max(fx.softness, 0.01);
    const at = (d: number): [number, number] => [cx + dx * d, cy + dy * d];

    if (fx.shape === 'barn') {
      // One gradient, not two. Canvas extends a gradient's end stops outward
      // forever, so two white-to-transparent half-planes union to full cover
      // almost immediately. Spanning -reach..+reach with transparent ends and
      // white interior gives a band that genuinely opens from the centre.
      // Each door only crosses half the layer, hence span / 2.
      const reach = Math.max(t * (span / 2 + softEdge), 0.01);
      const [x0, y0] = at(-reach);
      const [x1, y1] = at(reach);
      const grad = mctx.createLinearGradient(x0, y0, x1, y1);
      // Capped at 0.5 so the two ramps can never cross and unorder the stops.
      const ramp = Math.min(0.5, softEdge / (2 * reach));
      grad.addColorStop(0, 'transparent');
      grad.addColorStop(ramp, '#fff');
      grad.addColorStop(1 - ramp, '#fff');
      grad.addColorStop(1, 'transparent');
      mctx.fillStyle = grad;
      mctx.fillRect(0, 0, w, h);
    } else {
      // A single edge sweeping the full span: white behind the head,
      // transparent ahead of it. The extended end stops are what keep the
      // already-swept region covered as the head advances.
      const head = -span / 2 + t * (span + softEdge);
      const [x0, y0] = at(head - softEdge);
      const [x1, y1] = at(head);
      const grad = mctx.createLinearGradient(x0, y0, x1, y1);
      grad.addColorStop(0, '#fff');
      grad.addColorStop(1, 'transparent');
      mctx.fillStyle = grad;
      mctx.fillRect(0, 0, w, h);
    }
  }

  octx.globalCompositeOperation = 'destination-in';
  octx.drawImage(mask, 0, 0);
  return out;
}

/**
 * Run every bitmap-stage reveal in list order. Reveals go before decorations
 * so that glow, shadow and shine bloom off what is actually visible rather
 * than off the full silhouette.
 */
export function applyReveals(
  bitmap: HTMLCanvasElement,
  fx: LayerFxDef[] | undefined,
  frameInLayer: number,
  layerDuration: number,
): RevealResult {
  let current = bitmap;
  let alpha = 1;
  if (!fx) return { bitmap: current, alpha };

  for (const f of fx) {
    const env = fxEnv(f, frameInLayer, layerDuration);
    switch (f.type) {
      case 'pixelate':
        current = applyPixelate(current, f, env, frameInLayer);
        if (f.fade > 0) {
          alpha *= 1 - f.fade + f.fade * Math.max(0, Math.min(1, env));
        }
        break;
      case 'slice':
        current = applySlice(current, f, env);
        break;
      case 'wipe':
        current = applyWipe(current, f, env);
        break;
      default:
        break;
    }
  }
  return { bitmap: current, alpha };
}

/** Number of stamps used to fake a dilation. Twelve is enough that the ring
 *  reads as a smooth outline at the widths this control allows. */
const OUTLINE_STAMPS = 12;

function drawOutline(
  ctx: CanvasRenderingContext2D,
  bitmap: HTMLCanvasElement,
  fx: OutlineFx,
  env: number,
): void {
  const width = fx.width * env;
  if (width <= 0) return;

  const ring = silhouette(bitmap, fx.color);
  ctx.save();
  for (let i = 0; i < OUTLINE_STAMPS; i++) {
    const a = (i / OUTLINE_STAMPS) * Math.PI * 2;
    ctx.drawImage(ring, Math.cos(a) * width, Math.sin(a) * width);
  }
  ctx.restore();
}

/**
 * Composite a pre-rendered layer bitmap with its FX stack.
 * `filter` carries the layer's CSS filter effects, applied to every stamp so
 * blur/brightness still behave as before.
 */
export function compositeLayerFx(
  ctx: CanvasRenderingContext2D,
  bitmap: HTMLCanvasElement,
  fx: LayerFxDef[] | undefined,
  pad: number,
  frameInLayer: number,
  layerDuration: number,
  filter: string,
): void {
  const longShadow = getFx(fx, 'long-shadow');
  const glow = getFx(fx, 'glow');
  const rgbSplit = getFx(fx, 'rgb-split');
  const shine = getFx(fx, 'shine');
  const glitch = getFx(fx, 'glitch');
  const outline = getFx(fx, 'outline');
  const gooey: GooeyFx | undefined = getFx(fx, 'gooey');

  const reveal = applyReveals(bitmap, fx, frameInLayer, layerDuration);
  const src = reveal.bitmap;

  ctx.save();
  ctx.translate(-pad, -pad);
  const gooeyEnv = gooey ? fxEnv(gooey, frameInLayer, layerDuration) : 0;
  const gooeyFilter = gooey && gooeyEnv > 0
    ? `blur(${(gooey.blur * gooeyEnv).toFixed(2)}px) contrast(${gooey.contrast})`
    : '';
  const combined = [filter === 'none' ? '' : filter, gooeyFilter]
    .filter(Boolean).join(' ');
  if (combined) ctx.filter = combined;
  ctx.globalAlpha *= reveal.alpha;

  if (longShadow) {
    const e = fxEnv(longShadow, frameInLayer, layerDuration);
    if (e > 0) {
      drawLongShadow(ctx, src, { ...longShadow, distance: longShadow.distance * e });
    }
  }
  if (outline) {
    const e = fxEnv(outline, frameInLayer, layerDuration);
    if (e > 0) drawOutline(ctx, src, outline, e);
  }
  if (glow) {
    const e = fxEnv(glow, frameInLayer, layerDuration);
    if (e > 0) {
      drawGlow(ctx, src, { ...glow, radius: glow.radius * e }, frameInLayer);
    }
  }

  const splitEnv = rgbSplit ? fxEnv(rgbSplit, frameInLayer, layerDuration) : 0;
  if (rgbSplit && splitEnv > 0) {
    drawRgbSplit(
      ctx, src, { ...rgbSplit, offset: rgbSplit.offset * splitEnv }, frameInLayer,
    );
  } else {
    ctx.drawImage(src, 0, 0);
  }

  if (glitch) {
    const e = fxEnv(glitch, frameInLayer, layerDuration);
    if (e > 0) drawGlitch(ctx, src, glitch, frameInLayer, e);
  }

  if (shine) {
    const e = fxEnv(shine, frameInLayer, layerDuration);
    if (e > 0) {
      drawShine(ctx, src, { ...shine, intensity: shine.intensity * e }, frameInLayer);
    }
  }

  ctx.filter = 'none';
  ctx.restore();
}
