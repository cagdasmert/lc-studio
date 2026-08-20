# Reveal FX and Layer FX Envelope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every layer FX an optional timing envelope, and use it to add four reveal effects (zoom, pixelate, slice, wipe) and three continuous effects (glitch, outline, gooey).

**Architecture:** A single optional `window?: FxWindow` field on every member of the `LayerFxDef` union. The renderer collapses it to one scalar `env` per effect per frame. Reveal effects read `env` as geometry; continuous effects read it as an intensity multiplier. When `window` is absent `env` is `1`, so existing projects render byte-identically.

**Tech Stack:** TypeScript, React 19, Canvas 2D, Vite 7, Vitest (added by Task 1), Tauri v2.

**Spec:** `docs/superpowers/specs/2026-08-20-reveal-fx-envelope-design.md`

## Global Constraints

- **Never call `Math.random()` in renderer code.** Every stochastic value must derive from `hash` / `signedHash` in `src/renderer/noise.ts`, keyed on integer inputs. Preview and FFmpeg render draw the same frame at different times and must produce identical pixels.
- **`fx-schema.ts` is UI metadata only.** No **non-test** file under `src/renderer/` may import from `src/lib/fx-schema.ts`. The renderer keeps its own type lists. `src/renderer/fx-kinds.test.ts` is the deliberate exception: verifying that the two independent lists agree is only possible by importing both, and a test file ships nothing.
- **`src/types/index.ts` is an explicit re-export list, not a `export *`.** Every new interface added to `src/types/scene.ts` must also be added there, or importing it from `'../types'` fails to compile.
- **`fxPadding` must never depend on `env`.** Padding is computed from FX parameters alone. A canvas that changes size between frames resamples differently each frame and produces visible edge crawl.
- **Backward compatibility is absolute.** No `.lcs.json` migration. `window` absent → `env = 1` → identical output to tag `fx-v1`.
- **`npx tsc --noEmit` must pass at the end of every task.** `tsconfig.json` sets `strict`, `noUnusedLocals`, and `noUnusedParameters` — an unused function parameter is a build error here, not a warning.
- Baseline for this work is tag `fx-v1` (commit `1634217`).

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/renderer/fx-envelope.ts` | **New.** Pure. `envelope()` — the one scalar. No DOM. |
| `src/renderer/fx-geometry.ts` | **New.** Pure. Slice band ordering and staggered progress. No DOM. |
| `src/renderer/layer-fx.ts` | Two-phase composite, padding table, `REVEAL_FX` / `BITMAP_FX` lists, all bitmap-stage draw functions. |
| `src/renderer/draw.ts` | Transform-stage zoom; envelope on `echo`; passes `layerDuration`. |
| `src/types/scene.ts` | `FxWindow`, `window?` on every FX, seven new FX interfaces. |
| `src/lib/fx-schema.ts` | `select` field kind, `FxSpec.kind`, seven new specs. |
| `src/components/storyboard/PropertyInspector.tsx` | Envelope sub-panel, `select` control. |
| `src/renderer/*.test.ts` | Vitest unit tests for the pure logic. |

Pure logic lives in `fx-envelope.ts` and `fx-geometry.ts` specifically so Vitest can run it under the `node` environment with no canvas polyfill.

---

## Task 1: Vitest harness and the envelope scalar

**Files:**
- Modify: `package.json`, `src/types/scene.ts`, `src/types/index.ts`
- Create: `vitest.config.ts`
- Create: `src/renderer/fx-envelope.ts`
- Test: `src/renderer/fx-envelope.test.ts`, `src/renderer/noise.test.ts`

**Interfaces:**
- Consumes: `getEasing(name, params)` from `src/renderer/easing.ts`; `EasingType`, `EasingParams` from `src/types`.
- Produces: `envelope(window: FxWindow | undefined, frameInLayer: number, layerDuration: number, clamp: boolean): number`. Every later task calls this.

- [ ] **Step 1: Install Vitest and add the test script**

```bash
npm i -D vitest@^3
```

Then add to the `"scripts"` block in `package.json`, after `"preview"`:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 2: Create the Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Renderer logic under test is pure — no DOM, no canvas polyfill needed.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: Write a test against existing code to prove the harness runs**

Create `src/renderer/noise.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { hash, signedHash } from './noise';

describe('hash', () => {
  it('returns the same value for the same inputs', () => {
    expect(hash(12, 7)).toBe(hash(12, 7));
  });

  it('returns different values for different inputs', () => {
    expect(hash(12, 7)).not.toBe(hash(12, 8));
  });

  it('stays in [0, 1)', () => {
    for (let i = 0; i < 500; i++) {
      const v = hash(i, i * 31);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('signedHash', () => {
  it('stays in [-1, 1)', () => {
    for (let i = 0; i < 500; i++) {
      const v = signedHash(i, 4001);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThan(1);
    }
  });
});
```

- [ ] **Step 4: Run it to confirm the harness works**

Run: `npm test`
Expected: PASS, 4 tests. If this fails, the harness is wrong — fix it before continuing.

- [ ] **Step 5: Add the `FxWindow` type**

In `src/types/scene.ts`, insert immediately before the `// ── Layer FX ──` banner comment (currently line 125):

```ts
// ── FX timing envelope ────────────────────────────────
// Any layer FX may carry a window. The renderer collapses it to a single
// scalar `env`: 0 → 1 across the entrance, 1 while held, 1 → 0 across the
// exit. Absent window means env is always 1, i.e. the effect is always on.

export interface FxWindow {
  inDelay: number;    // frames after layer start before the entrance begins
  inFrames: number;   // entrance length; 0 = no entrance
  outFrames: number;  // exit length, measured back from the last frame; 0 = none
  easing: EasingType;
  easingParams?: EasingParams;
}
```

Then add `FxWindow` to the explicit re-export list in `src/types/index.ts` — it is a hand-maintained list, not `export *`, so the test in Step 6 will not compile without it.

- [ ] **Step 6: Write the failing envelope test**

Create `src/renderer/fx-envelope.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { FxWindow } from '../types';
import { envelope } from './fx-envelope';

const linear = (over: Partial<FxWindow> = {}): FxWindow => ({
  inDelay: 0, inFrames: 0, outFrames: 0, easing: 'linear', ...over,
});

describe('envelope', () => {
  it('returns 1 when there is no window', () => {
    expect(envelope(undefined, 0, 60, true)).toBe(1);
    expect(envelope(undefined, 30, 60, true)).toBe(1);
  });

  it('returns 1 for a zero-length layer', () => {
    expect(envelope(linear({ inFrames: 10 }), 0, 0, true)).toBe(1);
  });

  it('ramps 0 to 1 across the entrance', () => {
    const w = linear({ inFrames: 10 });
    expect(envelope(w, 0, 60, true)).toBe(0);
    expect(envelope(w, 5, 60, true)).toBeCloseTo(0.5);
    expect(envelope(w, 10, 60, true)).toBe(1);
    expect(envelope(w, 40, 60, true)).toBe(1);
  });

  it('holds at 0 through inDelay, then ramps', () => {
    const w = linear({ inDelay: 6, inFrames: 10 });
    expect(envelope(w, 0, 60, true)).toBe(0);
    expect(envelope(w, 5, 60, true)).toBe(0);
    expect(envelope(w, 6, 60, true)).toBe(0);
    expect(envelope(w, 11, 60, true)).toBeCloseTo(0.5);
    expect(envelope(w, 16, 60, true)).toBe(1);
  });

  it('ignores inDelay when there is no entrance', () => {
    expect(envelope(linear({ inDelay: 20 }), 0, 60, true)).toBe(1);
  });

  it('ramps 1 to 0 across the exit, reaching 0 on the last rendered frame', () => {
    // duration 60 -> frames 0..59, lastFrame 59, outStart 49
    const w = linear({ outFrames: 10 });
    expect(envelope(w, 40, 60, true)).toBe(1);
    expect(envelope(w, 49, 60, true)).toBe(1);
    expect(envelope(w, 54, 60, true)).toBeCloseTo(0.5);
    expect(envelope(w, 59, 60, true)).toBe(0);
  });

  it('applies entrance and exit together', () => {
    const w = linear({ inFrames: 10, outFrames: 10 });
    expect(envelope(w, 0, 60, true)).toBe(0);
    expect(envelope(w, 10, 60, true)).toBe(1);
    expect(envelope(w, 30, 60, true)).toBe(1);
    expect(envelope(w, 59, 60, true)).toBe(0);
  });

  it('multiplies rather than mins, so overlapping windows never reach full', () => {
    // duration 12 -> lastFrame 11, outStart 1. Entrance and exit overlap.
    const w = linear({ inFrames: 10, outFrames: 10 });
    const mid = envelope(w, 6, 12, true);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it('preserves easing overshoot when clamp is false', () => {
    const w = linear({ inFrames: 10, easing: 'ease-out-back' });
    const peak = Math.max(
      ...[6, 7, 8, 9].map((f) => envelope(w, f, 60, false)),
    );
    expect(peak).toBeGreaterThan(1);
  });

  it('clips overshoot when clamp is true', () => {
    const w = linear({ inFrames: 10, easing: 'ease-out-back' });
    for (let f = 0; f <= 20; f++) {
      const v = envelope(w, f, 60, true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npm test -- fx-envelope`
Expected: FAIL — `Failed to resolve import "./fx-envelope"`.

- [ ] **Step 8: Implement the envelope**

Create `src/renderer/fx-envelope.ts`:

```ts
import type { FxWindow } from '../types';
import { getEasing } from './easing';

/**
 * Collapse an FX timing window to a single scalar for one frame.
 *
 * 0 at the start of the entrance, 1 once it completes, back to 0 across the
 * exit. Reveal effects read this as geometry (0 = unrevealed); continuous
 * effects read it as an intensity multiplier.
 *
 * `clamp` must be false for reveals and true for continuous effects: the
 * back/elastic/spring easings overshoot outside [0, 1], which is the desired
 * look for a reveal but would mean a negative glow radius for a decoration.
 */
