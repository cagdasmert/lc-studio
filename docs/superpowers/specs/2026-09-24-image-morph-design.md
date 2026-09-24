# Image Morph

**Date:** 2026-09-24
**Status:** Approved, ready for planning
**Baseline:** branch `fix/keyframed-radius-stroke` (commit `79127d7`), which
adds the `frameInLayer` argument to `drawImageLayer` that this feature needs.

## Summary

A true morph: an image layer can warp its image into a second image, so that
matching features (eye to eye, wheel to wheel) travel into place while one
image fades into the other. The morph is driven by a keyframable `progress`
scalar, so it runs at any time inside a scene alongside other layers.

Matching points are proposed by a bundled, offline vision model (DINOv2-small)
and corrected by hand in a three-pane editor. Rendering is pure Canvas 2D, so
the preview and the FFmpeg export draw identical frames.

## Goals

- A morph is a property of an image layer, not a new layer type. Every
  existing image feature (fit, border radius, tint, box shadow, clip path,
  layer FX, keyframes) applies to the morphed result unchanged.
- Rendering is deterministic and model-free: the model runs only when the user
  presses Auto-match, and its output is stored in the project.
- Auto-match works offline from first launch (model ships in the installer).
- Manual edits are never overwritten by Auto-match.
- Existing projects load and render unchanged. No migration.

## Non-goals

- Morphing video layers.
- Chains of three or more images in one layer (stack layers instead).
- A morph *scene transition*. The engine is reusable for one later.
- Separate timing curves for shape and colour.
- Face-specific landmark models.
- Sub-patch refinement of auto-matched points.
- Multi-threaded or WebGPU inference.
- Automatic repair of mesh fold-overs (the editor shows them; fixing is manual).
- Teaching the `lc-studio-project` skill (in `~/.claude/skills`, outside this
  repo) about `morph`. Follow-up.

## Data model

In `src/types/scene.ts`:

```ts
export interface MorphPoint { x: number; y: number }   // 0–1 in that image's own UV space

export interface MorphPair {
  id: string;
  a: MorphPoint;            // on the layer's own image (`src`)
  b: MorphPoint;            // on the target image
  source: 'auto' | 'manual';
  confidence?: number;      // 0–1; auto pairs only
}

export interface ImageMorphDef {
  target: string;           // second image; same path rules as `src`
  pairs: MorphPair[];
  progress: number;         // 0–1 static value; a 'morphProgress' keyframe track overrides it
}

export interface ImageLayerData extends LayerBase {
  // …existing fields…
  morph?: ImageMorphDef | null;
}
```

Decisions:

- **Points live in each image's own UV space (0–1 of the source bitmap),**
  not the layer box. Changing fit mode, resizing the layer, or swapping in a
  higher-resolution copy of the same image does not invalidate them. The two
  images may have different aspect ratios.
- **Both images use the layer's `fitMode`.** Each is fitted into the layer box
  with its own bitmap size.
- **`morphProgress` is resolved like `fontSize`:**
  `resolveNumericProperty(layer.keyframes, 'morphProgress', frameInLayer, morph.progress)`.
  All easings, including overshooting ones, apply.
- **Enabling a morph seeds a track**: `{frame: 0, value: 0, easing: 'ease-in-out'}`
  and `{frame: max(1, duration − 1), value: 1}`, where
  `duration = endFrame − startFrame`. Disabling removes `morph` and the track.
- `morph` is optional, so old projects are untouched.

## Rendering

### Where

`drawImageLayer` (`src/renderer/draw-image.ts`). When `layer.morph` is set
and both bitmaps are in the media cache, the content draw becomes the morph
draw. The tint path's two content draws (colour, then `destination-in` mask)
both use it. If the target bitmap is not loaded yet, the plain image draws.

### Fit geometry — `src/renderer/fit.ts`

`fitRect(fitMode, sw, sh, dw, dh) → {x, y, w, h}` is extracted from
`drawFitted` so the renderer, the warp and the editor share one definition:

| mode | scale | rect |
|---|---|---|
| fill | — | `0, 0, dw, dh` |
| contain | `min(dw/sw, dh/sh)` | centred `sw·s × sh·s` |
| cover | `max(dw/sw, dh/sh)` | centred `sw·s × sh·s` |
| none | 1 | centred `sw × sh` |

`uvToBox(uv, rect) = (rect.x + u·rect.w, rect.y + v·rect.h)` and its inverse
`boxToUv`.

