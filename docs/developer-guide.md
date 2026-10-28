# Developer Guide

## Prerequisites

- **Node.js** 18+ and npm
- **Rust** toolchain (rustup, cargo)
- **FFmpeg** installed and on PATH
- **Tauri v2 CLI** — installed automatically via `npm run tauri`

## Quick Start

```bash
git clone <repo-url>
cd remotion-studio
npm install
npm run tauri dev     # Full desktop app with hot-reload
```

## Development Commands

| Command | Purpose |
|---------|---------|
| `npm install` | Install frontend dependencies |
| `npm run dev` | Vite dev server only (http://localhost:1420) |
| `npm run build` | TypeScript check + Vite production build |
| `npm run tauri dev` | Full Tauri desktop app with hot-reload |
| `npm run tauri build` | Production build (.app/.dmg/.exe/.deb) |
| `npm run tauri build -- --debug` | Debug build (faster, includes devtools) |
| `npx tsc --noEmit` | Type-check without emitting |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Vitest in watch mode |
| `src-tauri/target/debug/local-content-studio render <project> --out <file>` | Command-line render (debug build: needs Vite on :1420); see "Command-line mode" |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Tauri v2 (Rust) |
| Frontend | React 19 + TypeScript |
| Bundler | Vite 7 |
| State management | Zustand 5 + zundo (undo/redo) |
| Render engine | HTML5 Canvas 2D |
| Video encoding | FFmpeg (spawned as child process) |
| Audio preview | Web Audio API |

## Project Structure

```
src/                              # React frontend
  main.tsx                        # React entry point
  App.tsx                         # Root layout component
  App.css                         # Global styles (dark theme)
  types/
    scene.ts                      # Core type system (layers, keyframes, composition)
    migration.ts                  # V1 → V2 migration utility
    ai.ts                         # AI provider config + generation types
    brand.ts                      # Brand kit types
    template.ts                   # Template + placeholder types
    index.ts                      # Barrel exports
  store/
    index.ts                      # Zustand store (7 slices + zundo temporal)
    composition-slice.ts          # Composition CRUD + project path/dirty tracking
    selection-slice.ts            # Scene/layer/property selection
    playback-slice.ts             # Frame, playing, loop, speed
    ui-slice.ts                   # Tool mode, zoom, grid, snap, pan
    render-slice.ts               # Render queue jobs + lifecycle
    brand-slice.ts                # Brand kit CRUD + active kit
    ai-slice.ts                   # AI provider config + generation state
  renderer/
    easing.ts                     # 28+ easing functions + cubic-bezier/spring
    interpolation.ts              # Keyframe interpolation engine
    draw.ts                       # Layer draw dispatcher (sort, transform, delegate)
    draw-text.ts                  # Text rendering (word wrap, stroke, shadow)
    draw-shape.ts                 # Shape rendering (rect, circle, ellipse, line)
    draw-image.ts                 # Image rendering (fit modes, border radius)
    draw-video.ts                 # Draws the prepared video frame (cover, clipped)
    video-time.ts                 # sourceTimeFor, collectVideoDraws
    video-frames.ts               # VideoFrameCache (WebCodecs via mediabunny), prepareVideoFrames
    motion-path.ts                # Motion paths: easing, per-segment / constant-speed timing
    effects.ts                    # CSS filter string builder
    layer-fx.ts                   # Layer FX: reveal phase + decoration compositing
    fx-disintegrate.ts            # Disintegrate reveal, written straight into a pixel buffer
    fx-decrypt.ts                 # Decrypt reveal: cells of bitmap glyphs resolving into the layer
    fx-wipe-edge.ts               # The wipe reveal's glowing front and sparks
    glyphs.ts                     # 5×5 bitmap glyph sets (RAMP, CIPHER, BINARY) and drawGlyph
    lens.ts                       # Lens layers: magnify, pixelate, dither, ascii over what's below
    scene-vhs.ts                  # VHS scene FX, applied to the scene surface
    scene-vhs-gl.ts               # VHS tube curvature (WebGL2)
    lens-gl.ts                    # Glass (refract) and ripple lens modes (WebGL2)
    lens-ripple.ts                # Which ripple impulses are live at a frame
    gl/                           # WebGL2 context, runPassInto, uniforms, GPU hash, transition shaders
    scene-fx.ts                   # Scene FX: grain, vignette, scanlines, shake
    fx-envelope.ts                # FX timing window → single 0→1→0 scalar (pure)
    fx-geometry.ts                # Slice band ordering and staggered progress (pure)
    noise.ts                      # Deterministic hash/noise — never Math.random()
    transitions.ts                # 12 scene transition implementations
    scene-surface.ts              # Scene surfaces and the full-frame canvas pool
    compositor.ts                 # Frame resolver + composition drawer
    capture.ts                    # Render pipeline (canvas → pixels → FFmpeg)
    media-cache.ts                # Image preloading and caching (ImageBitmap)
    audio.ts                      # AudioEngine: preview playback on the export's timing
  components/
    RenderPanel.tsx               # FFmpeg status, render button, progress bar
    storyboard/
      CanvasWorkspace.tsx          # Interactive canvas preview + playback loop
      LayerPanel.tsx               # Layer list with visibility/lock/add/delete
      PropertyInspector.tsx        # Property editor with keyframe buttons
      SceneTimeline.tsx            # Horizontal scene strip + cursor
      PlaybackControls.tsx         # Play/pause, scrubber, speed, loop
      Toolbar.tsx                  # Tool mode, zoom, grid/snap toggles
      AddLayerDialog.tsx           # Modal to add any layer type
      AIPanel.tsx                  # AI generation prompt + preview + apply
      AISettings.tsx               # AI provider configuration dialog
      AssetPanel.tsx               # Asset manager panel
      BrandKitEditor.tsx           # Brand kit editor panel
      TemplateBrowser.tsx          # Template library browser
      ProjectMenu.tsx              # Project save/open/recent menu
  hooks/
    useKeyboardShortcuts.ts       # Global keyboard shortcut handler
  lib/
    tauri-bridge.ts               # Tauri invoke wrappers for render commands
    media-bytes.ts                # Reads media files (plugin-fs) into Blobs, cached per source
    audio-tracks.ts               # Audio timing shared by export and preview; buildAudioTracks
    video-support.ts              # Can this webview decode a video? (Render panel warning)
    easing-options.ts             # Grouped easing list for menus
    e2e.ts                        # Debug-only scripted acceptance runs (LCS_E2E)
    render-project.ts             # Open + render a project (command line and the e2e render job)
    key-frames.ts                 # The frames `stills --frames auto` picks: hook, settled, transition, morph, end
    cli/
      index.ts                    # Asks Rust for a command-line job on startup; autosave off while one runs
      run.ts                      # Runs the job and builds the result document (loaded only for a job)
      stills.ts                   # `stills`: frame PNGs (the export renderer and encoder) and the labelled sheet
      issues.ts                   # The result's issue codes (a closed list) and the Render panel's warnings
    dialog.ts                     # Save file dialog wrapper
    file-utils.ts                 # File picker + blob URL conversion
    project-io.ts                 # Project save/load (.lcs.json format)
    output-presets.ts             # 8 output presets (IG Story, TikTok, etc.)
    asset-utils.ts                # Asset scanning across scenes
    brand-utils.ts                # Brand kit application utilities
    template-utils.ts             # Template instantiation + placeholder fill
    templates/
      index.ts                    # Template registry
      kinetic-text.ts             # Kinetic text template
      quote-card.ts               # Quote card template
      countdown.ts                # Countdown template
      product-highlight.ts        # Product highlight template
      announcement-teaser.ts      # Announcement teaser template
    ai/
      provider.ts                 # LLM provider factory
      ollama.ts                   # Ollama provider (localhost:11434)
      lmstudio.ts                 # LM Studio provider (localhost:1234/v1)
      openai-compat.ts            # OpenAI-compatible provider
      http.ts                     # Tauri HTTP fetch wrapper (CORS bypass)
      generate.ts                 # Generation orchestrator
      parse.ts                    # JSON extraction from LLM responses
      prompts.ts                  # System prompts for each generation mode

src-tauri/                        # Rust backend
  src/
    main.rs                       # Desktop entry point
    lib.rs                        # Tauri app builder, plugin registration, the main window (hidden for CLI runs)
    cli.rs                        # Command-line mode: argv parsing, cli_* commands, watchdog
    e2e.rs                        # Debug-only LCS_E2E hook for scripts/e2e/
    render/
      mod.rs                      # Module declaration
      job.rs                      # RenderState (Mutex<Option<FfmpegProcess>>)
      commands.rs                 # Tauri commands (check, start, write, finish, cancel)
      ffmpeg.rs                   # FFmpeg args, audio filter graph, process + stderr
  tauri.conf.json                 # Tauri config (window, build, bundle)
  capabilities/default.json       # Permissions (core, opener, dialog, fs, http)
  Cargo.toml                      # Rust dependencies
```

## Architecture

### Data Flow

```
User interaction → Zustand store → React re-render → Canvas draw
                                                    ↓
                                              Render pipeline
                                                    ↓
                                          capture.ts (offscreen canvas)
                                                    ↓
                                          tauri-bridge.ts (invoke)
                                                    ↓
                                          commands.rs (Tauri command)
                                                    ↓
                                          ffmpeg.rs (stdin pipe)
                                                    ↓
                                              MP4 output
```

### Render Pipeline Detail

1. `renderComposition()` in `capture.ts` orchestrates the full render
2. Creates an offscreen `<canvas>` at output resolution
3. Preloads all image assets into `MediaCache` (ImageBitmap map)
4. Calls `startRender()` → Rust spawns FFmpeg with rawvideo input on stdin
5. For each frame:
   - `drawCompositionFrame()` resolves the current scene and frame
   - Checks for transition zones between scenes; a transition draws both scenes itself (see Scene Surfaces)
   - `drawSceneLayers()` iterates layers sorted by z-index
   - Each layer: resolve keyframe interpolation → apply transform matrix → draw
   - `ctx.getImageData()` extracts RGBA pixels
   - `writeFrame()` sends `Uint8Array` to Rust via Tauri IPC
   - Rust writes bytes to FFmpeg's stdin pipe
6. `finishRender()` closes stdin, FFmpeg finalizes the MP4

### Scene Surfaces

`renderSceneSurface()` (`src/renderer/scene-surface.ts`) draws a whole scene, background and layers, into its own composition-sized canvas with an identity transform. Transitions render the outgoing scene (at its current frame) and the incoming one (at frame 0) into two surfaces and composite them, so each keeps its own background. The result is drawn onto the target under whatever transform it has: the camera shake, and in the preview the workspace's pan/zoom. That means a transition in the preview is rendered at composition resolution and then scaled, so it is slightly soft above 100% zoom.

Zoom transitions are the exception: they draw both scenes straight onto the target, as they always have, because scaling a pre-rendered surface would resample it and change their output. They switch to surfaces only when a scene needs one.

`sceneNeedsSurface(scene)` says whether a scene must go through a surface even outside a transition, because something in it reads back what is drawn beneath it: a visible lens layer, or a VHS scene FX that changes any pixel. `renderSceneSurface` applies VHS to the surface itself, after the scene is drawn and before the surface goes onto the target, so the order for such a scene is: draw the scene, apply VHS, draw the surface under the shake, then the overlay FX. The compositor then draws such a scene into a surface and the surface onto the target, under the shake and the preview's pan/zoom.

Surfaces are full-frame, so never allocate one per frame: take canvases from the pool with `acquire(w, h)` and hand them back with `release(canvas)`. `renderSceneSurface` acquires; its caller releases.

### Layer Transform Order

Per layer, the 2D transform is applied as:

```
translate(x, y)
  → translate(width * anchorX, height * anchorY)
    → rotate(degrees)
      → scale(scaleX, scaleY)
        → translate(-width * anchorX, -height * anchorY)
          → draw at origin
```

### Keyframe Interpolation

1. `resolveLayerTransform()` calls `resolveNumericProperty()` for each animatable property
2. `resolveNumericProperty()` checks if a keyframe track exists; falls back to the layer's static value
3. `interpolateNumeric()` finds bounding keyframes via linear scan, computes normalized `t`, applies the easing function, then lerps
4. Color interpolation parses hex → RGB, lerps each channel, converts back to hex

### State Management

The Zustand store combines 7 slices:

| Slice | Responsibilities |
|-------|-----------------|
| **Composition** | Full composition tree (scenes, layers, keyframes). All mutations. Project path, dirty tracking. |
| **Selection** | Currently selected scene index, layer ID, property name. |
| **Playback** | Current frame, playing flag, loop, speed (0.25x-2x). |
| **UI** | Tool mode (select/move/hand), canvas zoom, grid/snap toggles, pan offset. |
| **Render** | Render queue jobs, active job ID, job lifecycle (idle/rendering/completed/failed/cancelled). |
| **Brand** | Brand kit CRUD, active brand kit selection. |
| **AI** | AI provider config, availability check, generation mode, loading/error state. |

The `zundo` temporal middleware wraps the store to provide undo/redo, tracking only composition changes (not UI/selection/playback state). History limit: 50 steps.

### Adding a New Layer Type

1. Define the data interface in `src/types/scene.ts` extending `LayerBase`, add the type to `LayerType` and the `Layer` union, and re-export it from `src/types/index.ts`
2. Create a draw function in `src/renderer/draw-<type>.ts`
3. Add a case to the `drawLayer` switch in `src/renderer/draw.ts`
4. Add a creation function and a button in `AddLayerDialog.tsx`, and an icon in `LAYER_TYPE_ICONS` (`LayerPanel.tsx`)
5. Add a property section in `PropertyInspector.tsx`, and hide the shared sections the type ignores
6. List its keyframable properties in `getAnimatableProperties` (`KeyframeEditor.tsx`)
7. If the AI generator should make it, describe it in `prompts.ts` and validate it in `parse.ts` (`GeneratedLayer`, `convertGeneratedScenes`)

A layer that reads what is under it, like the lens (`src/renderer/lens.ts`),
is drawn by `drawSceneLayers` itself in z-order, not by `drawLayer`, and makes
`sceneNeedsSurface` true so the scene is drawn into a surface it can read back.
The lens's mode list (`LENS_MODES`) mirrors `LENS_SPECS` in `fx-schema.ts`, and
`fx-kinds.test.ts` keeps them in sync.

### Adding a New Easing Function

1. Export the function in `src/renderer/easing.ts`
2. Add the name to `EasingType` union in `src/types/scene.ts`
3. Add the mapping in the `EASINGS` record within `getEasing()` in `easing.ts`

### Adding a New Transition

1. Add the name to the `TransitionType` union in `src/types/scene.ts`
2. Add it, with its label, to `TRANSITION_LABELS` in `src/lib/transition-options.ts`. The inspector, the AI prompt and the AI parser all read that list, so nothing else needs to know about it
3. Implement it in `src/renderer/transitions.ts`, in `compositeSurfaces()`: it gets the outgoing and incoming scene surfaces and the progress (0–1). Add a node-canvas test to `transitions.test.ts`

A shader transition instead goes in `src/renderer/gl/transitions/`: add its source, list it in `GL_TRANSITION_TYPES` and (for a gl-transitions shader) `GL_TRANSITION_SOURCES` in `index.ts`, add it to `GPU_TRANSITIONS` in `transition-options.ts`, and give its float uniforms a `TRANSITION_SPECS` entry in `fx-schema.ts`. `fx-kinds.test.ts` checks those lists and defaults against each other, and `scripts/e2e/fx-gl.mjs` (A5.3) checks its first frame, determinism and last frame in the app. See "Adding a GL effect".

### Adding a New Layer FX

The inspector is schema-driven, so no UI code is needed — an entry in
`fx-schema.ts` is what makes the controls appear.

1. Define the interface in `src/types/scene.ts` with a `type` tag and
   `window?: FxWindow`, add it to the `LayerFxDef` union, and add the name to
   the explicit re-export list in `src/types/index.ts` (it is hand-maintained,
   not `export *` — omitting it is a compile error at the first import).
2. Add a spec to `LAYER_FX_SPECS` in `src/lib/fx-schema.ts`: `label`, `hint`,
   `kind`, `defaults`, and the `fields` to render. Use the `num`, `color` and
   `select` helpers. Reveal specs should ship a `window` in their defaults.
3. Implement it in `src/renderer/layer-fx.ts`:
   - **Decoration** (always on, dimmed by the envelope): write a
     `drawX(ctx, bitmap, fx, …)` and call it from `compositeLayerFx`'s
     decoration block. Draw *before* the base bitmap if it belongs behind the
     layer, as `outline` and `long-shadow` do.
   - **Reveal** (geometry driven by the envelope): write an
     `applyX(src, fx, env): HTMLCanvasElement` and add a case to
     `applyReveals`. Reveals rewrite the bitmap and chain in list order.
     A reveal that works per pixel or per grain, like disintegrate, lives in
     its own module (`fx-disintegrate.ts`): read the bitmap once with
     `getImageData`, write into an `ImageData` through a `Uint32Array` view, and
     `putImageData` once. Never one `fillRect` per grain.
4. Register the type: add it to `BITMAP_FX` if it needs the layer bitmap, and to
   `REVEAL_FX` if it is a reveal. `fx-kinds.test.ts` enforces that `REVEAL_FX`
   matches the `kind: 'reveal'` specs and that every type is accounted for.
   An effect that draws characters uses the bitmap glyphs in `glyphs.ts`
   (`drawGlyph` into a `Uint32Array` view), never `fillText`: fonts differ
   between webviews. `applyReveals` gets the bitmap's padding as `pad`, for
   anything that must stay inside the layer box, such as wipe sparks.
   New optional fields on an existing effect must be off when absent, so old
   projects render as before; the inspector shows a missing field at its spec
   default.
5. If the effect reaches outside the layer box, add a `fxPadding` case.
   Decorations contribute to the decoration max; reveals that displace content
   contribute to the displacement term, which is added on top. **Never derive
   padding from the envelope** — a canvas that resizes between frames crawls.

Two rules that are not optional:

- **The renderer must not import `src/lib/fx-schema.ts`.** It is UI metadata.
  Anything the renderer needs to know is duplicated into `layer-fx.ts` and
  guarded by `fx-kinds.test.ts`. The one sanctioned exception is that test.
- **Never call `Math.random()`.** Preview and FFmpeg render draw the same frame
  at different times and must match. Derive every random value from `hash` /
  `signedHash` in `noise.ts`, keyed on the frame number and other integers.

Keep pure geometry in `fx-envelope.ts` or `fx-geometry.ts` — those are DOM-free
so they can be unit-tested under Vitest's `node` environment.

### Adding a GL effect

Everything WebGL2 goes through `src/renderer/gl/`:

- `context.ts` — `getGl()`: one shared WebGL2 context on a detached canvas, created lazily; null when WebGL2 is missing, the context is lost (programs are rebuilt after a restore), or the e2e job option `disableGl: true` is set.
- `pass.ts` — `runPassInto(target, dx, dy, w, h, program, inputs, uniforms, keys?)`: uploads the inputs as textures (premultiplied, flipped so uv (0,0) is the bottom-left), draws one full-screen triangle into a w×h viewport, and `drawImage`s the result onto the 2D `target` in the same task, under its transform. It returns false when GL is unavailable; every caller has a fallback. Programs are cached by name; the GL canvas only grows.
- `uniforms.ts` — DOM-free: uniform value types, `parseUniformDefaults` for gl-transitions' `uniform <type> <name>; // = value` comments (ivec2 and vec4 included), `withOverrides` for `transitionParams`.
- `hash.glsl.ts` — `lcsHash1…4`, an exact GLSL ES 3.00 port of `hash` in `noise.ts` (A5.2 checks it against the CPU over a 64×64 grid).

lc-studio's own shaders are GLSL ES 3.00 (`#version 300 es`, `in vec2 v_uv`, `out vec4 o_color`) and follow one uniform convention: `u_progress`, `u_frame` (int), `u_fps`, `u_resolution`, `u_seed`, plus the effect's own parameters. Time never comes from a clock. gl-transitions shaders are GLSL ES 1.00 and run inside `wrapGlTransition`.

Keep the logic that decides things in plain TypeScript with unit tests (`gpu-features.ts` for the Render panel's warning, `lens-ripple.ts` for which impulses are live, `uniforms.ts`), and check GL output in `scripts/e2e/fx-gl.mjs`, since node-canvas has no WebGL.

Uploading a 1080×1920 canvas costs about 5 ms in WKWebView, far more than drawing. Pass `keys` to `runPassInto` for inputs that don't change between frames (a transition's frozen incoming scene) so their textures are reused, and `textureHolds()` tells you whether you can skip producing the input at all.

New effects that need GL must be listed by `gpuFeatureUses()` so the Render panel can warn when WebGL2 is missing.

### Pixel loops in WKWebView

Full-frame pixel loops (VHS) run much slower in JavaScriptCore than in V8 if
written as one big loop. Measured on a 1080×1920 VHS frame:

- Keep each pass in its own small function. Inlined into one large function,
  the saturation pass took about 40 ms; on its own, about 4.
- Read and write whole pixels through an `Int32Array` view, not a
  `Uint32Array`: an opaque pixel read through a Uint32 view is ≥ 2³¹, which
  JavaScriptCore holds as a double (66 vs 42 ms for the same loop).
- Use `hash4` from `noise.ts` in per-pixel loops; it returns exactly what
  `hash` does, without the rest-parameter array.

Time it in the app, not in node or Chromium: `applyVhs` took 17 ms in Chromium
when it cost 70 in WKWebView.

### Adding a New Scene FX

Same shape, one layer up: define the interface in `src/types/scene.ts`, add it
to `SceneFxDef` and to `src/types/index.ts`, add a spec to `SCENE_FX_SPECS`, and
implement it in `src/renderer/scene-fx.ts`. Scene FX have no timing envelope.

## Testing

```bash
npm test          # Vitest, single run
npm run test:watch
```

Tests live beside the code as `src/**/*.test.ts` and run under the `node`
environment, so anything they touch must be DOM-free — which is why the pure FX
logic is split out of `layer-fx.ts`. The one exception is
`layer-fx-composite.test.ts`, which uses `node-canvas` to composite over a
non-empty destination; that condition is what catches effects wrongly erasing
the scene rather than their own bitmap.

Rust tests cover the FFmpeg argument and audio-graph builders; two of them run FFmpeg itself when it is on PATH:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

### Acceptance scripts (`scripts/e2e/`)

Each script generates its test media into `test-media/` (gitignored), writes small `.lcs` projects, and runs the debug app with `LCS_E2E=<script.json>`. On startup the frontend runs the script's jobs in the real webview (`src/lib/e2e.ts`), writes `script.result.json` and quits. The script then inspects the outputs with ffprobe, ffmpeg and node-canvas and prints PASS/FAIL per check. It builds the debug binary and starts Vite if nothing is on :1420; the app window opens while it runs.

```bash
node scripts/e2e/f2-export.mjs    # A2.1–A2.3: audio in exports
node scripts/e2e/f1-video.mjs     # A1.1–A1.7: video frames in export and preview
node scripts/e2e/f2-preview.mjs   # A2.5: preview audio matches the export
node scripts/e2e/project-io.mjs   # Save, asset import, and the fs scope boundary
node scripts/e2e/fx-regression.mjs  # FX pack A0.5: exports match a baseline, pixel for pixel
node scripts/e2e/fx1-disintegrate.mjs  # FX pack P1: disintegrate in real exports, and its cost per frame
node scripts/e2e/fx2-decrypt-wipe.mjs  # FX pack P2: decrypt and the wipe edge in real exports
node scripts/e2e/fx3-lens.mjs  # FX pack P3: lens preview matches export (A3.6), all four modes exported
node scripts/e2e/fx4-vhs.mjs   # FX pack P4: VHS in real exports, with shake, grain and a transition
node scripts/e2e/fx-gl.mjs     # FX pack P5: A5.1–A5.7, the WebGL2 pass, its transitions, lenses and fallback
```

`cli0-render.mjs` runs the debug binary as a command-line tool instead, with `runCli(args)` from `lib.mjs` (start Vite with `ensureDevServer()` first). Run it with nothing on :1420 so it can check that a missing frontend fails cleanly, and with `--long` for the 6.5-minute steadiness check:

```bash
node scripts/e2e/cli0-render.mjs [--long]  # CLI spec A0.2–A0.5: render, failure paths, hidden-window speed
node scripts/e2e/cli1-stills.mjs           # CLI spec A1.2–A1.3: stills match the export, auto frames, the sheet
```

`fx-regression.mjs` exports a fixture that uses every layer FX and scene FX from before the FX pack, plus cuts and zoom transitions, and compares each PNG frame with a baseline in `test-media/fx-regression-baseline/`. Make the baseline on the old code with `--baseline`, then run it without the flag after the change. A change that should not alter existing projects must keep it passing.

## Tauri IPC Protocol

Communication between frontend and Rust uses Tauri's `invoke` API:

| Command | Direction | Payload | Purpose |
|---------|-----------|---------|---------|
| `check_ffmpeg` | TS → Rust → TS | — / String | Verify FFmpeg is installed |
| `start_render` | TS → Rust | output_path, width, height, fps, total_frames, audio_tracks | Spawn FFmpeg process |
| `write_frame` | TS → Rust | `Uint8Array` (raw RGBA) | Pipe one frame to FFmpeg stdin |
| `finish_render` | TS → Rust | — | Close stdin, wait for FFmpeg exit |
| `cancel_render` | TS → Rust | — | Kill FFmpeg process |
| `e2e_script` | TS → Rust → TS | — / String or null | Debug builds: the `LCS_E2E` script, if any |
| `e2e_finish` | TS → Rust | result JSON | Debug builds: write the e2e results and quit |
| `cli_job` | TS → Rust → TS | — / job or null | The command-line job, if any; grants its folders |
| `cli_progress` | TS → Rust | done, total, stage | Progress to stderr (`total` 0: a heartbeat) |
| `cli_finish` | TS → Rust | result JSON | Print the result, exit 0 or 1 |

The `write_frame` command receives raw bytes via `tauri::ipc::Request` for zero-copy transfer of frame data.

### Command-line mode

`local-content-studio render <project> --out <file|dir>` (user guide: "From the Command Line"; design: `docs/superpowers/specs/2026-10-28-headless-cli-design.md`). The flow:

1. `cli::parse` (`src-tauri/src/cli.rs`) runs before Tauri starts. A first argument that isn't a command is a normal GUI launch, so "open with" launches that pass a path are unchanged. Usage errors, a folder that isn't a project, a skill draft, and an existing `--out` without `--force` all exit 2 with a JSON result and no window.
2. `build_main_window` (`lib.rs`) builds the window that `tauri.conf.json` declares with `create: false`. For a command-line job it's hidden, unfocused, with `BackgroundThrottlingPolicy::Disabled` and, on macOS, `ActivationPolicy::Accessory` (no Dock icon). Without `Disabled`, a hidden page is suspended from the start. Even with it, macOS puts WebKit's processes in the background band while the page is hidden, so renders run about 3.3× slower than in a visible window (`render` on `long-gl`: 3.0 s visible, 9.8 s hidden, debug build, M4 Pro). Covered windows are slowed the same way, so this also applies to GUI exports behind other windows. Every visible variant tried took focus. The measurements are in §10 of the spec.
3. `App.tsx` calls `runCliIfRequested()` (`src/lib/cli/index.ts`) on mount, in every build. It asks `cli_job`, loads `./run` only if there's a job, and keeps autosave off. `cli_job` grants the project folder, and creates and grants a PNG sequence's folder.
4. `runCliJob` loads through `renderProject` (`src/lib/render-project.ts`): no recent-list entry, bundled fonts awaited before the first frame. It adds the Render panel's warnings as `issues`, refuses video formats without FFmpeg, renders, and sends `cli_finish`. Progress goes to `cli_progress` at most every 250 ms, with a heartbeat every 5 s. Uncaught errors and rejections also end the run. `stills` opens with `openForRender` and draws with `createFrameRenderer` and `encodePng` from `capture.ts`, which the PNG-sequence export uses too, so a still at scale 1 is byte-identical to that frame's export.
5. `cli_finish` prints the result on stdout and to `--result`, then exits 1 if `ok` is false or any issue has `severity: "error"`, else 0. It calls `cleanup_before_exit` and `std::process::exit`, because `AppHandle::exit(code)` doesn't pass the code to the process on macOS.
6. A watchdog thread exits 2, killing any FFmpeg, if `cli_job` isn't called within 30 s (a debug build without Vite never loads), if nothing arrives for 120 s, or when `--timeout` passes. A failure inside `cli_job` takes the same path at once.

The result document's shape (schema 1) is §3 of the spec. lcs.py reads it, so add fields freely, but bump `RESULT_SCHEMA` for any change that breaks a reader. Issue codes are a closed list in `src/lib/cli/issues.ts`. The e2e `render` job goes through `renderProject` too, so the two paths can't drift. `LCS_E2E` is ignored when a command-line job is present.

## Tauri Plugins

| Plugin | Rust Crate | npm Package | Purpose |
|--------|-----------|-------------|---------|
| Opener | `tauri-plugin-opener` | (bundled) | Open URLs/files in system apps |
| Dialog | `tauri-plugin-dialog` | `@tauri-apps/plugin-dialog` | Native save/open file dialogs |
| FS | `tauri-plugin-fs` | `@tauri-apps/plugin-fs` | Read media; save projects, copy imported assets and fonts, write PNG frames |
| HTTP | `tauri-plugin-http` | `@tauri-apps/plugin-http` | HTTP requests via Rust (CORS bypass for local AI services) |

Permissions are declared in `src-tauri/capabilities/default.json`. The FS plugin may read, `mkdir`, `write_file`, `write_text_file` and `copy_file`, but only inside its runtime scope: app directories, paths picked in a dialog, and project folders granted by `allow_project_dir` (`node scripts/e2e/project-io.mjs` checks that a write outside them is refused). Any new plugin-fs command the frontend calls needs its permission added there. The HTTP plugin is scoped to `http://localhost:*`, `http://127.0.0.1:*`, and `https://*`.

## FFmpeg Arguments

Video-only render:
```
ffmpeg -y -hide_banner -nostats -loglevel error \
  -f rawvideo -pix_fmt rgba -s {w}x{h} -r {fps} -i pipe:0 \
  -c:v libx264 -pix_fmt yuv420p -preset medium -crf 23 -movflags +faststart \
  -an output.mp4
```

With audio tracks (one `-ss/-t/-i` per track; `-t` is the output length × playback rate):
```
ffmpeg -y -hide_banner -nostats -loglevel error \
  -f rawvideo -pix_fmt rgba -s {w}x{h} -r {fps} -i pipe:0 \
  -ss 10 -t 2 -i music.wav \
  -ss 0 -t 2.5 -i tone.wav \
  -c:v libx264 -pix_fmt yuv420p -preset medium -crf 23 -movflags +faststart \
  -filter_complex "[1:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=1,adelay=delays=0:all=1[a0];\
[2:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=1,afade=t=in:st=0:d=0.5,adelay=delays=2500:all=1[a1];\
[a0][a1]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.95,apad=whole_dur=5,atrim=end=5[aout]" \
  -map 0:v -map "[aout]" -c:a aac -b:a 192k -shortest output.mp4
```
`apad=whole_dur` and `atrim` make the mix exactly as long as the video (here 5 s = total frames / fps). An endless `apad` with only `-shortest` let the audio run up to half a second past the video when frames arrived at render pace.
