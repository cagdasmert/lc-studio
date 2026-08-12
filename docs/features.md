# Features

Local Content Studio is a cross-platform desktop application for creating, previewing, and rendering short-form video animations entirely on the local machine. No cloud services required.

## Core Capabilities

### Multi-Layer Composition

- **Text layers** — Rich text with configurable font family, size, weight, style, color, alignment, line height, letter spacing, word wrap, stroke outline, and drop shadow.
- **Shape layers** — Rectangle, rounded rectangle, circle, ellipse, and line with fill color, stroke, and corner radius.
- **Image layers** — Local image files (PNG, JPG, GIF, WebP, BMP, SVG) with fit modes: cover, contain, fill, none. Supports border radius.
- **Video layers** — Video file references with playback rate, start/end time, and mute controls.
- **Audio layers** — Audio file references with volume, start/end time, fade in/out.

Each layer has:
- Position (x, y), size (width, height), and anchor point
- Scale (x, y) and rotation (degrees)
- Opacity (0-1) and blend mode (normal, multiply, screen, overlay, darken, lighten, color-dodge, color-burn)
- z-index ordering, visibility toggle, lock toggle
- Visual effects pipeline (blur, brightness, contrast, saturate, grayscale, sepia, hue-rotate, drop-shadow)
- Per-property keyframe animation

### Keyframe Animation System

Every numeric property on a layer can be animated with keyframes:
- **Animatable properties:** x, y, width, height, scaleX, scaleY, rotation, opacity, anchorX, anchorY, fontSize, letterSpacing, lineHeight
- **Color animation:** Smooth interpolation between hex colors
- **Hold behavior:** Values hold at the first keyframe before the track starts and at the last keyframe after it ends
- **Per-keyframe easing:** Each keyframe specifies its own easing curve

### 28+ Easing Functions

| Category | Available |
|----------|-----------|
| Quadratic | ease-in, ease-out, ease-in-out |
| Sine | ease-in-sine, ease-out-sine, ease-in-out-sine |
| Cubic | ease-in-cubic, ease-out-cubic, ease-in-out-cubic |
| Exponential | ease-in-expo, ease-out-expo, ease-in-out-expo |
| Circular | ease-in-circ, ease-out-circ, ease-in-out-circ |
| Back | ease-in-back, ease-out-back, ease-in-out-back |
| Elastic | ease-in-elastic, ease-out-elastic, ease-in-out-elastic |
| Bounce | ease-in-bounce, ease-out-bounce, ease-in-out-bounce |
| Special | linear, cubic-bezier (custom control points), steps, spring (damped harmonic oscillator) |

### Scene Transitions

12 transition types between scenes:
- **none** / **cut** — Instant switch
- **fade** — Crossfade with opacity
- **slide** — Slide left, right, up, down
- **wipe** — Horizontal and vertical wipes
- **zoom** — Zoom in, zoom out
- **dissolve** — Pixel-level dissolve

Each transition has a configurable duration in frames.

### Audio System

- **Web Audio API** playback synchronized to the canvas frame loop
- Per-audio-layer volume control with fade in/out
- Automatic seek/sync when scrubbing the timeline
- FFmpeg audio mixing during render: per-track volume, multi-track amix filter, AAC encoding at 192kbps

### Render Pipeline

Custom Canvas + FFmpeg pipeline:
1. Offscreen `<canvas>` renders each frame at the output resolution
2. Raw RGBA pixel data extracted via `getImageData()`
3. Pixels sent to the Rust backend via Tauri IPC
4. Rust pipes pixels to FFmpeg's stdin as `rawvideo`
5. FFmpeg encodes to H.264 (libx264) in MP4 container with `yuv420p`, CRF 23, `faststart`
6. Audio tracks are mixed in if present

**Deterministic output** — same composition + assets = same render every time.

### Visual Storyboard Editor

