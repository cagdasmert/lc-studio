# Image Morph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an image layer warp its image into a second image (true feature-matched morph), with points proposed by a bundled offline DINOv2 model and corrected in a three-pane editor.

**Architecture:** A pure rigid-MLS warp field (`morph-field.ts`) is sampled on a grid and drawn as textured triangles in Canvas 2D (`draw-morph.ts`), called from `drawImageLayer` so preview and export share it. Auto-match runs DINOv2-small through `onnxruntime-web` (WASM, one thread) in a Web Worker at authoring time only; its pairs are stored in the project. A React dialog (`MorphEditor.tsx`) edits a draft of the pairs using pure helpers (`morph-edit.ts`, `morph-pane.ts`).

**Tech Stack:** TypeScript, React 19, Canvas 2D, Vitest + node-canvas, onnxruntime-web 1.30, Tauri v2 (plugin-fs, resources).

**Spec:** `docs/superpowers/specs/2026-09-24-image-morph-design.md`

## Global Constraints

- Rendering is deterministic: no `Math.random()` in any render path (IDs for new pairs may use it, as layer IDs already do).
- The renderer (`src/renderer/`) must not import the model, the worker, or anything under `src/lib/morph-match/`.
- `morph` is optional on `ImageLayerData`; projects without it load and render unchanged. No migration.
- Model: `onnx-community/dinov2-small` `onnx/model_quantized.onnx`, revision `8b1f705a3a7f6f062f6bdd21986c1583d3ef105d`, SHA-256 `c179f8f7f592449c4c1bca4cd124a7538021428c5ffb89afde9503935b197efb`, stored at `src-tauri/resources/models/dinov2-small-int8.onnx` (gitignored).
- `onnxruntime-web` pinned to `1.30.0`, WASM entry `onnxruntime-web/wasm`, `numThreads = 1`.
- Matching constants: long side 448, patch 14, min similarity 0.3, 8 × 8 buckets, 4 neighbours, max deviation 0.2 UV, max 48 pairs, manual clearance 0.04 UV, green dot at confidence ≥ 0.6.
- Warp constants: `MORPH_GRID = 24` (tunable by the performance check), seam expansion 0.75 px.
- Tests run with `npm test`; type-check with `npx tsc --noEmit`. There is no `@types/node`: test files that need Node APIs use the ambient shim in `src/test-utils/node-shims.d.ts`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Map

| File | Responsibility |
|---|---|
| `src/types/scene.ts` (modify) | `MorphPoint`, `MorphPair`, `ImageMorphDef`, `ImageLayerData.morph` |
| `src/renderer/fit.ts` (new) | `fitRect`, `uvToBox`, `boxToUv`, `Vec2`, `Rect`, `Size` |
| `src/renderer/draw-image.ts` (modify) | uses `fitRect`; swaps in the morph when `layer.morph` is set |
| `src/renderer/morph-field.ts` (new) | `MorphView`, `mlsRigid`, `morphControls`, `buildMorphMesh` |
| `src/renderer/draw-morph.ts` (new) | `renderMorph`, `MORPH_GRID`; fitted-texture cache, triangle warp, blend |
| `src/test-utils/node-canvas.ts` (new) | node-canvas `document` shim and pixel helpers for tests |
| `src/test-utils/node-shims.d.ts` (new) | ambient `node:fs` types for the model test |
| `src/lib/asset-refs.ts` (new) | `assetRefs(layer)` — every asset path a layer points at |
| `src/lib/asset-manager.ts`, `src/lib/asset-utils.ts`, `src/renderer/media-cache.ts` (modify) | use `assetRefs` |
| `src/lib/morph-edit.ts` (new) | pure pair editing: ids, add/move/delete/clear/merge, enable/disable |
| `src/lib/morph-pane.ts` (new) | pure pane geometry: `paneXf`, `toBox`, `toScreen`, `zoomAt`, `hitPoint` |
| `src/lib/morph-match/match.ts` (new) | pure feature matching → `MorphPair[]` |
| `src/lib/morph-match/features.ts` (new) | input sizing, CHW normalisation, patch grid, `extractFeatures` |
| `src/lib/morph-match/protocol.ts` (new) | worker message types |
| `src/lib/morph-match/worker.ts` (new) | ORT session + pipeline in a Web Worker |
| `src/lib/morph-match/index.ts` (new) | main-thread `autoMatch`, model loading, availability |
| `scripts/fetch-models.mjs` (new) | download + verify the pinned model |
| `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`, `.gitignore`, `package.json`, `vite.config.ts` (modify) | model shipping and worker build |
| `src-tauri/resources/models/README.md` (new) | keeps the resource glob non-empty; explains the model |
| `src/components/storyboard/MorphEditor.tsx` (new) | the three-pane dialog |
| `src/components/storyboard/PropertyInspector.tsx`, `KeyframeEditor.tsx`, `src/App.css` (modify) | Morph section, `morphProgress` track, dialog styles |
| `docs/features.md`, `docs/user-guide.md`, `docs/architecture.md`, `CLAUDE.md` (modify) | documentation |

---

### Task 1: Morph types and shared fit geometry