export function envelope(
  window: FxWindow | undefined,
  frameInLayer: number,
  layerDuration: number,
  clamp: boolean,
): number {
  if (!window || layerDuration <= 0) return 1;

  const ease = getEasing(window.easing, window.easingParams);
  const f = frameInLayer;

  let enter = 1;
  if (window.inFrames > 0) {
    if (f < window.inDelay) {
      enter = 0;
    } else if (f < window.inDelay + window.inFrames) {
      enter = ease((f - window.inDelay) / window.inFrames);
    }
  }

  let exit = 1;
  if (window.outFrames > 0) {
    // Frames run 0..layerDuration-1, so the exit must land on lastFrame.
    // Anchoring to layerDuration would leave 1/outFrames still showing.
    const lastFrame = layerDuration - 1;
    const outStart = lastFrame - window.outFrames;
    if (f >= lastFrame) {
      exit = 0;
    } else if (f > outStart) {
      exit = ease(1 - (f - outStart) / window.outFrames);
    }
  }

  // Multiply, not min: min would cap an overshooting entrance at the exit's
  // resting value of 1, throwing away the overshoot on purpose left unclamped.
  const env = enter * exit;
  return clamp ? Math.max(0, Math.min(1, env)) : env;
}
```

- [ ] **Step 9: Run the tests**

Run: `npm test`
Expected: PASS, all tests.

- [ ] **Step 10: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0, no output.

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/renderer/fx-envelope.ts src/renderer/fx-envelope.test.ts src/renderer/noise.test.ts src/types/scene.ts src/types/index.ts
git commit -m "Add Vitest and the FX timing envelope scalar"
```

---

## Task 2: Wire the envelope into the five existing effects

Deliverable: every existing effect accepts a `window` and dims by it. Nothing added to the UI yet, so this task is verified by tests and type-check.

**Files:**
- Modify: `src/types/scene.ts`
- Modify: `src/renderer/layer-fx.ts`
- Modify: `src/renderer/draw.ts:40-52` and `src/renderer/draw.ts:141-153`
- Test: `src/renderer/fx-padding.test.ts`

**Interfaces:**
- Consumes: `envelope()` from Task 1.
- Produces: `compositeLayerFx(ctx, bitmap, fx, pad, frameInLayer, layerDuration, filter)` — note the new sixth parameter. `REVEAL_FX: LayerFxType[]` exported from `layer-fx.ts`. `fxPadding(fx)` unchanged in signature.

- [ ] **Step 1: Add `window?` to the five existing FX interfaces**

In `src/types/scene.ts`, add `window?: FxWindow;` as the last field of `EchoFx`, `RgbSplitFx`, `ShineFx`, `GlowFx`, and `LongShadowFx`. For example `GlowFx` becomes:

```ts
export interface GlowFx {
  type: 'glow';
  color: string;
  radius: number;
  intensity: number;    // 0–3, how many passes worth of bloom
  pulseFrames: number;  // 0 = steady
  window?: FxWindow;
}
```

- [ ] **Step 2: Write the failing padding test**

Create `src/renderer/fx-padding.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { LayerFxDef } from '../types';
import { REVEAL_FX, fxPadding } from './layer-fx';

describe('fxPadding', () => {
  it('is zero for an empty or absent stack', () => {
    expect(fxPadding(undefined)).toBe(0);
    expect(fxPadding([])).toBe(0);
  });

  it('takes the maximum across the stack, not the sum', () => {
    const fx: LayerFxDef[] = [
      { type: 'glow', color: '#fff', radius: 10, intensity: 1, pulseFrames: 0 },
      { type: 'long-shadow', color: '#000', distance: 100, angle: 45, fade: 0.7 },
    ];
    expect(fxPadding(fx)).toBe(104); // long-shadow 100+4 beats glow 10*2
  });

  it('does not depend on the envelope', () => {
    const withWindow: LayerFxDef[] = [{
      type: 'glow', color: '#fff', radius: 30, intensity: 1, pulseFrames: 0,
      window: { inDelay: 0, inFrames: 10, outFrames: 0, easing: 'linear' },
    }];
    const without: LayerFxDef[] = [
      { type: 'glow', color: '#fff', radius: 30, intensity: 1, pulseFrames: 0 },
    ];
    expect(fxPadding(withWindow)).toBe(fxPadding(without));
  });
});

describe('REVEAL_FX', () => {
  it('does not yet contain any of the original five effects', () => {
    for (const t of ['echo', 'rgb-split', 'shine', 'glow', 'long-shadow']) {
      expect(REVEAL_FX).not.toContain(t);
    }
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test -- fx-padding`
Expected: FAIL — `REVEAL_FX` is not exported from `./layer-fx`.