Full GUI editor with:
- **Canvas workspace** — Interactive preview with click-to-select layers, selection overlay
- **Layer panel** — Layer list sorted by z-index, visibility/lock toggles, add/delete
- **Property inspector** — Edit all layer properties with keyframe diamond buttons per animatable property
- **Scene timeline** — Horizontal strip with proportional scene widths, playback cursor, add/delete/duplicate scenes
- **Playback controls** — Play/pause, frame step, jump to start/end, scrubber, frame & time display, speed selector (0.25x-2x), loop toggle
- **Toolbar** — Tool mode (select/move/hand), zoom controls, grid and snap toggles
- **Add layer dialog** — Add text, shape, image, audio, or video layers with native file pickers

### File Import

Native file picker dialogs for:
- **Images:** PNG, JPG, JPEG, GIF, WebP, BMP, SVG
- **Audio:** MP3, WAV, OGG, AAC, FLAC, M4A
- **Video:** MP4, WebM, MOV, AVI, MKV

Local files are read via the Tauri FS plugin and converted to blob URLs for browser-side rendering.

### State Management

- **Zustand** store with 7 slices: CompositionSlice, SelectionSlice, PlaybackSlice, UISlice, RenderSlice, BrandSlice, AISlice
- **Undo/redo** via `zundo` middleware (50-step history, composition changes only)
- Composition CRUD: add/remove/reorder/duplicate scenes, add/remove/reorder layers, set/remove keyframes
- **UISlice** state: toolMode, canvasZoom, showGrid, snapToGrid, gridSize, panX, panY, with actions setGridSize(), setPan(), resetView()
- **Dirty tracking** — `isDirty` flag on the composition slice, set on any mutation, cleared on save/load

### Render Queue

Full job queue managed by the RenderSlice (`render-slice.ts`) with a dedicated RenderPanel (`RenderPanel.tsx`).

- **Job lifecycle:** idle, rendering, completed, failed, cancelled
- Each RenderJob captures a snapshot of the composition at enqueue time, output path, progress (current frame / total frames), timestamps, and error details
- **Actions:** addRenderJob, updateJob, removeJob, retryJob (resets to idle), cancelJob, setActiveJob, clearCompleted

### AI Generation Layer

AI-assisted content generation with 3 provider backends and 4 generation modes. All inference runs against local or remote LLM endpoints -- no mandatory cloud dependency.

**Providers** (`src/lib/ai/`):
- **Ollama** (`ollama.ts`) -- default `http://localhost:11434`, any Ollama-hosted model
- **LM Studio** (`lmstudio.ts`) -- default `http://localhost:1234/v1`, OpenAI-compatible local server
- **OpenAI-compatible** (`openai-compat.ts`) -- any endpoint that speaks the OpenAI chat completions API (requires API key)

**Generation modes** (`GenerationMode` type):
- `full-composition` -- generate an entire multi-scene composition from a text prompt
- `add-scenes` -- append new scenes to an existing composition
- `template-fill` -- fill a template's placeholders with AI-generated content
- `rewrite-text` -- rewrite text content on selected layers

**Key implementation details:**
- Structured JSON output -- the LLM is prompted to return raw JSON arrays/objects matching the scene and layer schemas
- Brand-kit-aware prompts -- when a brand kit is active, its colors, fonts, and naming are injected into the system prompt so generated content stays on-brand
- CORS-free local requests via the Tauri HTTP plugin (`http.ts` wraps `@tauri-apps/plugin-http`), falling back to browser fetch outside Tauri
- Store state tracked in AISlice: provider config, availability check, generation mode, loading flag, last error

**UI components:** AIPanel.tsx (prompt input and generation), AISettings.tsx (provider configuration)

### Brand Kits

Reusable visual identity systems stored in the BrandSlice (`brand-slice.ts`).

- **Colors:** primary, secondary, accent, background, text (all hex)
- **Fonts:** heading, body (font family strings)
- **Logo:** optional logo image source
- **Watermark:** optional watermark image with configurable opacity (0-1) and position (top-left, top-right, bottom-left, bottom-right)
- **Actions:** addBrandKit, updateBrandKit, removeBrandKit, setActiveBrandKit
- Multiple brand kits can be stored; one is active at a time

