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
    lib.rs                        # Tauri app builder + plugin registration
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

`sceneNeedsSurface(scene)` says whether a scene must go through a surface even outside a transition, because something in it reads back what is drawn beneath it. It is false for every feature today.

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

1. Define the data interface in `src/types/scene.ts` extending `LayerBase`
2. Add the type to the `Layer` discriminated union
3. Create a draw function in `src/renderer/draw-<type>.ts`
4. Add a case to the `drawLayer` switch in `src/renderer/draw.ts`
5. Add a creation function and UI section in the relevant components
6. Add a property section in `PropertyInspector.tsx`

### Adding a New Easing Function

1. Export the function in `src/renderer/easing.ts`
2. Add the name to `EasingType` union in `src/types/scene.ts`
3. Add the mapping in the `EASINGS` record within `getEasing()` in `easing.ts`

### Adding a New Transition

1. Add the name to the `TransitionType` union in `src/types/scene.ts`
2. Add it, with its label, to `TRANSITION_LABELS` in `src/lib/transition-options.ts`. The inspector, the AI prompt and the AI parser all read that list, so nothing else needs to know about it
3. Implement it in `src/renderer/transitions.ts`, in `compositeSurfaces()`: it gets the outgoing and incoming scene surfaces and the progress (0–1). Add a node-canvas test to `transitions.test.ts`

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
4. Register the type: add it to `BITMAP_FX` if it needs the layer bitmap, and to
   `REVEAL_FX` if it is a reveal. `fx-kinds.test.ts` enforces that `REVEAL_FX`
   matches the `kind: 'reveal'` specs and that every type is accounted for.
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

The `write_frame` command receives raw bytes via `tauri::ipc::Request` for zero-copy transfer of frame data.

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