- [ ] **Step 4: Add the `REVEAL_FX` list to `layer-fx.ts`**

In `src/renderer/layer-fx.ts`, directly below the existing `BITMAP_FX` declaration:

```ts
/** FX whose geometry is driven by the envelope rather than merely dimmed by
 *  it. These read `env` unclamped so back/elastic easings can overshoot.
 *  Mirrors `kind: 'reveal'` in fx-schema.ts — the renderer must not import
 *  that module, so the knowledge is duplicated and a test keeps them in sync. */
export const REVEAL_FX: LayerFxType[] = [];
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- fx-padding`
Expected: PASS, 4 tests.

- [ ] **Step 6: Add the envelope helper to `layer-fx.ts`**

Add this import at the top of `src/renderer/layer-fx.ts`:

```ts
import { envelope } from './fx-envelope';
```

And add this helper below `getFx`:

```ts
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
```

- [ ] **Step 7: Thread `layerDuration` into `compositeLayerFx` and dim each effect**

Replace the whole `compositeLayerFx` function at the bottom of `src/renderer/layer-fx.ts` with:

```ts
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

  ctx.save();
  ctx.translate(-pad, -pad);
  if (filter !== 'none') ctx.filter = filter;

  if (longShadow) {
    const e = fxEnv(longShadow, frameInLayer, layerDuration);
    if (e > 0) {
      drawLongShadow(ctx, bitmap, { ...longShadow, distance: longShadow.distance * e });
    }
  }
  if (glow) {
    const e = fxEnv(glow, frameInLayer, layerDuration);
    if (e > 0) {
      drawGlow(ctx, bitmap, { ...glow, radius: glow.radius * e }, frameInLayer);
    }
  }

  const splitEnv = rgbSplit ? fxEnv(rgbSplit, frameInLayer, layerDuration) : 0;
  if (rgbSplit && splitEnv > 0) {
    drawRgbSplit(
      ctx, bitmap, { ...rgbSplit, offset: rgbSplit.offset * splitEnv }, frameInLayer,
    );
  } else {
    ctx.drawImage(bitmap, 0, 0);
  }

  if (shine) {
    const e = fxEnv(shine, frameInLayer, layerDuration);
    if (e > 0) {
      drawShine(ctx, bitmap, { ...shine, intensity: shine.intensity * e }, frameInLayer);
    }
  }

  ctx.filter = 'none';
  ctx.restore();
}
```

- [ ] **Step 8: Update the call site and apply the envelope to `echo`**

In `src/renderer/draw.ts`, find the `compositeLayerFx` call around line 149 and add the duration argument:

```ts
  if (needsFxCanvas && layerCanvas) {
    compositeLayerFx(
      ctx, layerCanvas, layer.layerFx, fxPad, frameInLayer,
      layer.endFrame - layer.startFrame,
      buildFilterString(layer.effects),
    );
```

Then apply the envelope to `echo`. It is handled in the scene loop at `draw.ts:40-52`, not in the compositor, because it re-runs the whole layer draw at earlier frames. Replace that block with:

```ts
    // Echo: stamp the layer as it was a few frames ago, fading with distance.
    // Drawn first so the trail sits behind the layer itself.
    const echo = getFx(layer.layerFx, 'echo');
    if (echo && echo.count > 0 && echo.frameGap > 0) {
      const echoEnv = fxEnv(
        echo, frameInScene - layer.startFrame, layer.endFrame - layer.startFrame,
      );
      if (echoEnv > 0) {
        for (let step = echo.count; step >= 1; step--) {
          const pastFrame = frameInScene - step * echo.frameGap;
          if (pastFrame < layer.startFrame) continue;
          drawLayerAtFrame(
            ctx, layer, pastFrame, mediaCache, fps, videoCache,
            Math.pow(echo.decay, step) * echoEnv,
          );
        }
      }
    }
```

Add `fxEnv` to the existing `./layer-fx` import.

- [ ] **Step 9: Run tests and type-check**

Run: `npm test`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 10: Verify no visual regression**

Start the app with `npm run tauri dev`, open a project with an existing glow or rgb-split effect, and confirm it looks exactly as it did before. No effect has a `window` yet, so `env` is `1` everywhere and output must be unchanged.

- [ ] **Step 11: Commit**

```bash
git add src/types/scene.ts src/renderer/layer-fx.ts src/renderer/draw.ts src/renderer/fx-padding.test.ts
git commit -m "Apply the FX envelope to the five existing layer effects"
```

---

## Task 3: Envelope controls in the inspector

Deliverable: you can put a fade-in on a glow from the UI and watch it work.

**Files:**
- Modify: `src/lib/fx-schema.ts`
- Modify: `src/components/storyboard/PropertyInspector.tsx:524-611`
- Modify: `src/App.css`

**Interfaces:**
- Consumes: `FxWindow` from Task 1.
- Produces: `FxSpec.kind: 'reveal' | 'continuous'`; `FxField` with `kind: 'select'`; `FxListEditor` prop `showEnvelope?: boolean`; exported `DEFAULT_FX_WINDOW`.

- [ ] **Step 1: Extend the schema types**

In `src/lib/fx-schema.ts`, replace the `FxField` and `FxSpec` interfaces with:

```ts
export interface FxFieldOption {
  value: string;
  label: string;
}

export interface FxField {
  key: string;
  label: string;
  kind: 'number' | 'color' | 'select';
  min?: number;
  max?: number;
  step?: number;
  options?: FxFieldOption[];  // required when kind is 'select'
}

export interface FxSpec<T> {
  label: string;
  hint: string;
  /** 'reveal' effects are driven by the envelope; 'continuous' ones are
   *  merely dimmed by it. UI only — the renderer keeps its own REVEAL_FX
   *  list in layer-fx.ts and must not import this module. */
  kind: 'reveal' | 'continuous';
  defaults: T;
  fields: FxField[];
}
```

Add the `select` helper next to `num` and `color`:

```ts
const select = (key: string, label: string, options: FxFieldOption[]): FxField =>
  ({ key, label, kind: 'select', options });
```

And export the default window:

```ts
import type { FxWindow } from '../types';

/** What a reveal gets when you add it: a 12-frame entrance, no exit. */
export const DEFAULT_FX_WINDOW: FxWindow = {
  inDelay: 0, inFrames: 12, outFrames: 0, easing: 'ease-out-cubic',
};
```

- [ ] **Step 2: Mark the five existing layer specs and the four scene specs**

