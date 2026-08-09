# Local Content Studio — Product Definition

## Product overview
Local Content Studio is a desktop-first creative application for planning, generating, previewing, and rendering short-form video animations on a fully local machine. The product is designed for macOS, Windows, and Linux and uses a custom local rendering engine built on HTML5 Canvas (for frame generation) and FFmpeg (for video encoding), requiring no external rendering services or proprietary dependencies.

The application combines three functions in one interface: a project workspace for managing assets and templates, an AI-assisted content generation layer for scripts and scene structures, and a render pipeline for exporting social-media-ready videos. The custom Canvas + FFmpeg pipeline supports reusable compositions, template-driven workflows, and dataset-based batch rendering with full control over the rendering stack and no licensing constraints.

## Vision
The product should feel like a hybrid of a lightweight motion design studio, a campaign asset factory, and a developer-grade automation tool. Its core promise is simple: create many high-quality short videos locally, with a strong visual system, reusable templates, and enough control to satisfy technical users who want deterministic outputs.

The experience should favor repeatability over manual timeline editing. Instead of building every video from scratch, users should define reusable compositions, feed them structured inputs, preview variants, and render optimized vertical or square outputs from one workspace. The custom Canvas rendering pipeline is designed around this programmatic composition model.

## Problem statement
Short-form content production is fragmented across too many tools. Scriptwriting happens in one place, captions in another, asset organization in folders, rendering in a video editor, and variant generation in spreadsheets or ad hoc scripts.

For technical creators, local-first teams, and privacy-sensitive workflows, cloud-only editors create friction. They introduce upload delays, API dependencies, inconsistent reproducibility, and infrastructure overhead that are unnecessary when the rendering engine can run locally using Canvas frame capture and FFmpeg encoding.

## Goals
- Run fully locally on macOS, Windows, and Linux, with no mandatory cloud service for generation, preview, or rendering.
- Provide a polished UI for managing projects, assets, prompts, templates, generated variants, and export jobs.
- Support AI-assisted generation of hooks, scripts, caption text, storyboard structures, visual direction, CTA variants, and metadata.
- Enable one-click generation of many short-video variants from structured data.
- Offer developer-friendly extensibility through JSON project files, local APIs, and composition templates.
- Produce fast, repeatable exports for vertical social media formats.

## Non-goals
- Replace full nonlinear editors such as Premiere Pro or DaVinci Resolve for deep manual editing.
- Depend on a cloud render service as the default architecture.
- Target feature-film workflows, long documentaries, or collaborative cloud editing as a first release.

## Target users
### Primary users
- Technical solo creators who want scripted, repeatable short-form content generation.
- Small campaign, education, advocacy, or branded-media teams that need many format variants from a common template.
- Developers building local AI agent pipelines that generate content props and trigger renders automatically.

### Secondary users
- Social content operators who need a friendlier UI on top of a code-based video engine.
- Local-first agencies that want internal template systems without giving raw content to external services.

## Core use cases
1. Create a new project for a content campaign and choose a template such as quote card, kinetic typography, talking-head captions, announcement clip, or countdown.
2. Enter a brief, talking points, references, or source text, then have the app generate multiple scripts, hooks, and scene sequences.
3. Review generated scenes in a visual storyboard and edit text, timing, media, colors, typography, and transitions.
4. Preview the selected composition in-app using a player-based interface before rendering.
5. Render one or many outputs locally in formats such as 1080x1920, 1080x1080, or 1920x1080.
6. Batch-produce variants for different audiences, languages, CTAs, or openings using structured data. The custom render pipeline supports dataset-based rendering by iterating over structured inputs and producing one output per data row.

## Product principles
### Local-first by default
All critical flows should work without an internet connection after installation, except optional model downloads or third-party media acquisition. Rendering should use the local Canvas + FFmpeg pipeline rather than requiring a hosted API.

### Structured creativity
The system should encourage users to think in terms of scenes, props, templates, and variants rather than freeform timelines. Creativity comes from flexible building blocks, not hidden state.

