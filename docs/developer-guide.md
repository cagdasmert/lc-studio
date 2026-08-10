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
    index.ts                      # Barrel exports
  store/
    index.ts                      # Zustand store (4 slices + zundo temporal)
    composition-slice.ts          # Composition CRUD + default composition
    selection-slice.ts            # Scene/layer/property selection
    playback-slice.ts             # Frame, playing, loop, speed
    ui-slice.ts                   # Tool mode, zoom, grid, snap
  renderer/
    easing.ts                     # 28+ easing functions + cubic-bezier/spring
    interpolation.ts              # Keyframe interpolation engine
    draw.ts                       # Layer draw dispatcher (sort, transform, delegate)
    draw-text.ts                  # Text rendering (word wrap, stroke, shadow)
    draw-shape.ts                 # Shape rendering (rect, circle, ellipse, line)
    draw-image.ts                 # Image rendering (fit modes, border radius)
    effects.ts                    # CSS filter string builder
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
  lib/
    tauri-bridge.ts               # Tauri invoke wrappers for render commands
    dialog.ts                     # Save file dialog wrapper
    file-utils.ts                 # File picker + blob URL conversion

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
  capabilities/default.json       # Permissions (core, opener, dialog, fs)
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

The Zustand store combines 4 slices:

| Slice | Responsibilities |
|-------|-----------------|
| **Composition** | Full composition tree (scenes, layers, keyframes). All mutations. Default composition. |
| **Selection** | Currently selected scene index, layer ID, property name. |
| **Playback** | Current frame, playing flag, loop, speed (0.25x-2x). |
| **UI** | Tool mode (select/move/hand), canvas zoom, grid/snap toggles. |

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

Permissions are declared in `src-tauri/capabilities/default.json`.

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