### The warp field — `src/renderer/morph-field.ts` (pure)

Per frame, with `t` = resolved progress:

1. Each pair's `a` → box via A's fit rect; `b` → box via B's fit rect.
2. Append 8 border anchors at the box corners and edge midpoints, with
   `a = b`. They are never stored or shown.
3. In-between targets: `pT = pA + (pB − pA)·t`. **`t` is not clamped** here,
   so back/elastic easings overshoot the geometry, as reveal FX do.
4. Rigid moving-least-squares (Schaefer et al. 2006, α = 1) maps a point `v`
   given controls `p_i → q_i`:
   - `w_i = 1 / |p_i − v|²`; if `v` coincides with some `p_k`, return `q_k`.
   - `p* = Σw_i p_i / Σw_i`, `q* = Σw_i q_i / Σw_i`, `p̂_i = p_i − p*`,
     `q̂_i = q_i − q*`, `d = v − p*`.
   - `a_i = p̂_i · d`, `b_i = p̂_i × d = p̂x·dy − p̂y·dx`.
   - `f = Σ w_i (q̂x a_i − q̂y b_i,  q̂x b_i + q̂y a_i)`.
   - Result: `|d| · f / |f| + q*`. If `|f| = 0`, return `d + q*`.
   - Properties the tests pin: identity when `q = p`; exact translation when
     every `q_i = p_i + T`; `f(p_k) = q_k`.
5. A regular grid of `GRID × GRID` cells (starting value 24, tuned by the
   performance test) is laid over the box. For image A each vertex `g` maps
   through MLS with controls `pA → pT`; for B, `pB → pT`.
6. Border vertices may slide along their edge but never leave it (x pinned on
   the left/right edges, y on the top/bottom). Otherwise an edge pulled inward
   opens a transparent strip along the side of the layer.

Exports: `buildMorphMesh(...)` returning source and destination vertex arrays
per image, and `mlsRigid(v, p, q)`, reused by the editor to predict a
partner point.

### Drawing — `src/renderer/draw-morph.ts`

1. Fitted A and fitted B are each rendered once into box-sized canvases and
   cached (WeakMap on the bitmap, keyed by fit mode and box size), plus a copy
   padded by 2 px of repeated edge pixels (clamp-to-edge), so stretched border
   triangles don't sample transparency past the edge.
2. For each image, each grid cell is two triangles. For each triangle: set
   the context to the affine map from the source triangle to the destination
   triangle, and fill the destination triangle **with every edge pushed 1 px
   outward** (miter joins, bevelled where a miter would pass 2 px; mapped
   back into texture space) using the padded texture as a `no-repeat`
   pattern. Triangles folded to under 0.5 px thick are skipped: they are
   invisible, their neighbours' grown edges cover them, and mapping them back
   divides by a near-zero scale — texture coordinates past Cairo's 16.16
   fixed-point range corrupted the node-canvas surface (a blank frame). Pattern fills
   replaced clip + `drawImage` after measuring WebKit: 78 ms → 11 ms per 1080²
   frame (Chromium ~10 ms either way).
   Warped A goes into canvas `WA`, warped B into `WB`, both at full opacity,
   so the seam overlap is invisible.
3. Blend into output canvas `O`: draw `WA` with `globalAlpha = 1 − τ`, then
   `WB` with `globalAlpha = τ` under `globalCompositeOperation = 'lighter'`,
   with `τ = clamp(t, 0, 1)`. That is exactly `(1−τ)·A + τ·B` in
   premultiplied space, so cutout PNGs fade cleanly: no remnant of A shows
   where B is transparent at `τ = 1`.
4. `O` is drawn at `(0, 0)` in the layer's box space.

Shortcuts: `t === 0` draws fitted A, `t === 1` draws fitted B (no warp).
With no pairs the warp is the identity, so the result is a plain
cross-dissolve.

**Performance budget:** ≤ 33 ms per frame for a 1080 × 1080 morph in the
webview (live preview at 30 fps). The warp engine is built and measured
before any UI. Fallbacks, in order: lower `GRID`; pattern fills instead of
clip + drawImage; reuse offscreen canvases across frames.

Pure JS maths, no randomness: same inputs, same frame.

## Auto-match

### Model and runtime

- Model: `onnx-community/dinov2-small`, file `onnx/model_quantized.onnx`,
  pinned to revision `8b1f705a3a7f6f062f6bdd21986c1583d3ef105d`, 24,446,700
  bytes, SHA-256
  `c179f8f7f592449c4c1bca4cd124a7538021428c5ffb89afde9503935b197efb`.
  Apache-2.0 (weights from `facebook/dinov2-small`).
