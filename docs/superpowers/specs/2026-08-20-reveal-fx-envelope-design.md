# Reveal FX and the Layer FX Envelope

**Date:** 2026-08-20
**Status:** Approved, ready for planning
**Baseline:** tag `fx-v1` (commit `1634217`)

## Summary

Layer FX today are always-on decorations. This change introduces a **timing
envelope** available to every layer FX, and uses it to add four *reveal*
effects (pixelate, slice, zoom, wipe) plus three cheap *continuous* effects
(glitch, outline, gooey).

The envelope is a single optional field on every effect rather than a second
effect type. Continuous effects gain time-gating for free; reveal effects are
just effects whose geometry happens to be driven by the envelope.

## Goals

- One `LayerFxDef` union, one optional envelope, no fork in the type system.
- Existing projects render byte-identically. No migration step.
- Reveals support entrance, exit, or both from a single scalar.
- All new effects are frame-deterministic (preview == FFmpeg render).
- Unit tests cover the pure logic that is easy to get subtly wrong.

## Non-goals

- Scene FX envelopes. `SceneFxDef` is untouched; the inspector passes
  `showEnvelope={false}` for scene FX.
- Shatter/shard, dissolve, halftone, ripple, and the other effects surveyed
  during brainstorming. They fit this architecture but are out of scope.
- Keyframing FX parameters. The envelope is a fixed four-value ramp, not a
  keyframe track.

## The envelope model

### Type

```ts
export interface FxWindow {
  inDelay: number;    // frames after layer start before the entrance begins
  inFrames: number;   // entrance length; 0 = no entrance
  outFrames: number;  // exit length, measured back from layer end; 0 = no exit
  easing: EasingType;
  easingParams?: EasingParams;
}
```

`EasingType` and `EasingParams` already exist in `src/types/scene.ts`; the
curve comes from the existing `getEasing(name, params)` in
`src/renderer/easing.ts`. No new easing code.

Every member of `LayerFxDef` gains `window?: FxWindow`.

### The `env` scalar

A new pure module `src/renderer/fx-envelope.ts` exports:

```ts
export function envelope(
  window: FxWindow | undefined,
  frameInLayer: number,
  layerDuration: number,
  clamp: boolean,
): number
```

Semantics, in order:

1. `window` undefined, or `layerDuration <= 0` → return `1`. This is what
   makes existing projects render unchanged.
2. Entrance. If `inFrames > 0`:
   - `f < inDelay` → `0`
   - `inDelay <= f < inDelay + inFrames` → `ease((f - inDelay) / inFrames)`
   - otherwise → `1`

   If `inFrames === 0` the entrance contributes `1` and `inDelay` is ignored.
3. Exit. If `outFrames > 0`, with `outStart = layerDuration - outFrames`:
   - `f >= layerDuration` → `0`
   - `f > outStart` → `ease(1 - (f - outStart) / outFrames)`
   - otherwise → `1`

   If `outFrames === 0` the exit contributes `1`.
4. `env = min(entrance, exit)`. When the two windows overlap on a short layer
   the effect simply never reaches full strength — no special case needed.

### Clamping is kind-dependent

`spring`, `back`, `elastic`, and `bounce` easings overshoot outside `[0, 1]`.
`interpolation.ts` deliberately does not clamp, and that is correct for
transforms.

- **Reveal effects: do not clamp.** A back-eased zoom that overshoots past
  `1.0` scale before settling is the desired look.
- **Continuous effects: clamp to `[0, 1]`.** An overshoot would produce a
  negative glow radius or a negative alpha.

The `clamp` argument carries this.

**Where the renderer learns an effect's kind.** Not from `FxSpec`.
`fx-schema.ts` documents itself as UI metadata that "the renderer reads none
of", and that boundary holds. The renderer keeps its own
`const REVEAL_FX: LayerFxType[]` in `layer-fx.ts`, alongside the existing
`BITMAP_FX` array, and derives `clamp` from membership. `FxSpec.kind` exists
purely so the inspector can group and label effects. The two lists must agree;
a unit test asserts they do.

### What `env` means per kind

`FxSpec` gains `kind: 'reveal' | 'continuous'` (UI only — see above):

- **`reveal`** — `env` drives geometry. `0` is the fully-unrevealed state,
  `1` is the finished layer.
- **`continuous`** — `env` is an intensity multiplier on the existing
  behaviour. Glow radius, rgb-split offset, echo alpha, shine intensity,
  long-shadow distance all scale by it.

## Execution sites

`drawLayerAtFrame` (`src/renderer/draw.ts:62`) resolves the transform, sizes
an offscreen canvas from it, draws the layer into it, then calls
`compositeLayerFx`. Reveals cannot all live in the compositor, because zoom
must change `resolved.scaleX/scaleY` *before* the canvas is sized at
`draw.ts:117`.

