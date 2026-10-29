# Headless CLI Mode: render, stills, check and automatch from the command line

**Date:** 2026-10-28
**Status:** Draft, ready to implement (or to turn into a plan)
**Baseline:** `main` at `6b6cec4` (the FX pack, including the WebGL2 pass, is merged). Independent of the audio-sync spec (`2026-10-25-audio-sync-design.md`): if that lands first, `render` picks up the soundtrack for free, because it goes through the same `renderComposition`.
**Caller:** the `lc-studio-project` skill (`/Users/cagdasmert/work/WS/skills/lc-studio-project`, outside this repo). §8 covers its side.

## How to use this document

- Read `CLAUDE.md` and `docs/developer-guide.md` first, especially "Acceptance scripts (`scripts/e2e/`)": the CLI grows out of the `LCS_E2E` hook described there.
- §0 says what is being built and why. §1 describes the code as it is today. §2 holds the rules for every phase. §3 is the command-line contract every phase implements against. §4–§8 give one phase each, with requirements (R…) and acceptance checks (A…). **§11 is the todo list. Work through it from top to bottom.**
- There are four phases in this repo, each on its own stacked branch, plus one phase in the skill. Every acceptance check of a phase passes before the next phase starts.
- If you'd rather have a step-by-step plan first, run superpowers:writing-plans on this file and save the result as `docs/superpowers/plans/2026-10-28-headless-cli.md`.
- Anything marked **(design call)** was decided while writing this spec, not by the user. Change it if the code argues otherwise, and say so in the phase's commit message.

---

## 0. What and why

The `lc-studio-project` skill lets an agent write a `.lcs` project, but the user still opens it and exports the video by hand, and the agent never sees what lc-studio actually draws. This spec makes the app binary itself usable from a shell:

```
local-content-studio render    "Spring Launch.lcs" --out "Spring Launch.mp4"
local-content-studio stills    "Spring Launch.lcs" --out stills/ --frames auto
local-content-studio check     "Spring Launch.lcs"
local-content-studio automatch "Spring Launch.lcs" --layer before-after
```

| Phase | What the user (and the agent) gets |
|---|---|
| **CL0** Runner and `render` | The app runs one job from argv in a hidden window, prints a JSON result, and exits with a meaningful code. `render` exports MP4/WebM/MOV/GIF/PNG sequence exactly as the Render panel does. |
| **CL1** `stills` | Chosen frames as PNGs plus one labelled contact sheet, so an agent can look at the hook, every scene, every transition and the end card in one image. |
| **CL2** `check` | The project checked by the app itself: does it load, does the editor survive it, does every frame draw, do text boxes fit (measured by the real canvas), are media, fonts and codecs usable, will GPU effects fall back. |
| **CL3** `automatch` | DINOv2 morph pairs for an image layer, from the command line, merged with manual pairs exactly as **Edit points… → Auto-match** does. |
| **CL4** Skill | `lcs.py` finds the app and wraps all four. The skill looks at stills before handing off, renders the MP4 itself, runs auto-match instead of leaving it to the user, and lets the app's `check` overrule its own Python copies of the app's logic. |

Why this shape:

- **The renderer only exists inside the webview.** Frames are drawn with Canvas 2D, WebGL2 and WebCodecs (mediabunny) in the frontend and piped to FFmpeg by Rust (`capture.ts` → `write_frame`). Any export path has to run that webview. A Python re-implementation would drift from the app, and a Chromium-based renderer (the way Remotion works) would draw text, decode video and run shaders differently from WKWebView, so the agent's render wouldn't match the user's. That breaks "deterministic output".
- **A mode of the existing binary, not a new tool.** The `LCS_E2E` hook (`src-tauri/src/e2e.rs`, `src/lib/e2e.ts`) already runs `render` and `preview` jobs in the real webview and quits. CL0 turns that idea into a release-safe front door: explicit argv instead of an env var, a fixed set of typed commands instead of arbitrary job JSON, a hidden window, and results on stdout.
- **Stills and check matter more than render.** Render is what the user asked for. But stills (the agent sees its work) and check (the app's own verdict replaces guesses) are what improve the projects the skill produces. `lcs.py` currently copies three pieces of app logic into Python so it can guess: the enums from `scene.ts`, `wrapText` from `draw-text.ts` (with its own TTF parser), and the morph geometry from `fit.ts`/`morph-field.ts`/`draw-morph.ts`.
- **CLI before MCP.** An MCP server inside the app, or a live link to the GUI instance the user has open, would allow co-editing. But it needs the app running, has a much larger surface, and can wrap these same four commands later. It's a follow-up (§12).

## Goals

- `render` output is identical to a Render-panel export of the same project at the same format and quality. For PNG sequences this means byte-identical frames, not just close.
- Every run ends: exit 0, 1 or 2 within a bounded time, never a hang or a window left open.
- A normal launch is unchanged: no args, the e2e hook, and "open with" launches that pass a file path all behave exactly as today.
- No new npm dependencies. On the Rust side, at most `windows-sys` for attaching to the parent console on Windows (R0.11).
- macOS is the acceptance platform. Windows and Linux build and keep the GUI unchanged, and their CLI limitations are written down.

## Non-goals

- Rendering with no webview at all, on a machine with no display server, or in CI on a bare Linux box (`xvfb-run` is documented, not supported).
- An MCP server, or any link to a running GUI instance (§12).
- Editing commands (`set-text`, `move-layer`…). Agents edit `project.json`; the CLI reads it.
- Frame ranges, partial renders, batch renders from CSV, or several formats in one run. Run `render` once per format.
- CLI renders as fast as Render-panel exports. A hidden window renders about 3.3× slower on macOS (§10, R0.10), and that's accepted.
- Replacing the `LCS_E2E` hook. It stays for debug-only UI checks (`preview`, `play`, `gl`, `save`).
- Deleting the Python copies of app logic from `lcs.py`. They stay as the fallback where the app isn't installed (cloud harnesses, another machine).

## Anti-goals (fail even if it "works")

- A CLI frame that differs from the GUI export of the same project.
- A CLI run that writes anything into the project or the user's app state (autosave, asset bundling, recent projects, localStorage), other than `automatch --write`.
- CLI mode that can be reached by anything other than explicit argv in a release build: no env var, no file inside a project, no deep link.
- A Dock icon or a focus steal on macOS while an agent renders.
- A run that hangs when the webview is suspended, the frontend never loads, or FFmpeg is missing.

---

## 1. Current state (verified at `6b6cec4`)

### Export

- `renderComposition(composition, outputPath, onProgress?, format, quality, projectDir?)` (`src/renderer/capture.ts`). `createFrameRenderer` preloads images (`preloadComposition`), sets up `MediaBlobCache` and `VideoFrameCache`, and draws on its own offscreen canvas at output size. Each frame awaits `prepareVideoFrames` and then calls `drawCompositionFrame`, so any frame can be drawn on its own, in any order.
- MP4/WebM/MOV/GIF: `startRender` → `writeFrame` per frame (raw RGBA) → `finishRender` (`src/lib/tauri-bridge.ts` → `src-tauri/src/render/commands.rs`). Rust spawns `ffmpeg` from `PATH` (`ffmpeg.rs`, `check_ffmpeg`) and writes the output file itself. One job at a time (`RenderState.active_job`).
- PNG sequence: no FFmpeg. The frontend writes `frame-NNNN.png` with plugin-fs `writeFile`, so the output folder must be in the fs scope.
- `ExportFormat = 'mp4' | 'webm' | 'gif' | 'png-sequence' | 'mov'`, `QualityPreset = 'low' | 'medium' | 'high' | 'lossless'` (`src/types/scene.ts:602`).
- Render-panel warnings (`RenderPanel.tsx`): undecodable video layers (`countUndecodableVideoLayers`/`undecodableWarning`, `src/lib/video-support.ts`) and GPU effects without WebGL2 (`gpuFeatureUses`/`gpuWarning`, `src/lib/gpu-features.ts`, `glAvailable()`).

### Loading

- `loadProjectFromPath(path)` (`src/lib/project-io.ts`) accepts a `.lcs` folder or its `project.json`, calls `allowProjectDir`, reads the file, **adds the project to the recent list**, and **registers bundled fonts without waiting** (`loadProjectFonts(...).catch(() => {})`). The GUI exports long after load, so the font race never shows there. A CLI run that draws straight away would draw with fallback fonts.
- `readProjectFile` checks only that the JSON parses and has `composition.scenes`. A skill draft (`{"draft": …}`) fails with "missing composition data". A shorthand value such as `"output": "tiktok"` passes and crashes later.
- There's no React error boundary in `src/`. A render error anywhere in the editor unmounts the tree, which is the "black window" the skill warns about.
- `App.tsx` autosaves every 60 s when `projectPath` is set and the composition is dirty.

### Rust shell

- `main.rs`: `windows_subsystem = "windows"` in release, so a release build on Windows has no console for stdout.
- `lib.rs`: plugins opener, dialog, fs, http; commands `allow_project_dir`, the render commands, `e2e_script`, `e2e_finish`. No arg parsing, no single-instance plugin.
- `project_scope::project_dir_for` accepts only a `.lcs` folder, a folder holding `project.json`, or a `project.json`. It refuses legacy `.lcs.json` files and arbitrary folders, and has unit tests.
- `tauri.conf.json`: one window with no `label` (so `"main"`) and the default `create: true`. 1280×800, min 960×600. `capabilities/default.json` applies to `"main"`.
- Tauri `2.11.5` creates config windows **before** the `setup` hook (`tauri/src/app.rs:2524`), so a config window can't be made hidden from `setup`. It has to be `create: false` and built in `setup`. `WebviewWindowBuilder` has `visible`, `focused` and `background_throttling(BackgroundThrottlingPolicy::Disabled)`; the latter is supported on macOS 14+ only. Its doc says hidden views are otherwise throttled and may be suspended after about 5 minutes. `App::set_activation_policy` exists on macOS.

### E2E hook

- `LCS_E2E=<script.json>`, debug builds only. The frontend loads `src/lib/e2e.ts` behind `import.meta.env.DEV`, calls `e2e_script`, runs jobs (`render`, `preview`, `gl`, `preview-audio`, `play`, `save`), calls `e2e_finish`, and the app exits. `scripts/e2e/lib.mjs#runApp` builds the debug binary, starts Vite if needed, and runs the app with a visible window.
- The `render` job is `openProject` + `renderComposition`. It has the font race above and calls `removeFromRecent` afterwards to undo the recent-list side effect.

### Text, fonts, morph

- `drawTextLayer` (`src/renderer/draw-text.ts`) wraps with the private `wrapText(ctx, text, maxWidth, _letterSpacing)`, which measures **without** letter spacing, while drawing adds it. Spaced text can therefore draw wider than its box. Block height is `lines × fontSize × lineHeight`. *(Fixed 2026-10-29, after this spec: `wrapText` now measures lines as they're drawn, through the same rule as `drawnLineWidth`. Only a single letter-spaced word wider than its box still overflows.)*
- Project fonts are registered from `assets/fonts/` under a family derived from the file name (`font-manager.ts`). An unknown family falls back silently.
- `autoMatch(a: ImageBitmap, b: ImageBitmap, view: MorphView, opts)` (`src/lib/morph-match/index.ts`) runs DINOv2 in a worker, reads the model from the bundle (`models/dinov2-small-int8.onnx`) and throws `ModelMissingError` without it. `MorphView` is `{ fitMode, sizeA, sizeB, boxW, boxH }`, built inline in `MorphEditor.tsx:88`. `mergeAuto` (`src/lib/morph-edit.ts`) keeps manual pairs and drops incoming pairs too close to them.

### The skill (outside this repo, not under git)

- `scripts/lcs.py` (stdlib Python, about 1,800 lines): `probe`, `build`, `validate`, `preview`. Its output is `[ERROR]`/`[WARN]`/`[NOTE]` lines from a `Report` class. Copies of app logic: enums (line 33), text measurement and `wrapText` (337–514), morph geometry and fold detection (1309–1432).
- `SKILL.md`: brief → probe → storyboard → draft → build/validate → hand-off. The hand-off tells the user to open the project in lc-studio, export it, and run Auto-match themselves.
- Copies: `~/.claude/skills/lc-studio-project` is a symlink to the folder above. `~/.hermes/skills/lc-studio-project` is a separate copy. A claude.ai-uploaded version exists too.

---

## 2. Rules for every phase

- **One renderer.** CLI jobs call the same functions as the GUI (`renderComposition`, `createFrameRenderer`, `drawCompositionFrame`). If a job needs something the GUI computes inline (the morph view, the text layout), extract it into a shared helper and have the GUI use it as well. Never add a second copy.
- **Pixel-identical regression.** `scripts/e2e/fx-regression.mjs` passes unchanged in every phase. Extracting `layoutText` (R2.4) and `morphViewFor` (R3.2) changes no pixels.
- **Read-only by default.** No CLI command writes into the project folder except `automatch --write`. No command touches recent projects, autosave or the GUI's localStorage.
- **Release-safe.** CLI mode is entered only when `argv[1]` is exactly one of `render`, `stills`, `check`, `automatch`, `--help`, `--version`. Rust parses arguments into a typed job. The frontend never receives free-form JSON from outside.
- **Code-split.** The CLI runner is `src/lib/cli/` and is loaded with a dynamic `import()` only when `cli_job` returns a job, so a normal launch pays one `invoke` and nothing else.
- **No new npm dependencies.** Rust: hand-rolled argv parsing **(design call: four commands don't justify clap or tauri-plugin-cli)**, plus `windows-sys` if R0.11 needs it.
- **Branches**, each stacked on the previous one: `claude/cli0-render`, `claude/cli1-stills`, `claude/cli2-check`, `claude/cli3-automatch`. No push and no PR unless the user asks.
- **Commits.** Never `git add -A`, because the checkout has unrelated untracked files; stage explicit paths. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Docs in every phase:** a "Command line" section in `docs/user-guide.md` (commands, flags, exit codes, where the binary lives on each platform); the runner and its job protocol in `docs/developer-guide.md`; `docs/features.md`; and the `CLAUDE.md` command list and Architecture bullets. Write down any limitation you hit.

---

## 3. The command-line contract

This is the interface the skill codes against. Every phase implements its command to it.

### Grammar

```
local-content-studio render    <project> --out <file|dir> [--format F] [--quality Q] [--force]
local-content-studio stills    <project> --out <dir> [--frames auto|all|N,N,…] [--scale S] [--sheet-scale S]
local-content-studio check     <project> [--frames auto|all|N,N,…]
local-content-studio automatch <project> [--layer <id|name>] [--write]
local-content-studio --help | --version

common: --result <file>   also write the result JSON to this file
        --timeout <secs>  wall-clock cap for the whole run (default: none)
        --show            run in the normal visible window: full speed, but it takes focus (debugging; see R0.3)
```

- `<project>` is a `.lcs` folder or its `project.json`, checked with `project_dir_for`. Anything else is a usage error.
- `render --format` defaults from the `--out` extension: `.mp4`, `.webm`, `.mov`, `.gif`, or a path with no extension → `png-sequence`. `--quality` defaults to `medium`, as in the Render panel.
- `render` refuses an existing `--out` without `--force` **(design call: an agent re-rendering into the user's file by mistake is worse than an extra flag)**.
- Frame numbers are 0-based global frames. `auto` is defined in R1.2. `all` means every frame.

### Output

- **stdout:** exactly one JSON document, the result, and nothing else. Rust prints the frontend's text as it is, with the frontend's key order and exact numbers. **stderr:** human-readable progress (`[lcs] render 120/450 (26%)`, at most once a second) and diagnostics. `--result` writes the same JSON to a file, which is the reliable channel on Windows (R0.11). `lcs.py` always passes it.
- The result:

```jsonc
{
  "schema": 1,                       // bump on any breaking change; lcs.py checks it
  "app": "0.1.0",
  "command": "render",
  "project": "/abs/path/Spring Launch.lcs",
  "ok": true,
  "error": null,                     // a message when ok is false
  "ms": 41230,
  "composition": { "width": 1080, "height": 1920, "fps": 30, "frames": 450, "seconds": 15, "gl": true },
  "issues": [
    { "severity": "warn", "code": "video-undecodable", "message": "…",
      "scene": 1, "sceneLabel": "Product", "layerId": "…", "layerName": "Clip", "frame": null }
  ],
  "data": { /* per command, below */ }
}
```

- `data` per command:
  - `render`: `{ "output", "format", "quality" }`
  - `stills`: `{ "sheet": "<dir>/sheet.png" | null, "frames": [{ "frame", "file", "scene", "sceneLabel", "why" }] }`, where `why` is one of `hook`, `settled`, `transition`, `morph`, `end` or `requested`
  - `check`: `{ "drawn": [frames] }`
  - `automatch`: `{ "layers": [{ "layerId", "layerName", "pairs": MorphPair[], "auto": n, "manual": n, "written": bool }] }`
- Issue `code`s are a closed list in `src/lib/cli/issues.ts`: `load`, `editor`, `draw`, `media-missing`, `video-undecodable`, `gpu-fallback`, `font-missing`, `text-overflow`, `ffmpeg-missing`, `model-missing`. Messages read like the Render panel's and name the scene and layer.

### Exit codes

| Code | Meaning |
|---|---|
| 0 | The command ran. `check` found no `error` issues. |
| 1 | The command ran and failed (`ok: false`), or `check` found `error` issues. |
| 2 | It never ran: usage error, not a project, `--out` exists, the frontend didn't load, or the watchdog fired (R0.8). The result is still written when possible, with `ok: false`. |

---

## 4. CL0: Runner and `render`

### Requirements

| ID | Requirement |
|---|---|
| R0.1 | `src-tauri/src/cli.rs`: `parse(args) -> Result<Option<CliJob>, Usage>`. `None` unless `argv[1]` is a command name, so `local-content-studio "/path/Launch.lcs"` (an "open with" launch on Windows and Linux) stays a GUI launch. `Usage` errors print the usage text to stderr and exit 2 before Tauri starts. `--help` prints usage to stdout and `--version` prints the app version; both exit 0. A CLI job wins over `LCS_E2E`: in CLI mode `e2e_script` returns `None`. |
| R0.2 | Rust checks everything it can before starting the webview: the project with `project_dir_for`, `--out` existence and `--force`, that `--out`'s parent folder exists, and that the format and quality are known. These are exit-2 failures, so no window appears for a typo. |
| R0.3 | `tauri.conf.json`: the window gets `"label": "main"` and `"create": false`. `setup` builds it with `WebviewWindowBuilder::from_config`, unchanged for the GUI. For a CLI job the window is always hidden: `visible(false)`, `focused(false)` and `background_throttling(BackgroundThrottlingPolicy::Disabled)`. `Disabled` is required: without it the hidden page is suspended from the start and the run never finishes (§10 spike). On macOS, CLI mode also sets `ActivationPolicy::Accessory`, so there's no Dock icon; in the spike, a hidden run never became the frontmost app. Call `set_activation_policy` before `from_config(app.handle(), …)`, because the borrow checker rejects it afterwards. Never build a visible CLI window by default: every visible variant in the spike took focus despite Accessory and `focused(false)`. `--show` builds the normal visible window, for debugging only, and is documented as taking focus. No private WebKit SPI (§10, option 3). The capability still applies, because the label is unchanged. |
| R0.4 | Commands `cli_job`, `cli_progress`, `cli_finish` in `cli.rs`. `cli_job` returns the typed job (or `None`) and grants the fs scope it needs: the project folder via `allow_project_dir`, plus the `--out` folder (non-recursive) for `png-sequence` and `stills`, which Rust creates first so the frontend never needs scope on its parent. `cli_progress { done, total, stage }` prints throttled progress to stderr and feeds the watchdog. `cli_finish { result }` writes stdout and `--result`, picks the exit code (§3) and exits. |
| R0.5 | Frontend: `App.tsx` calls `invoke('cli_job')` once on mount in every build. If it returns a job, it imports `src/lib/cli/run.ts` and runs it. In CLI mode, autosave is off and nothing writes recent projects. Do this with an option on `loadProjectFromPath` (`{ recent: false, awaitFonts: true }`), not with `removeFromRecent` afterwards. |
| R0.6 | The CLI webview never reads or writes the GUI's localStorage, so a CLI run next to an open GUI instance can't disturb it. Suggested mechanism **(design call)**: its own data store (`data_store_identifier` on macOS 14+, `data_directory` elsewhere). If that proves awkward, R0.5's options alone are enough, as long as A0.7 passes. |
| R0.7 | `render` = load (fonts awaited) → `renderComposition(...)` with `onProgress` → `cli_progress`. The result's `issues` carry the Render panel's two warnings (`video-undecodable`, `gpu-fallback`), computed with the same helpers. Missing FFmpeg is `ok: false` with an `ffmpeg-missing` issue, found with `check_ffmpeg` before the first frame. The e2e `render` job switches to the same shared `renderProject()` function, which fixes its font race. |
| R0.8 | Watchdog in Rust: if the frontend hasn't called `cli_job` within 30 s, exit 2 with "the frontend did not load (a debug build needs Vite on :1420)". After that, if no `cli_progress` arrives for 120 s, exit 2 with "the renderer stopped responding". The runner sends a heartbeat every 5 s while a job runs, so a long video decode or a model load doesn't trip it, but a suspended webview does. `--timeout` adds a wall-clock cap. Every exit path closes the window and kills any FFmpeg child (`cancel_render`). A failed or timed-out render also deletes the video FFmpeg had started writing at `--out` (a truncated MP4, which ffprobe can't read, would pass for a render); a file FFmpeg never touched is kept. |
| R0.9 | A JS error that escapes the job (`window.onerror`, `unhandledrejection`) ends the run with `ok: false` and the message. It never leaves a window open. |
| R0.10 | Hidden-window speed, accepted as measured in the §10 spike: about 3.3× slower than a visible window. WebKit moves its processes into the background band whenever the page isn't visible; `Disabled` prevents suspension but not that demotion, and App Nap isn't the cause. Targets: **(a)** the CLI render of `long-gl` (450 frames, 1080×1920, GL transitions) takes no more than 4× the e2e `render` job's time for the same project in a visible window, plus 3 s startup (spike: 3.3×). Use `long-gl`, not fx-regression: at 360×640 per-frame overhead dominates and the ratio was 6×. **(b)** Over a render longer than 6 minutes, throughput in every full minute stays within 15 % of the first minute, so nothing is suspended (spike: 46 → 43 fps). **(c)** Frames are identical to the visible render. Record release-build numbers too; the spike measured a debug build only. The user guide says command-line renders are slower than Render-panel exports, and why. On platforms where `Disabled` isn't supported (Windows, Linux, macOS < 14), measure the same targets. If a hidden run there stalls or misses (a), CLI mode on that platform defaults to `--show`, and the developer guide records it. |
| R0.11 | Windows release builds call `AttachConsole(ATTACH_PARENT_PROCESS)` in CLI mode, so stdout and stderr reach the calling shell. If that's unreliable, document `--result` as the Windows channel. Linux: document that a display is needed (`xvfb-run -a` on a headless box). |
| R0.12 | Errors from `readProjectFile` name the problem. A draft says "this is a draft (build input), not a project — run `lcs.py build`". This message also improves the GUI's Open. |

### Acceptance

| ID | Check |
|---|---|
| A0.1 | Rust unit (`cli.rs`): every command's valid forms and defaults (format from extension, quality `medium`); every usage error; no args → `None`; a bare project path → `None`; unknown flags → usage error. |
| A0.2 | e2e `scripts/e2e/cli0-render.mjs` (debug binary, Vite up, run with argv instead of `LCS_E2E`): `render <fixture> --out x.mp4` exits 0. Stdout parses as a result with `ok: true` and `schema: 1`. ffprobe shows the fixture's size, fps and frame count, with audio when the fixture has it. |
| A0.3 | Same script: `render --out frames/` (PNG sequence) gives byte-identical files to the e2e `render` job's PNG sequence of the same project. |
| A0.4 | Same script, failure paths: a non-project folder → exit 2 and no window; a draft → exit 2 with R0.12's message; an existing `--out` without `--force` → exit 2; `PATH` without ffmpeg → exit 1 with `ffmpeg-missing`; the debug binary with Vite down → exit 2 within 35 s with the "did not load" message. |
| A0.5 | R0.10 (a)–(c), printed by the script with both times and the per-minute throughput. For (b), reuse the spike driver's `--long` project (`scripts/e2e/spike-hidden-window.mjs` on `claude/spike-hidden-window`). |
| A0.6 | The existing e2e scripts all pass unchanged (they launch with no args and `LCS_E2E`). Manual: a plain launch shows the normal window. |
| A0.7 | Manual, macOS: with the GUI open on a project, a CLI render of another project shows no window and no Dock icon, takes no focus, and leaves the GUI's recent list and that project's `project.json` unchanged. |
| A0.8 | Manual: a release build (`npm run tauri build`) renders from `/Applications/Local Content Studio.app/Contents/MacOS/local-content-studio`, and the result JSON reaches stdout. |

---

## 5. CL1: `stills`

### Requirements

| ID | Requirement |
|---|---|
| R1.1 | `stills` draws each requested frame with `createFrameRenderer` (the export path, not the editor canvas). It writes `frame-NNNN.png` scaled by `--scale` (default `0.5` **(design call: readable text at half the file size)**), plus `sheet.png`: every frame in a grid, scaled by `--sheet-scale` (default `0.25`), up to 4 columns for portrait output and 3 for landscape. Each cell has a strip under it with frame number, time, scene label and `why`. The sheet is drawn in the webview canvas, with no new dependency. At `--scale 1` the frame canvas is encoded directly (no resampling pass), the same way `renderPngSequence` encodes it, so A1.2 can ask for identical bytes. Beyond 60 frames there is no sheet, and `data.sheet` is null **(design call: a `--frames all` sheet would pass WebKit's canvas limits)**; the frame files are still written. The label strip puts the frame number and why it was picked on the first line, because a narrow cell cuts text. |
| R1.2 | `src/lib/key-frames.ts` (pure, unit-tested) defines `auto`: **hook** `min(12, d₀ − 1)` in scene 0; **settled**, for each scene, its last frame before the outgoing transition starts (its last frame if it has none); **transition**, the middle frame of each scene's outgoing transition (every scene but the last); **morph**, for each image layer with a `morphProgress` track, the global frame halfway between its first and last keyframe; **end**, the last frame of the video. Deduplicate (first `why` wins), then sort. `check` uses the same helper. |
| R1.3 | Explicit frames outside `0…frames−1` give `ok: false` (exit 1) with the valid range in `error`. Only the frontend knows the frame count, so this can't be an exit-2 check in Rust. `stills` needs no FFmpeg. |
| R1.4 | Stills never touch the output folder outside the files they name. They overwrite their own `frame-*.png` and `sheet.png`. |

### Acceptance

| ID | Check |
|---|---|
| A1.1 | Unit: `key-frames.ts` on a three-scene fixture with a 12-frame transition, a scene shorter than 12 frames, a morph layer, and a last scene with a transition set (ignored). Exact frame lists. |
| A1.2 | e2e `scripts/e2e/cli1-stills.mjs`: `--frames 0,45,89 --scale 1` gives PNGs byte-identical to frames 0, 45 and 89 of the PNG-sequence render. |
| A1.3 | Same script: `--frames auto` returns R1.2's frames for the fixture. `sheet.png` has the expected grid size, and a label strip's pixels differ from the background. |
| A1.4 | Manual: an agent shown `sheet.png` of the fx-regression fixture can read every scene's headline. |

---

## 6. CL2: `check`

### Requirements

| ID | Requirement |
|---|---|
| R2.1 | **load:** a `readProjectFile`/`loadProjectFromPath` failure is an `error`, and `check` stops there. |
| R2.2 | **editor:** the project is put into the store the way Open does it (with autosave off), and the editor shows frame 0. An uncaught error, or a `.canvas-workspace canvas` missing after 5 s, is an `error` ("lc-studio's editor crashes on this project: …"). This is the "black window" check. |
| R2.3 | **draw:** each `--frames` frame (default `auto`) is drawn with the export renderer. A throw is an `error` naming the frame and scene, and the layer when the stack allows. `--frames all` is a full dry run without encoding. |
| R2.4 | **text-overflow:** extract the renderer's text layout into an exported `layoutText(ctx, layer, resolved, frameInLayer) → { lines: { text, width }[], height }` that `drawTextLayer` uses as well (it wraps at `layer.maxWidth || resolved.width`, so it needs the resolved transform). Line widths include letter spacing as drawn. For each text layer, at its first frame and at every keyframe frame of `fontSize`/`letterSpacing`/`lineHeight`: a line wider than the box (+1 px) or a block taller than it is a `warn`, with the numbers. Because of R2.4, `check` also reports text that wraps without spacing but draws wider with it (§1). Changing the wrap itself is out of scope. |
| R2.5 | **media-missing:** every path the composition references that `exists` can't find is an `error`. Walk the same set `bundleAssets` walks (`asset-manager.ts`: scene background images, plus `assetRefs(layer)` for every layer; export `assetRefs` if it isn't already). Don't keep a second list. |
| R2.6 | **video-undecodable**, **gpu-fallback:** the Render panel's two warnings, from the same helpers. `gpu-fallback` is a `note` when GL is available and nothing will fall back, otherwise a `warn` naming the effects. |
| R2.7 | **font-missing:** a `fontFamily` that is neither a project font nor installed is a `warn`. Detection **(design call)**: after fonts are awaited, measure a probe string in `"<family>", monospace` and `"<family>", serif`. If both widths equal the bare generics', the family is missing. |
| R2.8 | **ffmpeg-missing** is a `note` in `check` (a render would fail; stills and the GUI preview wouldn't). |
| R2.9 | `check` writes nothing anywhere. Its run time on the fx-regression fixture with `auto` frames is under 10 s on the author's Mac, measured and recorded in the developer guide. |

**As built (2026-10-29):**
- **Text fit:** `layoutText` returns the lines and block height without widths. `drawnLineWidth` measures a line as drawn, so per-frame drawing doesn't pay for widths.
- **Shape check:** shorthand values such as `"output": "tiktok"` are caught as `load` errors before anything draws.
- **Drafts:** a draft exits 2 in Rust, as it does for `render`, not with a `load` issue.
- **Layers `check` can't lay out:** these become `draw` errors, not a failed run.
- **`ok` and the exit code:** `check` sets `ok: true` when it finishes, and its error issues give exit 1.
- **Timing (R2.9):** 1.55 s wall on fx-regression.

### Acceptance

| ID | Check |
|---|---|
| A2.1 | Unit (node-canvas): `layoutText` returns the same lines `drawTextLayer` draws, for left, center and right alignment, with and without letter spacing. Overflow rules on a fixture with a known-overflowing and a known-fitting layer. |
| A2.2 | e2e `scripts/e2e/cli2-check.mjs` with one fixture per issue: clean → exit 0, no errors; overflowing text → `text-overflow` on that layer; missing image → `media-missing`, exit 1; `prores.mov` (from `RECIPES`) → `video-undecodable`; an unknown font family → `font-missing`; `"output": "tiktok"` → `editor` or `draw` error, exit 1, no hang; a draft → `load`, exit 1. |
| A2.3 | `fx-regression.mjs` unchanged after the `layoutText` extraction. |
| A2.4 | Same script: no file under the fixtures' folders changes (mtime and hash before and after). |

---

## 7. CL3: `automatch`

### Requirements

| ID | Requirement |
|---|---|
| R3.1 | `automatch` runs on the image layer named by `--layer` (id first, then name; an ambiguous name is an error listing the ids), or on every image layer with a `morph` when `--layer` is omitted. A named layer without a morph is an error. |
| R3.2 | Bitmaps A (`src`) and B (`morph.target`) come from `MediaBlobCache`. The view comes from a new `morphViewFor(layer, sizeA, sizeB)` that `MorphEditor.tsx` uses too. `autoMatch(...)` → `mergeAuto(existing, incoming)`. Progress goes to `cli_progress`. |
| R3.3 | Without `--write`, nothing is written. The merged pairs are in `data.layers[].pairs`. With `--write`, `project.json` is re-read and only those layers' `morph.pairs` (and `savedAt`) are replaced, then written with the app's serialiser. Not through `saveProject`, which bundles assets and is more than this needs. The result says `written: true`. |
| R3.4 | `ModelMissingError` → `ok: false` with a `model-missing` issue and its message. |

**As built (2026-10-29):**
- **Image loading:** the images come from `loadMorphImages` (the renderer's media cache, as the editor loads them), not from `MediaBlobCache`.
- **A3.1's bound:** "every pair within 0.03" can't be met. DINOv2's 14 px patches at 448 px on the long side are 0.031 of a 1080×1920 image's height and 0.056 of its width, and look-alike features give a few confident outliers (the editor's Edit points is for those). The check is now a median error of at most 0.03 and at least 90 % of pairs within 0.06. On a non-repeating 48-shape image, 48 pairs gave a median of 0.015, 45 within 0.06 and a worst of 0.18; on testsrc2's repeating colour bars, the median was 0.043. A wiring fault, such as swapping A and B or using the wrong view, gives a median of about 0.1.
- **Result output:** `cli_finish` prints the frontend's result text as it is. Re-serializing it changed float digits (see §3).

### Acceptance

| ID | Check |
|---|---|
| A3.1 | e2e `scripts/e2e/cli3-automatch.mjs`: B is A shifted and scaled by a known transform (made with ffmpeg in `RECIPES`). Every returned pair maps `a` to `b` within 0.03 of the transform. A manual pair in the fixture survives, and incoming pairs near it are dropped (as `mergeAuto`'s unit test expects). |
| A3.2 | `--write`: a JSON diff of `project.json` before and after shows changes only at those layers' `morph.pairs` and at `savedAt`. Without `--write`, the file is byte-identical. |
| A3.3 | With the model file moved away (debug build): exit 1, `model-missing`. |

---

## 8. CL4: The skill calls it

This phase is in `/Users/cagdasmert/work/WS/skills/lc-studio-project`, not in this repo, and that folder isn't under git. **First `git init` it (or copy it aside) so the change can be reviewed and undone.**

### How the skill uses the CLI

```
build ──► lcs.py build  ──► (app found) local-content-studio check ──► merged [ERROR]/[WARN]/[NOTE]
  │
  ├─ morph layers ──► lcs.py automatch ──► pairs into draft + project.json ──► lcs.py preview (pair sheet)
  │
  ├─ look ──► lcs.py stills ──► agent views sheet.png ──► fix draft, rebuild (at most 3 rounds)
  │
  └─ hand off ──► lcs.py render ──► "<Name>.mp4" beside the project
```

### Requirements

| ID | Requirement |
|---|---|
| R4.1 | `find_app()` in `lcs.py` looks, in order, at: `$LCS_APP`; on macOS, `/Applications/Local Content Studio.app/Contents/MacOS/local-content-studio` and the same under `~/Applications`; on Windows, `%LOCALAPPDATA%\Local Content Studio\local-content-studio.exe` and Program Files; on Linux, `local-content-studio` on `PATH`. It runs `--version` once per process. A missing app or an unknown `schema` means "no app". |
| R4.2 | `lcs.py` runs the app with `--result <tmp>.json`, reads that file (not stdout), streams the app's stderr through, and maps `issues` to `Report` lines prefixed `app:`, for example `[WARN] app: scene 2 › Headline: …`. Exit 2 from the app becomes `[ERROR] lc-studio could not run: <message>`. |
| R4.3 | `build` and `validate` run `check` after the Python checks when the app is found (`--no-app` skips it). When the app's check ran, the Python text-fit warnings are dropped in favour of the app's `text-overflow`, so the two measurements never disagree on screen. Without the app, they print `[NOTE] lc-studio not found — checked with lcs.py's own copies of its rules (set LCS_APP to the app binary)`. |
| R4.4 | `lcs.py stills <Name.lcs> [--frames] [--out]`: the default `--out` is `<Name>.lcs/.draft/stills/`, so stills stay out of the user's way. It prints the sheet path first. |
| R4.5 | `lcs.py render <Name.lcs> [--out] [--format] [--quality]`: the default `--out` is `<Name>.mp4` next to the `.lcs` folder **(design call)**, and it always passes `--force` for that default path. It prints progress and the output path. |
| R4.6 | `lcs.py automatch <Name.lcs> [--layer]`: runs the app without `--write`. It writes the merged pairs into `.draft/draft.json` (the layer matched by `id`, else by scene index and layer `name`) and into `project.json`. If the draft layer can't be found, it says so: the next `build --force` from the draft would drop the pairs. |
| R4.7 | Every new subcommand without an app exits 2 with one line saying what to install or set. `preview` keeps working without the app. |
| R4.8 | `SKILL.md`: a new step "Look at it" after build (run `stills`, view `sheet.png`, fix what's wrong, at most 3 rounds, and check the hook frame and every end card). Morph steps use `automatch` when the app is there, then `preview`. Hand-off renders the MP4 by default when the app is available, unless the user asked for a project only. Run `render` with a long tool timeout (it prints progress; hidden renders run at about 45 fps at 1080×1920 in the spike, so a 30 s reel takes about 20 s and a long video takes minutes). Name the video path, and say whether auto-match placed the pairs. The final checklist gets "looked at the stills sheet" and "rendered, or said why not". "Without a script runner" and the no-app path stay valid. |
| R4.9 | `evals/evals.json`: add cases for "make the video" (expects an MP4 and a stills look), and for a machine without the app (expects the project plus the manual-export hand-off). |
| R4.10 | Sync the copies: `~/.hermes/skills/lc-studio-project` and the claude.ai upload. Note in the hand-off text that the cloud copy will normally have no app and takes the fallback path. |

### Acceptance

| ID | Check |
|---|---|
| A4.1 | Offline unit test (`scripts/test_lcs.py`, stdlib `unittest`): `LCS_APP` pointing at a stub script that writes canned results gives the expected `Report` lines, exit codes, draft/project pair merging and text-fit suppression. No app needed. |
| A4.2 | With the real debug or release app: the skill's own eval brief, built and handed off, produces a project, a stills sheet the agent looked at, and an MP4 that ffprobe accepts. |
| A4.3 | With `LCS_APP` set to a missing path: build, validate and preview behave as today, plus the NOTE. |

---

## 9. Open choices left to the builder

- Hand-rolled argv vs a crate, if the hand-rolled parser grows past about 150 lines.
- The heartbeat interval and watchdog limits (5 s / 120 s / 30 s): tune them if a real project trips them, and record the numbers.
- The contact-sheet layout details (gutter, label font, column rule).
- Whether `check --frames all` should also run `prepareVideoFrames` on every frame (slower; catches mid-clip decode errors).
- Whether `--show` should also open devtools in debug builds.

## 10. Risks to settle first

- **Hidden-window throttling** (R0.10). *Settled by the spike below:* hidden with `Disabled` is about 3.3× slower and never suspended; option 1 was chosen.
- **WebGL2 in a hidden window.** *Settled by the spike below:* WebGL2 works hidden and the frames are identical. CL0 still reports `composition.gl` in every result.
- **Two app instances** sharing WebKit storage (R0.6).

### Spike results (2026-10-28, branch `claude/spike-hidden-window`, not merged)

M4 Pro, macOS 27.0.1, on AC power. The debug binary with Vite, as `scripts/e2e/` runs it. `scripts/e2e/spike-hidden-window.mjs` runs each window mode (`LCS_SPIKE_WINDOW`, `src-tauri/src/lib.rs`) in 2–3 interleaved rounds. "Priority" is `ps`'s value for our WebContent and GPU processes; 4 is the background band.

| Mode | long-gl MP4, 450 @ 1080×1920 | fx-regression PNG, 110 @ 360×640 | vs visible | Priority | Page |
|---|---|---|---|---|---|
| visible (today's e2e) | 2.95 s (152 fps) | 0.68 s | 1× | 46–47 | visible |
| hidden, default throttling | never finished: WebContent at 0 % CPU for 10 min | – | ∞ | – | – |
| hidden, `Disabled` | 9.8 s (46 fps) | 4.2 s | 3.3× | 4 | hidden |
| hidden, `Disabled`, App Nap off (`NSProcessInfo` activity) | 9.2 s | 4.5 s | 3.1× | 4 | hidden |
| visible, Accessory, unfocused (no Dock icon) | 3.02 s | 0.70 s | 1.02× | 47 | visible |
| visible 240×140 corner window | 3.02 s | 0.69 s | 1.02× | 47 | visible |
| visible, kept below other windows (covered) | 10.2 s | 4.2 s | 3.4× | 4 | hidden |
| covered + occlusion detection off (private SPI) | 3.01 s, 3.03 s (2 of 2 fast) | 0.69 s | 1.02× | mixed | visible |
| off-screen + occlusion detection off | 9.6 s, 3.1 s (1 of 2 fast) | – | flaky | 4 | mixed |
| hidden + occlusion detection off | 10.2 s | 3.7 s | 3.4× | 4 | hidden |

- **WebGL2 works in every mode:** WebGL 2.0 on the Apple GPU, the identity pass is exact, and the hash error is 0.5/255 (within A5.2's 1/255).
- **Pixels match in every mode and round:** fx-regression is identical to its baseline (110 of 110 frames), the cube GL transition is identical to the visible run (50 of 50), and every MP4 is 15.00 s.
- **Why hidden is slow:** whenever the page isn't visible, WebKit moves its WebContent and GPU processes into the background band, `setTimeout(0)` chains run about once a second, and rAF never fires. `BackgroundThrottlingPolicy::Disabled` only prevents suspension, not that demotion. Keeping App Nap off for the app process makes no difference.
- **Covered counts as hidden.** WebKit uses window occlusion, so a visible window behind other windows renders 3.4× slower. This already applies to GUI exports and e2e runs whenever the user covers the window.
- **Long run:** hidden with `Disabled` rendered 16,560 frames at 1080×1920 in 383 s and held 43–46 fps in every minute through minute 6. No suspension past the 5-minute mark.
- **Focus:** all three visible variants made the app frontmost while running, despite Accessory and `focused(false)`. After two of them quit, no app was frontmost, so focus never went back to Safari. Hidden mode never took the foreground.
- **Startup and teardown** take about 0.5 s in every mode.
- **Not measured:** a release build (optimised Rust, bundled frontend), so absolute numbers will differ there but the visibility effect shouldn't. Windows and Linux.

**What this means for CL0.** R0.10's original ≤ 1.1× target can't be met by a hidden window through public API. The choices:

1. **Hidden + `Disabled`**: public API, no window, no focus steal, never suspended, 3.3× slower (about 46 fps at 1080×1920, so a 15 s reel takes about 10 s). R0.10 would become "hidden render within 4× of visible, steady over 6 minutes".
2. **A visible window**: full speed only while nothing covers it, and it takes focus. That breaks the focus anti-goal unless an untested fix works (`focusable(false)`, or turning off tao's activate-ignoring-other-apps).
3. **A visible window with occlusion detection off** (`-[WKWebView _setWindowOcclusionDetectionEnabled:]`, private SPI): full speed even when covered, but it's private API that a macOS update can break, the focus problem remains, and the off-screen variant was flaky.

**Decision (2026-10-28, the user): option 1.** R0.3 and R0.10 have been rewritten to match.

---

## 11. Todo

1. ~~Spike R0.10 and §10 on a throwaway branch.~~ Done: results and decision are in §10, and the spike code is on `claude/spike-hidden-window`, uncommitted. Record the numbers in the CL0 commit message.
2. Branch `claude/cli0-render` from `main`. `cli.rs` (parser, unit tests), window-from-config, `cli_*` commands, watchdog, `src/lib/cli/run.ts`, `loadProjectFromPath` options, shared `renderProject()` used by e2e too, R0.12. Then A0.1–A0.8, docs and checks.
3. Branch `claude/cli1-stills`. `key-frames.ts` with tests, then the stills job and sheet. A1.1–A1.4, docs.
4. Branch `claude/cli2-check`. Extract `layoutText` and run `fx-regression.mjs`, then the checks in R2.1–R2.9. A2.1–A2.4, docs.
5. Branch `claude/cli3-automatch`. Extract `morphViewFor` and run `fx-regression.mjs`, then the job. A3.1–A3.3, docs.
6. Skill: `git init` the skill folder, then R4.1–R4.10 and A4.1–A4.3. Sync the copies.

## 12. Follow-ups (not in this spec)

- An MCP server that wraps these four commands, and later a live link to the open GUI instance (agent edits reload in the editor, and the agent can read the user's selection and current frame).
- `render --variants` or a batch command for the render queue (several formats or hook variants in one run).
- Moving the e2e `render` and `preview` jobs onto the CLI, leaving `LCS_E2E` for UI-only checks.
- Retiring `lcs.py`'s copies of app logic once every harness that runs the skill has the app.
- Windows and Linux acceptance runs for the CLI.
- ~~Making `wrapText` account for letter spacing (§1).~~ Done on `claude/wrap-letter-spacing`: only letter-spaced or character-animated text changes; fx-regression (no spacing) stays identical.
