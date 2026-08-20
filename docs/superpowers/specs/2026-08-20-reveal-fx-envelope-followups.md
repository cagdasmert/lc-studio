# Reveal FX and Layer FX Envelope — Deferred Follow-ups

**Date:** 2026-08-20
**Branch:** `fx-reveal-envelope` (base `f2cb0fd`, head `e73cf47`)
**Spec:** `2026-08-20-reveal-fx-envelope-design.md`

Findings raised during the nine task reviews and the whole-branch review that were
deliberately deferred rather than fixed. None blocks merge. Recorded here because
the review workspace they were tracked in is deleted once the branch is done.

## Correctness — worth doing

**`BITMAP_FX` has no exhaustiveness guard.** `fx-kinds.test.ts` keeps `REVEAL_FX`
and the schema's `kind: 'reveal'` entries in sync, but nothing guards `BITMAP_FX`.
A future bitmap effect added to `REVEAL_FX` and forgotten in `BITMAP_FX` makes
`hasBitmapFx` return false, the effect silently never runs, and no test or type
error fires. Worse after the final fix wave: the direct-draw path's correctness now
depends on `{pixelate, slice, wipe} ⊆ BITMAP_FX` — a reveal missing from it would
produce a revealed bitmap for the box shadow and an unrevealed direct draw for the
layer. Fix: assert `REVEAL_FX \ {'zoom'} ⊆ BITMAP_FX` in `fx-kinds.test.ts`.

**Zoom's scale can go negative.** With `from: 0.1` and an `ease-in-elastic`
entrance (overshoot dips to ≈ −0.354), `scale = from + (1 - from) * e` reaches
≈ −0.22 and momentarily mirrors the layer. Falls out of the deliberate
unclamped-reveal design. Clamp `scale` to a small positive epsilon.
(Note: an earlier record of this had the arithmetic backwards — `from: 3` with an
*out*-elastic easing stays positive at ≈ 0.29. The reachable case is a small
`from` with an *in*-elastic easing.)

**`fxPadding` uses max across classes where it should add across them.** Max is
right among decorations, which each measure outward from static content. But
reveals *consume* padding: `applySlice` displaces bands by up to `travel`, so
`pad === travel` is exactly enough for the band and leaves nothing over. Stacking
`slice{travel:60}` with `glow{radius:24}` gives `pad = 60`, and the glow blooms off
a bitmap with zero margin on the displaced side — a clipped bloom that heals as the
reveal completes. Correct rule: `max(decoration padding) + max(reveal displacement)`.
`fx-padding.test.ts` asserts "max, not sum" against two decorations only, so it
encodes the incomplete rule.

**Unchecking "Timing" silently disables a reveal.** `toggleWindow`'s
`delete copy.window` gives `env = 1`, which for reveals means fully-revealed:
zoom scale 1, pixelate block 1, wipe returns `src`, slice `local = 1` everywhere.
The effect stays in the list, still forces the bitmap path, and does nothing.
Either hide the toggle for `kind: 'reveal'` specs or label it.

## Test coverage

- **No direct unit test for `applySlice` or `drawGlitch`.** The `bands === 1` defect
  found in Task 6 lived entirely in `applySlice`, which is why the pure-geometry
  split did not catch it. `layer-fx-composite.test.ts` (added in the final fix wave)
  now covers glitch's compositing but not its band geometry.
- **`fx-geometry.test.ts`'s "deterministic for random order" test is near-tautological** —
  `bandOrderPosition` takes no frame parameter, so any pure function passes. It does
  not exercise the frame-stability property it names.
- **No test covers `applyPixelate`/`applyReveals` pixel math** (block sizing, settle
  and flicker thresholds, fade curve).
- **No test covers `fxEnv` dimming or `compositeLayerFx`'s `env > 0` skip logic**
  with a window actually set. `envelope()`'s own math is well covered.
- **Non-zero-angle wipe geometry is unexercised.** Only `angle = 0` was measured.
  The whole-branch reviewer verified it analytically for any θ — `span = |w·cosθ| + |h·sinθ|`
  is exactly the projected extent — but there is no regression test.
- **The committed glitch test asserts alpha outside the layer footprint, not
  destination survival inside it.** The stronger measurement exists only in
  throwaway harnesses.

