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

- **Zustand** store with 4 slices: composition, selection, playback, UI
- **Undo/redo** via `zundo` middleware (50-step history, composition changes only)
- Composition CRUD: add/remove/reorder/duplicate scenes, add/remove/reorder layers, set/remove keyframes

### Output Presets

Configurable output resolution and frame rate. Default preset: 1080x1920 (vertical) at 30fps.
