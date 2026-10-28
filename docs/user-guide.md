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
- **None / Cut** — Instant switch to next scene
- **Fade** — Crossfade
- **Slide left/right/up/down** — The current scene slides out as the next slides in
- **Wipe horizontal/vertical** — A wipe reveals the next scene
- **Zoom in/out** — Zoom transition
- **Dissolve** — The next scene replaces the current one in small blocks, in scattered order

The **GPU** group (Cube, Doorway, Grid flip, Water drop, Cross warp, Glitch displace, Film burn, Page curl, ASCII sweep) is drawn with WebGL2. Their settings appear as sliders under the Transition menu; switching to another transition resets them. Without WebGL2 they play as a fade, and the Render panel lists them before you export.

Set the **Transition Frames** to control how long the transition lasts (in frames). Each scene keeps its own background throughout the transition. In the preview, a transition other than zoom is drawn at the output resolution and scaled, so it looks slightly soft when you zoom the canvas in past 100%; the export is unaffected.

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

Keyframes let you animate any numeric property over time, and a text layer's colour.

### Setting a Keyframe

1. Select a layer
2. Move the playhead to the desired frame (using the scrubber or step buttons)
3. Set the property value you want at that frame
4. Click the **diamond button** next to the property — it turns orange when a keyframe exists at the current frame

Keyframes belong to the layer, so they move with it when you change its Start frame. The diamond is greyed out while the playhead is outside the layer's Start–End range, and the Keyframes panel shades those frames.

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

### Example: Colour Change

1. Select a text layer with a solid fill
2. Go to frame 0, set Color to the starting colour, click the diamond next to Color
3. Go to frame 30, pick the second colour, click the diamond next to Color
4. Press play — the text blends from one colour to the other

While the colour track has keyframes it overrides the Color field. The keys also appear on the `color` row of the **Keyframes** panel below the canvas, drawn in their own colour. Scroll over the property names to reach that row (the mouse wheel over the timeline zooms). There you can drag keys to new frames or double-click one to delete it; with none left, the Color field applies again.

### Example: Slide-in Animation

1. Select a layer
2. At frame 0, set X to -500 (off-screen left), add keyframe
3. At frame 20, set X to 540 (centered), add keyframe
4. The layer slides in from the left

## Lens Layers

A lens changes whatever is under it: the layers below it in the Layer Panel
order. Choose **Add layer → Lens**; it is added on top of the scene.

- **Shape** — circle, rectangle or rounded rectangle. **Feather** softens the edge.
- **Mode** — *Magnify* enlarges what's under it, *Pixelate* turns it into blocks, *Dither* reduces it to a few colour levels in a fine pattern, and *ASCII* redraws it as text-like density glyphs. Each mode shows its own controls. For Dither and ASCII, tick **Set** next to *Ink* and *Paper* to use two fixed colours instead of the picture's own.
- **Glass** and **Ripple** (GPU) — *Glass* bends what is under it like a glass dome, with colour fringes (*Dispersion*) and a shine (*Highlight*). *Ripple* sends rings out from impulses: press **Add at current frame** to drop one at the lens centre on the current frame, then edit its frame and position (0–1 across the lens), or set *Automatic every* to drop them on a beat of frames. Without WebGL2 both show the picture unchanged.
- **Intensity** — how strong the effect is, from 0 (none) to 1. Set keyframes on it (the ◇ button) to bring a lens in or out.
- **Ring** — an outline around the lens, like a HUD.
- **Moving it** — keyframe *X* and *Y*, or give it a motion path, to sweep it across a product or a title.

A lens doesn't take Layer FX, Effects, a shadow, a blend mode or a clip path, so
those sections are hidden while one is selected. In the preview, a scene with a
lens looks slightly soft when you zoom the canvas in past 100%; the export is
sharp.

## Morphing One Image into Another

1. Add an image layer with the first image (**A**).
2. In the Property Inspector, turn on **Morph to…** and click **Browse...** to
   pick the second image (**B**). A `morphProgress` track appears in the
   keyframe editor, running 0 → 1 over the layer's duration.
3. Click **Edit points...**. The editor shows A, the live result, and B.
4. Click **Auto-match**. After a few seconds, numbered dots appear on both
   images: green are confident matches, amber are weak ones worth checking.
5. Fix what's wrong:
   - **Click** empty space on A or B to add a pair; its partner appears where
     the current warp predicts. Drag it onto the right feature.
   - **Drag** a dot to move it (it turns blue: your points are never touched by
     Auto-match again). **Arrow keys** nudge the selected dot; Shift moves 10 px.
   - **Delete** removes the selected pair; **Clear auto** removes every
     auto-matched pair.
   - **Wheel** zooms a pane, **Space-drag** pans, **Fit** resets it.
   - Drag the slider or press ▶ to watch the result; **Mesh** overlays the
     warp grid and marks folded areas in red.
6. Click **Done** (one undo step), or **Cancel** / Esc to discard.
7. Shape the timing by editing the `morphProgress` keyframes like any other
   property.

Tips: a few well-placed pairs on distinctive features (eyes, corners, tips)
beat many vague ones. If the result tears or folds, remove the pair causing it.

## Rendering

The Render panel warns before export when something can't render as designed: video files the app can't decode, and, if WebGL2 is unavailable, every GPU transition, Glass or Ripple lens and VHS tube curvature in the project, with what each falls back to.

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

### From the Command Line

The app binary can also render a project without opening its window, for scripts and agents (such as the `lc-studio-project` skill):

```bash
"/Applications/Local Content Studio.app/Contents/MacOS/local-content-studio" render "Spring Launch.lcs" --out "Spring Launch.mp4"
```