Add `kind: 'continuous',` immediately after the `hint` line in each of the five entries in `LAYER_FX_SPECS` and each of the four entries in `SCENE_FX_SPECS`.

- [ ] **Step 3: Type-check to find every spec you missed**

Run: `npx tsc --noEmit`
Expected: exit 0. Any error naming a missing `kind` property points at a spec you skipped.

- [ ] **Step 4: Add the `select` control to `FxListEditor`**

In `src/components/storyboard/PropertyInspector.tsx`, the field loop currently branches `field.kind === 'color' ? … : …`. Replace that ternary with an explicit three-way branch. Inside `spec.fields.map((field) => (`, use:

```tsx
              field.kind === 'color' ? (
                <label key={field.key} className="prop-field">
                  <span>{field.label}</span>
                  <input
                    type="color"
                    value={String((item as Record<string, unknown>)[field.key] ?? '#ffffff')}
                    onChange={(e) => patch(i, field.key, e.target.value)}
                  />
                </label>
              ) : field.kind === 'select' ? (
                <label key={field.key} className="prop-field">
                  <span>{field.label}</span>
                  <select
                    value={String((item as Record<string, unknown>)[field.key] ?? '')}
                    onChange={(e) => patch(i, field.key, e.target.value)}
                  >
                    {(field.options ?? []).map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>
              ) : (
```

leaving the existing range-slider branch as the final `else`.

- [ ] **Step 5: Add the envelope sub-panel**

Still in `FxListEditor`, widen the props to accept the flag and the spec kind:

```tsx
function FxListEditor<T extends { type: string }>({
  title, items, specs, typeList, onChange, showEnvelope = false,
}: {
  title: string;
  items: T[];
  specs: Record<string, { label: string; hint: string; kind: 'reveal' | 'continuous'; defaults: T; fields: FxField[] }>;
  typeList: string[];
  onChange: (items: T[]) => void;
  showEnvelope?: boolean;
}) {
```

Add a window patcher next to the existing `patch`:

```tsx
  function patchWindow(index: number, key: string, value: number | string) {
    const next = [...items];
    const current = (next[index] as Record<string, unknown>).window as FxWindow | undefined;
    const base = current ?? DEFAULT_FX_WINDOW;
    next[index] = { ...next[index], window: { ...base, [key]: value } };
    onChange(next);
  }

  function toggleWindow(index: number, on: boolean) {
    const next = [...items];
    const copy = { ...next[index] } as Record<string, unknown>;
    if (on) copy.window = { ...DEFAULT_FX_WINDOW };
    else delete copy.window;
    next[index] = copy as T;
    onChange(next);
  }
```

Then render the panel inside the effect card, after the `spec.fields.map(...)` block and before the closing `</div>`:

```tsx
            {showEnvelope && (() => {
              const win = (item as Record<string, unknown>).window as FxWindow | undefined;
              return (
                <div className="fx-envelope">
                  <label className="fx-envelope-toggle">
                    <input
                      type="checkbox"
                      checked={!!win}
                      onChange={(e) => toggleWindow(i, e.target.checked)}
                    />
                    <span>Timing</span>
                  </label>
                  {win && (
                    <>
                      {([
                        ['inDelay', 'Delay', 0, 120],
                        ['inFrames', 'In', 0, 120],
                        ['outFrames', 'Out', 0, 120],
                      ] as const).map(([key, label, min, max]) => (
                        <label key={key} className="prop-field fx-slider-field">
                          <span>{label}</span>
                          <input
                            type="range"
                            min={min}
                            max={max}
                            step={1}
                            value={win[key]}
                            onChange={(e) => patchWindow(i, key, Number(e.target.value))}
                          />
                          <span className="fx-value">{win[key]}</span>
                        </label>
                      ))}
                      <label className="prop-field">
                        <span>Easing</span>
                        <select
                          value={win.easing}
                          onChange={(e) => patchWindow(i, 'easing', e.target.value)}
                        >
                          {EASING_OPTIONS.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </label>
                    </>
                  )}
                </div>
              );
            })()}
```

Add the easing option list near the top of the file, below the imports:

```tsx
const EASING_OPTIONS: EasingType[] = [
  'linear',
  'ease-in', 'ease-out', 'ease-in-out',
  'ease-in-cubic', 'ease-out-cubic', 'ease-in-out-cubic',
  'ease-in-sine', 'ease-out-sine', 'ease-in-out-sine',
  'ease-in-expo', 'ease-out-expo', 'ease-in-out-expo',
  'ease-in-circ', 'ease-out-circ', 'ease-in-out-circ',
  'ease-in-back', 'ease-out-back', 'ease-in-out-back',
  'ease-in-elastic', 'ease-out-elastic', 'ease-in-out-elastic',
  'ease-in-bounce', 'ease-out-bounce', 'ease-in-out-bounce',
];
```

Add `EasingType` and `FxWindow` to the existing `../../types` import, and `DEFAULT_FX_WINDOW` to the `../../lib/fx-schema` import.

- [ ] **Step 6: Pass the flag from `LayerFxSection` only**

In `LayerFxSection`, add `showEnvelope` to the `<FxListEditor<LayerFxDef>` props. Leave `SceneFxSection` untouched — scene FX get no envelope.

- [ ] **Step 7: Style the panel**

Append to `src/App.css`, after the existing `.fx-value` rule:

```css
.fx-envelope {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #2a2a2a;
}
.fx-envelope-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  color: #ddd;
  margin-bottom: 6px;
}
.fx-envelope-toggle input { margin: 0; }
```

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 9: Verify in the app**

Run `npm run tauri dev`. Add a Neon glow to a text layer, tick **Timing**, set In to 20, and scrub the scene. The glow must bloom in over the first 20 frames and then hold. Untick Timing and confirm it reverts to always-on.

- [ ] **Step 10: Commit**

```bash
git add src/lib/fx-schema.ts src/components/storyboard/PropertyInspector.tsx src/App.css
git commit -m "Add FX envelope controls and select fields to the inspector"
```

---

## Task 4: Zoom reveal

The simplest reveal, and the only transform-stage one. Proves the reveal model end to end before any bitmap work.

**Files:**
- Modify: `src/types/scene.ts`, `src/types/index.ts`, `src/renderer/layer-fx.ts`, `src/renderer/draw.ts`, `src/lib/fx-schema.ts`
- Test: `src/renderer/fx-kinds.test.ts`

**Interfaces:**
- Consumes: `fxEnv`, `REVEAL_FX` from Task 2; `DEFAULT_FX_WINDOW` from Task 3.
- Produces: `ZoomFx` in the `LayerFxDef` union.

- [ ] **Step 1: Add the type**

In `src/types/scene.ts`, after `LongShadowFx`:

```ts
/** Scale-based reveal — punches in from `from` (or recedes, when from > 1). */
export interface ZoomFx {
  type: 'zoom';
  from: number;    // starting scale multiplier; <1 punches in, >1 recedes
  fade: number;    // 0–1, how much layer alpha is coupled to the envelope
  window?: FxWindow;
}
```