## Performance

- **`applyPixelate`'s cost guard peaks at its own threshold.** The comment argues
  per-block stamping is "only affordable while blocks are big", but cost is
  `(w/block) × (h/block)`, so among admitted values it is *maximal* at `block === 8` —
  32,400 stamps on a 1920×1080 layer. Measured: 5.6 ms/frame at block 40, 6.8 ms at
  block 20, **23.1 ms at block 8**, 0.1 ms at block 4. A `sw * sh <= N` cap would
  express the intent directly.
- **Nothing is pathological about stacking, for the record.** A ten-effect stack on
  1920×1080 measured 9.7 ms/frame mid-reveal, 45 ms at the block-8 point — ~22 fps
  preview at worst, offline render unaffected. Per-frame allocation of ~10 full-size
  canvases is churn, not a leak.
- **`gooey`'s `blur * 2` padding does nothing.** The blur applies via `ctx.filter` at
  draw time onto the destination, not into a padded intermediate, so the margin
  neither helps nor hurts — it only inflates the max and enlarges the offscreen.

## Structure and style

- **`layer-fx.ts` is ~600 lines** holding registry/envelope helpers, nine effect
  implementations plus three bitmap utilities, and the composite orchestration. The
  whole-branch reviewer judged this **not** a merge blocker and recommended, if ever
  split, a **two-way** split (`layer-fx-effects.ts` for the `draw*`/`apply*`
  functions plus `silhouette`/`channel`/`createCanvas`; everything else stays) —
  not the three-way split proposed earlier, which would put `fxEnv`, `REVEAL_FX`
  and `applyReveals` on opposite sides of a boundary they all cross.
- `fx-envelope.ts`'s parameter is named `window`, shadowing the DOM global in a file
  whose stated purpose is being DOM-free. Harmless; rename to `win`.
- The envelope panel in `PropertyInspector.tsx` uses an IIFE-in-JSX rather than a
  named `FxEnvelopePanel` subcomponent.
- `FxField.options` is not discriminated on `kind`, so `kind: 'select'` with no
  options type-checks. The `num`/`color`/`select` constructor helpers make the
  invalid state unconstructible at every current call site.
- `applyWipe`'s iris branch hardcodes `w / 2, h / 2` while the sibling branch defines
  `cx`/`cy` — though they are out of scope in the iris branch as written.
- `applySlice` double-composites band overlaps: bands are drawn `ceil(size) + 1` tall
  at `globalAlpha = local`, so the 1–2 px overlap gets `a_i + a_{i+1}(1 - a_i)` — a
  brighter seam per boundary while `local < 1`. Cosmetic and transient.
- All four scene specs carry `kind: 'continuous'` purely to satisfy the shared
  `FxSpec<T>`; `SceneFxDef` has no envelope. Dead metadata — worth a comment or a
  separate `SceneFxSpec` type.

## Build

**`canvas` (node-canvas) is now a devDependency** and sits on every install path.
It is `hasInstallScript: true` and pulls `prebuild-install`. It resolved to a
prebuilt binary on Node 22 / darwin-arm64, but a CI image or contributor platform
without a matching prebuild will attempt a native compile on `npm ci`. **Confirm
against CI before merge.** It exists to support `layer-fx-composite.test.ts`, which
needs a real canvas to composite over a non-empty destination — the exact condition
that a pure-node test could not reproduce and that let the glitch bug through.

## Behaviour changes worth knowing about

The final fix wave made `drawGlitch` produce a bitmap that *replaces* the base draw
rather than being stamped over it. Beyond the three combinations the fixer
enumerated (glitch + rgb-split, glitch + CSS filter, glitch at layer alpha < 1),
two more changed — both improvements, neither documented at the time:

- **glitch + `outline` / `long-shadow` / `glow` / box shadow.** The old
  `destination-out` punched through these decorations too. It no longer does. Concrete
  consequence: a torn band's vacated strip now shows the outline colour rather than
  the scene beneath, which reads as sticker backing showing through a tear.
- **glitch + a non-`normal` blend mode.** The old code reset the composite op to
  `source-over` for the restamp, so torn bands lost the layer's blend mode. The base
  is now drawn once under the layer's own blend mode.