### Deterministic output
A given composition, prop set, and asset package should render the same way across supported machines, within the limits of platform-level codec and browser differences.

### Human override everywhere
AI suggestions should accelerate production, not trap the user. Every generated line, scene, caption, and asset choice must remain editable.

## Proposed solution
The product will be a cross-platform desktop application with a local web-style UI shell and a custom render worker. The UI manages projects, templates, generation sessions, and render jobs, while a background render process draws each frame to an HTML5 Canvas (or OffscreenCanvas in a Web Worker), captures the frame as image data, and pipes it to FFmpeg for video encoding.

A recommended architecture is a Python or local-model orchestration layer for language and planning tasks, paired with the Canvas + FFmpeg render worker for actual video output. FFmpeg is bundled or resolved locally; the Tauri/Rust backend orchestrates the FFmpeg child process and streams progress events back to the UI.

## UX concept
The app should feel cinematic, tactical, and production-oriented without resembling a traditional timeline editor. The mental model is “workspace plus factory” rather than “canvas plus manual timeline.”

### Primary navigation
- Home
- Projects
- Templates
- Assets
- Generator
- Preview
- Render Queue
- Settings

### Primary layout
Use a three-pane layout in the main project view:
- Left pane: project tree, scenes, variants, assets, and template sections.
- Center pane: storyboard cards, forms, and preview context.
- Right pane: inspector for selected scene properties, animation presets, typography, brand settings, and timing controls.

### Key interaction style
- Scene cards instead of freeform tracks for the first version.
- Inline prompt bars for quick generation and rewrite actions.
- Dockable live preview player.
- Persistent render queue with job history, logs, retries, and export destinations.
- Snapshot system to compare script or style variants side by side.

## Main features
### 1. Project workspace
Each project contains:
- Project metadata
- Brand profile
- Template selection
- Script versions
- Scene graph
- Assets folder references
- Output presets
- Render history

Projects should be stored as portable local folders with JSON manifests so they can be versioned with Git or copied between machines.

### 2. Template library
The app should ship with editable starter templates inspired by common short-form content patterns. Each template is a self-contained Canvas composition module that defines how to draw frames given structured input props.

Suggested templates:
- Kinetic text opener
- Talking-head caption overlay
- Before/after comparison
- Quote and statistic card
- Product highlight reel
- Countdown or listicle
- Testimonial montage
- Event or announcement teaser
- Meme-style reaction format
- Audio waveform explainer

Each template should define:
- Input schema
- Scene schema
- Motion presets
- Typography tokens
- Safe-zone guides
- Output presets

### 3. AI generation studio
The generation layer should support:
- Brief to script
- Long text to short-video scenes
- Script rewrite by tone or intensity
- Hook generation
- CTA generation
- Caption splitting
- Visual prompt generation for background art
- Thumbnail/title suggestion
- Variant generation across audience or platform

Creatively, this area should work like a “content lab.” A user enters a thesis, key message, source notes, and constraints; the system returns several narrative shapes such as punchy, authoritative, ironic, urgent, documentary, or minimalist.

### 4. Storyboard editor
The storyboard is the heart of the product. Each scene card should include:
- Scene label
- Duration
- Text layers
- Caption rules
- Background media
- Motion preset
- Audio cues
- Transition type
- Notes and tags

Users should be able to duplicate, lock, reorder, disable, or branch scenes into variants.

### 5. Preview system
The app should provide a local preview player that renders compositions in real time using HTML5 Canvas within the Tauri webview. The same Canvas rendering functions used for export are reused for preview, ensuring WYSIWYG fidelity between preview and final output.

Preview modes:
- Full composition preview
- Scene-only preview
- Mobile safe-area preview
- Caption-only preview
- Brand compliance preview
- Side-by-side variant comparison

### 6. Render queue
The render queue should expose local jobs as first-class objects. The Canvas + FFmpeg pipeline renders frames locally and writes output to user-specified locations, fitting a desktop queue model with no external dependencies.

