# Architecture

## System Overview

Local Content Studio is a Tauri v2 desktop application with a clear separation between frontend (React/TypeScript) and backend (Rust).

```
┌─────────────────────────────────────────────────┐
│                    Tauri Shell                   │
│  ┌────────────────────┐  ┌────────────────────┐ │
│  │  React Frontend    │  │   Rust Backend     │ │
│  │                    │  │                    │ │
│  │  Zustand Store ────┼──┼→ Tauri Commands   │ │
│  │  Canvas Renderer   │  │  FFmpeg Process    │ │
│  │  Web Audio Engine  │  │  File System       │ │
│  │  Storyboard UI     │  │                    │ │
│  └────────────────────┘  └────────────────────┘ │
│              ↕ Tauri IPC (invoke / events)       │
└─────────────────────────────────────────────────┘
```

## Frontend Architecture

### Type System (`src/types/`)

The composition data model uses TypeScript discriminated unions:

```
Composition
  ├── id, name
  ├── output: OutputPreset (width, height, fps)
  └── scenes: Scene[]
        ├── id, label, backgroundColor
        ├── durationFrames
        ├── transition, transitionDurationFrames
        └── layers: Layer[]  (discriminated union on `type`)
              ├── TextLayerData    (type: 'text')
              ├── ImageLayerData   (type: 'image')
              ├── ShapeLayerData   (type: 'shape')
              ├── VideoLayerData   (type: 'video')
              └── AudioLayerData   (type: 'audio')
```

All layer types extend `LayerBase` which defines common properties: position, size, transform, opacity, blend mode, effects, keyframes, visibility, and lock state.

### Keyframe System (`src/types/scene.ts`)

```
KeyframeTrack<T>
  └── keyframes: Keyframe<T>[]
        ├── frame: number
        ├── value: T
        ├── easing: EasingType
        └── easingParams?: EasingParams
```

Each layer has `keyframes: Record<string, KeyframeTrack>` mapping property names to tracks. The interpolation engine in `src/renderer/interpolation.ts` resolves the value of any property at any frame.

### State Management (`src/store/`)

```
Zustand Store (with zundo temporal middleware)
  ├── CompositionSlice    — composition data + all mutations + project path/dirty
  ├── SelectionSlice      — selected scene/layer/property
  ├── PlaybackSlice       — currentFrame, playing, loop, speed
  ├── UISlice             — toolMode, zoom, grid, snap, pan
  ├── RenderSlice         — render queue jobs, active job, lifecycle
  ├── BrandSlice          — brand kit CRUD, active kit selection
  └── AISlice             — AI provider config, generation state
```

The `zundo` temporal middleware provides undo/redo by tracking snapshots of the composition slice only (not UI/playback state). This keeps the history relevant and memory-efficient. History limit: 50 steps.

### Render Engine (`src/renderer/`)

The render engine is a pure Canvas 2D pipeline:

```
drawCompositionFrame(ctx, composition, globalFrame, mediaCache, videoCache?)
  │
  ├── resolveFrame() → { sceneIndex, frameInScene }
  │
  ├── [If in transition zone]
  │     └── drawTransition(outgoing, incoming, progress, type)
  │           ├── Draws outgoing scene layers
  │           └── Draws incoming scene layers with transition effect
  │
  └── [Normal frame]
        └── drawScene(ctx, scene, frameInScene)
              └── drawSceneLayers()
                    │ Sort layers by zIndex
                    │ For each visible, active layer:
                    ├── [Echo FX] re-draw the layer at earlier frames, fading
                    └── drawLayerAtFrame()
                          ├── resolveLayerTransform() → interpolate keyframes
                          ├── Motion path override (x/y, optional rotation)
                          ├── [Zoom reveal] multiply resolved scale, fold alpha
                          ├── ctx.save()
                          ├── Apply opacity, blend mode, 2D transform, clip path
                          ├── [If layer FX / CSS effects / box shadow]
                          │     ├── Render the layer into a padded offscreen
                          │     ├── applyReveals() → rewrite the bitmap
                          │     ├── drawSilhouetteShadow() from the revealed bitmap
                          │     └── compositeLayerFx() → stamp decorations
                          ├── [Else] dispatch to type-specific drawer:
                          │     ├── drawTextLayer()
                          │     ├── drawShapeLayer()
                          │     ├── drawImageLayer()
                          │     └── drawVideoLayer()
                          └── ctx.restore()
```

#### Layer FX pipeline (`layer-fx.ts`)

Layer FX composite the layer's own pixels several times, so they need the layer
rendered to an offscreen canvas first. That canvas is padded by `fxPadding()`
so bloom, extrusion and channel offsets are not clipped; padding is derived from
effect parameters only, never from the current frame, because a canvas that
changes size between frames resamples differently each frame and crawls.

Effects run in three places, not one:

| Site | Effects | Why there |
| --- | --- | --- |
| Scene loop (`draw.ts`) | `echo` | Re-runs the whole layer draw at earlier frames |
| Transform stage (`draw.ts`) | `zoom` | Writes the resolved scale, read before the offscreen exists |
| Bitmap stage (`layer-fx.ts`) | everything else | Operates on the rendered bitmap |

Within the bitmap stage there are two phases. **Reveals** (`pixelate`, `slice`,
`wipe`) rewrite the bitmap in list order; **decorations** (`long-shadow`,
`outline`, `glow`, `rgb-split`, `glitch`, `shine`, `gooey`) then stamp onto the
result. Reveals go first deliberately — a glow must bloom off what is actually
visible, not off the full silhouette.

#### The FX timing envelope (`fx-envelope.ts`)

