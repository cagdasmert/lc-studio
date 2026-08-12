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
                    ├── resolveLayerTransform() → interpolate keyframes
                    ├── ctx.save()
                    ├── Apply opacity, blend mode, effects (CSS filter)
                    ├── Apply 2D transform matrix
                    ├── Dispatch to type-specific drawer:
                    │     ├── drawTextLayer()
                    │     ├── drawShapeLayer()
                    │     ├── drawImageLayer()
                    │     └── drawVideoLayer()
                    └── ctx.restore()
```

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