Render capabilities:
- Single render
- Batch render from CSV or JSON
- Multi-format export from one source
- Retry failed jobs
- Priority ordering
- Log inspection
- Estimated time remaining
- Export presets for major social platforms

### 7. Asset system
The asset manager should organize:
- Images
- Short clips
- Voiceover files
- Music and SFX
- Logos
- Fonts
- Color palettes
- Subtitle files
- Generated thumbnails

Important capabilities:
- Drag-and-drop import
- Duplicate detection
- Auto-tagging
- Asset usage tracing
- Missing-file repair
- Proxy previews for large media

### 8. Brand kits
A brand kit should let users define reusable visual systems:
- Logo package
- Primary and secondary colors
- Typography pairs
- Background styles
- Motion style presets
- Lower-third presets
- CTA styles
- Watermark rules

One project can switch brand kits to produce the same message in multiple visual identities.

### 9. Local automation
Advanced users should be able to trigger jobs through:
- Local CLI
- Watched input folders
- Local REST endpoint, optional
- JSON import/export
- Local webhooks, optional
- Scheduled generation profiles

REST should remain optional. The core app must work by directly invoking the local Canvas renderer and FFmpeg encoder without requiring network services.

## Delight features
To make the product memorable, add a few signature features:

### Narrative modes
A script can be reframed through selectable narrative engines such as:
- Manifesto
- Fast facts
- Myth vs fact
- Countdown
- Testimonial arc
- Contrast arc
- Warning then solution
- Cold open then reveal

### Motion personality packs
Users can apply higher-level motion identities such as:
- Broadcast urgency
- Clean editorial
- Neon kinetic
- Documentary minimal
- Retro terminal
- Luxury promo
- Street poster

These packs remap multiple low-level animation parameters at once.

### Tension graph
A creative control curve lets users control intensity across the video timeline. Raising tension can automatically increase cut speed, text scale emphasis, contrast, caption punch-ins, audio density, and CTA sharpness.

### Content genome
Each exported video records the “genome” of its composition: template, prompts, narrative mode, motion pack, assets, and output settings. Users can fork from any old genome to create new variants quickly.

## Functional requirements
### Platform
- Must run locally on macOS, Windows, and Linux.
- Must support GPU-optional rendering, with graceful fallback to CPU-based local execution where needed.
- Must allow portable project directories.

### Content generation
- Must support manual mode, AI-assisted mode, and template-only mode.
- Must generate multiple script variants from one brief.
- Must let users lock selected lines before regenerating the rest.
- Must support multilingual content fields.

### Editing
- Must support scene duplication, reordering, disabling, and branching.
- Must support per-scene asset overrides.
- Must support project-wide style tokens and per-scene exceptions.
- Must support undo/redo history.

### Rendering
- Must render locally without cloud dependency.
- Must support MP4 as the initial required format.
- Must support queueing multiple jobs.
- Must support predefined output resolutions and FPS.
- Must save logs for failed renders.

### Data
- Must save project manifests as human-readable files.
- Must support import/export of JSON-based scene definitions.
- Must preserve generation history and render history.

## Suggested architecture
| Layer | Responsibility | Suggested stack |
|---|---|---|
| Desktop shell | Windowing, file access, process orchestration | Tauri or Electron |
| UI frontend | Project UI, forms, preview, queue, inspector | React + TypeScript |
| Render worker | Draw frames and encode video | HTML5 Canvas/OffscreenCanvas + FFmpeg (bundled or system) |
| Generation worker | Prompting, local model orchestration, text processing | Python or Node |
| Storage | Local project folders, manifests, cache, logs | JSON + SQLite optional |
| Preview | In-app playback and inspection | HTML5 Canvas in Tauri webview (same render functions as export) |

## Data model
### Project manifest
```json
{
  "projectId": "garden-campaign-01",
  "name": "Garden Campaign",
  "brandKit": "default-editorial",
  "template": "kinetic-opener-v2",
  "outputs": ["vertical-1080x1920"],
  "scripts": ["script-a", "script-b"],
  "activeStoryboard": "storyboard-main",
  "assetsPath": "./assets",
  "createdAt": "2026-08-09T20:00:00Z"
}
```

