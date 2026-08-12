# User Guide

## Installation

### Requirements

- **FFmpeg** must be installed and available on your system PATH
  - macOS: `brew install ffmpeg`
  - Windows: Download from [ffmpeg.org](https://ffmpeg.org/download.html) and add to PATH
  - Linux: `sudo apt install ffmpeg` or equivalent

### Running the App

```bash
npm install
npm run tauri dev
```

For a production build:
```bash
npm run tauri build
```

## Interface Overview

The editor is organized into five regions:

```
+--------------------------------------------------------------+
| ProjectMenu | App Title | Toolbar                            |
+------+-------------------------------+-----------+-----------+
| Layer|  Canvas Workspace             | Property  | AI Panel  |
| Panel|  (preview + interaction)      | Inspector | 300px     |
| 200px|                               | 280px     |           |
+------+-------------------------------+-----------+-----------+
| Scene Timeline                       | Playback Controls     |
+--------------------------------------+-----------------------+
```

### Header & Toolbar

- **App title** — "Local Content Studio"
- **Tool mode** — V (Select), M (Move), H (Hand/Pan)
- **Zoom** — Decrease/increase with -/+ buttons, or pick a preset from the dropdown
- **Grid** — Toggle grid overlay visibility
- **Snap** — Toggle snap-to-grid behavior

### Canvas Workspace

The center area shows a live preview of your composition at the current frame.

- **Click a layer** on the canvas to select it (a blue dashed border appears)
- **Click empty space** to deselect
- The canvas scales to fit the available space while maintaining aspect ratio

### Layer Panel (Left)

Shows all layers in the currently selected scene, sorted by z-index (topmost first).

- **Eye button (E/-)** — Toggle layer visibility
- **Lock button (U/L)** — Toggle layer lock (locked layers cannot be selected on canvas)
- **Click a layer** — Select it for editing in the Property Inspector
- **T+ button** — Quick-add a text layer
- **S+ button** — Quick-add a shape layer
- **+ button** — Open the Add Layer dialog (all layer types including image/audio/video)
- **x button** — Delete a layer (appears on hover)

### Property Inspector (Right)

When a layer is selected, this panel shows editable properties.

**Scene section** (always visible):
- Scene label
- Background color
- Duration (seconds)
- Transition type and duration

**Layer section** (when selected):
- Name, start frame, end frame
- Transform: position (X, Y), size (W, H), rotation, scale, opacity, blend mode
- Keyframe diamonds next to animatable properties (see Keyframes below)

**Type-specific sections:**
- **Text:** Content, font size, font family, weight, color, alignment, line height, letter spacing, max width
- **Shape:** Shape type, fill color, stroke color, stroke width, corner radius
- **Image:** Source path, fit mode, border radius

### Scene Timeline (Bottom Left)

A horizontal bar showing all scenes proportional to their duration.

- **Click a scene** to select it and jump playback to its start
- **+ button** — Add a new scene
- **x button** — Delete a scene (appears on hover, disabled when only one scene remains)
- **d button** — Duplicate a scene
- A **red cursor line** shows the current playback position

### Playback Controls (Bottom Right)

- **|<** — Jump to the first frame
- **<** — Step one frame backward
- **Play/Pause** — Start or stop playback
- **>** — Step one frame forward
- **>|** — Jump to the last frame
- **Scrubber** — Drag to seek to any frame
- **Frame/time display** — Shows current frame number and time in seconds
- **Speed** — 0.25x, 0.5x, 1x, 2x
- **Loop** — Toggle looping playback

## Working with Scenes

A composition is made up of one or more **scenes**. Each scene has:
- A background color
- A set of layers
- A duration (in seconds)
- An optional transition to the next scene

### Adding a Scene

Click the **+** button in the Scene Timeline header. A new scene is created with a default text layer.

### Duplicating a Scene

Hover over a scene in the timeline and click the **d** button. This creates an exact copy (with new IDs) inserted after the original.

### Deleting a Scene

Hover over a scene and click **x**. You must have at least one scene.

### Scene Transitions

Select a scene in the timeline, then in the Property Inspector change the **Transition** dropdown. Options:
- **none / cut** — Instant switch to next scene
- **fade** — Crossfade
- **slide-left/right/up/down** — The current scene slides out, revealing the next
- **wipe-horizontal/vertical** — A wipe reveals the next scene
- **zoom-in/out** — Zoom transition
- **dissolve** — Pixel-level dissolve

Set the **Transition Frames** to control how long the transition lasts (in frames).

## Working with Layers

### Adding Layers

**Quick add** (Layer Panel):
- **T+** creates a text layer with default settings
- **S+** creates a shape layer with default settings

**Full dialog** (Layer Panel **+** button):
- **Text** — Creates a text layer
- **Shape** — Creates a shape layer
- **Image** — Opens a file picker to select an image file
- **Audio** — Opens a file picker to select an audio file
- **Video** — Opens a file picker to select a video file

### Selecting Layers

- Click a layer name in the Layer Panel, or
- Click directly on the layer in the Canvas Workspace

### Reordering Layers

Layers are drawn in z-index order (lowest = behind, highest = in front). Change a layer's z-index via the Property Inspector.

### Layer Visibility and Locking

- Toggle **visibility** (eye icon) to hide a layer from the preview and render
- Toggle **lock** to prevent accidental selection on the canvas

### Deleting a Layer

Click the **x** button that appears when hovering over a layer in the Layer Panel.

## Animating with Keyframes

Keyframes let you animate any numeric property over time.

### Setting a Keyframe

1. Select a layer
2. Move the playhead to the desired frame (using the scrubber or step buttons)
3. Set the property value you want at that frame
4. Click the **diamond button** next to the property — it turns orange when a keyframe exists at the current frame

### Removing a Keyframe

Click the orange diamond button at a frame that has a keyframe. It will revert to an empty diamond.

### How Interpolation Works

- Between two keyframes, values are interpolated using the easing curve of the first keyframe
- Before the first keyframe, the value holds at the first keyframe's value
- After the last keyframe, the value holds at the last keyframe's value

### Example: Fade-in Animation

1. Select a text layer
2. Go to frame 0, set Opacity to 0, click the diamond next to Opacity
3. Go to frame 30, set Opacity to 1, click the diamond next to Opacity
4. Press play — the text fades in over 1 second (at 30fps)

### Example: Slide-in Animation

1. Select a layer
2. At frame 0, set X to -500 (off-screen left), add keyframe
3. At frame 20, set X to 540 (centered), add keyframe
4. The layer slides in from the left

## Rendering

### Checking FFmpeg

The Render Panel (below the canvas) shows the detected FFmpeg version. If FFmpeg is not found, you'll see an error message — install it and restart the app.

### Starting a Render

1. Click **Render MP4**
2. Choose a save location in the file dialog
3. The progress bar shows frame-by-frame progress
4. When complete, the output MP4 is ready at the chosen path

### During Render

- A progress bar shows the current frame and percentage
- Click **Cancel** to abort the render

### Output Format

- **Video:** H.264 (libx264), YUV420P, CRF 23, MP4 container with faststart
- **Audio:** AAC at 192kbps (if audio layers are present)
- **Resolution & FPS:** Matches the composition's output preset (default 1080x1920 @ 30fps)

## Project Management

### Saving a Project

- **Ctrl/Cmd+S** — Save (overwrites current file, or prompts Save As if new)
- **Ctrl/Cmd+Shift+S** — Save As (always prompts for location)
- Projects are saved as `.lcs.json` files containing the full composition data
- A dot indicator appears in the header when there are unsaved changes

### Opening a Project

- **Ctrl/Cmd+O** — Open a project file
- **Recent Projects** — Click the project menu (top left) to see recently opened projects

### New Project

Use File > New or load a template from the Template Browser to start fresh.

## AI Generation

The AI Panel (right sidebar) provides AI-assisted content generation.

### Setup

1. Open **AI Settings** (gear icon in the AI Panel header)
2. Select a provider: **Ollama**, **LM Studio**, or **OpenAI-compatible**
3. The app auto-fetches available models from your provider
4. Select a model from the dropdown
5. Click **Test Connection** to verify

### Generating Content

1. Select a **generation mode**:
   - **Full Composition** — Generate an entire multi-scene composition from a prompt
   - **Add Scenes** — Append new scenes to the current composition
   - **Template Fill** — Fill a template's placeholders with AI content
   - **Rewrite Text** — Rewrite text on selected layers
2. Type your prompt
3. Click **Generate**
4. Preview the generated result
5. Click **Apply** to use it or **Discard** to cancel

When a brand kit is active, generated content will follow your brand colors and fonts.

## Brand Kits

Brand kits ensure consistent visual identity across compositions.

### Creating a Brand Kit

1. Open the **Brand Kit Editor** from the toolbar
2. Click **Add Brand Kit**
3. Configure colors (primary, secondary, accent, background, text)
4. Set heading and body fonts
5. Optionally add a logo or watermark

### Using a Brand Kit

Select a brand kit to make it active. Active brand kits influence AI generation prompts and can be applied to templates.

## Templates

### Browsing Templates

Open the **Template Browser** from the toolbar. Available templates:
- **Kinetic Text** — Animated text opener
- **Quote Card** — Styled quote display
- **Countdown** — Countdown timer animation
- **Product Highlight** — Product showcase
- **Announcement Teaser** — Event/announcement teaser

### Applying a Template

Click a template to load it as a new composition. The template's placeholders can be filled manually or via AI generation.

## Asset Manager

Open the **Asset Panel** from the toolbar to see all media assets used in your composition. Assets are grouped by file path and show which scenes and layers reference them.

## Output Presets

In the Property Inspector (Scene section), select an output preset:

| Preset | Resolution | FPS |
|--------|-----------|-----|
| Instagram Story | 1080x1920 | 30 |
| TikTok | 1080x1920 | 30 |
| YouTube Shorts | 1080x1920 | 60 |
| YouTube (1080p) | 1920x1080 | 30 |
| Square | 1080x1080 | 30 |
| Landscape | 1920x1080 | 30 |
| Custom | User-defined | User-defined |

## Render Queue

The Render Panel supports queue-based rendering:

1. Click **Render MP4** — choose save location, the job is added to the queue
2. Jobs run sequentially — progress shows current frame and percentage
3. **Retry** — Re-run a failed job
4. **Cancel** — Stop a running or queued job
5. **Clear Completed** — Remove finished jobs from the queue

## Keyboard Reference

| Key | Action |
|-----|--------|
| Space | Toggle play/pause |
| Delete / Backspace | Remove selected layer |
| Left Arrow | Step one frame backward |
| Right Arrow | Step one frame forward |
| Home | Jump to first frame |
| End | Jump to last frame |
| Ctrl/Cmd+Z | Undo |
| Ctrl/Cmd+Shift+Z | Redo |
| Ctrl/Cmd+S | Save project |
| Ctrl/Cmd+Shift+S | Save project as |
| Ctrl/Cmd+O | Open project |
| Ctrl/Cmd+D | Duplicate selected layer |
| V | Select tool |
| M | Move tool |
| H | Hand (pan) tool |
| G | Toggle grid |
| Click canvas | Select layer under cursor |
| Click empty canvas | Deselect layer |
| Mouse wheel | Zoom in/out |
| Middle mouse drag | Pan canvas |

## Tips

- **Deterministic renders** — The same composition with the same assets will always produce identical output. This is useful for batch rendering and automation.
- **Layer timing** — Use Start Frame and End Frame in the Property Inspector to make layers appear and disappear at specific points within a scene.
- **Blend modes** — Experiment with multiply, screen, overlay, and other blend modes for creative compositing effects.
- **Effects stack** — Multiple effects (blur, brightness, contrast, etc.) can be applied to a single layer and are processed in order.
- **Performance** — Large canvas resolutions (e.g., 4K) may slow down preview playback. The final render is unaffected since it runs frame-by-frame.