**Files:**
- Modify: `src/types/scene.ts` (after `ImageLayerData`'s `TintBlendMode`, ~line 367)
- Create: `src/renderer/fit.ts`
- Modify: `src/renderer/draw-image.ts` (`drawFitted`)
- Test: `src/renderer/fit.test.ts`

**Interfaces:**
- Produces: `MorphPoint {x,y}`, `MorphPair {id,a,b,source,confidence?}`, `ImageMorphDef {target,pairs,progress}`, `ImageLayerData.morph?: ImageMorphDef | null`; `Vec2`, `Size {w,h}`, `Rect {x,y,w,h}`, `fitRect(fitMode, sw, sh, dw, dh): Rect`, `uvToBox(uv, rect): Vec2`, `boxToUv(p, rect): Vec2`.

- [ ] **Step 1: Add the types**

In `src/types/scene.ts`, directly above `export interface ImageLayerData`:

```ts
/** 0–1 position in an image's own pixel space (not the layer box). */
export interface MorphPoint {
  x: number;
  y: number;
}

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
```

and add to `ImageLayerData` after `tintBlend?`:

```ts
  morph?: ImageMorphDef | null;
```

- [ ] **Step 2: Write the failing fit tests**

`src/renderer/fit.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { boxToUv, fitRect, uvToBox } from './fit';

// A 400×300 bitmap into a 200×200 box, rects worked out by hand.
describe('fitRect', () => {
  it('fill stretches to the box', () => {
    expect(fitRect('fill', 400, 300, 200, 200)).toEqual({ x: 0, y: 0, w: 200, h: 200 });
  });

  it('contain scales by the smaller ratio and centres', () => {
    // scale min(0.5, 0.667) = 0.5 → 200×150, centred vertically
    expect(fitRect('contain', 400, 300, 200, 200)).toEqual({ x: 0, y: 25, w: 200, h: 150 });
  });

  it('cover scales by the larger ratio and centres', () => {
    // scale max(0.5, 0.667) = 2/3 → 266.67×200, overhanging 33.33 each side
    const r = fitRect('cover', 400, 300, 200, 200);
    expect(r.x).toBeCloseTo(-33.333, 3);
    expect(r.y).toBe(0);
    expect(r.w).toBeCloseTo(266.667, 3);
    expect(r.h).toBe(200);
  });

  it('none keeps native size and centres', () => {
    expect(fitRect('none', 400, 300, 200, 200)).toEqual({ x: -100, y: -50, w: 400, h: 300 });
  });
});

describe('uvToBox / boxToUv', () => {
  const rect = { x: 0, y: 25, w: 200, h: 150 };

  it('maps UV into the fitted rect', () => {
    expect(uvToBox({ x: 0.25, y: 0.5 }, rect)).toEqual({ x: 50, y: 100 });
  });

  it('inverts uvToBox', () => {
    expect(boxToUv({ x: 50, y: 100 }, rect)).toEqual({ x: 0.25, y: 0.5 });
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/renderer/fit.test.ts`
Expected: FAIL — cannot resolve `./fit`.

- [ ] **Step 4: Implement `fit.ts`**

```ts
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
```

- [ ] **Step 5: Make `drawFitted` use it**

In `src/renderer/draw-image.ts`, replace the body of `drawFitted` (the whole `switch`) with:

```ts
  const r = fitRect(fitMode, bitmap.width, bitmap.height, dw, dh);
  ctx.drawImage(bitmap, r.x, r.y, r.w, r.h);
```

and add `import { fitRect } from './fit';`. Remove the now-unused `sw`/`sh` locals.

- [ ] **Step 6: Run all tests and type-check**

Run: `npm test && npx tsc --noEmit`
Expected: PASS (fit tests plus the existing 58).

- [ ] **Step 7: Commit**

```bash
git add src/types/scene.ts src/renderer/fit.ts src/renderer/fit.test.ts src/renderer/draw-image.ts
git commit -m "Add morph types and share fit geometry through fitRect"
```

---

### Task 2: Rigid MLS warp field

**Files:**
- Create: `src/renderer/morph-field.ts`
- Test: `src/renderer/morph-field.test.ts`

**Interfaces:**
- Consumes: `fitRect`, `uvToBox`, `Vec2`, `Size` (Task 1); `MorphPair`, `ImageFitMode` (types).
- Produces:
  - `interface MorphView { fitMode: ImageFitMode; sizeA: Size; sizeB: Size; boxW: number; boxH: number }`
  - `mlsRigid(v: Vec2, p: readonly Vec2[], q: readonly Vec2[]): Vec2`
  - `morphControls(view: MorphView, pairs: readonly MorphPair[]): { pA: Vec2[]; pB: Vec2[] }` (box px, 8 anchors appended)
  - `interface MorphMesh { cols: number; rows: number; src: Float64Array; dstA: Float64Array; dstB: Float64Array }` (xy interleaved, `(cols+1)·(rows+1)` vertices, row-major)
  - `buildMorphMesh(view: MorphView, pairs: readonly MorphPair[], t: number, grid: number): MorphMesh`

- [ ] **Step 1: Write the failing tests**

`src/renderer/morph-field.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildMorphMesh, mlsRigid, type MorphView } from './morph-field';
import type { MorphPair } from '../types';

const tri = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }];

describe('mlsRigid', () => {
  it('is the identity when every control stays put', () => {
    const v = mlsRigid({ x: 3, y: 4 }, tri, tri);
    expect(v.x).toBeCloseTo(3, 9);
    expect(v.y).toBeCloseTo(4, 9);
  });

  it('reproduces a pure translation exactly', () => {
    const q = tri.map((p) => ({ x: p.x + 5, y: p.y - 2 }));
    const v = mlsRigid({ x: 3, y: 4 }, tri, q);
    expect(v.x).toBeCloseTo(8, 9);
    expect(v.y).toBeCloseTo(2, 9);
  });

  it('reproduces a 90° rotation exactly', () => {
    const p = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];
    const q = p.map(({ x, y }) => ({ x: -y, y: x }));
    const v = mlsRigid({ x: 0.5, y: 0.2 }, p, q);
    expect(v.x).toBeCloseTo(-0.2, 9);
    expect(v.y).toBeCloseTo(0.5, 9);
  });

  it('lands a control point exactly on its target', () => {
    const q = [{ x: 1, y: 1 }, { x: 12, y: 0 }, { x: 0, y: 15 }];
    expect(mlsRigid({ x: 10, y: 0 }, tri, q)).toEqual({ x: 12, y: 0 });
  });

  it('maps the weighted centroid to the target centroid', () => {
    // v = p* makes the rotation term vanish; the result is q*.
    const p = [{ x: -1, y: 0 }, { x: 1, y: 0 }];
    const q = [{ x: -1, y: 5 }, { x: 1, y: 5 }];
    const v = mlsRigid({ x: 0, y: 0 }, p, q);
    expect(v.x).toBeCloseTo(0, 9);
    expect(v.y).toBeCloseTo(5, 9);
  });

  it('returns the point unchanged with no controls', () => {
    expect(mlsRigid({ x: 7, y: 8 }, [], [])).toEqual({ x: 7, y: 8 });
  });
});

const square: MorphView = {
  fitMode: 'fill', sizeA: { w: 100, h: 100 }, sizeB: { w: 100, h: 100 }, boxW: 100, boxH: 100,
};

function pair(a: [number, number], b: [number, number]): MorphPair {
  return { id: 'p', a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] }, source: 'manual' };
}

describe('buildMorphMesh', () => {
  it('leaves A undeformed at t = 0', () => {
    const mesh = buildMorphMesh(square, [pair([0.5, 0.5], [0.6, 0.5])], 0, 4);
    for (let i = 0; i < mesh.src.length; i++) expect(mesh.dstA[i]).toBeCloseTo(mesh.src[i], 6);
  });

  it('leaves B undeformed at t = 1', () => {
    const mesh = buildMorphMesh(square, [pair([0.5, 0.5], [0.6, 0.5])], 1, 4);
    for (let i = 0; i < mesh.src.length; i++) expect(mesh.dstB[i]).toBeCloseTo(mesh.src[i], 6);
  });

  it('moves a control vertex of A halfway at t = 0.5', () => {
    // grid 2 on a 100 box: the centre vertex (50,50) is index 4 and is A's control.
    const mesh = buildMorphMesh(square, [pair([0.5, 0.5], [0.6, 0.5])], 0.5, 2);
    expect(mesh.dstA[8]).toBeCloseTo(55, 9);
    expect(mesh.dstA[9]).toBeCloseTo(50, 9);
  });

  it('maps points through each image’s own fit', () => {
    // box 200×200. A 400×200 contain → rect (0,50,200,100); B 200×400 → (50,0,100,200).
    // a (0.75,0.5) → A box (150,100); b (0.5,0.25) → B box (100,50).
    // grid 4: (150,100) is column 3, row 2 → index (2·5+3)·2 = 26.
    const view: MorphView = {
      fitMode: 'contain', sizeA: { w: 400, h: 200 }, sizeB: { w: 200, h: 400 }, boxW: 200, boxH: 200,
    };
    const mesh = buildMorphMesh(view, [pair([0.75, 0.5], [0.5, 0.25])], 1, 4);
    expect(mesh.dstA[26]).toBeCloseTo(100, 9);
    expect(mesh.dstA[27]).toBeCloseTo(50, 9);
  });

  it('pins the box corners', () => {
    const mesh = buildMorphMesh(square, [pair([0.3, 0.3], [0.7, 0.7])], 0.5, 4);
    const last = mesh.src.length - 2;
    expect([mesh.dstA[0], mesh.dstA[1]]).toEqual([0, 0]);
    expect([mesh.dstB[last], mesh.dstB[last + 1]]).toEqual([100, 100]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/renderer/morph-field.test.ts`
Expected: FAIL — cannot resolve `./morph-field`.

- [ ] **Step 3: Implement `morph-field.ts`**

```ts
import type { ImageFitMode, MorphPair } from '../types';
import { fitRect, uvToBox, type Size, type Vec2 } from './fit';

/** Everything that fixes where a pair's UV points sit in the layer box. */
export interface MorphView {
  fitMode: ImageFitMode;
  sizeA: Size;   // source bitmap sizes
  sizeB: Size;
  boxW: number;  // layer box
  boxH: number;
}

/**
 * Rigid moving-least-squares deformation (Schaefer, McPhail & Warren 2006,
 * α = 1): the as-rigid-as-possible map that sends each control p_i to q_i,
 * evaluated at v. Exact at the controls, reproduces rigid motions exactly,
 * and bends smoothly in between — which keeps noisy auto-matched points from
 * tearing the image the way per-triangle warps do.
 */
export function mlsRigid(v: Vec2, p: readonly Vec2[], q: readonly Vec2[]): Vec2 {
  const n = p.length;
  if (n === 0) return { x: v.x, y: v.y };

  let sw = 0, psx = 0, psy = 0, qsx = 0, qsy = 0;
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const dx = p[i].x - v.x;
    const dy = p[i].y - v.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < 1e-12) return { x: q[i].x, y: q[i].y };
    const wi = 1 / d2;
    w[i] = wi;
    sw += wi;
    psx += wi * p[i].x; psy += wi * p[i].y;
    qsx += wi * q[i].x; qsy += wi * q[i].y;
  }
  psx /= sw; psy /= sw; qsx /= sw; qsy /= sw;

  const dx = v.x - psx;
  const dy = v.y - psy;
  let fx = 0, fy = 0;
  for (let i = 0; i < n; i++) {
    const phx = p[i].x - psx, phy = p[i].y - psy;
    const qhx = q[i].x - qsx, qhy = q[i].y - qsy;
    const a = phx * dx + phy * dy;   // p̂ · d
    const b = phx * dy - phy * dx;   // p̂ × d
    fx += w[i] * (qhx * a - qhy * b);
    fy += w[i] * (qhx * b + qhy * a);
  }
  const fl = Math.hypot(fx, fy);
  if (fl < 1e-12) return { x: dx + qsx, y: dy + qsy };
  const dl = Math.hypot(dx, dy);
  return { x: (dl * fx) / fl + qsx, y: (dl * fy) / fl + qsy };
}

/** Box corners and edge midpoints, as fractions of the box. Pinned (a = b). */
const ANCHORS: readonly [number, number][] = [
  [0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5],
];

/** Every pair's points in box px (each through its own image's fit), plus the anchors. */
export function morphControls(view: MorphView, pairs: readonly MorphPair[]): { pA: Vec2[]; pB: Vec2[] } {
  const rA = fitRect(view.fitMode, view.sizeA.w, view.sizeA.h, view.boxW, view.boxH);
  const rB = fitRect(view.fitMode, view.sizeB.w, view.sizeB.h, view.boxW, view.boxH);
  const pA = pairs.map((pr) => uvToBox(pr.a, rA));
  const pB = pairs.map((pr) => uvToBox(pr.b, rB));
  for (const [u, v] of ANCHORS) {
    const anchor = { x: u * view.boxW, y: v * view.boxH };
    pA.push(anchor);
    pB.push(anchor);
  }
  return { pA, pB };
}

export interface MorphMesh {
  cols: number;
  rows: number;
  /** Regular grid over the box — the texture coordinates of both images. */
  src: Float64Array;
  /** Where each grid vertex of image A lands at progress t. */
  dstA: Float64Array;
  /** Where each grid vertex of image B lands at progress t. */
  dstB: Float64Array;
}

/**
 * Sample the warp on a grid. `t` is deliberately unclamped: back/elastic
 * easings overshoot the geometry, as reveal FX do. Blend weights are clamped
 * by the caller.
 */
export function buildMorphMesh(
  view: MorphView,
  pairs: readonly MorphPair[],
  t: number,
  grid: number,
): MorphMesh {
  const { pA, pB } = morphControls(view, pairs);
  const pT = pA.map((a, i) => ({ x: a.x + (pB[i].x - a.x) * t, y: a.y + (pB[i].y - a.y) * t }));

  const n = (grid + 1) * (grid + 1) * 2;
  const src = new Float64Array(n);
  const dstA = new Float64Array(n);
  const dstB = new Float64Array(n);
  let k = 0;
  for (let r = 0; r <= grid; r++) {
    for (let c = 0; c <= grid; c++) {
      const g = { x: (c / grid) * view.boxW, y: (r / grid) * view.boxH };
      src[k] = g.x; src[k + 1] = g.y;
      const fa = mlsRigid(g, pA, pT);
      dstA[k] = fa.x; dstA[k + 1] = fa.y;
      const fb = mlsRigid(g, pB, pT);
      dstB[k] = fb.x; dstB[k + 1] = fb.y;
      k += 2;
    }
  }
  return { cols: grid, rows: grid, src, dstA, dstB };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/renderer/morph-field.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/morph-field.ts src/renderer/morph-field.test.ts
git commit -m "Add the rigid MLS warp field for image morphs"
```

---

### Task 3: Morph drawing

**Files:**
- Create: `src/test-utils/node-canvas.ts`
- Create: `src/renderer/draw-morph.ts`
- Test: `src/renderer/draw-morph.test.ts`

**Interfaces:**
- Consumes: `fitRect` (Task 1), `buildMorphMesh`, `MorphView`, `MorphMesh` (Task 2).
- Produces:
  - `const MORPH_GRID = 24`
  - `interface MorphDrawInput { a: ImageBitmap; b: ImageBitmap; fitMode: ImageFitMode; pairs: readonly MorphPair[]; t: number; width: number; height: number; grid?: number }`
  - `renderMorph(m: MorphDrawInput): HTMLCanvasElement` — a `round(width)×round(height)` canvas holding the morphed layer content. May return a cached canvas: callers only read it.
  - test utils: `installCanvasDocument()`, `bitmap(w, h, paint)`, `rgba(canvas, x, y)`.

- [ ] **Step 1: Write the test utilities**

`src/test-utils/node-canvas.ts`:

```ts
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
```

- [ ] **Step 2: Write the failing tests**

`src/renderer/draw-morph.test.ts`:

```ts
// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { renderMorph } from './draw-morph';
import { bitmap, installCanvasDocument, rgba, solid } from '../test-utils/node-canvas';
import type { MorphPair } from '../types';

beforeAll(installCanvasDocument);

const S = 40;
const RED = solid(S, S, '#ff0000');
const BLUE = solid(S, S, '#0000ff');

function draw(a: ImageBitmap, b: ImageBitmap, t: number, pairs: MorphPair[] = []) {
  return renderMorph({ a, b, fitMode: 'fill', pairs, t, width: S, height: S });
}

describe('renderMorph', () => {
  it('is (almost) image A just after t = 0', () => {
    const [r, g, b, a] = rgba(draw(RED, BLUE, 0.001), 20, 20);
    expect(r).toBeGreaterThanOrEqual(253);
    expect(g).toBe(0);
    expect(b).toBeLessThanOrEqual(2);
    expect(a).toBe(255);
  });

  it('is (almost) image B just before t = 1', () => {
    const [r, , b] = rgba(draw(RED, BLUE, 0.999), 20, 20);
    expect(r).toBeLessThanOrEqual(2);
    expect(b).toBeGreaterThanOrEqual(253);
  });

  it('cross-dissolves evenly at t = 0.5 with no pairs', () => {
    const [r, , b, a] = rgba(draw(RED, BLUE, 0.5), 20, 20);
    expect(r).toBeGreaterThanOrEqual(126);
    expect(r).toBeLessThanOrEqual(129);
    expect(b).toBeGreaterThanOrEqual(126);
    expect(b).toBeLessThanOrEqual(129);
    expect(a).toBe(255);
  });

  it('leaves no seams between triangles', () => {
    const out = draw(RED, BLUE, 0.5, [{
      id: 'p', a: { x: 0.3, y: 0.4 }, b: { x: 0.6, y: 0.5 }, source: 'manual',
    }]);
    const data = (out.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, S, S).data;
    let minAlpha = 255;
    for (let i = 3; i < data.length; i += 4) minAlpha = Math.min(minAlpha, data[i]);
    expect(minAlpha).toBeGreaterThanOrEqual(254);
  });

  it('carries a matched feature to the in-between spot', () => {
    // A red dot at (10,20) in A and at (30,20) in B, matched by one pair.
    // At t = 0.5 both warped images put their dot at (20,20).
    const dotAt = (cx: number) => bitmap(S, S, (ctx) => {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, S, S);
      ctx.fillStyle = '#ff0000'; ctx.fillRect(cx - 2, 18, 4, 4);
    });
    const out = draw(dotAt(10), dotAt(30), 0.5, [{
      id: 'dot', a: { x: 10 / S, y: 20 / S }, b: { x: 30 / S, y: 20 / S }, source: 'manual',
    }]);
    const [, gMid] = rgba(out, 20, 20);
    const [, gOld] = rgba(out, 10, 20);
    expect(gMid).toBeLessThan(80);      // red where the dot travelled to
    expect(gOld).toBeGreaterThan(200);  // white where it left
  });

  it('fades a cutout without leaving A behind where B is transparent', () => {
    // source-over would keep A fully opaque under B; the additive blend
    // leaves only (1 − t) of A: 0.01 × 255 ≈ 3.
    const clear = bitmap(S, S, () => {});
    const [, , , a] = rgba(draw(RED, clear, 0.99), 20, 20);
    expect(a).toBeLessThanOrEqual(3);
  });

  it('clamps the blend weights when the easing overshoots', () => {
    // t = 1.2: A's weight must be 0, not −0.2 (canvas ignores a negative
    // globalAlpha and would draw A at full strength).
    const clear = bitmap(S, S, () => {});
    const [, , , a] = rgba(draw(RED, clear, 1.2), 20, 20);
    expect(a).toBe(0);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/renderer/draw-morph.test.ts`
Expected: FAIL — cannot resolve `./draw-morph`.

- [ ] **Step 4: Implement `draw-morph.ts`**

```ts
import type { ImageFitMode, MorphPair } from '../types';
import { fitRect } from './fit';
import { buildMorphMesh, type MorphMesh, type MorphView } from './morph-field';

/** Grid cells per side. Tuned by the performance check (spec: ≤ 33 ms at 1080²). */
export const MORPH_GRID = 24;

/** How far each destination triangle is pushed out from its centroid, so the
 *  antialiased edges of neighbours overlap instead of leaving hairline gaps. */
const SEAM_PX = 0.75;

/** Source-rect margin around each triangle, in texture px. */
const SRC_MARGIN = 2;

export interface MorphDrawInput {
  a: ImageBitmap;
  b: ImageBitmap;
  fitMode: ImageFitMode;
  pairs: readonly MorphPair[];
  t: number;
  width: number;
  height: number;
  grid?: number;
}

function blank(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return ctx;
}

// One fitted texture per bitmap, rebuilt when the fit or box size changes.
const fittedCache = new WeakMap<object, { key: string; canvas: HTMLCanvasElement }>();

/** The bitmap under its fit in a box-sized canvas — the texture the warp samples. */
function fitted(bitmap: ImageBitmap, fitMode: ImageFitMode, w: number, h: number): HTMLCanvasElement {
  const key = `${fitMode}:${w}x${h}`;
  const hit = fittedCache.get(bitmap);
  if (hit && hit.key === key) return hit.canvas;
  const canvas = blank(w, h);
  const r = fitRect(fitMode, bitmap.width, bitmap.height, w, h);
  ctx2d(canvas).drawImage(bitmap, r.x, r.y, r.w, r.h);
  fittedCache.set(bitmap, { key, canvas });
  return canvas;
}

/** Draw one textured triangle: source (s) triangle of `tex` onto destination (d). */
function drawTriangle(
  ctx: CanvasRenderingContext2D,
  tex: HTMLCanvasElement,
  s: Float64Array,
  d: Float64Array,
  i0: number, i1: number, i2: number,
): void {
  const sx0 = s[i0], sy0 = s[i0 + 1], sx1 = s[i1], sy1 = s[i1 + 1], sx2 = s[i2], sy2 = s[i2 + 1];
  const dx0 = d[i0], dy0 = d[i0 + 1], dx1 = d[i1], dy1 = d[i1 + 1], dx2 = d[i2], dy2 = d[i2 + 1];

  const ux1 = sx1 - sx0, uy1 = sy1 - sy0, ux2 = sx2 - sx0, uy2 = sy2 - sy0;
  const det = ux1 * uy2 - ux2 * uy1;
  if (Math.abs(det) < 1e-9) return;
  const vx1 = dx1 - dx0, vy1 = dy1 - dy0, vx2 = dx2 - dx0, vy2 = dy2 - dy0;
  // Affine map taking the source triangle onto the destination triangle.
  const a = (vx1 * uy2 - vx2 * uy1) / det;
  const b = (vy1 * uy2 - vy2 * uy1) / det;
  const c = (vx2 * ux1 - vx1 * ux2) / det;
  const dd = (vy2 * ux1 - vy1 * ux2) / det;
  const e = dx0 - a * sx0 - c * sy0;
  const f = dy0 - b * sx0 - dd * sy0;

  const cx = (dx0 + dx1 + dx2) / 3;
  const cy = (dy0 + dy1 + dy2) / 3;
  const push = (x: number, y: number): [number, number] => {
    const ox = x - cx, oy = y - cy;
    const len = Math.hypot(ox, oy) || 1;
    return [x + (ox / len) * SEAM_PX, y + (oy / len) * SEAM_PX];
  };

  // Only the triangle's neighbourhood of the texture is drawn: a full-texture
  // draw per triangle costs area × triangles on CPU and GPU canvases alike.
  const minX = Math.max(0, Math.floor(Math.min(sx0, sx1, sx2)) - SRC_MARGIN);
  const minY = Math.max(0, Math.floor(Math.min(sy0, sy1, sy2)) - SRC_MARGIN);
  const maxX = Math.min(tex.width, Math.ceil(Math.max(sx0, sx1, sx2)) + SRC_MARGIN);
  const maxY = Math.min(tex.height, Math.ceil(Math.max(sy0, sy1, sy2)) + SRC_MARGIN);
  if (maxX <= minX || maxY <= minY) return;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(...push(dx0, dy0));
  ctx.lineTo(...push(dx1, dy1));
  ctx.lineTo(...push(dx2, dy2));
  ctx.closePath();
  ctx.clip();
  ctx.transform(a, b, c, dd, e, f);
  ctx.drawImage(tex, minX, minY, maxX - minX, maxY - minY, minX, minY, maxX - minX, maxY - minY);
  ctx.restore();
}

function warp(target: HTMLCanvasElement, tex: HTMLCanvasElement, mesh: MorphMesh, dst: Float64Array): void {
  const ctx = ctx2d(target);
  const stride = mesh.cols + 1;
  for (let r = 0; r < mesh.rows; r++) {
    for (let c = 0; c < mesh.cols; c++) {
      const i00 = (r * stride + c) * 2;
      const i10 = i00 + 2;
      const i01 = i00 + stride * 2;
      const i11 = i01 + 2;
      drawTriangle(ctx, tex, mesh.src, dst, i00, i10, i11);
      drawTriangle(ctx, tex, mesh.src, dst, i00, i11, i01);
    }
  }
}

/**
 * The morphed layer content at progress t, in a box-sized canvas.
 *
 * Each image is warped toward the in-between point positions at full opacity
 * (so the seam overlap is invisible), then the two are blended additively:
 * (1 − τ)·A + τ·B in premultiplied space, with τ = clamp(t). That is exact,
 * transparency included, so a cutout fades without leaving A behind.
 */
export function renderMorph(m: MorphDrawInput): HTMLCanvasElement {
  const w = Math.max(1, Math.round(m.width));
  const h = Math.max(1, Math.round(m.height));
  const texA = fitted(m.a, m.fitMode, w, h);
  if (m.t === 0) return texA;
  const texB = fitted(m.b, m.fitMode, w, h);
  if (m.t === 1) return texB;

  const view: MorphView = {
    fitMode: m.fitMode,
    sizeA: { w: m.a.width, h: m.a.height },
    sizeB: { w: m.b.width, h: m.b.height },
    boxW: w,
    boxH: h,
  };
  const mesh = buildMorphMesh(view, m.pairs, m.t, m.grid ?? MORPH_GRID);

  const warpedA = blank(w, h);
  warp(warpedA, texA, mesh, mesh.dstA);
  const warpedB = blank(w, h);
  warp(warpedB, texB, mesh, mesh.dstB);

  const tau = Math.max(0, Math.min(1, m.t));
  const out = blank(w, h);
  const o = ctx2d(out);
  o.globalAlpha = 1 - tau;
  o.drawImage(warpedA, 0, 0);
  o.globalAlpha = tau;
  o.globalCompositeOperation = 'lighter';
  o.drawImage(warpedB, 0, 0);
  return out;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/renderer/draw-morph.test.ts`
Expected: PASS (7 tests). If the seam test fails with a min alpha of 253, the node-canvas rounding differs by one: check which pixel, and only if it lies on a triangle edge raise `SEAM_PX` to 1.

- [ ] **Step 6: Commit**

```bash
git add src/test-utils/node-canvas.ts src/renderer/draw-morph.ts src/renderer/draw-morph.test.ts
git commit -m "Draw image morphs as warped, additively blended triangle meshes"
```

---

### Task 4: Morph inside image layers, plus the performance check

**Files:**
- Modify: `src/renderer/draw-image.ts`
- Test: `src/renderer/draw-image-morph.test.ts`
- Create: `src/renderer/draw-morph.perf.test.ts` (skipped unless `MORPH_PERF=1`)

**Interfaces:**
- Consumes: `renderMorph` (Task 3), `resolveNumericProperty` (existing).
- Produces: image layers with `morph` render the morph; `morphProgress` keyframes drive it.

- [ ] **Step 1: Write the failing tests**

`src/renderer/draw-image-morph.test.ts`:

```ts
// @vitest-environment node
//
// Drawn through drawSceneLayers, the entry the preview and exporter use. The
// layer starts at scene frame 5 so layer frames differ from scene frames.
import { beforeAll, describe, expect, it } from 'vitest';
import { createCanvas } from 'canvas';
import { drawSceneLayers } from './draw';
import type { MediaCache } from './media-cache';
import type { ImageLayerData, Scene } from '../types';
import { installCanvasDocument, solid } from '../test-utils/node-canvas';

beforeAll(installCanvasDocument);

const S = 40;
const START = 5;

function layer(over: Partial<ImageLayerData> = {}): ImageLayerData {
  return {
    id: 'l1', name: 'img', type: 'image', startFrame: START, endFrame: START + 30,
    x: 0, y: 0, width: S, height: S, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1,
    anchorX: 0, anchorY: 0, zIndex: 0, blendMode: 'normal', effects: [],
    visible: true, locked: false, src: 'a.png', fitMode: 'fill', borderRadius: 0,
    morph: { target: 'b.png', pairs: [], progress: 0 },
    keyframes: {
      morphProgress: { keyframes: [
        { frame: 0, value: 0, easing: 'linear' },
        { frame: 10, value: 1, easing: 'linear' },
      ] },
    },
    ...over,
  };
}

function centre(l: ImageLayerData, frameInScene: number, media: MediaCache): number[] {
  const scene: Scene = {
    id: 's', label: 's', durationFrames: 60, backgroundColor: '#000',
    layers: [l], transition: 'cut', transitionDurationFrames: 0,
  };
  const canvas = createCanvas(S, S);
  drawSceneLayers(canvas.getContext('2d') as unknown as CanvasRenderingContext2D, scene, frameInScene, S, S, media);
  return Array.from(canvas.getContext('2d').getImageData(20, 20, 1, 1).data);
}

const both = (): MediaCache => new Map([['a.png', solid(S, S, '#ff0000')], ['b.png', solid(S, S, '#0000ff')]]);

describe('image layer morph', () => {
  it('shows image A at the start of the morphProgress track', () => {
    expect(centre(layer(), START, both())).toEqual([255, 0, 0, 255]);
  });

  it('shows image B once the track reaches 1', () => {
    expect(centre(layer(), START + 10, both())).toEqual([0, 0, 255, 255]);
  });

  it('falls back to image A while the target is not loaded', () => {
    const onlyA: MediaCache = new Map([['a.png', solid(S, S, '#ff0000')]]);
    expect(centre(layer(), START + 10, onlyA)).toEqual([255, 0, 0, 255]);
  });

  it('uses the static progress when there is no track', () => {
    const l = layer({ keyframes: {}, morph: { target: 'b.png', pairs: [], progress: 1 } });
    expect(centre(l, START, both())).toEqual([0, 0, 255, 255]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/renderer/draw-image-morph.test.ts`
Expected: the "image B" and "static progress" tests FAIL (red drawn instead of blue).

- [ ] **Step 3: Implement**

In `src/renderer/draw-image.ts` add `import { renderMorph } from './draw-morph';` and, below `overflowsBox`:

```ts
/** The morphed content for this frame, or null to draw the plain image. */
function morphContent(
  layer: ImageLayerData,
  bitmap: ImageBitmap,
  mediaCache: MediaCache,
  frameInLayer: number,
  dw: number,
  dh: number,
): HTMLCanvasElement | null {
  const morph = layer.morph;
  if (!morph) return null;
  const target = mediaCache.get(morph.target);
  if (!target) return null; // Target still loading — show the plain image meanwhile
  const t = resolveNumericProperty(layer.keyframes, 'morphProgress', frameInLayer, morph.progress);
  return renderMorph({
    a: bitmap, b: target, fitMode: layer.fitMode, pairs: morph.pairs, t, width: dw, height: dh,
  });
}
```

In `drawImageLayer`, after the `borderRadius`/overflow clip block, add:

```ts
  // Rendered once and drawn wherever the plain image would be — the tint path
  // draws the content twice (colour, then alpha mask).
  const morphed = morphContent(layer, bitmap, mediaCache, frameInLayer, dw, dh);
  const drawContent = (target: CanvasRenderingContext2D) => {
    if (morphed) target.drawImage(morphed, 0, 0, dw, dh);
    else drawFitted(target, bitmap, layer.fitMode, dw, dh);
  };
```

Then replace each of the four `drawFitted(ctx|tctx, bitmap, layer.fitMode, dw, dh)` calls below with `drawContent(ctx)` / `drawContent(tctx)`.

- [ ] **Step 4: Run all tests and type-check**

Run: `npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Add the performance check**

`src/renderer/draw-morph.perf.test.ts`:

```ts
// @vitest-environment node
//
// Not a pass/fail gate: prints how long one 1080² morph frame takes, as a
// proxy for the webview budget (≤ 33 ms). Run with MORPH_PERF=1.
import { beforeAll, describe, expect, it } from 'vitest';
import { renderMorph } from './draw-morph';
import { installCanvasDocument, bitmap } from '../test-utils/node-canvas';
import type { MorphPair } from '../types';

const enabled = typeof process !== 'undefined' && process.env.MORPH_PERF === '1';

beforeAll(installCanvasDocument);

describe.skipIf(!enabled)('renderMorph performance', () => {
  it('times a 1080 × 1080 frame with 40 pairs', () => {
    const img = (hue: number) => bitmap(1080, 1080, (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 1080, 1080);
      g.addColorStop(0, `hsl(${hue},70%,50%)`);
      g.addColorStop(1, `hsl(${hue + 120},70%,50%)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 1080, 1080);
    });
    const a = img(0), b = img(200);
    const pairs: MorphPair[] = Array.from({ length: 40 }, (_, i) => ({
      id: `p${i}`, source: 'auto', confidence: 0.7,
      a: { x: 0.1 + (i % 8) * 0.1, y: 0.1 + Math.floor(i / 8) * 0.15 },
      b: { x: 0.12 + (i % 8) * 0.1, y: 0.08 + Math.floor(i / 8) * 0.15 },
    }));
    renderMorph({ a, b, fitMode: 'fill', pairs, t: 0.4, width: 1080, height: 1080 }); // warm the texture cache
    const runs = 5;
    const t0 = performance.now();
    for (let i = 0; i < runs; i++) {
      renderMorph({ a, b, fitMode: 'fill', pairs, t: 0.3 + i * 0.1, width: 1080, height: 1080 });
    }
    const ms = (performance.now() - t0) / runs;
    console.log(`renderMorph 1080² (node-canvas): ${ms.toFixed(1)} ms/frame`);
    expect(ms).toBeGreaterThan(0);
  });
});
```

This file uses `process`, which the shim from Task 9 declares; until then add the one line `declare const process: { env: Record<string, string | undefined> } | undefined;` at the top of `src/test-utils/node-shims.d.ts` (create the file now with that line; Task 9 adds the `node:fs` module to it).

- [ ] **Step 6: Measure**

Run: `MORPH_PERF=1 npx vitest run src/renderer/draw-morph.perf.test.ts`
Record the number. Then in the dev server (Chromium pane), time the same call from the console via `await import('/src/renderer/draw-morph.ts')` with two 1080² canvases (Task 15 repeats this). If Chromium exceeds 33 ms, lower `MORPH_GRID` to 16 and re-measure; note the final value in the commit message.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/draw-image.ts src/renderer/draw-image-morph.test.ts src/renderer/draw-morph.perf.test.ts src/test-utils/node-shims.d.ts
git commit -m "Render image morphs inside image layers, driven by morphProgress"
```

---

### Task 5: Asset wiring for the morph target

**Files:**
- Create: `src/lib/asset-refs.ts`
- Modify: `src/lib/asset-manager.ts` (`rewriteAssetPaths`, `bundleAssets`, remove `hasAssetSrc`)
- Modify: `src/lib/asset-utils.ts` (`scanCompositionAssets`)
- Modify: `src/renderer/media-cache.ts` (export `getImageSources`, use `assetRefs`)
- Test: `src/lib/asset-refs.test.ts`

**Interfaces:**
- Produces: `interface AssetRef { kind: 'image' | 'video' | 'audio'; get(): string; set(value: string): void }`, `assetRefs(layer: Layer): AssetRef[]`; `getImageSources(layers: Layer[]): string[]` (now exported).

- [ ] **Step 1: Write the failing tests**

`src/lib/asset-refs.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { Composition, ImageLayerData } from '../types';

vi.mock('@tauri-apps/plugin-fs', () => ({}));
vi.mock('@tauri-apps/api/path', () => ({}));

const { assetRefs } = await import('./asset-refs');
const { rewriteAssetPaths } = await import('./asset-manager');
const { scanCompositionAssets } = await import('./asset-utils');
const { getImageSources } = await import('../renderer/media-cache');

function image(morphTarget?: string): ImageLayerData {
  return {
    id: 'l1', name: 'Hero', type: 'image', startFrame: 0, endFrame: 30,
    x: 0, y: 0, width: 100, height: 100, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1,
    anchorX: 0, anchorY: 0, zIndex: 0, blendMode: 'normal', effects: [],
    visible: true, locked: false, keyframes: {},
    src: '/abs/a.png', fitMode: 'cover', borderRadius: 0,
    morph: morphTarget === undefined ? undefined : { target: morphTarget, pairs: [], progress: 0 },
  };
}

function comp(l: ImageLayerData): Composition {
  return {
    id: 'c', name: 'c', output: { id: 'o', label: 'o', width: 100, height: 100, fps: 30 },
    scenes: [{ id: 's', label: 'Intro', durationFrames: 30, backgroundColor: '#000', layers: [l], transition: 'cut', transitionDurationFrames: 0 }],
  };
}

describe('assetRefs', () => {
  it('lists only src for a plain image', () => {
    expect(assetRefs(image()).map((r) => r.get())).toEqual(['/abs/a.png']);
  });

  it('adds the morph target and writes through to it', () => {
    const l = image('/abs/b.png');
    const refs = assetRefs(l);
    expect(refs.map((r) => r.get())).toEqual(['/abs/a.png', '/abs/b.png']);
    refs[1].set('assets/b.png');
    expect(l.morph?.target).toBe('assets/b.png');
  });
});

describe('morph target reaches every asset consumer', () => {
  it('is rewritten with src', () => {
    const out = rewriteAssetPaths(comp(image('/abs/b.png')), (p) => p.replace('/abs/', 'assets/'));
    const l = out.scenes[0].layers[0] as ImageLayerData;
    expect([l.src, l.morph?.target]).toEqual(['assets/a.png', 'assets/b.png']);
  });

  it('is preloaded', () => {
    expect(getImageSources([image('/abs/b.png')])).toEqual(['/abs/a.png', '/abs/b.png']);
  });

  it('is listed in the asset panel', () => {
    expect(scanCompositionAssets(comp(image('/abs/b.png'))).map((r) => [r.path, r.type])).toEqual([
      ['/abs/a.png', 'image'], ['/abs/b.png', 'image'],
    ]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/asset-refs.test.ts`
Expected: FAIL — cannot resolve `./asset-refs`.

- [ ] **Step 3: Implement `asset-refs.ts`**

```ts
import type { Layer } from '../types';

export interface AssetRef {
  kind: 'image' | 'video' | 'audio';
  get(): string;
  set(value: string): void;
}

/**
 * Every asset path a layer points at: its own `src`, plus an image's morph
 * target. Saving, bundling, preloading and the asset panel all walk this one
 * list, so a new asset field only has to be added here.
 */
export function assetRefs(layer: Layer): AssetRef[] {
  const refs: AssetRef[] = [];
  if (layer.type === 'image' || layer.type === 'video' || layer.type === 'audio') {
    const l = layer;
    refs.push({ kind: l.type, get: () => l.src, set: (v) => { l.src = v; } });
  }
  if (layer.type === 'image' && layer.morph) {
    const morph = layer.morph;
    refs.push({ kind: 'image', get: () => morph.target, set: (v) => { morph.target = v; } });
  }
  return refs;
}
```

- [ ] **Step 4: Route the four consumers through it**

`src/lib/asset-manager.ts` — import `assetRefs` from `./asset-refs`; in `rewriteAssetPaths` replace the layer loop body with:

```ts
    for (const layer of scene.layers) {
      for (const ref of assetRefs(layer)) ref.set(fn(ref.get()));
    }
```

in `bundleAssets` replace the layer loop with:

```ts
    for (const layer of scene.layers) {
      for (const ref of assetRefs(layer)) {
        ref.set(await bundleAssetSrc(ref.get(), `layer "${layer.name}"`, projectDir));
      }
    }
```

and delete `hasAssetSrc`. Remove `Layer` from the type import if it becomes unused.

`src/lib/asset-utils.ts` — replace `scanCompositionAssets` with:

```ts
export function scanCompositionAssets(composition: Composition): AssetReference[] {
  const refs: AssetReference[] = [];
  composition.scenes.forEach((scene, sceneIndex) => {
    for (const layer of scene.layers) {
      for (const ref of assetRefs(layer)) {
        const path = ref.get();
        if (!path) continue;
        refs.push({
          path, type: ref.kind, layerName: layer.name,
          sceneLabel: scene.label, sceneIndex, layerId: layer.id,
        });
      }
    }
  });
  return refs;
}
```

with `import type { Composition } from '../types';` and `import { assetRefs } from './asset-refs';` (drop the now-unused layer type imports).

`src/renderer/media-cache.ts` — import `assetRefs` from `../lib/asset-refs` and replace `getImageSources` with:

```ts
export function getImageSources(layers: Layer[]): string[] {
  const sources: string[] = [];
  for (const layer of layers) {
    for (const ref of assetRefs(layer)) {
      if (ref.kind === 'image' && ref.get()) sources.push(ref.get());
    }
  }
  return sources;
}
```

- [ ] **Step 5: Run all tests and type-check**

Run: `npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/asset-refs.ts src/lib/asset-refs.test.ts src/lib/asset-manager.ts src/lib/asset-utils.ts src/renderer/media-cache.ts
git commit -m "Route every layer asset path through assetRefs, including morph targets"
```

---

### Task 6: Pair editing logic

**Files:**
- Create: `src/lib/morph-edit.ts`
- Test: `src/lib/morph-edit.test.ts`

**Interfaces:**
- Consumes: `fitRect`, `uvToBox`, `boxToUv` (Task 1); `mlsRigid`, `morphControls`, `MorphView` (Task 2).
- Produces:
  - `MANUAL_CLEARANCE = 0.04`
  - `newPairId(): string`
  - `predictPartner(pairs, view, side: 'a' | 'b', uv: MorphPoint): MorphPoint`
  - `addPair(pairs, view, side, uv, id): MorphPair[]`
  - `movePoint(pairs, id, side, to): MorphPair[]`
  - `deletePair(pairs, id): MorphPair[]`
  - `clearAuto(pairs): MorphPair[]`
  - `mergeAuto(existing, incoming): MorphPair[]`
  - `enableMorph(layer: ImageLayerData, target: string): Partial<ImageLayerData>`
  - `disableMorph(layer: ImageLayerData): Partial<ImageLayerData>`

- [ ] **Step 1: Write the failing tests**

`src/lib/morph-edit.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  addPair, clearAuto, disableMorph, enableMorph, mergeAuto, movePoint, predictPartner,
} from './morph-edit';
import type { MorphView } from '../renderer/morph-field';
import type { ImageLayerData, MorphPair } from '../types';

const square: MorphView = {
  fitMode: 'fill', sizeA: { w: 100, h: 100 }, sizeB: { w: 100, h: 100 }, boxW: 100, boxH: 100,
};

const auto = (id: string, a: [number, number], b: [number, number]): MorphPair =>
  ({ id, a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] }, source: 'auto', confidence: 0.8 });
const manual = (id: string, a: [number, number], b: [number, number]): MorphPair =>
  ({ id, a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] }, source: 'manual' });

describe('predictPartner', () => {
  it('predicts the same spot when nothing is matched yet', () => {
    const p = predictPartner([], square, 'a', { x: 0.3, y: 0.6 });
    expect(p.x).toBeCloseTo(0.3, 9);
    expect(p.y).toBeCloseTo(0.6, 9);
  });

  it('predicts the partner of an existing point exactly', () => {
    const p = predictPartner([manual('m', [0.5, 0.5], [0.6, 0.5])], square, 'a', { x: 0.5, y: 0.5 });
    expect(p).toEqual({ x: 0.6, y: 0.5 });
  });

  it('works through different fits', () => {
    // box 100². A 200×100 contain → rect (0,25,100,50); B 100×200 → (25,0,50,100).
    // uv_a (0.25,0.5) → box (25,50) → uv_b ((25−25)/50, 50/100) = (0, 0.5).
    const view: MorphView = { fitMode: 'contain', sizeA: { w: 200, h: 100 }, sizeB: { w: 100, h: 200 }, boxW: 100, boxH: 100 };
    const p = predictPartner([], view, 'a', { x: 0.25, y: 0.5 });
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.y).toBeCloseTo(0.5, 9);
  });

  it('predicts from B back to A', () => {
    const p = predictPartner([manual('m', [0.5, 0.5], [0.6, 0.5])], square, 'b', { x: 0.6, y: 0.5 });
    expect(p).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe('addPair', () => {
  it('adds a manual pair with the clicked point on the clicked side', () => {
    const pairs = addPair([], square, 'b', { x: 0.2, y: 0.7 }, 'new');
    expect(pairs).toHaveLength(1);
    expect(pairs[0].id).toBe('new');
    expect(pairs[0].source).toBe('manual');
    expect(pairs[0].b).toEqual({ x: 0.2, y: 0.7 });
    expect(pairs[0].a.x).toBeCloseTo(0.2, 9);
  });
});

describe('movePoint', () => {
  it('moves one side and makes an auto pair manual', () => {
    const [moved] = movePoint([auto('p', [0.1, 0.1], [0.2, 0.2])], 'p', 'b', { x: 0.3, y: 0.3 });
    expect(moved.a).toEqual({ x: 0.1, y: 0.1 });
    expect(moved.b).toEqual({ x: 0.3, y: 0.3 });
    expect(moved.source).toBe('manual');
    expect('confidence' in moved).toBe(false);
  });
});

describe('clearAuto', () => {
  it('keeps only manual pairs', () => {
    const pairs = [auto('x', [0, 0], [0, 0]), manual('m', [1, 1], [1, 1])];
    expect(clearAuto(pairs).map((p) => p.id)).toEqual(['m']);
  });
});

describe('mergeAuto', () => {
  it('replaces old auto pairs, keeps manual ones, and skips auto pairs next to manual ones', () => {
    const existing = [auto('old', [0.9, 0.9], [0.9, 0.9]), manual('m', [0.5, 0.5], [0.5, 0.5])];
    const incoming = [
      auto('nearA', [0.51, 0.5], [0.1, 0.1]),   // a within 0.04 of the manual a
      auto('nearB', [0.1, 0.1], [0.5, 0.52]),   // b within 0.04 of the manual b
      auto('free', [0.2, 0.2], [0.25, 0.2]),
    ];
    expect(mergeAuto(existing, incoming).map((p) => p.id)).toEqual(['m', 'free']);
  });
});

function img(): ImageLayerData {
  return {
    id: 'l', name: 'l', type: 'image', startFrame: 10, endFrame: 40,
    x: 0, y: 0, width: 100, height: 100, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1,
    anchorX: 0, anchorY: 0, zIndex: 0, blendMode: 'normal', effects: [],
    visible: true, locked: false, src: 'a.png', fitMode: 'cover', borderRadius: 0,
    keyframes: { opacity: { keyframes: [{ frame: 0, value: 1, easing: 'linear' }] } },
  };
}

describe('enableMorph / disableMorph', () => {
  it('seeds a 0 → 1 ease-in-out track over the layer’s own frames', () => {
    const patch = enableMorph(img(), 'b.png');
    expect(patch.morph).toEqual({ target: 'b.png', pairs: [], progress: 0 });
    expect(patch.keyframes?.morphProgress.keyframes).toEqual([
      { frame: 0, value: 0, easing: 'ease-in-out' },
      { frame: 29, value: 1, easing: 'linear' },
    ]);
    expect(patch.keyframes?.opacity).toBeDefined();
  });

  it('removes the morph and its track, and nothing else', () => {
    const on = { ...img(), ...enableMorph(img(), 'b.png') } as ImageLayerData;
    const patch = disableMorph(on);
    expect(patch.morph).toBeNull();
    expect(Object.keys(patch.keyframes ?? {})).toEqual(['opacity']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/morph-edit.test.ts`
Expected: FAIL — cannot resolve `./morph-edit`.

- [ ] **Step 3: Implement `morph-edit.ts`**

```ts
import type { ImageLayerData, KeyframeTrack, MorphPair, MorphPoint } from '../types';
import { boxToUv, fitRect, uvToBox } from '../renderer/fit';
import { mlsRigid, morphControls, type MorphView } from '../renderer/morph-field';

/** Auto-match never places a pair this close (UV) to a manual point. */
export const MANUAL_CLEARANCE = 0.04;

export function newPairId(): string {
  return `pair-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Where a point clicked on one image most likely sits on the other: push it
 * through the warp the existing pairs (and pinned border) already define.
 */
export function predictPartner(
  pairs: readonly MorphPair[],
  view: MorphView,
  side: 'a' | 'b',
  uv: MorphPoint,
): MorphPoint {
  const { pA, pB } = morphControls(view, pairs);
  const rA = fitRect(view.fitMode, view.sizeA.w, view.sizeA.h, view.boxW, view.boxH);
  const rB = fitRect(view.fitMode, view.sizeB.w, view.sizeB.h, view.boxW, view.boxH);
  if (side === 'a') return boxToUv(mlsRigid(uvToBox(uv, rA), pA, pB), rB);
  return boxToUv(mlsRigid(uvToBox(uv, rB), pB, pA), rA);
}

export function addPair(
  pairs: readonly MorphPair[],
  view: MorphView,
  side: 'a' | 'b',
  uv: MorphPoint,
  id: string,
): MorphPair[] {
  const partner = predictPartner(pairs, view, side, uv);
  const pair: MorphPair = side === 'a'
    ? { id, a: uv, b: partner, source: 'manual' }
    : { id, a: partner, b: uv, source: 'manual' };
  return [...pairs, pair];
}

/** Moving a point makes the pair the user's: manual, with no auto confidence. */
export function movePoint(
  pairs: readonly MorphPair[],
  id: string,
  side: 'a' | 'b',
  to: MorphPoint,
): MorphPair[] {
  return pairs.map((p) => p.id !== id ? p : {
    id: p.id,
    a: side === 'a' ? to : p.a,
    b: side === 'b' ? to : p.b,
    source: 'manual',
  });
}

export function deletePair(pairs: readonly MorphPair[], id: string): MorphPair[] {
  return pairs.filter((p) => p.id !== id);
}

export function clearAuto(pairs: readonly MorphPair[]): MorphPair[] {
  return pairs.filter((p) => p.source === 'manual');
}

/** Fresh auto pairs replace old ones; manual pairs always survive, untouched. */
export function mergeAuto(existing: readonly MorphPair[], incoming: readonly MorphPair[]): MorphPair[] {
  const manual = clearAuto(existing);
  const near = (u: MorphPoint, v: MorphPoint) => Math.hypot(u.x - v.x, u.y - v.y) < MANUAL_CLEARANCE;
  const kept = incoming.filter((p) => !manual.some((m) => near(m.a, p.a) || near(m.b, p.b)));
  return [...manual, ...kept];
}

/** Turn a morph on, with a 0 → 1 track across the layer so it works at once. */
export function enableMorph(layer: ImageLayerData, target: string): Partial<ImageLayerData> {
  const last = Math.max(1, layer.endFrame - layer.startFrame - 1);
  const track: KeyframeTrack = {
    keyframes: [
      { frame: 0, value: 0, easing: 'ease-in-out' },
      { frame: last, value: 1, easing: 'linear' },
    ],
  };
  return {
    morph: { target, pairs: [], progress: 0 },
    keyframes: { ...layer.keyframes, morphProgress: track },
  };
}

export function disableMorph(layer: ImageLayerData): Partial<ImageLayerData> {
  const keyframes = { ...layer.keyframes };
  delete keyframes.morphProgress;
  return { morph: null, keyframes };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/morph-edit.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/morph-edit.ts src/lib/morph-edit.test.ts
git commit -m "Add pure pair-editing helpers for image morphs"
```

---

### Task 7: Editor pane geometry

**Files:**
- Create: `src/lib/morph-pane.ts`
- Test: `src/lib/morph-pane.test.ts`

**Interfaces:**
- Consumes: `Vec2` (Task 1).
- Produces: `interface PaneView { zoom; panX; panY }`, `DEFAULT_VIEW`, `interface PaneXf { s; x; y }` (screen = box·s + (x, y)), `paneXf(cw, ch, boxW, boxH, view): PaneXf`, `toBox(xf, sx, sy): Vec2`, `toScreen(xf, p): Vec2`, `zoomAt(cw, ch, boxW, boxH, view, sx, sy, factor): PaneView`, `hitPoint(points: {id,x,y}[], sx, sy, radius): string | null`.

- [ ] **Step 1: Write the failing tests**

`src/lib/morph-pane.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW, hitPoint, paneXf, toBox, zoomAt } from './morph-pane';

// Pane 232² with a 16 px margin leaves 200² for a 100² box: s = 2, origin (16,16).
describe('paneXf', () => {
  it('fits the box with a margin, centred', () => {
    expect(paneXf(232, 232, 100, 100, DEFAULT_VIEW)).toEqual({ s: 2, x: 16, y: 16 });
  });
});

describe('zoomAt', () => {
  it('keeps the box point under the cursor fixed', () => {
    // Cursor (66,66) is box (25,25). At zoom 2, s = 4 and the unpanned origin
    // is (232 − 400)/2 = −84, so (25,25) would sit at 16; pan by 50 to keep it at 66.
    const v = zoomAt(232, 232, 100, 100, DEFAULT_VIEW, 66, 66, 2);
    expect(v).toEqual({ zoom: 2, panX: 50, panY: 50 });
    const p = toBox(paneXf(232, 232, 100, 100, v), 66, 66);
    expect(p).toEqual({ x: 25, y: 25 });
  });

  it('does not zoom out past the fitted view', () => {
    expect(zoomAt(232, 232, 100, 100, DEFAULT_VIEW, 66, 66, 0.5)).toEqual(DEFAULT_VIEW);
  });
});

describe('hitPoint', () => {
  const pts = [{ id: 'far', x: 0, y: 0 }, { id: 'near', x: 10, y: 10 }];

  it('returns the nearest point within the radius', () => {
    expect(hitPoint(pts, 8, 8, 9)).toBe('near');
  });

  it('returns null when nothing is within the radius', () => {
    expect(hitPoint(pts, 40, 40, 9)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/morph-pane.test.ts`
Expected: FAIL — cannot resolve `./morph-pane`.

- [ ] **Step 3: Implement `morph-pane.ts`**

```ts
import type { Vec2 } from '../renderer/fit';

export interface PaneView { zoom: number; panX: number; panY: number }
export const DEFAULT_VIEW: PaneView = { zoom: 1, panX: 0, panY: 0 };

/** screen = box · s + (x, y), in CSS px. */
export interface PaneXf { s: number; x: number; y: number }

const MARGIN = 16;
const MIN_ZOOM = 1;
const MAX_ZOOM = 16;

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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/morph-pane.test.ts`
Expected: PASS (5 tests). Note `zoomAt` at zoom 1 with factor 0.5 returns `panX: 0` exactly because `p` and `base` come from the same transform.

- [ ] **Step 5: Commit**

```bash
git add src/lib/morph-pane.ts src/lib/morph-pane.test.ts
git commit -m "Add morph editor pane geometry: fit, zoom about cursor, hit testing"
```

---

### Task 8: Feature matching

**Files:**
- Create: `src/lib/morph-match/match.ts`
- Test: `src/lib/morph-match/match.test.ts`

**Interfaces:**
- Consumes: `fitRect`, `uvToBox`, `Vec2` (Task 1); `MorphView` (Task 2); `newPairId` (Task 6).
- Produces:
  - `interface FeatureGrid { cols: number; rows: number; dim: number; data: Float32Array }` (patches row-major, each L2-normalised)
  - `interface Candidate { a: Vec2; b: Vec2; sim: number }`
  - `MATCH` constants
  - `mutualMatches(A, B): Candidate[]`, `spread(c, buckets): Candidate[]`, `dropInconsistent(c, k, maxDev): Candidate[]`, `dropInvisible(c, view): Candidate[]`
  - `matchFeatures(A, B, view, makeId?): MorphPair[]`

- [ ] **Step 1: Write the failing tests**

`src/lib/morph-match/match.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  dropInconsistent, dropInvisible, matchFeatures, mutualMatches, spread,
  type Candidate, type FeatureGrid,
} from './match';
import type { MorphView } from '../../renderer/morph-field';

function grid(cols: number, rows: number, vectors: number[][]): FeatureGrid {
  const dim = vectors[0].length;
  const data = new Float32Array(cols * rows * dim);
  vectors.forEach((v, i) => {
    const n = Math.hypot(...v);
    v.forEach((x, k) => { data[i * dim + k] = x / n; });
  });
  return { cols, rows, dim, data };
}

const cand = (ax: number, ay: number, bx: number, by: number, sim = 0.8): Candidate =>
  ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, sim });

describe('mutualMatches', () => {
  it('keeps only pairs that are each other’s nearest neighbour', () => {
    // A0 ↔ B0 is mutual. A1's best is B0 too, but B0 prefers A0: dropped.
    const A = grid(2, 1, [[1, 0, 0], [0.8, 0.6, 0]]);
    const B = grid(2, 1, [[1, 0, 0], [0, 0, 1]]);
    const out = mutualMatches(A, B);
    expect(out).toHaveLength(1);
    expect(out[0].a).toEqual({ x: 0.25, y: 0.5 });
    expect(out[0].b).toEqual({ x: 0.25, y: 0.5 });
    expect(out[0].sim).toBeCloseTo(1, 6);
  });
});

describe('spread', () => {
  it('keeps the best candidate per bucket', () => {
    const out = spread([cand(0.1, 0.1, 0, 0, 0.9), cand(0.2, 0.2, 0, 0, 0.5), cand(0.9, 0.9, 0, 0, 0.7)], 2);
    expect(out.map((c) => c.sim)).toEqual([0.9, 0.7]);
  });
});

describe('dropInconsistent', () => {
  it('drops a pair that moves against all its neighbours', () => {
    const corners = [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]]
      .map(([x, y]) => cand(x, y, x + 0.1, y));
    const outlier = cand(0.5, 0.5, 0.0, 0.5);
    const out = dropInconsistent([...corners, outlier], 4, 0.2);
    expect(out).toHaveLength(4);
    expect(out).not.toContain(outlier);
  });
});

describe('dropInvisible', () => {
  it('drops pairs outside the layer box under cover', () => {
    // A 200×100 cover in a 100² box → rect (−50,0,200,100). u = 0.1 → x = −30: outside.
    const view: MorphView = { fitMode: 'cover', sizeA: { w: 200, h: 100 }, sizeB: { w: 200, h: 100 }, boxW: 100, boxH: 100 };
    const out = dropInvisible([cand(0.1, 0.5, 0.5, 0.5), cand(0.5, 0.5, 0.5, 0.5)], view);
    expect(out).toEqual([cand(0.5, 0.5, 0.5, 0.5)]);
  });
});

describe('matchFeatures', () => {
  const view: MorphView = { fitMode: 'fill', sizeA: { w: 28, h: 14 }, sizeB: { w: 28, h: 14 }, boxW: 100, boxH: 100 };

  it('drops matches below the similarity floor', () => {
    const A = grid(1, 1, [[1, 0]]);
    const B = grid(1, 1, [[0.2, 0.9798]]);
    expect(matchFeatures(A, B, view)).toEqual([]);
  });

  it('returns auto pairs with confidence and fresh ids', () => {
    const A = grid(2, 1, [[1, 0, 0], [0, 1, 0]]);
    const B = grid(2, 1, [[0, 1, 0], [1, 0, 0]]);
    let n = 0;
    const pairs = matchFeatures(A, B, view, () => `p${n++}`);
    expect(pairs.map((p) => [p.id, p.source, p.confidence])).toEqual([
      ['p0', 'auto', 1], ['p1', 'auto', 1],
    ]);
    expect(pairs[0].a).toEqual({ x: 0.25, y: 0.5 });
    expect(pairs[0].b).toEqual({ x: 0.75, y: 0.5 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/morph-match/match.test.ts`
Expected: FAIL — cannot resolve `./match`.

- [ ] **Step 3: Implement `match.ts`**

```ts
import type { MorphPair } from '../../types';
import { fitRect, uvToBox, type Vec2 } from '../../renderer/fit';
import type { MorphView } from '../../renderer/morph-field';
import { newPairId } from '../morph-edit';

/** One image's patch features: rows × cols patches, each an L2-normalised dim-vector. */
export interface FeatureGrid {
  cols: number;
  rows: number;
  dim: number;
  data: Float32Array;
}

export interface Candidate { a: Vec2; b: Vec2; sim: number }

export const MATCH = {
  minSim: 0.3,
  buckets: 8,
  neighbours: 4,
  maxDeviation: 0.2,
  maxPairs: 48,
} as const;

function centre(g: FeatureGrid, i: number): Vec2 {
  return { x: ((i % g.cols) + 0.5) / g.cols, y: (Math.floor(i / g.cols) + 0.5) / g.rows };
}

/** Pairs of patches that are each other's most similar patch (cosine). */
export function mutualMatches(A: FeatureGrid, B: FeatureGrid): Candidate[] {
  const na = A.cols * A.rows;
  const nb = B.cols * B.rows;
  const dim = A.dim;
  const bestB = new Int32Array(na).fill(-1);
  const bestBSim = new Float32Array(na).fill(-Infinity);
  const bestA = new Int32Array(nb).fill(-1);
  const bestASim = new Float32Array(nb).fill(-Infinity);
  for (let i = 0; i < na; i++) {
    const ia = i * dim;
    for (let j = 0; j < nb; j++) {
      const jb = j * dim;
      let s = 0;
      for (let k = 0; k < dim; k++) s += A.data[ia + k] * B.data[jb + k];
      if (s > bestBSim[i]) { bestBSim[i] = s; bestB[i] = j; }
      if (s > bestASim[j]) { bestASim[j] = s; bestA[j] = i; }
    }
  }
  const out: Candidate[] = [];
  for (let i = 0; i < na; i++) {
    const j = bestB[i];
    if (j >= 0 && bestA[j] === i) out.push({ a: centre(A, i), b: centre(B, j), sim: bestBSim[i] });
  }
  return out;
}

/** Best candidate per cell of a buckets × buckets split of A, best first. */
export function spread(c: readonly Candidate[], buckets: number): Candidate[] {
  const best = new Map<number, Candidate>();
  for (const x of c) {
    const bx = Math.min(buckets - 1, Math.floor(x.a.x * buckets));
    const by = Math.min(buckets - 1, Math.floor(x.a.y * buckets));
    const key = by * buckets + bx;
    const cur = best.get(key);
    if (!cur || x.sim > cur.sim) best.set(key, x);
  }
  return [...best.values()].sort((p, q) => q.sim - p.sim);
}

function median(values: number[]): number {
  const s = [...values].sort((p, q) => p - q);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Drop pairs whose displacement disagrees with their neighbours'. Local, not
 * one global transform, so different subjects (which warp non-rigidly) pass.
 */
export function dropInconsistent(c: readonly Candidate[], k: number, maxDev: number): Candidate[] {
  if (c.length < 3) return [...c];
  return c.filter((x) => {
    const others = c
      .filter((y) => y !== x)
      .map((y) => ({ y, d: Math.hypot(y.a.x - x.a.x, y.a.y - x.a.y) }))
      .sort((p, q) => p.d - q.d)
      .slice(0, k)
      .map(({ y }) => y);
    const mdx = median(others.map((y) => y.b.x - y.a.x));
    const mdy = median(others.map((y) => y.b.y - y.a.y));
    return Math.hypot(x.b.x - x.a.x - mdx, x.b.y - x.a.y - mdy) <= maxDev;
  });
}

/** Drop pairs where either point falls outside the layer box under its fit. */
export function dropInvisible(c: readonly Candidate[], view: MorphView): Candidate[] {
  const rA = fitRect(view.fitMode, view.sizeA.w, view.sizeA.h, view.boxW, view.boxH);
  const rB = fitRect(view.fitMode, view.sizeB.w, view.sizeB.h, view.boxW, view.boxH);
  const inside = (p: Vec2) => p.x >= 0 && p.x <= view.boxW && p.y >= 0 && p.y <= view.boxH;
  return c.filter((x) => inside(uvToBox(x.a, rA)) && inside(uvToBox(x.b, rB)));
}

export function matchFeatures(
  A: FeatureGrid,
  B: FeatureGrid,
  view: MorphView,
  makeId: () => string = newPairId,
): MorphPair[] {
  let c = mutualMatches(A, B).filter((x) => x.sim >= MATCH.minSim);
  c = spread(c, MATCH.buckets);
  c = dropInconsistent(c, MATCH.neighbours, MATCH.maxDeviation);
  c = dropInvisible(c, view);
  return c
    .sort((p, q) => q.sim - p.sim)
    .slice(0, MATCH.maxPairs)
    .map((x) => ({
      id: makeId(),
      a: x.a,
      b: x.b,
      source: 'auto' as const,
      confidence: Math.max(0, Math.min(1, x.sim)),
    }));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/morph-match/match.test.ts`
Expected: PASS (7 tests). In the last test both sims are exactly 1 after normalisation; if float rounding gives 0.99999994, compare with `toBeCloseTo` instead of changing the code.

- [ ] **Step 5: Commit**

```bash
git add src/lib/morph-match/match.ts src/lib/morph-match/match.test.ts
git commit -m "Add auto-match pair selection: mutual NN, spread, consistency, visibility"
```

---

### Task 9: Model features and model shipping

**Files:**
- Modify: `package.json` (add `onnxruntime-web@1.30.0`; add `"fetch-models"` script)
- Create: `scripts/fetch-models.mjs`
- Create: `src-tauri/resources/models/README.md`
- Modify: `.gitignore`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`
- Create: `src/lib/morph-match/features.ts`
- Modify: `src/test-utils/node-shims.d.ts`
- Test: `src/lib/morph-match/features.test.ts`, `src/lib/morph-match/features.model.test.ts`

**Interfaces:**
- Consumes: `FeatureGrid` (Task 8).
- Produces: `PATCH = 14`, `LONG_SIDE = 448`, `interface Pixels { data: Uint8ClampedArray; width: number; height: number }`, `inputSize(w, h, longSide?): { w; h }`, `toChw(rgba, w, h): Float32Array`, `patchGrid(hidden, w, h, dim): FeatureGrid`, `extractFeatures(session, Tensor, px): Promise<FeatureGrid>`; the model file at `src-tauri/resources/models/dinov2-small-int8.onnx`, bundled as resource `models/dinov2-small-int8.onnx`.

- [ ] **Step 1: Install the runtime**

Run: `npm install onnxruntime-web@1.30.0 --save-exact`

- [ ] **Step 2: Write the fetch script**

`scripts/fetch-models.mjs`:

```js
#!/usr/bin/env node
// Downloads the pinned auto-match model into src-tauri/resources/models/ and
// verifies its SHA-256. Skips when a valid copy is already there. Release
// builds run it strictly (beforeBuildCommand); dev runs pass --optional, so a
// machine without network still starts — auto-match just reports the model
// missing.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const MODELS = [
  {
    file: 'src-tauri/resources/models/dinov2-small-int8.onnx',
    url: 'https://huggingface.co/onnx-community/dinov2-small/resolve/8b1f705a3a7f6f062f6bdd21986c1583d3ef105d/onnx/model_quantized.onnx',
    sha256: 'c179f8f7f592449c4c1bca4cd124a7538021428c5ffb89afde9503935b197efb',
  },
];

const optional = process.argv.includes('--optional');
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

async function ensure(model) {
  const path = join(ROOT, model.file);
  if (existsSync(path) && sha(readFileSync(path)) === model.sha256) {
    console.log(`fetch-models: ${model.file} ok`);
    return;
  }
  console.log(`fetch-models: downloading ${model.file}`);
  const res = await fetch(model.url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${model.url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const got = sha(buf);
  if (got !== model.sha256) throw new Error(`SHA-256 mismatch for ${model.file}: got ${got}`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.part`, buf);
  renameSync(`${path}.part`, path);
  console.log(`fetch-models: ${model.file} ok`);
}

try {
  for (const model of MODELS) await ensure(model);
} catch (err) {
  const msg = `fetch-models: ${err instanceof Error ? err.message : err}`;
  if (optional) {
    console.warn(`${msg}\nfetch-models: auto-match stays unavailable until the model is fetched.`);
  } else {
    console.error(msg);
    process.exit(1);
  }
}
```

In `package.json` scripts add `"fetch-models": "node scripts/fetch-models.mjs"`.

- [ ] **Step 3: Wire it into Tauri and git**

`src-tauri/resources/models/README.md`:

```markdown
# Bundled models

`dinov2-small-int8.onnx` powers the morph editor's Auto-match. It is not in
git (24 MB): `npm run fetch-models` downloads the pinned revision of
`onnx-community/dinov2-small` (`onnx/model_quantized.onnx`, Apache-2.0) and
verifies its SHA-256. `tauri build` runs it automatically.

This README keeps the resource glob matching when the model is absent.
```

`.gitignore` — add:

```
src-tauri/resources/models/*.onnx
src-tauri/resources/models/*.part
```

`src-tauri/tauri.conf.json` — set:

```json
"beforeDevCommand": "npm run fetch-models -- --optional && npm run dev",
"beforeBuildCommand": "npm run fetch-models && npm run build",
```

and in `"bundle"` add:

```json
"resources": { "resources/models/": "models/" },
```

`src-tauri/capabilities/default.json` — add `"fs:allow-resource-read-recursive"` to `permissions`.

Run: `npm run fetch-models`
Expected: `fetch-models: downloading …` then `… ok`; a second run prints only `ok`.

- [ ] **Step 4: Write the failing unit tests**

`src/lib/morph-match/features.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { inputSize, patchGrid, toChw } from './features';

describe('inputSize', () => {
  it('scales the long side to 448 and snaps both sides to 14', () => {
    expect(inputSize(1000, 750)).toEqual({ w: 448, h: 336 });
    expect(inputSize(300, 1200)).toEqual({ w: 112, h: 448 });
  });
});

describe('toChw', () => {
  it('normalises with ImageNet mean/std into planar RGB', () => {
    const out = toChw(new Uint8ClampedArray([255, 0, 128, 255]), 1, 1);
    expect(out[0]).toBeCloseTo((1 - 0.485) / 0.229, 5);
    expect(out[1]).toBeCloseTo((0 - 0.456) / 0.224, 5);
    expect(out[2]).toBeCloseTo((128 / 255 - 0.406) / 0.225, 5);
  });
});

describe('patchGrid', () => {
  it('drops the CLS token and L2-normalises each patch', () => {
    // CLS, then patches (3,4) and (0,2); 28×14 input → 2 cols × 1 row.
    const hidden = new Float32Array([9, 9, 3, 4, 0, 2]);
    const g = patchGrid(hidden, 28, 14, 2);
    expect([g.cols, g.rows, g.dim]).toEqual([2, 1, 2]);
    expect(Array.from(g.data)).toEqual([0.6000000238418579, 0.800000011920929, 0, 1]);
  });
});
```

- [ ] **Step 5: Run to verify it fails**

Run: `npx vitest run src/lib/morph-match/features.test.ts`
Expected: FAIL — cannot resolve `./features`.

- [ ] **Step 6: Implement `features.ts`**

```ts
import type { InferenceSession, Tensor as OrtTensor } from 'onnxruntime-web';
import type { FeatureGrid } from './match';

export const PATCH = 14;
export const LONG_SIDE = 448;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

export interface Pixels { data: Uint8ClampedArray; width: number; height: number }

/** Model input size: long side 448, both sides multiples of the 14 px patch. */
export function inputSize(w: number, h: number, longSide = LONG_SIDE): { w: number; h: number } {
  const s = longSide / Math.max(w, h);
  const snap = (v: number) => Math.max(PATCH, Math.round((v * s) / PATCH) * PATCH);
  return { w: snap(w), h: snap(h) };
}

/** RGBA bytes → ImageNet-normalised planar RGB (CHW). */
export function toChw(rgba: Uint8ClampedArray, w: number, h: number): Float32Array {
  const plane = w * h;
  const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) {
      out[c * plane + i] = (rgba[i * 4 + c] / 255 - MEAN[c]) / STD[c];
    }
  }
  return out;
}

/** `last_hidden_state` rows after CLS, each L2-normalised for cosine matching. */
export function patchGrid(hidden: Float32Array, w: number, h: number, dim: number): FeatureGrid {
  const cols = w / PATCH;
  const rows = h / PATCH;
  const n = cols * rows;
  const data = new Float32Array(n * dim);
  for (let i = 0; i < n; i++) {
    const src = (i + 1) * dim;
    let norm = 0;
    for (let k = 0; k < dim; k++) norm += hidden[src + k] * hidden[src + k];
    const inv = norm > 0 ? 1 / Math.sqrt(norm) : 0;
    for (let k = 0; k < dim; k++) data[i * dim + k] = hidden[src + k] * inv;
  }
  return { cols, rows, dim, data };
}

/**
 * Run DINOv2 on one image. The Tensor constructor is passed in so the same
 * code runs on the worker's WASM build and on Node's build in tests.
 */
export async function extractFeatures(
  session: InferenceSession,
  Tensor: typeof OrtTensor,
  px: Pixels,
): Promise<FeatureGrid> {
  const input = new Tensor('float32', toChw(px.data, px.width, px.height), [1, 3, px.height, px.width]);
  const out = await session.run({ pixel_values: input });
  const hidden = out.last_hidden_state;
  return patchGrid(hidden.data as Float32Array, px.width, px.height, hidden.dims[2]);
}
```

- [ ] **Step 7: Run to verify it passes**

Run: `npx vitest run src/lib/morph-match/features.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 8: Write the real-model test**

Append to `src/test-utils/node-shims.d.ts`:

```ts
// Vitest runs in Node, but the type-check has no @types/node (it would
// retype browser globals such as setTimeout). Test files that touch the disk
// use exactly these two functions.
declare module 'node:fs' {
  export function existsSync(path: string): boolean;
  export function readFileSync(path: string): Uint8Array;
}
```

`src/lib/morph-match/features.model.test.ts`:

```ts
// @vitest-environment node
//
// Runs the real bundled model. Skipped when it has not been fetched
// (`npm run fetch-models`).
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { createCanvas } from 'canvas';
import * as ort from 'onnxruntime-web';
import { extractFeatures, type Pixels } from './features';
import { matchFeatures } from './match';
import { hash } from '../../renderer/noise';

const MODEL = 'src-tauri/resources/models/dinov2-small-int8.onnx';
const S = 448;
const SHIFT = 56; // 4 patches

/** A busy, distinctive picture: gradient ground, varied shapes. */
function scene(offsetX: number): Pixels {
  const c = createCanvas(S, S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#777777';
  ctx.fillRect(0, 0, S, S);
  ctx.translate(offsetX, 0);
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, '#203060');
  g.addColorStop(1, '#c08040');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 60; i++) {
    const x = hash(i, 1) * S, y = hash(i, 2) * S, r = 8 + hash(i, 3) * 30;
    ctx.fillStyle = `hsl(${Math.floor(hash(i, 4) * 360)}, 70%, ${35 + Math.floor(hash(i, 5) * 40)}%)`;
    ctx.beginPath();
    if (i % 3 === 0) ctx.rect(x - r, y - r / 2, r * 2, r);
    else ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return { data: ctx.getImageData(0, 0, S, S).data as unknown as Uint8ClampedArray, width: S, height: S };
}

describe.skipIf(!existsSync(MODEL))('DINOv2 auto-match on a shifted copy', () => {
  it('recovers the shift to within one patch', async () => {
    const session = await ort.InferenceSession.create(readFileSync(MODEL));
    const A = await extractFeatures(session, ort.Tensor, scene(0));
    const B = await extractFeatures(session, ort.Tensor, scene(SHIFT));
    const view = { fitMode: 'fill' as const, sizeA: { w: S, h: S }, sizeB: { w: S, h: S }, boxW: S, boxH: S };
    const pairs = matchFeatures(A, B, view);
    expect(pairs.length).toBeGreaterThanOrEqual(10);
    const dx = pairs.map((p) => p.b.x - p.a.x).sort((p, q) => p - q);
    const median = dx[dx.length >> 1];
    expect(Math.abs(median - SHIFT / S)).toBeLessThan(1 / 32);
  }, 60_000);
});
```

- [ ] **Step 9: Run it**

Run: `npx vitest run src/lib/morph-match/features.model.test.ts`
Expected: PASS in a few seconds. If fewer than 10 pairs survive, look at the candidates before and after each filter; a synthetic image with repeated shapes can defeat mutual matching, in which case make the fixture busier (more, smaller, differently-coloured shapes) — do not loosen the production constants to pass a test.

- [ ] **Step 10: Run all tests and type-check**

Run: `npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json scripts/fetch-models.mjs src-tauri/resources/models/README.md .gitignore src-tauri/tauri.conf.json src-tauri/capabilities/default.json src/lib/morph-match/features.ts src/lib/morph-match/features.test.ts src/lib/morph-match/features.model.test.ts src/test-utils/node-shims.d.ts
git commit -m "Ship the DINOv2 auto-match model and extract patch features with it"
```

---

### Task 10: Worker and main-thread auto-match API

**Files:**
- Create: `src/lib/morph-match/protocol.ts`, `src/lib/morph-match/worker.ts`, `src/lib/morph-match/index.ts`
- Modify: `vite.config.ts`

**Interfaces:**
- Consumes: `extractFeatures`, `inputSize`, `Pixels` (Task 9); `matchFeatures` (Task 8); `MorphView` (Task 2).
- Produces: `autoMatch(a: ImageBitmap, b: ImageBitmap, view: MorphView, opts?: { onProgress?: (p: number) => void; signal?: AbortSignal }): Promise<MorphPair[]>`, `autoMatchAvailable(): boolean`, `class ModelMissingError extends Error`, `MODEL_RESOURCE = 'models/dinov2-small-int8.onnx'`.

- [ ] **Step 1: Protocol**

`src/lib/morph-match/protocol.ts`:

```ts
import type { MorphPair } from '../../types';
import type { MorphView } from '../../renderer/morph-field';
import type { Pixels } from './features';

export type WorkerRequest =
  | { type: 'load'; model: ArrayBuffer }
  | { type: 'match'; a: Pixels; b: Pixels; view: MorphView };

export type WorkerResponse =
  | { type: 'loaded' }
  | { type: 'progress'; value: number }
  | { type: 'result'; pairs: MorphPair[] }
  | { type: 'error'; message: string };
```

- [ ] **Step 2: Worker**

`src/lib/morph-match/worker.ts`:

```ts
// Auto-match runs here so the 1–3 s of inference never blocks the editor.
import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import { extractFeatures } from './features';
import { matchFeatures } from './match';
import type { WorkerRequest, WorkerResponse } from './protocol';

// One thread: multi-threaded WASM needs cross-origin isolation, which would
// change how every cross-origin resource in the app loads.
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = { wasm: wasmUrl };

let session: ort.InferenceSession | null = null;

function post(msg: WorkerResponse): void {
  (self as unknown as Worker).postMessage(msg);
}

self.addEventListener('message', async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  try {
    if (msg.type === 'load') {
      session ??= await ort.InferenceSession.create(new Uint8Array(msg.model));
      post({ type: 'loaded' });
      return;
    }
    if (!session) throw new Error('Auto-match model is not loaded');
    post({ type: 'progress', value: 0.05 });
    const fa = await extractFeatures(session, ort.Tensor, msg.a);
    post({ type: 'progress', value: 0.5 });
    const fb = await extractFeatures(session, ort.Tensor, msg.b);
    post({ type: 'progress', value: 0.95 });
    post({ type: 'result', pairs: matchFeatures(fa, fb, msg.view) });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
});
```

- [ ] **Step 3: Main-thread API**

`src/lib/morph-match/index.ts`:

```ts
import { resolveResource } from '@tauri-apps/api/path';
import { readFile } from '@tauri-apps/plugin-fs';
import type { MorphPair } from '../../types';
import type { MorphView } from '../../renderer/morph-field';
import { inputSize, type Pixels } from './features';
import type { WorkerRequest, WorkerResponse } from './protocol';

export const MODEL_RESOURCE = 'models/dinov2-small-int8.onnx';

export class ModelMissingError extends Error {
  constructor() {
    super('Auto-match unavailable — model not found (run `npm run fetch-models` in dev)');
    this.name = 'ModelMissingError';
  }
}

/** The model is read from the app bundle, which needs the Tauri runtime. */
export function autoMatchAvailable(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

let worker: Worker | null = null;
let ready: Promise<void> | null = null;

function resetWorker(): void {
  worker?.terminate();
  worker = null;
  ready = null;
}

function abortError(): DOMException {
  return new DOMException('Auto-match cancelled', 'AbortError');
}

/** Send one request and wait for its final reply, relaying progress. */
function call(
  w: Worker,
  msg: WorkerRequest,
  transfer: Transferable[],
  onProgress?: (p: number) => void,
  signal?: AbortSignal,
): Promise<WorkerResponse> {
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent<WorkerResponse>) => {
      if (e.data.type === 'progress') { onProgress?.(e.data.value); return; }
      cleanup();
      if (e.data.type === 'error') reject(new Error(e.data.message));
      else resolve(e.data);
    };
    const onError = (e: ErrorEvent) => {
      cleanup();
      resetWorker();
      reject(new Error(e.message || 'Auto-match worker crashed'));
    };
    const onAbort = () => {
      cleanup();
      resetWorker();
      reject(abortError());
    };
    function cleanup() {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
    }
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    signal?.addEventListener('abort', onAbort);
    w.postMessage(msg, transfer);
  });
}

async function readModel(): Promise<ArrayBuffer> {
  let bytes: Uint8Array;
  try {
    bytes = await readFile(await resolveResource(MODEL_RESOURCE));
  } catch {
    throw new ModelMissingError();
  }
  return bytes.slice().buffer;
}

async function ensureWorker(signal?: AbortSignal): Promise<Worker> {
  if (!worker || !ready) {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker = w;
    ready = readModel()
      .then((model) => call(w, { type: 'load', model }, [model], undefined, signal))
      .then(() => undefined);
    ready.catch(() => { if (worker === w) resetWorker(); });
  }
  await ready;
  if (!worker) throw abortError();
  return worker;
}

/** Downscale to the model's input size; transparent areas read as neutral grey. */
function toPixels(bitmap: ImageBitmap): Pixels {
  const { w, h } = inputSize(bitmap.width, bitmap.height);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  return { data: ctx.getImageData(0, 0, w, h).data, width: w, height: h };
}

/** New auto pairs for A → B. Merging with existing pairs is the caller's job. */
export async function autoMatch(
  a: ImageBitmap,
  b: ImageBitmap,
  view: MorphView,
  opts: { onProgress?: (p: number) => void; signal?: AbortSignal } = {},
): Promise<MorphPair[]> {
  if (opts.signal?.aborted) throw abortError();
  const w = await ensureWorker(opts.signal);
  const pa = toPixels(a);
  const pb = toPixels(b);
  const res = await call(
    w, { type: 'match', a: pa, b: pb, view },
    [pa.data.buffer as ArrayBuffer, pb.data.buffer as ArrayBuffer],
    opts.onProgress, opts.signal,
  );
  if (res.type !== 'result') throw new Error('Unexpected reply from the auto-match worker');
  return res.pairs;
}
```

- [ ] **Step 4: Vite config**

In `vite.config.ts`, inside the returned config object add:

```ts
  // onnxruntime-web locates its .wasm relative to its own module; pre-bundling
  // moves the module and breaks that, and the auto-match worker is an ES module.
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  worker: { format: 'es' as const },
```

- [ ] **Step 5: Type-check and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed; `dist/assets/` contains a `worker-*.js` and an `ort-wasm-simd-threaded-*.wasm`.

- [ ] **Step 6: Spike the worker in the browser (Risk 2, Vite half)**

Start the `studio-dev` preview. In the page (javascript tool), load the model through Vite's `/@fs/` route and drive the worker directly:

```js
const model = await (await fetch('/@fs' + '<repo>/src-tauri/resources/models/dinov2-small-int8.onnx')).arrayBuffer();
const w = new Worker(new URL('/src/lib/morph-match/worker.ts', location.origin), { type: 'module' });
const reply = (m) => new Promise((r) => { const h = (e) => { if (e.data.type !== 'progress') { w.removeEventListener('message', h); r(e.data); } }; w.addEventListener('message', h); w.postMessage(m); });
const t0 = performance.now(); const loaded = await reply({ type: 'load', model });
const px = (seed) => { const c = document.createElement('canvas'); c.width = c.height = 448; const x = c.getContext('2d'); for (let i = 0; i < 80; i++) { x.fillStyle = `hsl(${(i * 47 + seed) % 360},70%,50%)`; x.fillRect((i * 97) % 420, (i * 57) % 420, 40, 30); } return { data: x.getImageData(0, 0, 448, 448).data, width: 448, height: 448 }; };
const view = { fitMode: 'fill', sizeA: { w: 448, h: 448 }, sizeB: { w: 448, h: 448 }, boxW: 448, boxH: 448 };
const res = await reply({ type: 'match', a: px(0), b: px(0), view });
({ loaded: loaded.type, result: res.type, pairs: res.pairs?.length, ms: Math.round(performance.now() - t0) });
```

Expected: `{ loaded: 'loaded', result: 'result', pairs: ≥ 10, ms: < 10000 }`. (Identical images → pairs with `a ≈ b`.) The Tauri half — reading the model from the resource directory — is verified in Task 15.

- [ ] **Step 7: Commit**

```bash
git add src/lib/morph-match/protocol.ts src/lib/morph-match/worker.ts src/lib/morph-match/index.ts vite.config.ts
git commit -m "Run auto-match in a Web Worker behind a main-thread autoMatch API"
```

---

### Task 11: Match-quality check (Risk 3, throwaway)

Not committed. Uses macOS sample pictures (`/Library/User Pictures/Animals/*.heic`, 512²) converted with `sips`, so nothing is downloaded and nothing third-party enters the repo.

- [ ] **Step 1: Prepare fixtures in the scratchpad**

```bash
SP=<scratchpad>/morph-eval && mkdir -p $SP
for n in Owl Eagle Parrot Penguin; do sips -s format png "/Library/User Pictures/Animals/$n.heic" --out $SP/$n.png >/dev/null; done
```

- [ ] **Step 2: Write an eval test outside `src/` with its own config**

`$SP/eval.test.ts` loads each pair (`Owl→Owl` shifted 48 px, `Owl→Eagle`, `Parrot→Penguin`) with node-canvas `loadImage`, runs `extractFeatures` + `matchFeatures` (imported by absolute path from the repo), prints the pair count and median displacement, and writes a side-by-side PNG per pair with numbered dots (green ≥ 0.6, amber below) and a line joining each pair. `$SP/vitest.config.ts` sets `root` to the repo and `include` to the eval file.

Run: `npx vitest run --config $SP/vitest.config.ts`

- [ ] **Step 3: Judge by eye**

Open the three PNGs. Acceptance: the shifted pair's lines are parallel; for the bird pairs, most green dots join the same body part (eye ↔ eye, beak ↔ beak, wing ↔ wing). If most dots are background or wrong, tune the production constants (`minSim`, `maxDeviation`) and re-run Task 8's tests; record the change and the reason in the commit that makes it.

---

### Task 12: Inspector section and `morphProgress` track

**Files:**
- Modify: `src/components/storyboard/PropertyInspector.tsx`
- Modify: `src/components/storyboard/KeyframeEditor.tsx`

**Interfaces:**
- Consumes: `enableMorph`, `disableMorph` (Task 6); `MorphEditor` (Task 13 — create a stub first: `export function MorphEditor(_: { layer: ImageLayerData; sceneIndex: number; onClose: () => void }) { return null; }`, replaced in Task 13).

- [ ] **Step 1: Keyframe editor**

In `KeyframeEditor.tsx`:

```ts
function getAnimatableProperties(layer: Layer): string[] {
  switch (layer.type) {
    case 'text': return TEXT_PROPERTIES;
    case 'shape': return SHAPE_PROPERTIES;
    case 'image': return layer.morph ? [...IMAGE_PROPERTIES, 'morphProgress'] : IMAGE_PROPERTIES;
    default: return BASE_PROPERTIES;
  }
}

function getPropertyValue(layer: Layer, property: string): number {
  // morphProgress lives on the morph block, not the layer itself.
  if (property === 'morphProgress' && layer.type === 'image') return layer.morph?.progress ?? 0;
  return (layer as unknown as Record<string, number>)[property] ?? 0;
}
```

- [ ] **Step 2: Inspector section**

In `PropertyInspector.tsx` add imports `import { createPortal } from 'react-dom';`, `import { enableMorph, disableMorph } from '../../lib/morph-edit';`, `import { MorphEditor } from './MorphEditor';`, then below `ImageSection`:

```tsx
function MorphSection({ layer, sceneIndex }: { layer: ImageLayerData; sceneIndex: number }) {
  const updateLayer = useStore((s) => s.updateLayer);
  const projectPath = useStore((s) => s.projectPath);
  const [editing, setEditing] = useState(false);
  const morph = layer.morph;
  const update = (patch: Partial<ImageLayerData>) => updateLayer(sceneIndex, layer.id, patch as Partial<Layer>);

  async function handleBrowse() {
    const path = await pickImageFile();
    if (!path) return;
    const target = projectPath ? await copyAssetToProject(path, projectPath) : path;
    update(morph ? { morph: { ...morph, target } } : enableMorph(layer, target));
  }

  return (
    <div className="prop-section">
      <h4>
        Morph to…
        <label className="prop-checkbox section-toggle">
          <input
            type="checkbox"
            checked={!!morph}
            onChange={() => update(morph ? disableMorph(layer) : enableMorph(layer, ''))}
          />
          <span>{morph ? 'On' : 'Off'}</span>
        </label>
      </h4>
      {morph && (
        <>
          <label className="prop-field">
            <span>Target</span>
            <input
              type="text"
              value={morph.target}
              placeholder="Second image"
              onChange={(e) => update({ morph: { ...morph, target: e.target.value } })}
            />
          </label>
          <button className="prop-browse-btn" onClick={handleBrowse}>Browse...</button>
          <p className="prop-hint">{morph.pairs.length} point pairs</p>
          <button className="prop-browse-btn" disabled={!morph.target} onClick={() => setEditing(true)}>
            Edit points...
          </button>
        </>
      )}
      {editing && morph && createPortal(
        <MorphEditor layer={layer} sceneIndex={sceneIndex} onClose={() => setEditing(false)} />,
        document.body,
      )}
    </div>
  );
}
```

and in the main render, after the `ImageSection` line:

```tsx
          {layer.type === 'image' && <MorphSection layer={layer} sceneIndex={selectedSceneIndex} />}
```

- [ ] **Step 3: Type-check and run tests**

Run: `npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 4: Verify in the preview**

Start `studio-dev`; add an image layer via the store (javascript tool, data-URL `src`), select it, toggle Morph on, and confirm with `read_page`: the Morph section shows Target/Browse/0 point pairs/Edit points (disabled), and the keyframe editor lists a `morphProgress` track with two keyframes. Toggle off: section collapses, track gone.

- [ ] **Step 5: Commit**

```bash
git add src/components/storyboard/PropertyInspector.tsx src/components/storyboard/KeyframeEditor.tsx src/components/storyboard/MorphEditor.tsx
git commit -m "Add the Morph to… inspector section and the morphProgress keyframe track"
```

---

### Task 13: The morph point editor

**Files:**
- Modify (replace stub): `src/components/storyboard/MorphEditor.tsx`
- Modify: `src/App.css`

**Interfaces:**
- Consumes: `renderMorph`, `MORPH_GRID` (Task 3); `buildMorphMesh`, `MorphView` (Task 2); `fitRect`, `uvToBox`, `boxToUv` (Task 1); `addPair`, `movePoint`, `deletePair`, `clearAuto`, `mergeAuto`, `newPairId` (Task 6); pane helpers (Task 7); `autoMatch`, `autoMatchAvailable`, `ModelMissingError` (Task 10); `createMediaCache`, `loadImage` (media-cache); `resolveAssetPath` (asset-manager).
- Produces: `MorphEditor({ layer, sceneIndex, onClose })`.

- [ ] **Step 1: Styles**

Append to `src/App.css`:

```css
/* ── Morph editor ────────────────────────────────────── */

.morph-editor {
  width: 90vw; height: 85vh; display: flex; flex-direction: column; gap: 8px; padding: 12px;
}
.morph-toolbar { display: flex; align-items: center; gap: 6px; }
.morph-toolbar b { font-size: 13px; color: #e0e0e0; margin-right: 8px; }
.morph-spacer { flex: 1; }
.morph-btn {
  padding: 4px 10px; background: #2a2a2a; border: 1px solid #3a3a3a; border-radius: 4px;
  color: #ccc; font-size: 12px; cursor: pointer;
}
.morph-btn:hover:not(:disabled) { border-color: #4a7abf; }
.morph-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.morph-btn.primary { background: #e94560; border-color: #e94560; color: #fff; }
.morph-btn.active { border-color: #4a7abf; color: #fff; }
.morph-progress { display: inline-flex; align-items: center; gap: 6px; }
.morph-progress-bar { width: 120px; height: 6px; background: #2a2a2a; border-radius: 3px; overflow: hidden; }
.morph-progress-bar > span { display: block; height: 100%; background: #e94560; }
.morph-error { color: #ff6b6b; font-size: 12px; margin: 0; }
.morph-panes { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.morph-pane { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.morph-cap {
  display: flex; justify-content: space-between; align-items: center; height: 18px; margin-bottom: 4px;
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #888;
}
.morph-cap span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.morph-fit {
  padding: 0 6px; background: none; border: 1px solid #3a3a3a; border-radius: 3px;
  color: #aaa; font-size: 10px; cursor: pointer;
}
.morph-pane canvas {
  flex: 1; min-height: 0; width: 100%; background: #111; border-radius: 4px;
  cursor: crosshair; touch-action: none;
}
.morph-pane.mid canvas { cursor: grab; }
.morph-scrub { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #ccc; }
.morph-scrub input[type='range'] { flex: 1; }
.morph-legend { display: flex; gap: 14px; flex-wrap: wrap; font-size: 11px; color: #888; }
.morph-legend i {
  display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; vertical-align: -1px;
}
```

- [ ] **Step 2: The component**

`src/components/storyboard/MorphEditor.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store';
import type { ImageLayerData, ImageMorphDef, Layer, MorphPair, MorphPoint } from '../../types';
import { createMediaCache, loadImage } from '../../renderer/media-cache';
import { resolveAssetPath } from '../../lib/asset-manager';
import { boxToUv, fitRect, uvToBox, type Rect } from '../../renderer/fit';
import { MORPH_GRID, renderMorph } from '../../renderer/draw-morph';
import { buildMorphMesh, type MorphView } from '../../renderer/morph-field';
import { addPair, clearAuto, deletePair, mergeAuto, movePoint, newPairId } from '../../lib/morph-edit';
import {
  DEFAULT_VIEW, hitPoint, paneXf, toBox, toScreen, zoomAt, type PaneView, type PaneXf,
} from '../../lib/morph-pane';
import { autoMatch, autoMatchAvailable, ModelMissingError } from '../../lib/morph-match';

type Side = 'a' | 'b';
type PaneId = Side | 'mid';
const PANES: PaneId[] = ['a', 'mid', 'b'];

const COLORS = { high: '#2fb36b', low: '#e0a526', manual: '#4a7dff', ring: '#e94560' };
const DOT_R = 7;
const HIT_R = DOT_R + 3;
const DRAG_START_PX = 3;

type Drag =
  | { kind: 'point'; id: string; side: Side; sx: number; sy: number; moved: boolean }
  | { kind: 'pan'; pane: PaneId; sx: number; sy: number; view: PaneView };

function dotColor(p: MorphPair): string {
  if (p.source === 'manual') return COLORS.manual;
  return (p.confidence ?? 0) >= 0.6 ? COLORS.high : COLORS.low;
}

const clampUv = (p: MorphPoint): MorphPoint =>
  ({ x: Math.max(0, Math.min(1, p.x)), y: Math.max(0, Math.min(1, p.y)) });

const baseName = (p: string) => p.split(/[\\/]/).pop() || p;

export function MorphEditor({ layer, sceneIndex, onClose }: {
  layer: ImageLayerData;
  sceneIndex: number;
  onClose: () => void;
}) {
  const updateLayer = useStore((s) => s.updateLayer);
  const projectPath = useStore((s) => s.projectPath);

  const [draft, setDraft] = useState<ImageMorphDef>(() => structuredClone(layer.morph as ImageMorphDef));
  const [bitmaps, setBitmaps] = useState<{ a?: ImageBitmap; b?: ImageBitmap }>({});
  const [selected, setSelected] = useState<{ id: string; side: Side } | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [t, setT] = useState(0.5);
  const [playing, setPlaying] = useState(false);
  const [showMesh, setShowMesh] = useState(false);
  const [views, setViews] = useState<Record<PaneId, PaneView>>({ a: DEFAULT_VIEW, mid: DEFAULT_VIEW, b: DEFAULT_VIEW });
  const [sizes, setSizes] = useState<Record<PaneId, { w: number; h: number }>>({
    a: { w: 1, h: 1 }, mid: { w: 1, h: 1 }, b: { w: 1, h: 1 },
  });
  const [matching, setMatching] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refA = useRef<HTMLCanvasElement>(null);
  const refMid = useRef<HTMLCanvasElement>(null);
  const refB = useRef<HTMLCanvasElement>(null);
  const refs = { a: refA, mid: refMid, b: refB };
  const dragRef = useRef<Drag | null>(null);
  const spaceRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  // ── Images ──────────────────────────────────────────
  const target = layer.morph?.target ?? '';
  useEffect(() => {
    let cancelled = false;
    const cache = createMediaCache();
    (async () => {
      await Promise.all([layer.src, target].filter(Boolean).map(async (src) =>
        loadImage(cache, src, await resolveAssetPath(src, projectPath))));
      if (!cancelled) setBitmaps({ a: cache.get(layer.src), b: cache.get(target) });
    })();
    return () => { cancelled = true; };
  }, [layer.src, target, projectPath]);

  const view: MorphView | null = useMemo(() => {
    if (!bitmaps.a || !bitmaps.b) return null;
    return {
      fitMode: layer.fitMode,
      sizeA: { w: bitmaps.a.width, h: bitmaps.a.height },
      sizeB: { w: bitmaps.b.width, h: bitmaps.b.height },
      boxW: layer.width,
      boxH: layer.height,
    };
  }, [bitmaps, layer.fitMode, layer.width, layer.height]);

  const rectOf = (side: Side): Rect => {
    const v = view as MorphView;
    const size = side === 'a' ? v.sizeA : v.sizeB;
    return fitRect(v.fitMode, size.w, size.h, v.boxW, v.boxH);
  };
  const xfOf = (pane: PaneId): PaneXf => {
    const v = view as MorphView;
    return paneXf(sizes[pane].w, sizes[pane].h, v.boxW, v.boxH, views[pane]);
  };
  const screenPoints = (side: Side) => {
    const xf = xfOf(side);
    const r = rectOf(side);
    return draft.pairs.map((p) => ({ id: p.id, ...toScreen(xf, uvToBox(p[side], r)) }));
  };

  // ── Pane sizes ──────────────────────────────────────
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      const next: Partial<Record<PaneId, { w: number; h: number }>> = {};
      for (const pane of PANES) {
        const c = refs[pane].current;
        if (!c) continue;
        c.width = Math.max(1, Math.round(c.clientWidth * dpr));
        c.height = Math.max(1, Math.round(c.clientHeight * dpr));
        next[pane] = { w: c.clientWidth, h: c.clientHeight };
      }
      setSizes((s) => ({ ...s, ...next }));
    });
    for (const pane of PANES) {
      const c = refs[pane].current;
      if (c) observer.observe(c);
    }
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Drawing (once per animation frame, after any state change) ─────
  useEffect(() => {
    const raf = requestAnimationFrame(drawAll);
    return () => cancelAnimationFrame(raf);
  });

  function drawDot(ctx: CanvasRenderingContext2D, x: number, y: number, p: MorphPair, n: number) {
    const isSel = selected?.id === p.id;
    const r = hover === p.id ? DOT_R + 2 : DOT_R;
    if (isSel) {
      ctx.beginPath();
      ctx.arc(x, y, r + 4, 0, Math.PI * 2);
      ctx.strokeStyle = COLORS.ring;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = dotColor(p);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), x, y + 0.5);
  }

  function beginPane(pane: PaneId): { ctx: CanvasRenderingContext2D; xf: PaneXf } | null {
    const c = refs[pane].current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return null;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, sizes[pane].w, sizes[pane].h);
    if (!view) return null;
    return { ctx, xf: xfOf(pane) };
  }

  function drawSourcePane(side: Side) {
    const pane = beginPane(side);
    const bitmap = bitmaps[side];
    if (!pane || !bitmap || !view) return;
    const { ctx, xf } = pane;
    const r = rectOf(side);
    ctx.save();
    ctx.translate(xf.x, xf.y);
    ctx.scale(xf.s, xf.s);
    ctx.beginPath();
    ctx.rect(0, 0, view.boxW, view.boxH);
    ctx.clip();
    ctx.drawImage(bitmap, r.x, r.y, r.w, r.h);
    ctx.restore();
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.strokeRect(xf.x, xf.y, view.boxW * xf.s, view.boxH * xf.s);
    draft.pairs.forEach((p, i) => {
      const s = toScreen(xf, uvToBox(p[side], r));
      drawDot(ctx, s.x, s.y, p, i + 1);
    });
  }

  function drawResultPane() {
    const pane = beginPane('mid');
    if (!pane || !view || !bitmaps.a || !bitmaps.b) return;
    const { ctx, xf } = pane;
    const dpr = window.devicePixelRatio || 1;
    // Render at display resolution. 'none' pins the image to native pixels,
    // so only there must the box be rendered at full size.
    const k = view.fitMode === 'none' ? 1 : Math.min(1, xf.s * dpr);
    const out = renderMorph({
      a: bitmaps.a, b: bitmaps.b, fitMode: view.fitMode, pairs: draft.pairs, t,
      width: view.boxW * k, height: view.boxH * k,
    });
    ctx.save();
    ctx.translate(xf.x, xf.y);
    ctx.scale(xf.s, xf.s);
    ctx.drawImage(out, 0, 0, view.boxW, view.boxH);
    if (showMesh) drawMesh(ctx, xf.s);
    ctx.restore();
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.strokeRect(xf.x, xf.y, view.boxW * xf.s, view.boxH * xf.s);

    const sel = selected && draft.pairs.find((p) => p.id === selected.id);
    if (sel) {
      const a = uvToBox(sel.a, rectOf('a'));
      const b = uvToBox(sel.b, rectOf('b'));
      const s = toScreen(xf, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      ctx.beginPath();
      ctx.arc(s.x, s.y, DOT_R, 0, Math.PI * 2);
      ctx.setLineDash([3, 2]);
      ctx.strokeStyle = COLORS.ring;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /** Warped grid of image A; triangles that fold over are filled red. */
  function drawMesh(ctx: CanvasRenderingContext2D, scale: number) {
    const mesh = buildMorphMesh(view as MorphView, draft.pairs, t, MORPH_GRID);
    const { src, dstA: d, cols, rows } = mesh;
    const stride = cols + 1;
    const area = (v: Float64Array, i: number, j: number, k: number) =>
      (v[j] - v[i]) * (v[k + 1] - v[i + 1]) - (v[k] - v[i]) * (v[j + 1] - v[i + 1]);
    ctx.fillStyle = 'rgba(255, 60, 60, 0.45)';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i00 = (r * stride + c) * 2, i10 = i00 + 2, i01 = i00 + stride * 2, i11 = i01 + 2;
        for (const [i, j, k] of [[i00, i10, i11], [i00, i11, i01]]) {
          if (Math.sign(area(src, i, j, k)) !== Math.sign(area(d, i, j, k))) {
            ctx.beginPath();
            ctx.moveTo(d[i], d[i + 1]);
            ctx.lineTo(d[j], d[j + 1]);
            ctx.lineTo(d[k], d[k + 1]);
            ctx.closePath();
            ctx.fill();
          }
        }
      }
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1 / scale;
    ctx.beginPath();
    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c <= cols; c++) {
        const i = (r * stride + c) * 2;
        if (c === 0) ctx.moveTo(d[i], d[i + 1]); else ctx.lineTo(d[i], d[i + 1]);
      }
    }
    for (let c = 0; c <= cols; c++) {
      for (let r = 0; r <= rows; r++) {
        const i = (r * stride + c) * 2;
        if (r === 0) ctx.moveTo(d[i], d[i + 1]); else ctx.lineTo(d[i], d[i + 1]);
      }
    }
    ctx.stroke();
  }

  function drawAll() {
    drawSourcePane('a');
    drawResultPane();
    drawSourcePane('b');
  }

  // ── Pointer input ───────────────────────────────────
  function local(e: React.PointerEvent | React.WheelEvent) {
    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    return { sx: e.clientX - rect.left, sy: e.clientY - rect.top };
  }

  function onPointerDown(pane: PaneId, e: React.PointerEvent<HTMLCanvasElement>) {
    if (!view) return;
    const { sx, sy } = local(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (e.button === 1 || spaceRef.current || pane === 'mid') {
      dragRef.current = { kind: 'pan', pane, sx, sy, view: views[pane] };
      return;
    }
    if (e.button !== 0) return;
    const side = pane;
    const hit = hitPoint(screenPoints(side), sx, sy, HIT_R);
    if (hit) {
      setSelected({ id: hit, side });
      dragRef.current = { kind: 'point', id: hit, side, sx, sy, moved: false };
      return;
    }
    const uv = boxToUv(toBox(xfOf(side), sx, sy), rectOf(side));
    if (uv.x < 0 || uv.x > 1 || uv.y < 0 || uv.y > 1) return;
    const id = newPairId();
    setDraft((d) => ({ ...d, pairs: addPair(d.pairs, view, side, uv, id) }));
    setSelected({ id, side });
    dragRef.current = { kind: 'point', id, side, sx, sy, moved: true };
  }

  function onPointerMove(pane: PaneId, e: React.PointerEvent<HTMLCanvasElement>) {
    if (!view) return;
    const { sx, sy } = local(e);
    const drag = dragRef.current;
    if (drag?.kind === 'pan' && drag.pane === pane) {
      setViews((v) => ({
        ...v,
        [pane]: { ...drag.view, panX: drag.view.panX + sx - drag.sx, panY: drag.view.panY + sy - drag.sy },
      }));
      return;
    }
    if (drag?.kind === 'point' && drag.side === pane) {
      if (!drag.moved && Math.hypot(sx - drag.sx, sy - drag.sy) < DRAG_START_PX) return;
      drag.moved = true;
      const uv = clampUv(boxToUv(toBox(xfOf(drag.side), sx, sy), rectOf(drag.side)));
      setDraft((d) => ({ ...d, pairs: movePoint(d.pairs, drag.id, drag.side, uv) }));
      return;
    }
    if (pane !== 'mid') setHover(hitPoint(screenPoints(pane), sx, sy, HIT_R));
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  function onWheel(pane: PaneId, e: React.WheelEvent<HTMLCanvasElement>) {
    if (!view) return;
    const { sx, sy } = local(e);
    const { w, h } = sizes[pane];
    setViews((v) => ({ ...v, [pane]: zoomAt(w, h, view.boxW, view.boxH, v[pane], sx, sy, Math.exp(-e.deltaY * 0.0015)) }));
  }

  // ── Keyboard (modal: nothing reaches the app's shortcuts while open) ──
  useEffect(() => {
    function nudge(dx: number, dy: number) {
      if (!selected || !view) return;
      const pair = draft.pairs.find((p) => p.id === selected.id);
      if (!pair) return;
      const xf = xfOf(selected.side);
      const r = rectOf(selected.side);
      const from = pair[selected.side];
      const to = clampUv({ x: from.x + dx / (xf.s * r.w), y: from.y + dy / (xf.s * r.h) });
      setDraft((d) => ({ ...d, pairs: movePoint(d.pairs, selected.id, selected.side, to) }));
    }
    function onKeyDown(e: KeyboardEvent) {
      e.stopPropagation();
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === ' ') { spaceRef.current = true; e.preventDefault(); return; }
      if (e.key === 'Escape') { cancel(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        e.preventDefault();
        setDraft((d) => ({ ...d, pairs: deletePair(d.pairs, selected.id) }));
        setSelected(null);
        return;
      }
      const step = e.shiftKey ? 10 : 1;
      const dir: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
      };
      if (dir[e.key]) {
        e.preventDefault();
        nudge(dir[e.key][0] * step, dir[e.key][1] * step);
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      e.stopPropagation();
      if (e.key === ' ') spaceRef.current = false;
    }
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    };
  });

  // ── Playback ────────────────────────────────────────
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setT((v) => (v + dt / 2) % 1); // one pass every two seconds
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // ── Actions ─────────────────────────────────────────
  async function runAutoMatch() {
    if (!view || !bitmaps.a || !bitmaps.b) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setMatching(0);
    setError(null);
    try {
      const incoming = await autoMatch(bitmaps.a, bitmaps.b, view, {
        onProgress: (p) => setMatching(p),
        signal: ac.signal,
      });
      setDraft((d) => ({ ...d, pairs: mergeAuto(d.pairs, incoming) }));
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setError(err instanceof ModelMissingError ? err.message : `Auto-match failed: ${err instanceof Error ? err.message : err}`);
      }
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      setMatching(null);
    }
  }

  function cancel() {
    abortRef.current?.abort();
    onClose();
  }

  function done() {
    abortRef.current?.abort();
    updateLayer(sceneIndex, layer.id, { morph: draft } as Partial<Layer>);
    onClose();
  }

  const canMatch = autoMatchAvailable() && !!view && matching === null;
  const matchTitle = autoMatchAvailable() ? 'Find matching points automatically' : 'Auto-match needs the desktop app';
  const zoomed = (pane: PaneId) => views[pane] !== DEFAULT_VIEW;
  const caption: Record<PaneId, string> = {
    a: `A · ${baseName(layer.src)}`,
    mid: `Result · t = ${t.toFixed(2)}`,
    b: `B · ${baseName(target)}`,
  };

  return (
    <div className="dialog-overlay">
      <div className="dialog-panel morph-editor" onClick={(e) => e.stopPropagation()}>
        <div className="morph-toolbar">
          <b>Morph points · {draft.pairs.length} pairs</b>
          {matching === null ? (
            <button className="morph-btn primary" disabled={!canMatch} title={matchTitle} onClick={runAutoMatch}>
              Auto-match
            </button>
          ) : (
            <span className="morph-progress">
              <span className="morph-progress-bar"><span style={{ width: `${Math.round(matching * 100)}%` }} /></span>
              <button className="morph-btn" onClick={() => abortRef.current?.abort()}>Cancel</button>
            </span>
          )}
          <button className="morph-btn" onClick={() => setDraft((d) => ({ ...d, pairs: clearAuto(d.pairs) }))}>
            Clear auto
          </button>
          <button className={`morph-btn${showMesh ? ' active' : ''}`} onClick={() => setShowMesh((m) => !m)}>
            Mesh
          </button>
          <span className="morph-spacer" />
          <button className="morph-btn" onClick={cancel}>Cancel</button>
          <button className="morph-btn primary" onClick={done}>Done</button>
        </div>
        {error && <p className="morph-error">{error}</p>}
        <div className="morph-panes">
          {PANES.map((pane) => (
            <div className={`morph-pane ${pane}`} key={pane}>
              <div className="morph-cap">
                <span>{view ? caption[pane] : 'Loading images…'}</span>
                {zoomed(pane) && (
                  <button className="morph-fit" onClick={() => setViews((v) => ({ ...v, [pane]: DEFAULT_VIEW }))}>
                    Fit
                  </button>
                )}
              </div>
              <canvas
                ref={refs[pane]}
                onPointerDown={(e) => onPointerDown(pane, e)}
                onPointerMove={(e) => onPointerMove(pane, e)}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onPointerLeave={() => setHover(null)}
                onWheel={(e) => onWheel(pane, e)}
              />
            </div>
          ))}
        </div>
        <div className="morph-scrub">
          <button className="morph-btn" onClick={() => setPlaying((p) => !p)}>{playing ? '❚❚' : '▶'}</button>
          <input
            type="range" min={0} max={1} step={0.01} value={t}
            onChange={(e) => { setPlaying(false); setT(Number(e.target.value)); }}
          />
          <span>t = {t.toFixed(2)}</span>
        </div>
        <div className="morph-legend">
          <span><i style={{ background: COLORS.high }} />confident</span>
          <span><i style={{ background: COLORS.low }} />weak</span>
          <span><i style={{ background: COLORS.manual }} />manual</span>
          <span>Click to add · drag to move · arrows nudge (Shift ×10) · Delete removes · wheel zooms · Space-drag pans</span>
        </div>
      </div>
    </div>
  );
}
```

If `tsc` flags `refs[pane]` as a union of ref types, annotate `const refs: Record<PaneId, React.RefObject<HTMLCanvasElement | null>>`. Remove the `eslint-disable` comment if the repo has no ESLint.

- [ ] **Step 3: Type-check and run tests**

Run: `npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 4: Verify in the preview**

In `studio-dev` (no Tauri, so Auto-match is disabled with its tooltip): create an image layer whose `src` and morph target are two data-URL images (a red square on white, a blue circle on white), select it, open **Edit points…**, and check with screenshots and `read_page`:
1. three panes render A, the result at t = 0.5, and B;
2. clicking in A adds pair 1 and its predicted partner appears in B; the count reads "1 pairs";
3. dragging the B point moves it and the result pane changes;
4. arrow keys nudge the selected point; Delete removes it; Delete does **not** delete the layer;
5. wheel zooms pane A and **Fit** resets it;
6. **Mesh** shows the grid;
7. **Done** closes and the inspector reads the new pair count; one Cmd+Z restores the previous count;
8. no console errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/storyboard/MorphEditor.tsx src/App.css
git commit -m "Add the three-pane morph point editor"
```

---

### Task 14: Documentation

**Files:**
- Modify: `docs/features.md`, `docs/user-guide.md`, `docs/architecture.md`, `CLAUDE.md`

- [ ] **Step 1: Write the docs**

- `docs/features.md`: extend the Image layers bullet with "Supports morphing into a second image (see Image morph)", and add an **Image morph** section: what it does, `morphProgress`, point pairs, Auto-match (offline, bundled model), the editor, limits (no video, one target per layer).
- `docs/user-guide.md`: a "Morph one image into another" walkthrough: add an image layer → Morph to… → Browse target → Edit points… → Auto-match → fix points (click/drag/nudge/delete) → Done → adjust the `morphProgress` keyframes.
- `docs/architecture.md`: renderer — `fit.ts`, `morph-field.ts` (rigid MLS on a grid), `draw-morph.ts` (triangle warp + additive blend), called from `draw-image.ts`; lib — `morph-match/` (worker, ORT WASM single-thread, model as Tauri resource, fetch script), `morph-edit.ts`, `morph-pane.ts`, `asset-refs.ts`.
- `CLAUDE.md` Implemented subsystems: add "**Image morph** — Image layers can warp into a second image (`src/renderer/morph-field.ts`, `draw-morph.ts`); matching points come from a bundled DINOv2 model run in a worker at authoring time only (`src/lib/morph-match/`, model fetched by `npm run fetch-models`), never during rendering." Add `npm run fetch-models` to Development Commands.

- [ ] **Step 2: Commit**

```bash
git add docs/features.md docs/user-guide.md docs/architecture.md CLAUDE.md
git commit -m "Document the image morph feature"
```

---

### Task 15: End-to-end verification in the desktop app

- [ ] **Step 1: Full suite**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: all pass.

- [ ] **Step 2: Performance in the webview engine**

In `studio-dev` (Chromium), time `renderMorph` on two 1080² canvases with 40 pairs via the javascript tool (5 runs, mean). Record it with the node number from Task 4. If over 33 ms, lower `MORPH_GRID` (and re-run Task 3's tests).

- [ ] **Step 3: Tauri run (Risk 2, Tauri half)**

Run `npm run tauri dev` (the preview config `studio-tauri`). Confirm `src-tauri/target/debug/models/dinov2-small-int8.onnx` exists. In the app: open or create a project, add an image layer with a real photo, enable Morph with a second photo, open the editor, press **Auto-match**, and confirm pairs appear (green/amber dots), then **Done**.

- [ ] **Step 4: Export**

Render the composition to MP4 from the Render panel and confirm the output plays with the morph visible (inspect a mid-morph frame with `ffmpeg -ss <t> -frames:v 1`).

- [ ] **Step 5: Final commit of any fixes, then finish the branch**

Use superpowers:finishing-a-development-branch.
