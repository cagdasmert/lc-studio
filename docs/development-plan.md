# Development Plan: Pre-AI Foundation

> **Status: COMPLETED.** All 12 items below have been implemented.

## Overview

Before adding the AI generation layer, the storyboard editor needs functional completeness, usability fundamentals, and workflow infrastructure. This plan covers 12 items grouped by priority.

---

## Priority 1: Critical (Must-Have)

### 1. Project Save/Load

Compositions currently live only in memory and are lost on close. This is the most fundamental gap.

**Scope:**
- Save composition to `.lcs.json` file (custom extension for "Local Content Studio")
- Load composition from file
- Recent projects list (stored in app settings via Tauri plugin-store or localStorage)
- Auto-save to a temp location every 60 seconds
- "New Project" that resets to default composition
- Dirty state tracking (unsaved changes indicator in header)

**Files:**
| File | Action | Purpose |
|------|--------|---------|
| `src/lib/project-io.ts` | NEW | `saveProject()`, `loadProject()`, `autoSave()`, `loadRecentProjects()` |
| `src/store/composition-slice.ts` | UPDATE | Add `isDirty` flag, set on every mutation |
| `src/components/storyboard/ProjectMenu.tsx` | NEW | New/Open/Save/Save As/Recent menu |
| `src/App.tsx` | UPDATE | Integrate ProjectMenu in header, auto-save effect |
| `src/App.css` | UPDATE | Styles for ProjectMenu, dirty indicator |

**Notes:**
- Use `@tauri-apps/plugin-dialog` for open/save dialogs
- Use `@tauri-apps/plugin-fs` for read/write
- Project file stores the full `Composition` JSON plus metadata (version, savedAt)
- Asset paths should be stored as relative paths when possible for portability

---

### 2. Undo/Redo UI

The `zundo` temporal middleware is configured but has no triggers.

**Scope:**
- Undo/Redo buttons in the header/toolbar area
- Keyboard shortcuts: Ctrl/Cmd+Z (undo), Ctrl/Cmd+Shift+Z (redo)
- Visual disabled state when at history boundary
- Show "nothing to undo/redo" state

**Files:**
| File | Action | Purpose |
|------|--------|---------|
| `src/components/storyboard/Toolbar.tsx` | UPDATE | Add undo/redo buttons |
| `src/hooks/useKeyboardShortcuts.ts` | NEW (see item 3) | Registers undo/redo shortcuts |
| `src/App.css` | UPDATE | Styles for undo/redo buttons |

**Notes:**
- Access temporal store via `useStore.temporal.getState()` from zundo
- `undo()` and `redo()` methods, `pastStates` and `futureStates` for disabled state

---

### 3. Keyboard Shortcuts

No keyboard handling exists. Essential for any editor.

**Scope:**
| Shortcut | Action |
|----------|--------|
| `Space` | Play/Pause |
| `Delete` / `Backspace` | Remove selected layer |
| `Left Arrow` | Step back one frame |
| `Right Arrow` | Step forward one frame |
| `Home` | Jump to first frame |
| `End` | Jump to last frame |
| `Ctrl/Cmd+Z` | Undo |
| `Ctrl/Cmd+Shift+Z` | Redo |
| `Ctrl/Cmd+S` | Save project |
| `Ctrl/Cmd+Shift+S` | Save As |
| `Ctrl/Cmd+O` | Open project |
| `Ctrl/Cmd+D` | Duplicate selected layer |
| `V` | Select tool |
| `M` | Move tool |
| `H` | Hand tool |
| `G` | Toggle grid |

**Files:**
| File | Action | Purpose |
|------|--------|---------|
| `src/hooks/useKeyboardShortcuts.ts` | NEW | Central keyboard handler registered on window |
| `src/App.tsx` | UPDATE | Mount the keyboard shortcuts hook |

**Notes:**
- Must not fire when user is typing in an input/textarea (check `document.activeElement`)
- Use `e.metaKey` on macOS, `e.ctrlKey` on other platforms

---

## Priority 2: Important (Functional Gaps)

### 4. Canvas Interaction

Tool modes and zoom exist in the store but aren't connected to the canvas.

**Scope:**
- **Move tool**: Click and drag layers to reposition them
- **Resize handles**: 8 handles (corners + edges) on selected layer bounding box
- **Rotation handle**: Handle above the bounding box for rotation
- **Zoom**: Toolbar zoom controls scale the canvas view; mouse wheel zoom
- **Pan**: Hand tool enables click-drag panning; also middle-mouse-button panning
- **Grid overlay**: Draw grid lines on canvas when showGrid is enabled
- **Snap**: Snap layer position to grid when snapToGrid is enabled (grid size configurable, default 10px)

**Files:**
| File | Action | Purpose |
|------|--------|---------|
| `src/components/storyboard/CanvasWorkspace.tsx` | UPDATE | Add drag, resize, rotate handlers; zoom/pan transform; grid drawing |
| `src/store/ui-slice.ts` | UPDATE | Add `gridSize`, `panX`, `panY` state |
| `src/App.css` | UPDATE | Cursor styles for different tool modes |

