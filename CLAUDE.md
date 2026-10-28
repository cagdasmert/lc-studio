# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

**Local Content Studio** is a cross-platform desktop application for planning, generating, previewing, and rendering short-form video animations entirely on the local machine. It combines a project workspace, an AI-assisted content generation layer, and a custom render pipeline built on HTML5 Canvas + FFmpeg.

Key constraint: **local-first**. All critical flows (generation, preview, rendering) must work offline after installation. No mandatory cloud services.

The full product definition is in `local-content-studio-product-definition.md`.

## Development Commands

```bash
npm install              # Install frontend dependencies
npm run dev              # Start Vite dev server only (frontend at http://localhost:1420)
npm run build            # TypeScript check + Vite production build
npm run tauri dev        # Launch full Tauri desktop app with hot-reload
npm run tauri build      # Production build (creates .app/.dmg/.exe/.deb)
npm run tauri build -- --debug  # Debug build (faster, includes devtools)
npx tsc --noEmit         # Type-check without emitting
npm run fetch-models     # Download + verify the auto-match model (tauri build runs it)
npm test                 # Run the Vitest suite once
npm run test:watch       # Vitest in watch mode
cargo test --manifest-path src-tauri/Cargo.toml   # Rust unit tests (FFmpeg args, audio graph)
node scripts/e2e/f2-export.mjs                    # Acceptance checks; see docs/developer-guide.md
src-tauri/target/debug/local-content-studio render <project.lcs> --out <file|dir>   # Command-line render (needs Vite in debug)
src-tauri/target/debug/local-content-studio stills <project.lcs> --out <dir>         # Key frames + contact sheet
```

## Tech Stack

- **Desktop shell**: Tauri v2 (Rust backend in `src-tauri/`)
- **Frontend**: React 19 + TypeScript + Vite 7
- **Rust crate name**: `local-content-studio` (lib: `local_content_studio_lib`)
- **Bundle identifier**: `com.localcontentstudio.app`

## Project Structure

```
src/                  # React frontend (TypeScript)
src-tauri/
  src/lib.rs          # Tauri commands and app setup (Rust)
  src/main.rs         # Desktop entry point
  tauri.conf.json     # Tauri config (window size, bundle settings, build commands)
  Cargo.toml          # Rust dependencies
```

## Architecture

The Tauri backend (`src-tauri/`) handles windowing, file system access, and process orchestration. The React frontend (`src/`) provides the UI. Communication between them uses Tauri's `invoke` API for calling Rust commands from TypeScript and Tauri's event system for async notifications.

Implemented subsystems:
- **Render pipeline** — Custom Canvas renderer (`src/renderer/`) for frame generation + FFmpeg encoding (`src-tauri/src/render/`) for video output
- **Effects system** — Layer FX (`src/renderer/layer-fx.ts`) composited from the layer's own pixels, with an optional timing envelope (`fx-envelope.ts`) that drives reveal effects and dims continuous ones; scene FX (`scene-fx.ts`) applied full-frame. UI is schema-driven from `src/lib/fx-schema.ts`, which the renderer must never import. All FX are frame-deterministic via `noise.ts` — never `Math.random()`
- **Image morph** — Image layers can warp into a second image (`src/renderer/morph-field.ts`, `draw-morph.ts`, driven by the `morphProgress` track). Matching points come from a bundled DINOv2 model run in a Web Worker at authoring time only (`src/lib/morph-match/`, model fetched by `npm run fetch-models`) — never during rendering
- **AI generation** — LLM orchestration via Ollama, LM Studio, or OpenAI-compatible APIs (`src/lib/ai/`), using `@tauri-apps/plugin-http` for CORS-free local requests
- **Export audio** — `buildAudioTracks()` (`src/lib/audio-tracks.ts`) times every audible layer; `build_audio_filter()` in `src-tauri/src/render/ffmpeg.rs` mixes them in one FFmpeg graph; preview playback (`AudioEngine`) uses the same timing helper. Media bytes are read with `src/lib/media-bytes.ts` (plugin-fs), never by fetching a filesystem path
- **Video frames** — `prepareVideoFrames()` decodes each frame's video (WebCodecs via mediabunny, `src/renderer/video-frames.ts`, adapted from OpenCut Classic — see `THIRD_PARTY_NOTICES.md`) before the synchronous draw; export awaits it, preview doesn't. Never draw a video layer by seeking an `HTMLVideoElement`
- **Acceptance scripts** — `node scripts/e2e/<feature>.mjs` drives real exports in the debug app through the `LCS_E2E` hook (`src-tauri/src/e2e.rs`, `src/lib/e2e.ts`)
- **Command line** — `local-content-studio render <project> --out <file>` (and `stills`, chosen frames plus a labelled contact sheet) runs the same renderer in a hidden window and prints a JSON result (`src-tauri/src/cli.rs`, `src/lib/cli/`). It must stay hidden (visible windows take focus) and throttling must stay off (a hidden page is otherwise suspended). Both renders go through `renderProject` (`src/lib/render-project.ts`). Spec: `docs/superpowers/specs/2026-10-28-headless-cli-design.md`
- **Storage** — JSON project manifests (`.lcs.json`) via `src/lib/project-io.ts`, recent projects tracked in localStorage

## Core Domain Concepts

- **Projects** — portable local folders with JSON manifests. Contain metadata, brand profile, template selection, script versions, scene graph, asset references, output presets, and render history.
- **Templates** — reusable Canvas compositions with defined input schemas, scene schemas, motion presets, typography tokens, and output presets.
- **Scenes** — storyboard cards (not freeform timeline tracks). Each has text layers, duration, motion preset, background media, caption rules, audio cues, and transition type.
- **Brand kits** — reusable visual systems (colors, typography, motion style, logo, watermark rules).
- **Render queue** — local jobs as first-class objects. Supports single render, batch render from CSV/JSON, multi-format export, retry, and log inspection.

## Key Design Principles

- **Structured creativity** — scenes, props, templates, and variants over freeform timelines.
- **Deterministic output** — same composition + props + assets = same render.
- **Human override everywhere** — all AI suggestions remain fully editable.