### Scene schema
```json
{
  "id": "scene-03",
  "type": "text-overlay",
  "durationFrames": 75,
  "text": {
    "headline": "The old system is broken",
    "subline": "Build the local alternative"
  },
  "motionPack": "broadcast-urgency",
  "backgroundAsset": "bg-city-01.mp4",
  "captionMode": "word-by-word",
  "audioCue": "hit-02.wav"
}
```

## UI modules
### Home dashboard
Shows recent projects, render status, favorite templates, quick-start generation modes, and the last-used brand kit.

### Project cockpit
A command center view with project summary, open tasks, generation drafts, render-ready variants, and asset health warnings.

### Prompt console
A power-user panel for entering structured instructions with fields for objective, audience, tone, constraints, banned phrases, desired CTA style, and output count.

### Style inspector
A dedicated control surface for typography scales, color tokens, caption presets, transition presets, motion pack assignment, and safe-area overlays.

### Batch lab
A grid interface for importing CSV or JSON rows and mapping fields to template inputs. The custom render pipeline iterates over each data row to produce one video per entry, making batch production one of the product’s strongest differentiators.

### Queue theater
A cinematic queue screen with live statuses, mini thumbnails, ETA, warnings, and post-render actions such as open folder, reveal asset, duplicate job, or generate alternate cuts.

## Suggested user flow
1. Open app.
2. Create project from a template.
3. Select narrative mode and visual motion pack.
4. Enter a brief or paste source material.
5. Generate 3 to 8 scripts.
6. Pick one and auto-build a storyboard.
7. Review scenes in storyboard view.
8. Adjust typography, timing, assets, and captions.
9. Preview on vertical safe area.
10. Render one or more output presets.
11. Review output and fork variants.

## MVP scope
### Included in MVP
- Cross-platform desktop shell
- Local project management
- Template library with 5 to 8 starter templates
- Prompt-based script generation
- Scene storyboard editor
- Embedded preview
- Local render queue
- MP4 export
- JSON import/export
- Brand kits

### Excluded from MVP
- Multi-user collaboration
- Cloud sync
- Marketplace for templates
- Advanced timeline editing
- Voice cloning
- Auto-posting to social networks
- Distributed render farm

## Risks and mitigations
| Risk | Why it matters | Mitigation |
|---|---|---|
| Cross-platform packaging complexity | Desktop apps and local dependencies can behave differently across operating systems | Keep render worker isolated, test on all three OS targets early |
| Local media and codec differences | Export behavior may vary across environments | Standardize supported presets and validate during install |
| AI output inconsistency | Generated scripts may be uneven in quality | Add deterministic template scaffolding and lockable sections |
| Asset sprawl | Local projects can become messy quickly | Use project manifests, asset tracing, and missing-file diagnostics |
| Performance under batch loads | Users may queue many renders at once | Add queue limits, previews, and background worker monitoring |

## Success metrics
- Time from brief to first render under 10 minutes for a new user.
- Time from approved template to ten rendered variants under 20 minutes on a modern local machine.
- At least 80 percent of projects rendered without manual troubleshooting after template setup.
- At least 50 percent of users reuse a template or brand kit within their first five projects.

## Positioning
Local Content Studio should be positioned as a local-first short-video operating system for technical creators and content teams. It is a management layer, creative engine, and render command center built on a fully custom, open-standards rendering foundation (HTML5 Canvas + FFmpeg) with no proprietary dependencies or licensing constraints.

## Release recommendation
The first release should focus on one strong wedge: batchable short-form social videos with editable storyboard scenes and deterministic local rendering. That wedge is realistic because the Canvas + FFmpeg pipeline gives full control over frame-level rendering, template-driven composition, and data-driven batch workflows with no external service or licensing dependencies.

## Naming ideas
- Local Content Studio
- Motion Forge
- Clip Foundry
- Variant Studio
- Signal Cut
- Frame Factory
- PromptMotion
- CutGrid
- ForgeFrame
- StoryRender