Extend the union:

```ts
export type LayerFxDef = EchoFx | RgbSplitFx | ShineFx | GlowFx | LongShadowFx | ZoomFx;
```

Add `ZoomFx` to the explicit re-export list in `src/types/index.ts`.

- [ ] **Step 2: Write the failing kinds test**

Create `src/renderer/fx-kinds.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { LAYER_FX_SPECS } from '../lib/fx-schema';
import { REVEAL_FX } from './layer-fx';
import type { LayerFxType } from '../types';

describe('REVEAL_FX', () => {
  it('matches the reveal specs in fx-schema, which the renderer cannot import', () => {
    const fromSpecs = (Object.keys(LAYER_FX_SPECS) as LayerFxType[])
      .filter((t) => LAYER_FX_SPECS[t].kind === 'reveal')
      .sort();
    expect([...REVEAL_FX].sort()).toEqual(fromSpecs);
  });

  it('contains zoom', () => {
    expect(REVEAL_FX).toContain('zoom');
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test -- fx-kinds`
Expected: FAIL — `REVEAL_FX` is empty, `zoom` not found.

- [ ] **Step 4: Register zoom as a reveal**

In `src/renderer/layer-fx.ts`:

```ts
export const REVEAL_FX: LayerFxType[] = ['zoom'];
```

Do **not** add `zoom` to `BITMAP_FX` — it runs at the transform stage and must stay on the cheap path.

- [ ] **Step 5: Add the spec**

In `src/lib/fx-schema.ts`, add to `LAYER_FX_SPECS`:

```ts
  zoom: {
    label: 'Zoom reveal',
    hint: 'Punches in or recedes as it appears. Set From above 1 to zoom out.',
    kind: 'reveal',
    defaults: { type: 'zoom', from: 0.6, fade: 1, window: { ...DEFAULT_FX_WINDOW } },
    fields: [
      num('from', 'From', 0.1, 3, 0.05),
      num('fade', 'Fade', 0, 1, 0.05),
    ],
  },
```

- [ ] **Step 6: Apply zoom at the transform stage**

In `src/renderer/draw.ts`, inside `drawLayerAtFrame`, immediately **after** the motion-path block and **before** `ctx.save()`:

```ts
  // Zoom reveal runs here, not in compositeLayerFx: it changes the resolved
  // scale, and `resolved` is what sizes the offscreen canvas further down.
  const layerDuration = layer.endFrame - layer.startFrame;
  const zoom = getFx(layer.layerFx, 'zoom');
  let revealAlpha = 1;
  if (zoom) {
    const e = fxEnv(zoom, frameInLayer, layerDuration);
    const scale = zoom.from + (1 - zoom.from) * e;
    resolved.scaleX *= scale;
    resolved.scaleY *= scale;
    if (zoom.fade > 0) {
      revealAlpha *= 1 - zoom.fade + zoom.fade * Math.max(0, Math.min(1, e));
    }
  }
```

Then fold `revealAlpha` into the opacity line a few lines below:

```ts
  ctx.globalAlpha *= Math.max(0, Math.min(1, resolved.opacity)) * alphaMultiplier * revealAlpha;
```

`getFx` is already imported in `draw.ts` (it is used by the echo block); add only `fxEnv` to that import.

Note the existing `const layerDuration` inside the motion-path block — remove that inner declaration and let it use the one you just hoisted, or the compiler will report a redeclaration.

- [ ] **Step 7: Run tests and type-check**

Run: `npm test`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 8: Verify in the app**

Run `npm run tauri dev`. Add **Zoom reveal** to a text layer. Scrub: the layer should scale up from 0.6 and fade in over 12 frames. Set Easing to `ease-out-back` and confirm it overshoots past full size before settling — this proves reveals are running unclamped. Set From to 1.4 and confirm it now shrinks into place.

- [ ] **Step 9: Commit**

```bash
git add src/types/scene.ts src/types/index.ts src/renderer/layer-fx.ts src/renderer/draw.ts src/lib/fx-schema.ts src/renderer/fx-kinds.test.ts
git commit -m "Add zoom reveal effect"
```

---

## Task 5: Pixelate reveal and the two-phase composite

The first bitmap-stage reveal. This task restructures `compositeLayerFx` into its reveal phase and decoration phase.

**Files:**
- Modify: `src/types/scene.ts`, `src/types/index.ts`, `src/renderer/layer-fx.ts`, `src/lib/fx-schema.ts`

**Interfaces:**
- Produces: `interface RevealResult { bitmap: HTMLCanvasElement; alpha: number }`, and `applyReveals(bitmap, fx, frameInLayer, layerDuration): RevealResult` in `layer-fx.ts`. Tasks 6 and 7 add cases to it.

- [ ] **Step 1: Add the type**

In `src/types/scene.ts`, after `ZoomFx`:

```ts
/** Mosaic reveal — content resolves out of coarse blocks. */
export interface PixelateFx {
  type: 'pixelate';
  maxBlock: number;  // block size in px at env 0
  flicker: number;   // 0–1, per-block alpha noise so blocks pop rather than sharpen
  fade: number;      // 0–1, how much layer alpha is coupled to the envelope
  window?: FxWindow;
}
```

Add `PixelateFx` to the `LayerFxDef` union, and add `PixelateFx` to the explicit re-export list in `src/types/index.ts`.

- [ ] **Step 2: Add the reveal phase to `layer-fx.ts`**

Add the `hash` import: change the existing noise import to
`import { hash, signedHash } from './noise';`

Then add, above `compositeLayerFx`:

```ts
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
      default:
        break;
    }
  }
  return { bitmap: current, alpha };
}
```

Add `PixelateFx` to the type import at the top of the file.

- [ ] **Step 3: Split `compositeLayerFx` into two phases**

In `compositeLayerFx`, immediately after the `getFx` lookups and before `ctx.save()`:

```ts
  const reveal = applyReveals(bitmap, fx, frameInLayer, layerDuration);
  const src = reveal.bitmap;
```

Then replace every remaining use of `bitmap` inside the function body with `src`, and after `if (filter !== 'none') ctx.filter = filter;` add:

```ts
  ctx.globalAlpha *= reveal.alpha;
```

- [ ] **Step 4: Register pixelate**

In `layer-fx.ts`:

```ts
const BITMAP_FX: LayerFxType[] = ['rgb-split', 'shine', 'glow', 'long-shadow', 'pixelate'];
export const REVEAL_FX: LayerFxType[] = ['zoom', 'pixelate'];
```

Pixelate adds no padding — it stays inside the layer box — so `fxPadding` needs no new case.

- [ ] **Step 5: Add the spec**

In `src/lib/fx-schema.ts`:

```ts
  pixelate: {
    label: 'Pixelate reveal',
    hint: 'Content resolves out of coarse blocks, with optional per-block flicker.',
    kind: 'reveal',
    defaults: { type: 'pixelate', maxBlock: 40, flicker: 0.6, fade: 0.4, window: { ...DEFAULT_FX_WINDOW } },
    fields: [
      num('maxBlock', 'Max block', 2, 160),
      num('flicker', 'Flicker', 0, 1, 0.05),
      num('fade', 'Fade', 0, 1, 0.05),
    ],
  },
```