Three sites, extending the split the code already has for `echo`:

| Site | Effects | Mechanism |
| --- | --- | --- |
| Outer, pre-transform (`drawLayerAtFrame`) | `zoom` | Mutates `resolved` scale; also multiplies `ctx.globalAlpha` when `fade > 0` |
| Outer, re-draw (`drawLayerAtFrame`) | `echo` | Already there; its `env` scales the stamp alpha |
| Bitmap (`compositeLayerFx`) | `pixelate`, `slice`, `wipe`, `glitch`, `outline`, `gooey`, and the existing four | Rewrites or stamps the bitmap |

### Ordering inside `compositeLayerFx`

The function becomes a two-phase pass:

1. **Reveal phase.** Bitmap-stage reveals apply in list order, each consuming
   the previous one's output, producing a single transformed bitmap.
2. **Decoration phase.** The existing chain — long-shadow, glow,
   rgb-split/base draw, shine — plus the new continuous effects, all run
   against the *revealed* bitmap.

Reveals run first on purpose: if slice has hidden half the layer, glow must
bloom off what is actually visible, not off the full silhouette.

### Signature changes

- `compositeLayerFx` gains a `layerDuration: number` parameter. It currently
  receives `frameInLayer` only, and the exit ramp needs `endFrame - startFrame`.
- `hasBitmapFx` — its hardcoded `BITMAP_FX` list gains `pixelate`, `slice`,
  `wipe`, `glitch`, `outline`, `gooey`. `zoom` is deliberately excluded so it
  stays on the cheap non-bitmap path.

### Padding must stay static

`fxPadding` computes from FX parameters only, **never from the current `env`**.
A canvas whose dimensions change between frames resamples differently each
frame and produces visible crawling along edges. Worst-case padding for the
whole layer duration is correct even when the effect is at `env = 0`.

| Effect | Padding contribution |
| --- | --- |
| `slice` | `travel` |
| `outline` | `width` |
| `gooey` | `blur * 2` |
| `glitch` | `maxOffset + channelShift` |
| `pixelate`, `wipe` | none — both stay inside the layer box |
| `zoom` | none — transform stage, no bitmap involved |

## The seven effects

### Reveals

**`pixelate`** — `{ maxBlock: number, flicker: number, fade: number }`

`env` maps `maxBlock → 1px` block size. Downscale the bitmap into a canvas of
`ceil(w / block) × ceil(h / block)`, then draw it back at full size with
`imageSmoothingEnabled = false`. `flicker` (0–1) applies per-block alpha noise
from `hash(frame, bx, by)` so blocks pop in rather than smoothly sharpen.
`fade` (0–1) couples layer alpha to `env`, so the layer can dissolve rather
than merely coarsen.

**`slice`** — `{ bands, direction, order, travel, stagger }`

`direction`: `'horizontal' | 'vertical'`.
`order`: `'sequential' | 'center-out' | 'random'`.

Each band `i` of `bands` gets a normalised order position `o_i ∈ [0, 1]`:

- sequential: `i / (bands - 1)`
- center-out: `|i - (bands-1)/2| / ((bands-1)/2)`
- random: `hash(i, 9173)` — deterministic and stable across frames

Local progress, with `stagger` clamped to `[0, 0.95]`:

```
local_i = clamp((env - o_i * stagger) / (1 - stagger), 0, 1)
```

At `stagger = 0` every band shares `env`. Band `i` is drawn as a sub-rect
`drawImage` with `alpha = local_i` and a perpendicular offset of
`(1 - local_i) * travel * sign_i`, where `sign_i` alternates `+1 / -1` by band
parity — alternating direction is what makes the effect read as slicing rather
than sliding.

`bands === 1` must degrade to a plain fade, not divide by zero.

**`zoom`** — `{ from: number, fade: number }`

`env` maps `from → 1.0`. `from < 1` punches in, `from > 1` recedes. `fade`
(0–1) couples alpha to `env`. Transform stage: multiplies `resolved.scaleX`
and `resolved.scaleY`, so it composes with the layer's own scale and with
keyframed transforms.

**`wipe`** — `{ shape, angle, softness }`

`shape`: `'linear' | 'iris' | 'barn'`. A gradient mask is painted onto a
scratch canvas and applied with `destination-in`. `softness` is the gradient
ramp width in px; `0` gives a hard edge. `angle` applies to `linear` and
`barn`. One implementation covers all three shapes.

### Continuous

**`glitch`** — `{ bands, maxOffset, channelShift, probability }`, `probability` in `[0, 1]`

Horizontal strips. Band `i` on frame `f` is displaced when
`hash(f, i, 4001) < probability`, by `signedHash(f, i, 4002) * maxOffset * env`.
Displaced bands also get an rgb offset of `channelShift * env`.

**`outline`** — `{ color, width }`