- Input `pixel_values` `[1, 3, H, W]` float32, H and W any multiples of 14.
  Output `last_hidden_state` `[1, 1 + N, 384]`: token 0 is CLS, the rest are
  patches in row-major order. Verified: 448 × 448 takes 1.2 s on one WASM
  thread in Node.
- Runtime: `onnxruntime-web` 1.30 via the `onnxruntime-web/wasm` entry, one
  thread (no cross-origin isolation, which would change how every
  cross-origin resource loads). The SIMD WASM binary (14.2 MB) ships with the
  frontend build.
- Budget: ≤ 10 s for both images on an M1-class machine. If it's slower, drop
  the long side from 448 to 336.

### Shipping the model

- File path: `src-tauri/resources/models/dinov2-small-int8.onnx`, gitignored.
  The directory holds a committed `README.md`, so the bundle glob
  `resources/models/*` always matches something and a checkout without the
  model still builds and runs.
- `scripts/fetch-models.mjs` downloads the pinned file, verifies the SHA-256,
  and skips if a valid file is already present. `--optional` turns failures
  into warnings.
- `tauri.conf.json`: `beforeBuildCommand` runs `fetch-models` (strict) before
  `npm run build`, so a release cannot ship without the model;
  `beforeDevCommand` runs it with `--optional`.
- The main thread reads the model with plugin-fs from the resource directory
  (`resolveResource('models/dinov2-small-int8.onnx')`) and transfers the bytes
  to the worker once. Capability `fs:allow-resource-read-recursive` is added.

### Pipeline

Main-thread API, `src/lib/morph-match/index.ts`:

```ts
autoMatch(
  bitmapA: ImageBitmap, bitmapB: ImageBitmap,
  view: { fitMode: ImageFitMode; boxW: number; boxH: number },
  opts: { onProgress?: (p: number) => void; signal?: AbortSignal },
): Promise<MorphPair[]>   // new auto pairs only; merging is the caller's job
```

1. Main thread: scale each bitmap so its long side is 448 and both sides are
   multiples of 14 (`createImageBitmap` with `resizeWidth/Height`), then
   transfer the copies to the worker.
2. Worker (`worker.ts`): ImageNet normalisation (mean 0.485/0.456/0.406, std
   0.229/0.224/0.225), CHW layout, run the model, drop CLS, L2-normalise each
   patch vector.
3. Pure matching (`match.ts`), all in UV space:
   - cosine similarity between every A patch and every B patch;
   - **mutual nearest neighbours only**;
   - drop pairs below similarity 0.3;
   - **spread**: split A's UV square into 8 × 8 buckets and keep the best
     pair in each;
   - **local consistency**: drop a pair whose displacement `b − a` is more
     than 0.2 UV from the median displacement of its 4 nearest neighbours
     (in A);
   - **visibility**: drop pairs where either point falls outside the layer
     box under its fit;
   - cap at 48 by similarity, then assign `confidence = clamp(sim, 0, 1)`,
     `source = 'auto'` and a fresh `id`.
4. Points sit at patch centres: `u = (col + 0.5)/cols`, `v = (row + 0.5)/rows`.

### Merge rule — `src/lib/morph-edit.ts`

`mergeAuto(existing, incoming)`: remove every existing `auto` pair, keep every
`manual` pair, and add each incoming pair unless its `a` or its `b` is within
0.04 UV of the same point of a manual pair.

### Errors

| Condition | Behaviour |
|---|---|
| Model file missing or unreadable | "Auto-match unavailable — model not found (run `npm run fetch-models` in dev)". Manual editing still works. |
| Model fails to load or run | The error message is shown; pairs are unchanged. |
| Cancel | The worker aborts; pairs are unchanged. |
| Not running under Tauri (plain Vite) | Auto-match is disabled, with a tooltip. |

## Editor

### Inspector

The Image section gains a **Morph to…** subsection with an on/off toggle (the
same pattern as Motion Path):

- target path, **Browse…** (`pickImageFile` + `copyAssetToProject`, as `src`
  does);
- pair count;
- **Edit points…**, which opens the dialog.

The keyframe editor lists `morphProgress` for image layers that have `morph`.
Its value lookup special-cases `morphProgress` to read `morph.progress`.