- [ ] **Step 6: Run tests and type-check**

Run: `npm test`
Expected: PASS — `fx-kinds` now checks `['pixelate', 'zoom']` against the specs.

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Verify in the app**

Run `npm run tauri dev`. Add **Pixelate reveal** to an image layer. Scrub: blocks should start coarse and resolve. Then stack a Neon glow on the same layer and confirm the glow follows the pixelated shape — that is the proof reveals run before decorations.

- [ ] **Step 8: Commit**

```bash
git add src/types/scene.ts src/types/index.ts src/renderer/layer-fx.ts src/lib/fx-schema.ts
git commit -m "Add pixelate reveal and split the compositor into reveal and decoration phases"
```

---

## Task 6: Slice reveal

**Files:**
- Create: `src/renderer/fx-geometry.ts`
- Test: `src/renderer/fx-geometry.test.ts`
- Modify: `src/types/scene.ts`, `src/types/index.ts`, `src/renderer/layer-fx.ts`, `src/lib/fx-schema.ts`

**Interfaces:**
- Produces: `bandOrderPosition(i, bands, order): number` and `bandProgress(env, orderPos, stagger): number` from `fx-geometry.ts`.

- [ ] **Step 1: Write the failing geometry test**

Create `src/renderer/fx-geometry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { bandOrderPosition, bandProgress } from './fx-geometry';

describe('bandOrderPosition', () => {
  it('returns 0 for a single band', () => {
    expect(bandOrderPosition(0, 1, 'sequential')).toBe(0);
    expect(bandOrderPosition(0, 1, 'center-out')).toBe(0);
  });

  it('spreads sequential bands evenly from 0 to 1', () => {
    expect(bandOrderPosition(0, 5, 'sequential')).toBe(0);
    expect(bandOrderPosition(2, 5, 'sequential')).toBeCloseTo(0.5);
    expect(bandOrderPosition(4, 5, 'sequential')).toBe(1);
  });

  it('puts the centre band first for an odd count', () => {
    expect(bandOrderPosition(2, 5, 'center-out')).toBe(0);
    expect(bandOrderPosition(0, 5, 'center-out')).toBe(1);
    expect(bandOrderPosition(4, 5, 'center-out')).toBe(1);
  });

  it('puts the two centre bands first for an even count', () => {
    expect(bandOrderPosition(1, 4, 'center-out')).toBe(0);
    expect(bandOrderPosition(2, 4, 'center-out')).toBe(0);
    expect(bandOrderPosition(0, 4, 'center-out')).toBe(1);
    expect(bandOrderPosition(3, 4, 'center-out')).toBe(1);
  });

  it('starts both bands together when there are only two', () => {
    // The naive |i-mid|/mid would give both 1, delaying every band there is.
    expect(bandOrderPosition(0, 2, 'center-out')).toBe(0);
    expect(bandOrderPosition(1, 2, 'center-out')).toBe(0);
  });

  it('is deterministic for random order', () => {
    expect(bandOrderPosition(3, 10, 'random')).toBe(bandOrderPosition(3, 10, 'random'));
  });

  it('stays in [0, 1] for every order and band count', () => {
    for (const order of ['sequential', 'center-out', 'random'] as const) {
      for (let bands = 1; bands <= 24; bands++) {
        for (let i = 0; i < bands; i++) {
          const v = bandOrderPosition(i, bands, order);
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe('bandProgress', () => {
  it('gives every band the same progress at zero stagger', () => {
    expect(bandProgress(0.4, 0, 0)).toBeCloseTo(0.4);
    expect(bandProgress(0.4, 1, 0)).toBeCloseTo(0.4);
  });

  it('delays later bands as stagger rises', () => {
    expect(bandProgress(0.5, 0, 0.5)).toBeGreaterThan(bandProgress(0.5, 1, 0.5));
  });

  it('clamps stagger so it never divides by zero', () => {
    expect(Number.isFinite(bandProgress(0.5, 0.5, 1))).toBe(true);
    expect(Number.isFinite(bandProgress(0.5, 0.5, 5))).toBe(true);
  });

  it('clamps output to [0, 1]', () => {
    expect(bandProgress(-1, 0, 0)).toBe(0);
    expect(bandProgress(2, 0, 0)).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- fx-geometry`
Expected: FAIL — cannot resolve `./fx-geometry`.

- [ ] **Step 3: Implement the geometry**

Create `src/renderer/fx-geometry.ts`:

```ts
import { hash } from './noise';

export type SliceOrder = 'sequential' | 'center-out' | 'random';

/**
 * Where band `i` sits in the reveal order, as 0 (first) to 1 (last).
 * Pure and DOM-free so it can be unit-tested without a canvas.
 */
export function bandOrderPosition(i: number, bands: number, order: SliceOrder): number {
  if (bands <= 1) return 0;
  switch (order) {
    case 'sequential':
      return i / (bands - 1);
    case 'center-out': {
      const mid = (bands - 1) / 2;
      // With an even band count no band sits exactly on the centre, so the
      // closest pair is 0.5 away. Rebasing by that distance is what lets the
      // centre-most bands start at 0 instead of being pushed to the end.
      const minDist = bands % 2 === 0 ? 0.5 : 0;
      const range = mid - minDist;
      return range <= 0 ? 0 : (Math.abs(i - mid) - minDist) / range;
    }
    case 'random':
      // Fixed seed: the shuffle must be identical on every frame and in
      // every render, or bands would reshuffle as the reveal plays.
      return hash(i, 9173);
  }
}

/** A single band's local progress, given the layer envelope and a stagger. */
export function bandProgress(env: number, orderPos: number, stagger: number): number {
  const s = Math.max(0, Math.min(0.95, stagger));
  const local = (env - orderPos * s) / (1 - s);
  return Math.max(0, Math.min(1, local));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- fx-geometry`
Expected: PASS, 11 tests.

- [ ] **Step 5: Add the type**

In `src/types/scene.ts`, after `PixelateFx`:

```ts
/** Banded reveal — the layer arrives in strips. */
export interface SliceFx {
  type: 'slice';
  bands: number;
  direction: 'horizontal' | 'vertical';
  order: 'sequential' | 'center-out' | 'random';
  travel: number;   // px each band slides in from; 0 = fade only
  stagger: number;  // 0 = all bands together, approaching 1 = strictly sequential
  window?: FxWindow;
}
```

Add `SliceFx` to the `LayerFxDef` union, and add `SliceFx` to the explicit re-export list in `src/types/index.ts`.

- [ ] **Step 6: Implement the draw**

In `src/renderer/layer-fx.ts`, add `import { bandOrderPosition, bandProgress } from './fx-geometry';` and add this function above `applyReveals`:

```ts
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
    // as the whole layer sliding in.
    const sign = i % 2 === 0 ? 1 : -1;
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
```

Add `SliceFx` to the type import.

- [ ] **Step 7: Register slice**

