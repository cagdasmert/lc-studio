# Local Content Studio

A cross-platform desktop application for planning, generating, previewing, and rendering short-form video animations entirely on your local machine. No cloud services required -- all critical flows work offline after installation.

<!-- ![Local Content Studio Screenshot](docs/screenshot.png) -->

## Features

**Storyboard Editor**
- Canvas workspace with drag, resize, and rotate for layers
- Zoom and pan navigation
- Drag-and-drop scene reordering
- Undo/redo and keyboard shortcuts

**Layer Types**
- Text, image, shape, video, and audio layers
- Layer effects: blur, brightness, contrast, saturate, and more

**Animation**
- Keyframe animation with 20+ easing functions and spring physics
- Scene transitions: fade, slide, wipe, zoom, dissolve

**AI-Assisted Content Generation**
- Supports Ollama, LM Studio, and OpenAI-compatible endpoints
- All AI suggestions remain fully editable

**Templates and Brand Kits**
- 5 built-in templates: kinetic text, quote card, countdown, product highlight, announcement
- Brand kits for consistent colors, typography, and motion style

**Rendering**
- Render queue with FFmpeg encoding to MP4
- Audio mixing via Web Audio (preview) and FFmpeg (multi-track export)
- Output presets: Instagram Story, TikTok, YouTube Shorts, and more

**Project Management**
- Save and load projects in `.lcs.json` format
- Portable project folders with JSON manifests

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- [Rust](https://www.rust-lang.org/tools/install) (latest stable)
- [FFmpeg](https://ffmpeg.org/download.html) (must be available on PATH for rendering)

## Quick Start

```bash
# Install frontend dependencies
npm install

# Launch the full desktop app with hot-reload
npm run tauri dev
```

### Other Commands

```bash
npm run dev                     # Vite dev server only (frontend at http://localhost:1420)
npm run build                   # TypeScript check + Vite production build
npm run tauri build             # Production build (.app/.dmg/.exe/.deb)
npm run tauri build -- --debug  # Debug build (faster, includes devtools)
npx tsc --noEmit                # Type-check without emitting
```

## Tech Stack

| Layer          | Technology                        |
|----------------|-----------------------------------|
| Desktop shell  | Tauri v2 (Rust)                   |
| Frontend       | React 19 + TypeScript             |
| Build tooling  | Vite 7                            |
| Rendering      | HTML5 Canvas + FFmpeg             |
| Audio          | Web Audio API + FFmpeg            |

## Project Structure

```
src/                  # React frontend (TypeScript)
src-tauri/
  src/lib.rs          # Tauri commands and app setup (Rust)
  src/main.rs         # Desktop entry point
  tauri.conf.json     # Tauri config (window size, bundle settings)
  Cargo.toml          # Rust dependencies
```

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## License

TBD