**Notes:**
- Use `onMouseDown`, `onMouseMove`, `onMouseUp` for drag operations
- Transform calculations must account for canvas scale, pan offset, layer anchor point, and rotation
- Resize should respect aspect ratio when holding Shift
- Snap rounds position to nearest grid multiple

---

### 5. Video Layer Rendering

Video layers can be created but render as nothing. The draw.ts switch has `case 'video': break;`.

**Scope:**
- Extract frames from video files using an offscreen `<video>` element
- Draw the current video frame on the canvas at the correct time offset
- Video playback during preview (synchronized with the playback loop)
- Video frame extraction for render (seek to exact frame, capture, draw)

**Files:**
| File | Action | Purpose |
|------|--------|---------|
| `src/renderer/draw-video.ts` | NEW | `drawVideoLayer()` — draw current frame from HTMLVideoElement |
| `src/renderer/video-cache.ts` | NEW | Video element pool, preloading, seek-and-capture |
| `src/renderer/draw.ts` | UPDATE | Wire `'video'` case to `drawVideoLayer()` |
| `src/renderer/media-cache.ts` | UPDATE | Support video sources alongside images |
| `src/components/storyboard/PropertyInspector.tsx` | UPDATE | Add Video section (src, start/end time, playback rate, muted) |

**Notes:**
- For preview: use HTMLVideoElement with `currentTime` synced to frame position
- For render: seek HTMLVideoElement to exact time, wait for `seeked` event, draw to canvas
- Video rendering is inherently slower due to seek latency; consider frame-level caching for short clips
- Full FFmpeg-based frame extraction is a future optimization

---

### 6. Effects UI

Effects are in the type system and renderer but can't be added/edited from the UI.

**Scope:**
- Effects section in PropertyInspector for selected layer
- Add effect (dropdown of available types)
- Edit effect value (numeric slider or input)
- Remove effect (x button)
- Reorder effects (up/down arrows)

**Files:**
| File | Action | Purpose |
|------|--------|---------|
| `src/components/storyboard/PropertyInspector.tsx` | UPDATE | Add EffectsSection component |
| `src/store/composition-slice.ts` | UPDATE | Add `addEffect`, `updateEffect`, `removeEffect`, `reorderEffects` mutations |
| `src/App.css` | UPDATE | Styles for effects list |

**Notes:**
- Effect value ranges: blur (0-50px), brightness (0-3), contrast (0-3), saturate (0-3), grayscale (0-1), sepia (0-1), hue-rotate (0-360deg)
- Drop-shadow needs color, blur, offsetX, offsetY — more complex UI
- Effects are applied via `ctx.filter` CSS filter string, already implemented in `effects.ts`

---

### 7. Render Queue

Only one render runs at a time with no queue, history, or retry.

**Scope:**
- Queue multiple render jobs (composition + output path + settings)
- Sequential execution (one at a time, next starts when previous finishes)
- Job states: queued, rendering, completed, failed, cancelled
- History of completed/failed renders
- Retry failed jobs
- Cancel individual queued jobs
- Progress per job

**Files:**
| File | Action | Purpose |
|------|--------|---------|
| `src/store/render-slice.ts` | NEW | Render queue state, job management |
| `src/store/index.ts` | UPDATE | Add RenderSlice to store |
| `src/components/RenderPanel.tsx` | UPDATE | Replace single-render UI with queue UI |
| `src/App.css` | UPDATE | Queue list styles |