In `layer-fx.ts`, add `'slice'` to both `BITMAP_FX` and `REVEAL_FX`, add the case to `applyReveals`:

```ts
      case 'slice':
        current = applySlice(current, f, env);
        break;
```

and add the padding case inside `fxPadding`'s switch:

```ts
      case 'slice': pad = Math.max(pad, Math.abs(f.travel)); break;
```

- [ ] **Step 8: Add the spec**

In `src/lib/fx-schema.ts`:

```ts
  slice: {
    label: 'Slice reveal',
    hint: 'The layer arrives in strips. Alternate bands slide in from opposite sides.',
    kind: 'reveal',
    defaults: {
      type: 'slice', bands: 10, direction: 'horizontal',
      order: 'sequential', travel: 60, stagger: 0.5,
      window: { ...DEFAULT_FX_WINDOW },
    },
    fields: [
      num('bands', 'Bands', 1, 40),
      select('direction', 'Direction', [
        { value: 'horizontal', label: 'Horizontal' },
        { value: 'vertical', label: 'Vertical' },
      ]),
      select('order', 'Order', [
        { value: 'sequential', label: 'Sequential' },
        { value: 'center-out', label: 'Centre out' },
        { value: 'random', label: 'Random' },
      ]),
      num('travel', 'Travel', 0, 400, 5),
      num('stagger', 'Stagger', 0, 0.95, 0.05),
    ],
  },
```

- [ ] **Step 9: Run tests and type-check**

Run: `npm test`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 10: Verify in the app**

Run `npm run tauri dev`. Add **Slice reveal** to a text layer. Confirm: bands slide in alternating directions; setting Bands to 1 gives a plain fade with no crash; each of the three Order values visibly changes which strips arrive first; Travel 0 leaves a pure staggered fade.

- [ ] **Step 11: Commit**

```bash
git add src/renderer/fx-geometry.ts src/renderer/fx-geometry.test.ts src/types/scene.ts src/types/index.ts src/renderer/layer-fx.ts src/lib/fx-schema.ts
git commit -m "Add slice reveal effect"
```

---

## Task 7: Wipe reveal

**Files:**
- Modify: `src/types/scene.ts`, `src/types/index.ts`, `src/renderer/layer-fx.ts`, `src/lib/fx-schema.ts`

- [ ] **Step 1: Add the type**

In `src/types/scene.ts`, after `SliceFx`:

```ts
/** Masked reveal — a soft edge sweeps across and the layer appears behind it. */
export interface WipeFx {
  type: 'wipe';
  shape: 'linear' | 'iris' | 'barn';
  angle: number;     // degrees; applies to linear and barn
  softness: number;  // px of gradient ramp; 0 = hard edge
  window?: FxWindow;
}
```

Add `WipeFx` to the `LayerFxDef` union, and add `WipeFx` to the explicit re-export list in `src/types/index.ts`.

- [ ] **Step 2: Implement the draw**

In `src/renderer/layer-fx.ts`, above `applyReveals`:

```ts
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
    // Barn doors open from the centre outward, so each half covers half the
    // span in the same time a linear wipe covers all of it.
    const reach = fx.shape === 'barn' ? (t * (span / 2 + soft)) : (t * (span + soft));
    const cx = w / 2;
    const cy = h / 2;

    const edge = (from: number, to: number) => {
      const grad = mctx.createLinearGradient(
        cx + dx * from, cy + dy * from,
        cx + dx * to, cy + dy * to,
      );
      grad.addColorStop(0, '#fff');
      grad.addColorStop(1, 'transparent');
      return grad;
    };

    if (fx.shape === 'barn') {
      mctx.fillStyle = edge(reach - soft, reach);
      mctx.fillRect(0, 0, w, h);
      mctx.fillStyle = edge(-(reach - soft), -reach);
      mctx.fillRect(0, 0, w, h);
    } else {
      const head = -span / 2 + reach;
      mctx.fillStyle = edge(head - soft - span, head);
      mctx.fillRect(0, 0, w, h);
    }
  }

  octx.globalCompositeOperation = 'destination-in';
  octx.drawImage(mask, 0, 0);
  return out;
}
```

Add `WipeFx` to the type import.

- [ ] **Step 3: Register wipe**

Add `'wipe'` to `BITMAP_FX` and `REVEAL_FX`, and add the case to `applyReveals`:

```ts
      case 'wipe':
        current = applyWipe(current, f, env);
        break;
```

Wipe stays inside the layer box, so `fxPadding` needs no case.

- [ ] **Step 4: Add the spec**

```ts
  wipe: {
    label: 'Wipe reveal',
    hint: 'A soft edge sweeps across. Linear, iris, or barn doors.',
    kind: 'reveal',
    defaults: { type: 'wipe', shape: 'linear', angle: 0, softness: 40, window: { ...DEFAULT_FX_WINDOW } },
    fields: [
      select('shape', 'Shape', [
        { value: 'linear', label: 'Linear' },
        { value: 'iris', label: 'Iris' },
        { value: 'barn', label: 'Barn doors' },
      ]),
      num('angle', 'Angle', 0, 360, 5),
      num('softness', 'Softness', 0, 300, 5),
    ],
  },
```

- [ ] **Step 5: Run tests and type-check**

Run: `npm test`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Verify in the app**

Run `npm run tauri dev`. Add **Wipe reveal**. Check all three shapes: linear sweeps across at the given angle; iris opens from the centre; barn opens from the centre in both directions. Confirm Softness 0 gives a hard edge and that the layer is fully visible once the entrance completes.

- [ ] **Step 7: Commit**

```bash
git add src/types/scene.ts src/types/index.ts src/renderer/layer-fx.ts src/lib/fx-schema.ts
git commit -m "Add wipe reveal effect"
```

---

## Task 8: Glitch blocks

**Files:**
- Modify: `src/types/scene.ts`, `src/types/index.ts`, `src/renderer/layer-fx.ts`, `src/lib/fx-schema.ts`

- [ ] **Step 1: Add the type**

In `src/types/scene.ts`, after `WipeFx`:

```ts
/** Horizontal strips jumping sideways on random frames — digital tearing. */
export interface GlitchFx {
  type: 'glitch';
  bands: number;
  maxOffset: number;    // px of horizontal displacement
  channelShift: number; // px of rgb fringing on displaced bands
  probability: number;  // 0–1, chance a given band tears on a given frame
  window?: FxWindow;
}
```

Add `GlitchFx` to the `LayerFxDef` union, and add `GlitchFx` to the explicit re-export list in `src/types/index.ts`.

- [ ] **Step 2: Implement the draw**

In `src/renderer/layer-fx.ts`, above `compositeLayerFx`:

```ts
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

    const cs = fx.channelShift * env;
    if (cs > 0) {
      const r = channel(bitmap, '#ff0000');
      const b = channel(bitmap, '#0000ff');
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(r, 0, sy, w, sh, shift - cs, sy, w, sh);
      ctx.drawImage(b, 0, sy, w, sh, shift + cs, sy, w, sh);
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  ctx.restore();
}
```