**UI component:** BrandKitEditor.tsx

### Template Library

5 built-in templates in `src/lib/templates/`:

| Template | File | Category |
|----------|------|----------|
| Kinetic Text | `kinetic-text.ts` | opener |
| Quote Card | `quote-card.ts` | quote |
| Countdown | `countdown.ts` | countdown |
| Product Highlight | `product-highlight.ts` | product |
| Announcement Teaser | `announcement-teaser.ts` | announcement |

Each `Template` contains:
- A full `Composition` (scenes, layers, output preset) ready to use as a starting point
- A `placeholders` array -- typed slots (`text`, `image`, or `color`) that map to specific layer properties, enabling AI or manual fill

**UI component:** TemplateBrowser.tsx

### Asset Manager

Asset panel for inspecting all media assets referenced by the current composition.

- Scans all scenes and layers for image, video, and audio sources (`asset-utils.ts`)
- Groups assets by file path, showing which scenes and layers use each one
- Displays asset type badge (IMG / VID / AUD) and file name
- Uses Tauri file dialogs for importing new assets via the Add Layer dialog

**UI component:** AssetPanel.tsx

### Output Presets

8 predefined output presets in `output-presets.ts`:

| Preset | Resolution | FPS |
|--------|-----------|-----|
| Vertical | 1080x1920 | 30 |
| Square | 1080x1080 | 30 |
| Landscape | 1920x1080 | 30 |
| Instagram Story | 1080x1920 | 30 |
| TikTok | 1080x1920 | 30 |
| YouTube Shorts | 1080x1920 | 60 |
| YouTube (1080p) | 1920x1080 | 30 |
| Custom | 1080x1920 (default) | 30 |

### Project Save/Load

Projects are saved as `.lcs.json` files via `project-io.ts`.

- **Save / Save As** -- Tauri `save` dialog with file filter, writes a versioned `ProjectFile` (version number, timestamp, full composition)
- **Open** -- Tauri `open` dialog, reads and parses the project file
- **Load from path** -- programmatic load (used for recent projects)
- **Recent projects** -- last 10 opened/saved projects stored in `localStorage`, with path, name, and timestamp
- **Dirty indicator** -- `isDirty` flag in the composition slice; set on any composition mutation, cleared on save/load

### Keyboard Shortcuts

Global keyboard shortcuts registered via the `useKeyboardShortcuts` hook (`useKeyboardShortcuts.ts`). Non-modifier shortcuts are suppressed when an input, textarea, or select element is focused.

| Shortcut | Action |
|----------|--------|
| Space | Toggle play/pause |
| Delete / Backspace | Remove selected layer |
| Arrow Left | Step one frame backward |
| Arrow Right | Step one frame forward |
| Home | Jump to first frame |
| End | Jump to last frame |
| Ctrl/Cmd+Z | Undo |
| Ctrl/Cmd+Shift+Z / Ctrl/Cmd+Y | Redo |
| Ctrl/Cmd+S | Save project |
| Ctrl/Cmd+Shift+S | Save project as |
| Ctrl/Cmd+O | Open project |
| Ctrl/Cmd+D | Duplicate selected layer |
| V | Select tool mode |
| M | Move tool mode |
| H | Hand (pan) tool mode |
| G | Toggle grid |

### Video Layer Rendering

Canvas-based video frame rendering with a caching layer.

- **draw-video.ts** -- draws a single video layer's current frame onto the canvas. Calculates source time from layer frame position, playback rate, and start time offset. Uses cover-mode scaling to fit the video into the layer's dimensions.
- **video-cache.ts** -- `VideoCache` class that manages `HTMLVideoElement` instances. One element per unique source URL, with deduplication of concurrent loads. Provides `seekTo()` for frame-accurate positioning (waits for the `seeked` event), `preloadScene()` to warm the cache for all video layers in a scene, and `clear()` to release all resources.