- `<project>` is a `.lcs` folder or the `project.json` inside it.
- `--out` is the video file. Its extension picks the format (`.mp4`, `.webm`, `.mov`, `.gif`); a path with no extension renders a PNG sequence into that folder. `--format` overrides the extension.
- `--quality low|medium|high|lossless` (default `medium`), as in the Render panel.
- `--force` replaces an existing `--out`. Without it, an existing output is refused.
- `--result <file>` also writes the result to a file. `--timeout <secs>` gives up after that long.
- `--show` uses the normal visible window. It's for debugging: the window takes focus.
- `--help` lists the options; `--version` prints the version.

`stills` draws chosen frames instead of the whole video, plus one contact sheet, to check a project at a glance:

```bash
"/Applications/Local Content Studio.app/Contents/MacOS/local-content-studio" stills "Spring Launch.lcs" --out stills
```

- By default (`--frames auto`) it picks the frames worth looking at: frame 12 (where the hook should already read), each scene once it has settled before its transition, the middle of each transition, the middle of each image morph, and the last frame. `--frames 0,45,90` picks your own frames (counted from 0), and `--frames all` picks every one.
- It writes `frame-NNNN.png` for each frame, at half size by default (`--scale`, more than 0 and at most 1; at 1 the files are byte-identical to a PNG-sequence render). `sheet.png` puts all of them in a grid, each labelled with its frame number, why it was picked, the time and the scene (`--sheet-scale`, default 0.25). Above 60 frames there's no sheet, only the files.
- The folder may already exist. Stills replace only their own files.

The output is the same as a Render-panel export, frame for frame. The app's window never appears, there's no Dock icon, and it doesn't take focus, so you can keep working. A command-line render is slower than one from the Render panel, about 3.3× on macOS: macOS gives a page nobody can see a lower priority. A 15-second 1080×1920 reel takes about 10 seconds.

The result is one JSON document on stdout: `ok`, `error`, the composition's size, frame count and duration, and any `issues` (such as a video the app can't decode, or GPU effects that fall back). Progress lines go to stderr. The exit code is 0 when the render succeeded, 1 when it ran and failed (for example, FFmpeg isn't installed), and 2 when it never started (a mistyped option, a folder that isn't a project, an output that already exists).

Opening the project in lc-studio while it renders from the command line is fine. The command line never changes the project or the app's recent-projects list.

On Windows, read the result from `--result`, because the app has no console there. On Linux, the app needs a display (run it under `xvfb-run -a` on a machine without one). Both are untested so far.

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
- **Layer FX vs Effects** — These are two different sections in the Property Inspector. *Effects* are CSS filters applied to the finished layer. *Layer FX* composite the layer's own pixels several times over — glow, echo trails, glitch tearing, and the reveal effects that animate a layer into frame.
- **Reveal effects** — Zoom, Pixelate, Slice, Wipe, Decrypt and Disintegrate are how a layer arrives. Add one and it brings a **Timing** panel with Delay, In, Out and Easing. Set *In* to control how long the entrance takes; set *Out* to make the layer leave the same way before the scene ends. Reveals cannot be switched off — a reveal with no timing would simply be a layer that is already there.
- **Timing on continuous effects** — Glow, glitch, shine and the rest are always on by default, but tick **Timing** on any of them and the same Delay/In/Out controls appear. That is how you get a glow that blooms in over the first twenty frames, or glitching that eases off rather than stopping dead.
- **Easing on reveals** — Try `ease-out-back` on a Zoom reveal. Reveals deliberately allow the easing to overshoot, so the layer scales past its final size and settles back.
- **Decrypt** — Cells of glyphs scramble over the layer, then resolve into it. *Glyphs* picks cipher characters, binary digits, or a density ramp that follows the layer's brightness. *Tint* moves the glyph colour from the layer's own colour (0) to *Glyph colour* (1). *Order* resolves cells at random, in a sweep along *Sweep angle*, or from the centre out; *Stagger* sets how strictly. This works on any layer, not just text; for per-character scrambling of a text layer's own font, use the text layer's *Scramble* character animation instead.
- **Wipe edge** — On a Wipe reveal, raise *Edge glow* for a hot line along the front, and *Sparks* for sparks drifting off it, both in *Edge colour*. Leave them at 0 for a plain wipe.
- **Text in a box** — Layer FX clip the layer to its box, so give a text layer with FX a box tall enough for all its lines.
- **VHS** — A scene FX (Scene FX → VHS) for worn tape: *Wave* and *Jitter* wobble the picture, *Colour bleed* pulls red and blue apart, *Head switching* and *Switching band* add the noisy strip at the bottom, *Crease* rolls a bright glitch line down the frame, and *Saturation* fades the colour. Stack it with Film grain and Camera shake: the VHS moves with the shake and the grain stays on top. *Tube curvature* bends the picture like an old TV screen (GPU; skipped without WebGL2).
- **Disintegrate** — The layer assembles from dust. *Wind angle* sets where the dust comes from (and blows to on exit), *Sweep angle* the direction in which grains land, and *Stagger* how strictly they land in that order (0 = all at once). *Gravity* drops (positive) or lifts (negative) the grains, and *Grain* is their size in pixels. Set *Out* to make the layer blow away at the end. At the default *Fade* of 1, far-off grains are nearly invisible; lower it to see the dust cloud travel.
- **Stacking order** — Reveals are applied before decorations, so a glow or outline follows the revealed shape. Stack Slice with Sticker outline to see the border trace each strip as it arrives.
- **Performance** — Large canvas resolutions (e.g., 4K) may slow down preview playback. The final render is unaffected since it runs frame-by-frame.