Add `GlitchFx` to the type import.

- [ ] **Step 3: Call it in the decoration phase**

In `compositeLayerFx`, add the lookup alongside the others:

```ts
  const glitch = getFx(fx, 'glitch');
```

and call it after the base bitmap is drawn, before `shine`:

```ts
  if (glitch) {
    const e = fxEnv(glitch, frameInLayer, layerDuration);
    if (e > 0) drawGlitch(ctx, src, glitch, frameInLayer, e);
  }
```

- [ ] **Step 4: Register glitch**

Add `'glitch'` to `BITMAP_FX` only — it is continuous, so it does **not** go in `REVEAL_FX`. Add the padding case:

```ts
      case 'glitch': pad = Math.max(pad, f.maxOffset + f.channelShift); break;
```

- [ ] **Step 5: Add the spec**

```ts
  glitch: {
    label: 'Glitch blocks',
    hint: 'Horizontal strips tear sideways on random frames, with rgb fringing.',
    kind: 'continuous',
    defaults: { type: 'glitch', bands: 12, maxOffset: 30, channelShift: 6, probability: 0.25 },
    fields: [
      num('bands', 'Bands', 1, 60),
      num('maxOffset', 'Max offset', 0, 200),
      num('channelShift', 'Channel shift', 0, 40),
      num('probability', 'Frequency', 0, 1, 0.05),
    ],
  },
```

- [ ] **Step 6: Run tests and type-check**

Run: `npm test`
Expected: PASS — `fx-kinds` confirms glitch is absent from `REVEAL_FX` and from the reveal specs.

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Verify determinism in the app**

Run `npm run tauri dev`. Add **Glitch blocks**. Scrub to a specific frame, note the tear pattern, scrub away and back, and confirm the pattern is identical — this is the check that no `Math.random()` crept in. Then tick Timing, set In to 20, and confirm the tearing eases in rather than starting at full strength.

- [ ] **Step 8: Commit**

```bash
git add src/types/scene.ts src/types/index.ts src/renderer/layer-fx.ts src/lib/fx-schema.ts
git commit -m "Add glitch blocks effect"
```

---

## Task 9: Outline and gooey

Two small continuous effects, grouped because each is a handful of lines and neither needs its own review cycle.

**Files:**
- Modify: `src/types/scene.ts`, `src/types/index.ts`, `src/renderer/layer-fx.ts`, `src/lib/fx-schema.ts`

- [ ] **Step 1: Add both types**

In `src/types/scene.ts`, after `GlitchFx`:

```ts
/** Sticker-style border hugging the layer's silhouette. */
export interface OutlineFx {
  type: 'outline';
  color: string;
  width: number;  // px
  window?: FxWindow;
}

/** Blur-plus-contrast melt — neighbouring shapes fuse like liquid. */
export interface GooeyFx {
  type: 'gooey';
  blur: number;      // px
  contrast: number;  // multiplier; higher tightens the edge
  window?: FxWindow;
}
```

Add both to the `LayerFxDef` union, and add `OutlineFx` and `GooeyFx` to the explicit re-export list in `src/types/index.ts`.

- [ ] **Step 2: Implement outline**

In `src/renderer/layer-fx.ts`, above `compositeLayerFx`:

```ts
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
```

- [ ] **Step 3: Wire outline and gooey into the decoration phase**

In `compositeLayerFx`, add the lookups:

```ts
  const outline = getFx(fx, 'outline');
  const gooey = getFx(fx, 'gooey');
```

Outline must be drawn *before* the base bitmap so the ring sits behind the layer. Put it immediately after the `long-shadow` block:

```ts
  if (outline) {
    const e = fxEnv(outline, frameInLayer, layerDuration);
    if (e > 0) drawOutline(ctx, src, outline, e);
  }
```

Gooey is a filter, so it composes with the layer's own filter string. Replace the `if (filter !== 'none') ctx.filter = filter;` line with:

```ts
  const gooeyEnv = gooey ? fxEnv(gooey, frameInLayer, layerDuration) : 0;
  const gooeyFilter = gooey && gooeyEnv > 0
    ? `blur(${(gooey.blur * gooeyEnv).toFixed(2)}px) contrast(${gooey.contrast})`
    : '';
  const combined = [filter === 'none' ? '' : filter, gooeyFilter]
    .filter(Boolean).join(' ');
  if (combined) ctx.filter = combined;
```

Add `OutlineFx` and `GooeyFx` to the type import.

- [ ] **Step 4: Register both**

Add `'outline'` and `'gooey'` to `BITMAP_FX`. Neither goes in `REVEAL_FX`. Add the padding cases:

```ts
      case 'outline': pad = Math.max(pad, f.width + 2); break;
      case 'gooey': pad = Math.max(pad, f.blur * 2); break;
```

- [ ] **Step 5: Add both specs**

```ts
  outline: {
    label: 'Sticker outline',
    hint: 'A solid border traced around the layer’s real shape.',
    kind: 'continuous',
    defaults: { type: 'outline', color: '#ffffff', width: 6 },
    fields: [
      color('color', 'Colour'),
      num('width', 'Width', 0, 60),
    ],
  },
  gooey: {
    label: 'Gooey melt',
    hint: 'Blur plus contrast, so nearby shapes fuse and separate like liquid.',
    kind: 'continuous',
    defaults: { type: 'gooey', blur: 8, contrast: 30 },
    fields: [
      num('blur', 'Blur', 0, 40),
      num('contrast', 'Contrast', 1, 60),
    ],
  },
```

- [ ] **Step 6: Run tests and type-check**

Run: `npm test`
Expected: PASS, all suites.

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Verify in the app**

Run `npm run tauri dev`.
- **Outline:** add it to a text layer, confirm the border follows the glyph shapes rather than the bounding box, and that Width 0 draws nothing.
- **Gooey:** add it to a text layer, confirm letters fuse at high blur. Add a CSS blur under Effects at the same time and confirm both apply — that is the check that gooey composed with the existing filter string instead of clobbering it.
- **Combined:** stack Slice reveal, Sticker outline, and Neon glow on one layer and confirm the outline and glow follow the sliced strips.

- [ ] **Step 8: Full build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 9: Commit and tag**

```bash
git add src/types/scene.ts src/types/index.ts src/renderer/layer-fx.ts src/lib/fx-schema.ts
git commit -m "Add sticker outline and gooey melt effects"
git tag -a fx-v2 -m "FX system v2: timing envelope, four reveal effects, three continuous effects"
```

---

## Verification Checklist

Run before declaring the feature done:

- [ ] `npm test` — all suites pass
- [ ] `npx tsc --noEmit` — exit 0
- [ ] `npm run build` — exit 0
- [ ] `grep -rn "Math.random" src/renderer/` returns nothing
- [ ] `grep -rn "fx-schema" src/renderer/ --include='*.ts' | grep -v '\.test\.ts'` returns nothing
- [ ] Open a project saved before this work and confirm every existing effect renders as it did at tag `fx-v1`
- [ ] Render a short clip to video and confirm the FFmpeg output matches the preview frame for frame