### Dialog — `src/components/storyboard/MorphEditor.tsx`

A large `.dialog-overlay` dialog (about 90 % of the window) with three panes:
**A | live result | B**.

- **Draft editing.** The dialog edits a copy of `morph`. **Done** commits it
  in one `updateLayer` call, so it is one undo step; **Cancel** or Esc
  discards it.
- Each pane shows its image with the layer's fit mode at the layer's aspect
  ratio. Points are converted UV ↔ box with `fit.ts`.
- The middle pane renders with `drawMorph`, the same code as export, redrawn
  at most once per animation frame. **Mesh** overlays the warped grid there
  and outlines flipped triangles in red.
- Slider plus ▶ previews `t` (default 0.5), independent of the timeline
  playhead.

| Action | Result |
|---|---|
| Click empty space in A or B | Adds a pair. The partner point appears where the current warp predicts (`mlsRigid` with the existing pairs plus anchors, A → B or B → A). `source: 'manual'`. |
| Drag a point | Moves it. An auto point becomes manual (confidence removed). |
| Click / hover a point | Selects / highlights it and its partner in both panes. |
| Arrow keys (Shift = ×10) | Nudges the selected point by 1 (10) screen px. |
| Delete / Backspace | Deletes the selected pair. |
| Wheel / Space-drag / **Fit** | Zoom at the cursor / pan / reset; each pane separately. (Not double-click: its first click would add a pair.) |
| Auto-match | Runs the worker with a progress bar and Cancel; results are merged into the draft with `mergeAuto`. |
| Clear auto | Removes all auto pairs. |

Dot colours: green for auto with confidence ≥ 0.6, amber for auto below that,
blue for manual.

The editing logic lives in the pure module `src/lib/morph-edit.ts`
(`addPair`, `movePoint`, `deletePair`, `clearAuto`, `mergeAuto`), so the
component stays thin.

## Integration

`assetRefs(layer)` in the new pure module `src/lib/asset-refs.ts` lists `src`
and, for image layers, `morph.target`, each with a getter and setter. It
replaces the separate `src`-only logic in:

- `rewriteAssetPaths` and `bundleAssets` (asset-manager): the target is saved
  relative and copied into `assets/`;
- `getImageSources` (media-cache): the target is preloaded for preview and
  export;
- `scanCompositionAssets` (asset-utils): the target is listed in the Asset
  panel.

Docs: `docs/features.md`, `docs/user-guide.md`, `docs/architecture.md`, and
one line in CLAUDE.md's subsystem list.

## Testing

| Area | Tests |
|---|---|
| `fit.ts` | `fitRect` for all four modes against hand-computed rects; `uvToBox` / `boxToUv` round trip |
| `morph-field.ts` | MLS identity, exact translation, interpolation at controls, `|f| = 0` fallback; mesh at `t = 0` equals the source grid |
| `draw-morph.ts` (node-canvas) | `t` near 0 ≈ A; `t` near 1 ≈ B; a single pair moving a dot puts its colour at the expected in-between spot at `t = 0.5`; a cutout PNG leaves no A remnant at `t = 1`; 0 pairs = cross-dissolve |
| `drawImageLayer` | a keyframed `morphProgress` changes output between frames; missing target falls back to A |
| Asset wiring | `rewriteAssetPaths` rewrites `morph.target`; preload includes it |
| `match.ts` | synthetic feature grids: mutual NN, threshold, spread, consistency filter, visibility, cap |
| `morph-edit.ts` | add with prediction, drag makes auto manual, delete, clear auto, merge rule |
| Real model | fixture image vs a shifted copy; median recovered shift within one patch; skipped when the model is absent |
| Performance | a timing test for a 1080 × 1080 morph frame in node-canvas as a proxy; confirmed in the webview |
| Editor and app | dev-server preview: add, drag, live pane updates, Done, undo |

## Risks and build order

1. **Triangle drawing speed in WKWebView.** Build and time the warp engine
   first, before any UI.
2. **ORT WASM under Tauri's origin.** Spike early in `tauri dev`: load the
   WASM binary and the model, run once. CSP is `null`, so trouble isn't
   expected.
3. **Match quality on different subjects.** Before polishing the editor, run
   the matcher on fixture pairs (same subject shifted, portrait → portrait,
   cat → dog, product → product) and judge the points by eye.

Order: fit + field → draw-morph + layer integration → asset wiring → matcher
(pure logic, then the model and worker) → edit logic → inspector + dialog →
docs.