Reuses the existing `silhouette()` helper in `layer-fx.ts`. Dilates by
stamping the silhouette at 12 evenly-spaced angles at radius `width * env`,
drawn beneath the layer.

**`gooey`** — `{ blur, contrast }`

`ctx.filter = blur(Npx) contrast(N)` on the bitmap draw, with `blur` scaled by
`env`. Composes with the existing `buildFilterString(layer.effects)` output
rather than replacing it.

## Determinism

`src/renderer/noise.ts` already states the rule: effects must never call
`Math.random()`, because preview and FFmpeg render draw the same frame at
different times and a reopened project must look identical.

Every stochastic value in this change derives from `hash` / `signedHash` keyed
on integer inputs: slice random ordering, glitch band gating and displacement,
pixelate flicker. Seeds are fixed constants so ordering is stable across
frames.

## Schema and UI

`src/lib/fx-schema.ts`:

- `FxField` gains `kind: 'select'` with an `options: { value: string; label: string }[]`
  list. Required by slice (`direction`, `order`) and wipe (`shape`). Today the
  union is `'number' | 'color'` only.
- `FxSpec` gains `kind: 'reveal' | 'continuous'`.
- Seven new entries in `LAYER_FX_SPECS`, and `kind` added to the five existing
  entries (all `'continuous'`).

`src/components/storyboard/PropertyInspector.tsx`:

- `FxListEditor` (line 524) gains a `showEnvelope?: boolean` prop and renders a
  shared envelope sub-panel — `inDelay`, `inFrames`, `outFrames`, `easing` —
  for each effect card when set. The panel is shared, not duplicated into each
  spec's `fields`, so every effect gets identical envelope controls.
- The `select` field kind needs a renderer alongside the existing number and
  colour controls.
- `LayerFxSection` passes `showEnvelope`; `SceneFxSection` does not.

Default `FxWindow` for a newly added reveal:
`{ inDelay: 0, inFrames: 12, outFrames: 0, easing: 'ease-out-cubic' }`.
Continuous effects are added with `window` absent, preserving today's
behaviour on insert.

## Testing

The repo has no test runner. This change adds **Vitest** (`npm i -D vitest`,
`"test": "vitest run"`), configured for the `node` environment. Only pure
logic is unit-tested; canvas compositing is verified by eye in the preview.

To keep the tested logic importable without a DOM, pure geometry lives in
modules that never touch `document`: `src/renderer/fx-envelope.ts` and a new
`src/renderer/fx-geometry.ts` for band layout. `layer-fx.ts` may import them.

Test coverage:

- **`fx-envelope.test.ts`** — undefined window → 1; `layerDuration <= 0` → 1;
  entrance-only; exit-only; both; `inDelay` respected; overlapping in/out on a
  short layer; boundary frames (0, `inDelay`, `inDelay + inFrames`,
  `outStart`, `layerDuration`); overshoot preserved when `clamp` is false and
  clipped when true.
- **`fx-geometry.test.ts`** — band offsets for all three `order` modes;
  `bands === 1` degrades without dividing by zero; `stagger = 0` gives every
  band the same local progress; `stagger` near 1 is clamped.
- **`fx-padding.test.ts`** — per-effect contribution matches the table above;
  a stack takes the max; padding is independent of `env`.
- **`noise.test.ts`** — `hash` returns the same value for the same inputs
  across calls; `signedHash` stays within `[-1, 1)`.
- **`fx-kinds.test.ts`** — the renderer's `REVEAL_FX` list and the
  `kind: 'reveal'` entries in `LAYER_FX_SPECS` name the same effects, so the
  duplicated knowledge cannot drift.

## Backward compatibility

- `window` is optional everywhere. Absent → `env = 1` → identical output.
- No project-file migration. Old `.lcs.json` files load and render unchanged.
- The five existing effects keep their current parameters and defaults; they
  only gain the optional envelope and a `kind` marker in their spec.

## Files touched

| File | Change |
| --- | --- |
| `src/types/scene.ts` | `FxWindow`; `window?` on all five FX interfaces; seven new FX interfaces; extend `LayerFxDef` union |
| `src/renderer/fx-envelope.ts` | New — `envelope()` |
| `src/renderer/fx-geometry.ts` | New — slice band layout |
| `src/renderer/layer-fx.ts` | Two-phase composite; `layerDuration` param; `BITMAP_FX` additions; padding table; six new draw functions |
| `src/renderer/draw.ts` | Zoom at transform stage; envelope on echo; pass `layerDuration` |
| `src/lib/fx-schema.ts` | `select` field kind; `FxSpec.kind`; seven new specs |
| `src/components/storyboard/PropertyInspector.tsx` | Envelope sub-panel; `select` control |
| `src/App.css` | Envelope panel styling |
| `package.json` | Vitest dev dependency and `test` script |