**Notes:**
- Queue is in-memory only for now (jobs don't persist across app restarts)
- Each job stores: id, composition snapshot, outputPath, status, progress, error, timestamps
- Run the next queued job automatically when the current one finishes

---

## Priority 3: Polish

### 8. Drag-and-Drop

**Scope:**
- Drag to reorder layers in the LayerPanel
- Drag to reorder scenes in the SceneTimeline
- Drag-and-drop files onto the canvas or layer panel to create image/audio layers

**Files:**
| File | Action | Purpose |
|------|--------|---------|
| `src/components/storyboard/LayerPanel.tsx` | UPDATE | Add drag handle, onDragStart/Over/Drop for reorder |
| `src/components/storyboard/SceneTimeline.tsx` | UPDATE | Add drag reorder for scenes |
| `src/components/storyboard/CanvasWorkspace.tsx` | UPDATE | onDrop handler for file drops |
| `src/lib/file-utils.ts` | UPDATE | Process dropped files (detect type, create blob URL) |

**Notes:**
- Use native HTML5 drag-and-drop API
- For layer/scene reorder: use `draggable` attribute and reorder on drop
- For file drops: read `DataTransfer.files`, filter by known extensions, create appropriate layer type

---

### 9. Multiple Output Presets

**Scope:**
- Selectable output presets in the render panel and project settings
- Built-in presets: Vertical (1080x1920), Square (1080x1080), Landscape (1920x1080), Instagram Story (1080x1920 @30fps), TikTok (1080x1920 @30fps), YouTube Shorts (1080x1920 @60fps)
- Custom preset entry (width, height, fps)
- Canvas preview aspect ratio updates when preset changes

**Files:**
| File | Action | Purpose |
|------|--------|---------|
| `src/lib/output-presets.ts` | NEW | Preset definitions array |
| `src/components/RenderPanel.tsx` | UPDATE | Preset selector dropdown |
| `src/components/storyboard/PropertyInspector.tsx` | UPDATE | Output preset in scene/project settings |
| `src/store/composition-slice.ts` | UPDATE | `setOutputPreset()` mutation |

---

### 10. Asset Manager

**Scope:**
- Side panel or dialog showing all assets used across the composition
- Asset types: images, audio, video
- Shows file name, type, size, usage count (which scenes/layers reference it)
- Missing asset detection and warning
- Re-link missing assets
- Remove unused assets

**Files:**
| File | Action | Purpose |
|------|--------|---------|
| `src/components/storyboard/AssetPanel.tsx` | NEW | Asset manager UI |
| `src/lib/asset-utils.ts` | NEW | Scan composition for asset references, detect missing files |
| `src/App.tsx` | UPDATE | Add asset panel toggle |
| `src/App.css` | UPDATE | Asset panel styles |

**Notes:**
- This is an informational/management panel, not a file browser
- Asset health warnings are important for portable projects (moved/deleted files)

---

### 11. Brand Kits

**Scope:**
- Brand kit data structure: colors (primary, secondary, accent, background), fonts (heading, body), logo source, watermark rules
- Brand kit editor UI
- Apply brand kit to composition (maps colors/fonts to layers)
- Save/load brand kits as JSON files
- Multiple brand kits per project

**Files:**
| File | Action | Purpose |
|------|--------|---------|
| `src/types/brand.ts` | NEW | BrandKit type definition |
| `src/store/brand-slice.ts` | NEW | Brand kit state and mutations |
| `src/store/index.ts` | UPDATE | Add BrandSlice |
| `src/components/storyboard/BrandKitEditor.tsx` | NEW | Brand kit editor panel |
| `src/lib/brand-utils.ts` | NEW | Apply brand kit to composition layers |

**Notes:**
- This is foundational for the AI layer — generated content should respect the active brand kit
- Applying a brand kit walks through all text layers and remaps color/font properties

---

### 12. Template Library

**Scope:**
- Template = a composition blueprint with placeholder content
- Built-in starter templates (5-8): kinetic text opener, quote card, countdown, product highlight, announcement teaser
- Template browser dialog
- "New from template" flow: pick template → fill placeholders → generates composition
- Save current composition as template

**Files:**
| File | Action | Purpose |
|------|--------|---------|
| `src/types/template.ts` | NEW | Template type definition (extends Composition with placeholder metadata) |
| `src/lib/templates/` | NEW DIR | Built-in template definitions (one .ts file per template) |
| `src/lib/template-utils.ts` | NEW | `instantiateTemplate()`, `saveAsTemplate()` |
| `src/components/storyboard/TemplateBrowser.tsx` | NEW | Template picker dialog |
| `src/App.tsx` | UPDATE | Wire template browser |
| `src/App.css` | UPDATE | Template browser styles |

**Notes:**
- Templates are the bridge between the storyboard editor and the AI layer
- AI-generated scenes should output compositions that match template schemas
- Template placeholders define which fields the user (or AI) fills in

---

## Implementation Order

```
Phase A: Usability Foundations (Items 1-3)
  1. Project Save/Load
  2. Undo/Redo UI
  3. Keyboard Shortcuts
  ─── Verification: Save a project, close app, reopen, load it back.
       Undo/redo with Ctrl+Z/Y. All shortcuts work. ───

Phase B: Editor Completeness (Items 4-6)
  4. Canvas Interaction (drag/move/resize/zoom/pan/grid)
  5. Video Layer Rendering
  6. Effects UI
  ─── Verification: Drag layers on canvas, resize with handles,
       zoom/pan, video layers render, add blur/brightness effects. ───

Phase C: Render & Workflow (Item 7)
  7. Render Queue
  ─── Verification: Queue 3 renders, they execute sequentially,
       retry a failed one, cancel a queued one. ───

Phase D: Polish & Infrastructure (Items 8-12)
  8. Drag-and-Drop
  9. Multiple Output Presets
  10. Asset Manager
  11. Brand Kits
  12. Template Library
  ─── Verification: Drag reorder layers, pick output presets,
       view assets, apply brand kit, create from template. ───

Phase E: AI Generation Layer (separate plan)
  ─── Depends on: Templates (12), Brand Kits (11), Save/Load (1) ───
```

## Files Summary

- **New files:** ~16
- **Updated files:** ~14
- **New directories:** 1 (`src/lib/templates/`)