Every layer FX may carry an optional `window`. `envelope()` reduces it to one
scalar per effect per frame: 0 across the entrance, 1 while held, back to 0
across the exit. With no window it returns 1, which is why effects saved before
the envelope existed render unchanged.

Reveals read the scalar **unclamped**, so back/elastic easings overshoot — that
is the intended look. Continuous effects read it **clamped** to `[0, 1]`, since
an overshoot there would mean a negative glow radius. Which list an effect
belongs to lives in `REVEAL_FX` in `layer-fx.ts`, deliberately duplicated from
`kind: 'reveal'` in `fx-schema.ts` so the renderer never imports the UI layer; a
test keeps the two in sync.

#### Determinism

Effects must never call `Math.random()`. The preview and the FFmpeg render draw
the same frame at different times, and a reopened project has to look like it
did yesterday. Every stochastic value — glitch's tear gating, slice's random
band order, pixelate's flicker, grain, shake — comes from the hash functions in
`noise.ts`, which are pure functions of integer inputs including the frame
number.

### Component Architecture (`src/components/`)

```
App.tsx
  ├── Header
  │     ├── ProjectMenu (save/open/recent)
  │     ├── App Title
  │     └── Toolbar (tool mode, zoom, grid/snap, undo/redo)
  ├── Body
  │     ├── LayerPanel (left sidebar, 200px)
  │     ├── CanvasWorkspace (center)
  │     └── PropertyInspector + AIPanel (right sidebar, 280px)
  ├── Footer
  │     ├── SceneTimeline
  │     └── PlaybackControls
  └── Dialogs/Panels (shown on demand)
        ├── AddLayerDialog
        ├── AISettings
        ├── AssetPanel
        ├── BrandKitEditor
        ├── TemplateBrowser
        └── RenderPanel
```

### AI Generation (`src/lib/ai/`)

```
generate.ts (orchestrator)
  ├── prompts.ts → builds system prompt (brand-kit-aware)
  ├── provider.ts → factory: createProvider(config)
  │     ├── ollama.ts (localhost:11434)
  │     ├── lmstudio.ts (localhost:1234/v1)
  │     └── openai-compat.ts (any OpenAI-compatible endpoint)
  ├── http.ts → aiFetch() wraps @tauri-apps/plugin-http for CORS bypass
  └── parse.ts → extracts JSON from LLM response text
```

### Project I/O (`src/lib/project-io.ts`)

Projects are saved as `.lcs.json` files (versioned JSON with full composition). Recent projects are tracked in localStorage.

### Brand Kits, Templates, Assets

- `src/lib/brand-utils.ts` — Brand kit application utilities
- `src/lib/template-utils.ts` — Template instantiation and placeholder filling
- `src/lib/templates/` — 5 built-in templates (kinetic-text, quote-card, countdown, product-highlight, announcement-teaser)
- `src/lib/asset-utils.ts` — Asset scanning and grouping across scenes
- `src/lib/output-presets.ts` — 8 output presets (Instagram Story, TikTok, YouTube Shorts, etc.)

## Backend Architecture

### Rust Modules (`src-tauri/src/`)

```
lib.rs          — App builder, plugin registration, command handlers
render/
  mod.rs        — Module declarations
  job.rs        — RenderState with Mutex<Option<FfmpegProcess>>
  commands.rs   — 5 Tauri commands (check, start, write, finish, cancel)
  ffmpeg.rs     — FfmpegProcess struct, spawn_ffmpeg(), check_ffmpeg()
```

### Render Job Lifecycle

```
  start_render()              write_frame() × N           finish_render()
       │                           │                            │
       ▼                           ▼                            ▼
  spawn_ffmpeg()          process.write_frame()          process.finish()
       │                    (stdin.write_all)             (drop stdin, wait)
       ▼                           │                            │
  FfmpegProcess                    ▼                            ▼
  stored in                   bytes → FFmpeg                 FFmpeg exits
  RenderState                    stdin                      MP4 finalized
```

The `RenderState` is managed via `tauri::State<Mutex<Option<FfmpegProcess>>>` — only one render can be active at a time.

### Binary Frame Transfer

The `write_frame` command uses `tauri::ipc::Request` to receive raw bytes without JSON serialization overhead:

```rust
#[tauri::command]
fn write_frame(request: tauri::ipc::Request, state: ...) -> Result<(), String> {
    let body = request.body();   // raw RGBA bytes
    // ... write to FFmpeg stdin
}
```

## Key Design Decisions

### Canvas over DOM/WebGL

HTML5 Canvas 2D was chosen over DOM-based rendering or WebGL because:
- Deterministic pixel output (same composition = same render)
- Direct `getImageData()` for frame capture
- No layout engine interference
- Sufficient performance for frame-by-frame preview

### FFmpeg via stdin pipe

FFmpeg receives raw RGBA pixels via stdin rather than writing intermediate frame files:
- No disk I/O bottleneck for frame storage
- No temp file cleanup needed
- Streaming encoding keeps memory usage constant
- Simple protocol: just write bytes

### Zustand over Redux/Context

Zustand was chosen for state management because:
- Minimal boilerplate for the slice pattern
- Direct store access outside React (useful for render pipeline)
- `zundo` provides undo/redo with simple configuration
- Fine-grained subscriptions prevent unnecessary re-renders

### Local-first constraint

All operations work offline:
- No cloud APIs for rendering or asset management
- FFmpeg runs as a local process
- Assets are read from the local filesystem
- No authentication or network dependencies
- AI provider HTTP calls use Tauri's HTTP plugin (goes through Rust, not the browser) to avoid CORS restrictions with localhost services
