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
    draw-video.ts                 # Video layer rendering (frame-accurate seek)
    video-cache.ts                # HTMLVideoElement management + seek cache
    effects.ts                    # CSS filter string builder
    layer-fx.ts                   # Layer FX: reveal phase + decoration compositing
    scene-fx.ts                   # Scene FX: grain, vignette, scanlines, shake
    fx-envelope.ts                # FX timing window → single 0→1→0 scalar (pure)
    fx-geometry.ts                # Slice band ordering and staggered progress (pure)
    noise.ts                      # Deterministic hash/noise — never Math.random()
    transitions.ts                # 12 scene transition implementations
    compositor.ts                 # Frame resolver + composition drawer
    capture.ts                    # Render pipeline (canvas → pixels → FFmpeg)
    media-cache.ts                # Image preloading and caching (ImageBitmap)
    audio.ts                      # AudioEngine (Web Audio API)
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
    render/
      mod.rs                      # Module declaration
      job.rs                      # RenderState (Mutex<Option<FfmpegProcess>>)
      commands.rs                 # Tauri commands (check, start, write, finish, cancel)
      ffmpeg.rs                   # FFmpeg process spawning + audio mixing
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
   - Checks for transition zones between scenes
   - `drawSceneLayers()` iterates layers sorted by z-index
   - Each layer: resolve keyframe interpolation → apply transform matrix → draw
   - `ctx.getImageData()` extracts RGBA pixels
   - `writeFrame()` sends `Uint8Array` to Rust via Tauri IPC
   - Rust writes bytes to FFmpeg's stdin pipe
6. `finishRender()` closes stdin, FFmpeg finalizes the MP4

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

1. Add the name to `TransitionType` union in `src/types/scene.ts`
2. Implement the transition in `src/renderer/transitions.ts` inside `drawTransition()`
3. Add it to the `TRANSITIONS` array in `PropertyInspector.tsx`

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

## Tauri IPC Protocol

Communication between frontend and Rust uses Tauri's `invoke` API:

| Command | Direction | Payload | Purpose |
|---------|-----------|---------|---------|
| `check_ffmpeg` | TS → Rust → TS | — / String | Verify FFmpeg is installed |
| `start_render` | TS → Rust | output_path, width, height, fps, total_frames, audio_tracks | Spawn FFmpeg process |
| `write_frame` | TS → Rust | `Uint8Array` (raw RGBA) | Pipe one frame to FFmpeg stdin |
| `finish_render` | TS → Rust | — | Close stdin, wait for FFmpeg exit |
| `cancel_render` | TS → Rust | — | Kill FFmpeg process |

The `write_frame` command receives raw bytes via `tauri::ipc::Request` for zero-copy transfer of frame data.

## Tauri Plugins

| Plugin | Rust Crate | npm Package | Purpose |
|--------|-----------|-------------|---------|
| Opener | `tauri-plugin-opener` | (bundled) | Open URLs/files in system apps |
| Dialog | `tauri-plugin-dialog` | `@tauri-apps/plugin-dialog` | Native save/open file dialogs |
| FS | `tauri-plugin-fs` | `@tauri-apps/plugin-fs` | Read local files for media import |
| HTTP | `tauri-plugin-http` | `@tauri-apps/plugin-http` | HTTP requests via Rust (CORS bypass for local AI services) |

Permissions are declared in `src-tauri/capabilities/default.json`. The HTTP plugin is scoped to `http://localhost:*`, `http://127.0.0.1:*`, and `https://*`.

## FFmpeg Arguments

Video-only render:
```
ffmpeg -y -f rawvideo -pix_fmt rgba -s {w}x{h} -r {fps} -i pipe:0 \
  -c:v libx264 -pix_fmt yuv420p -preset medium -crf 23 -movflags +faststart \
  -an -shortest output.mp4
```

With audio tracks:
```
ffmpeg -y -f rawvideo -pix_fmt rgba -s {w}x{h} -r {fps} -i pipe:0 \
  -ss {start} -t {duration} -i audio1.mp3 \
  -ss {start} -t {duration} -i audio2.wav \
  -c:v libx264 -pix_fmt yuv420p -preset medium -crf 23 -movflags +faststart \
  -filter_complex "[1]volume=0.80[a0];[2]volume=1.00[a1];[a0][a1]amix=inputs=2:duration=shortest" \
  -c:a aac -b:a 192k -shortest output.mp4
```
