# Video Frames, Export Audio and Motion-Path Easing

**Date:** 2026-10-10
**Status:** Draft, ready for planning
**Baseline:** `main` at `95470eb`
**Reference code:** OpenCut Classic (MIT) and ArtCraft's port of it. Read §8 before copying anything.

## Summary

The `lc-studio-project` skill lists three app limitations (its `references/schema.md` §12):

1. Video layers are saved but never drawn, in either preview or export.
2. Audio layers, and the sound of video layers, never reach the exported file, and nothing plays in preview.
3. Motion paths ignore easing, and their speed changes with segment length.

This spec fixes all three:

- **Video frames** come from a decoded-frame cache built on `mediabunny` (WebCodecs), modelled on OpenCut Classic's `VideoCache`. An async *prepare* pass runs before the existing synchronous draw.
- **Audio** goes to the FFmpeg process that already exists, through a corrected filter graph.
- **Motion paths** reuse lc-studio's own `getEasing()`, plus an optional constant-speed (arc-length) timing mode.

The three parts are independent. Each one can land, be tested and be merged on its own.

## Goals

- **Frame-accurate video.** Output frame *n* of a video layer shows the source frame at `startTime + (n − startFrame) / fps × playbackRate`.
- **Deterministic.** The same composition and assets give the same frames, and preview shows the frame export would write.
- **Complete audio.** Exported MP4/WebM/MOV files contain every audio layer and every unmuted video layer's sound. Each one is placed at its time on the timeline, trimmed, sped up or slowed down, and has its volume and fades applied.
- **No surprises.** Projects that don't use video, audio or motion paths render exactly as before, and motion paths without the new fields behave exactly as before. No project migration.
- **Offline, with no new native binaries.**

## Non-goals

- Echo FX sampling past video frames. Echo stamps on a video layer reuse the current frame, and this is documented as a limitation.
- Audio in GIF or PNG-sequence exports.
- Waveforms, audio scrubbing, and keyframed volume.
- Moving export off FFmpeg (for example, encoding with mediabunny).
- Pitch-preserving speed beyond what FFmpeg's `atempo` does.
- Updating the `lc-studio-project` skill (it lives in `~/.claude/skills`, outside this repo). This is a follow-up (§10).
- Copying any ArtCraft-original code (§8.3).

---

## 1. Current state (verified at `95470eb`)

### Video

- `src/renderer/video-cache.ts` holds an `HTMLVideoElement` cache (`load`, `seekTo`, `preloadScene`), but nothing ever constructs it.
- `drawCompositionFrame(ctx, composition, frame, mediaCache, videoCache?)` accepts a cache, but neither caller passes one. The callers are `CanvasWorkspace.tsx:154` and `capture.ts:52` / `capture.ts:111`. As a result, `drawLayer`'s `case 'video'` never draws.
- Even if it were wired up, `drawVideoLayer` (`draw-video.ts`) sets `video.currentTime` and draws immediately, so it would show a stale, inexact frame.
- `resolveAssetPath()` returns a filesystem path (`join(projectDir, src)`), not a URL, so `video.src = <path>` doesn't load in the webview. Images work only because `media-cache.ts` falls back to `plugin-fs` `readFile`.

### Audio

- `startRender()` in `src/lib/tauri-bridge.ts` already accepts `audioTracks`, but `renderComposition()` in `capture.ts` never passes any.
- `spawn_ffmpeg()` in `src-tauri/src/render/ffmpeg.rs` adds each track as `-ss start -t duration -i path`. It has five problems:
  - There's no timeline offset, so every track starts at 0:00 of the output.
  - There are no fades.
  - With several tracks, `amix=…:duration=shortest` ends the mix with the shortest track. `normalize` is also on by default, which turns every track down.
  - `-shortest` combined with audio that is shorter than the video cuts the **video**.
  - The single-track branch applies `-af volume` and nothing else.
- `AudioTrackSpec` (in `types/scene.ts` and `ffmpeg.rs`) has only `path`, `start_time_secs`, `duration_secs` and `volume`.
- `src/renderer/audio.ts` has an `AudioEngine` for preview playback, but it's never instantiated. It loads files with `fetch(resolvedPath)`, which fails for filesystem paths. It also ignores `endTime` and preloads one scene at a time.

### Motion path

- `draw.ts:83–90` computes `t = frameInLayer / layerDuration` and passes it straight to `evaluateMotionPath()`, with no easing.
- `motion-path.ts` splits `t` equally across segments (`segIndex = floor(t × segments)`). So a layer moves faster on long segments and slower on short ones. Within a bezier segment, speed follows the curve parameter, not the distance travelled.
- `getEasing(name, params)` in `easing.ts` already supports every `EasingType`, including `cubic-bezier`, `steps` and `spring`.

### Platform

Tauri v2 runs on WKWebView on macOS and on WebView2 (Chromium) on Windows. WebKit has had WebCodecs video (`VideoDecoder`) since Safari 16.4, and WebView2 has it too. Feature-detect it anyway (R1.9).

---

## 2. F1 — Video frames

### 2.1 Architecture

Each frame is drawn in two phases. OpenCut uses the same split: `services/renderer/resolve.ts` resolves video sources asynchronously and then draws synchronously.

1. **Prepare (async).** `prepareVideoFrames(composition, globalFrame, frames)` works out which video layers are drawn at that frame and asks the frame cache for each one. Each result is stored as "the frame for layer L at time t".
2. **Draw (sync).** `drawCompositionFrame` keeps its signature, with the cache passed in. `drawVideoLayer` reads the prepared frame for its layer and draws it with the existing cover-fit maths. If no frame is ready, it draws nothing. That can only happen in preview: export never draws before its prepare has finished.

### 2.2 Requirements

| ID | Requirement |
|---|---|
| R1.1 | **Frame cache.** Add a new module (suggested name: `src/renderer/video-frames.ts`), adapted from OpenCut Classic's `apps/web/src/services/video-cache/service.ts` (MIT; keep its notice, see §8). Keep OpenCut's strategy: (a) reuse the current frame if it covers *t*; (b) if *t* is 0–2 s ahead, decode forward; (c) otherwise seek; (d) prefetch one frame ahead; (e) keep a promise chain per key so requests don't race; (f) use a generation counter to drop stale requests while scrubbing. |
| R1.2 | **Key decoder state by layer id**, not by source. Two layers that play the same file at different offsets must not fight over one decoder. Share the loaded bytes per source. |
| R1.3 | **Loading.** Read local files as `readFile(await resolveAssetPath(src, projectDir))` from `@tauri-apps/plugin-fs`, then wrap them as a `Blob` → mediabunny `BlobSource`. Fetch `http(s)` URLs into a `Blob`. Cache the bytes per (projectDir, src). |
| R1.4 | **Time mapping**, as a pure function with unit tests: `sourceTime = startTime + (frameInLayer / fps) × playbackRate`. When `endTime > startTime`, clamp to `[startTime, endTime − ε]`, which holds the last frame after `endTime`. Add a small epsilon (about `1e-4` s) before the lookup, so floating-point error never lands one frame early. |
| R1.5 | **`collectVideoDraws(composition, globalFrame)`**, a pure function with unit tests, returns `{ layerId, src, sourceTime }[]` for every video layer drawn at that frame. It must mirror `drawCompositionFrame`: visible video layers of the current scene where `startFrame ≤ frameInScene < endFrame`. During a transition, it must also return the next scene's video layers at that scene's frame 0, because transitions draw the incoming scene frozen at frame 0. |
| R1.6 | **Drawing.** `drawVideoLayer` draws the prepared frame (mediabunny `WrappedCanvas.canvas`) with the current cover maths, taking the source size from that canvas. Compositing doesn't change, so layer FX, clip paths, box shadow and opacity behave as they do for images. |
| R1.7 | **Export.** In `capture.ts`, `await prepareVideoFrames(...)` before every `drawCompositionFrame`, in both the FFmpeg loop and the PNG-sequence loop, and pass the frame cache into `drawCompositionFrame`. Export must never draw a video layer without its exact frame. Dispose every decoder in `finally`. |
| R1.8 | **Preview.** In `CanvasWorkspace.tsx`, keep one frame cache per open project and reset it on project switch, the same way `mediaCacheRef` is reset. On every draw, start `prepareVideoFrames` without awaiting it, and draw at once with whatever frames are ready. If the prepare for the current frame finishes while playback is paused, redraw once. During playback a video layer may lag by one tick. Never block `requestAnimationFrame`. |
| R1.9 | **Fallback.** A layer is undecodable if `typeof VideoDecoder === 'undefined'`, if mediabunny's `videoTrack.canDecode()` returns false, or if the file has no video track. For such a layer, log once and draw nothing; the skill's poster-frame image underneath stays visible. Before export, show a one-line warning in `RenderPanel.tsx`, for example "1 video layer can't be decoded; convert it to H.264 MP4". *(Optional: use the old `HTMLVideoElement` path with a blob URL and an awaited `seeked` event as a second fallback. Skip it if it complicates the code.)* |
| R1.10 | **Dependency.** Add `mediabunny` (MPL-2.0) as an npm dependency pinned to an exact version. OpenCut used `^1.29.1`; the current release is 1.61.x. Don't vendor or modify its files. |
| R1.11 | **One way to get frames.** Remove the old `video-cache.ts` / `seekTo` path, or fold it into the R1.9 fallback. |
| R1.12 | **Echo FX on video layers** reuses the current frame. Document this in `docs/features.md`. |

### 2.3 Acceptance

| ID | Check |
|---|---|
| A1.1 | Place the frame-ID clip (§7) in a 30 fps scene with `startFrame: 10`, `startTime: 0.5`, `playbackRate: 1`. In a PNG-sequence export, frames 10, 11, 12 … show source frames 15, 16, 17 … for 30 frames. With `playbackRate: 2` they show 15, 17, 19 … |
| A1.2 | Exporting the same project twice as a PNG sequence gives identical pixels in every frame (compare the decoded images, not the PNG bytes). |
| A1.3 | In preview, scrubbing to a frame and pausing shows the same picture as that frame in the PNG-sequence export. |
| A1.4 | Two layers using the same clip at different `startTime`s both pass A1.1. |
| A1.5 | A video layer with `endTime` before the layer ends holds its last frame. |
| A1.6 | A project with an undecodable clip (for example a ProRes `.mov` on macOS) exports without crashing, shows the warning, and draws the poster frame. |
| A1.7 | Exporting a 15 s, 1080×1920, 30 fps project with one full-screen H.264 clip takes no more than about 2× as long as the same project with an image in its place. Record both times in the PR. |

---

## 3. F2 — Audio

### 3.1 Export (must)

| ID | Requirement |
|---|---|
| R2.1 | **`buildAudioTracks(composition, projectDir)`** (async; for example in `src/lib/audio-tracks.ts`) returns one `AudioTrackSpec` per audible item: every visible `audio` layer, and every visible `video` layer with `muted: false` whose file has an audio track. Check for the track with mediabunny `input.getPrimaryAudioTrack()` and skip the layer silently if there isn't one, because a missing audio stream makes FFmpeg fail. Put the pure timing maths in a separate function with unit tests. |
| R2.2 | **Fields of each track.** `path`: the absolute filesystem path. `timelineOffsetSecs`: (the sum of `durationFrames` of all earlier scenes + `layer.startFrame`) / fps. Scenes don't overlap, because transitions happen inside the outgoing scene. `sourceStartSecs`: `layer.startTime`. `durationSecs` is the output length: `(endFrame − startFrame) / fps`, shortened to `(endTime − startTime) / playbackRate` when `endTime > startTime`. `volume`: the layer's `volume` for audio layers, 1 for video layers. `fadeInSecs` / `fadeOutSecs`: `fadeInFrames` / `fadeOutFrames` divided by fps for audio layers, 0 for video layers. `playbackRate`: the layer's `playbackRate` for video layers, 1 for audio layers. |
| R2.3 | **Extend `AudioTrackSpec` on both sides**, in TypeScript (`types/scene.ts` and the snake_case mapping in `tauri-bridge.ts`) and in Rust (`ffmpeg.rs`). Add `timeline_offset_secs`, `fade_in_secs`, `fade_out_secs` and `playback_rate`, each with `#[serde(default)]` so older payloads still deserialize. Make the meaning of `start_time_secs` (where to start in the source) and `duration_secs` (output length) explicit in comments. |
| R2.4 | **Input arguments per track:** `-ss {source_start} -t {duration × playback_rate} -i {path}`. |
| R2.5 | **Filter graph.** Move graph construction into a pure Rust function `build_audio_filter(tracks: &[AudioTrackSpec]) -> Option<String>` with `cargo test` unit tests. Use one code path for any number of tracks. For track *i* (input index *i + 1*): `[{i+1}:a]aformat=sample_rates=48000:channel_layouts=stereo,{atempo},volume={v},{afade in},{afade out},adelay=delays={offset_ms}:all=1[a{i}]`. Leave out `atempo` when the rate is 1. `atempo` accepts 0.5–100, so chain it for rates below 0.5 (0.25 → `atempo=0.5,atempo=0.5`). Leave out each fade when it's 0. The fade-out starts at `duration − fade_out`. Then join all tracks with `[a0]…[a{n-1}]amix=inputs={n}:duration=longest:normalize=0,alimiter=limit=0.95,apad[aout]`. |
| R2.6 | **Mapping.** Use `-map 0:v -map [aout]` and keep `-shortest`. Because of `apad`, the video now sets the output length: short audio no longer cuts the video, and long audio is trimmed to the video. With no tracks, keep `-an`. |
| R2.7 | **No change for GIF and PNG sequence:** they stay without audio. |
| R2.8 | **Wire it up:** `capture.ts` passes `audioTracks: await buildAudioTracks(...)` to `startRender()`. |

The R2.5 graph was checked with FFmpeg 6.1 using three inputs: a tone at 0 s with 0.5 s fades, a tone at 1.5 s, and a video's audio track at 2.5 s with `atempo=2`. Each sound starts at its time, fades where expected, and stays silent afterwards, and the output audio length matches the 4.0 s video. Very old FFmpeg builds may not have `amix`'s `normalize` option. If FFmpeg rejects the graph, surface its stderr in the render error instead of failing silently.

### 3.2 Preview playback (should)

| ID | Requirement |
|---|---|
| R2.9 | **Wire `AudioEngine` into `CanvasWorkspace.tsx`**, with one engine per open project. On play, call `seekTo(currentFrame, fps, scenes)`. On pause, call `stopAll()`. On a seek during playback, call `seekTo` again. Dispose the engine on unmount and on project switch. |
| R2.10 | **Fix `AudioEngine.loadAudio`** to read bytes through the R1.3 loader instead of `fetch(path)`. Also: honour `endTime`; include unmuted video layers (decode the video file with `decodeAudioData`, and skip the layer if decoding fails); preload every scene. |
| R2.11 | **Shared timing.** Preview and export use the same timing helper from R2.1, so they agree. |

### 3.3 Acceptance

| ID | Check |
|---|---|
| A2.1 | Build a 30 fps project with scene 1 (2 s) and scene 2 (3 s). Scene 1 has a music layer with `startTime: 10`. Scene 2 has a tone layer with `startFrame: 15` and `fadeInFrames: 15`. Export it as MP4. `ffprobe` should show one AAC stream whose duration is within one frame of the video's. The tone should start at 2.5 s ± 1 frame (check with `silencedetect`), and the music should be audible only from 0 to 2 s. |
| A2.2 | When the audio is shorter than the video, the exported video keeps its full length. This is a regression test for `-shortest`. |
| A2.3 | An unmuted video layer with sound plus a music layer: both are audible. A muted video layer: not audible. An unmuted video layer whose file has no audio stream: the export still succeeds. |
| A2.4 | `cargo test` covers `build_audio_filter` with 0 tracks (`None`), 1 track, 3 tracks, fades, `playback_rate` 0.25 (chained) and 3.0 (single), and millisecond rounding of offsets. |
| A2.5 | Manual check: playing in preview from frame 0 sounds the same as the export. |

---

## 4. F3 — Motion-path easing

| ID | Requirement |
|---|---|
| R3.1 | **New optional fields on `MotionPathDef`** (`types/scene.ts`): `easing?: EasingType`, `easingParams?: EasingParams`, `timing?: 'per-segment' \| 'constant-speed'`. When they are absent, today's behaviour applies (`linear`, `per-segment`), so no migration is needed. |
| R3.2 | **Apply easing.** In `draw.ts`, compute `t = getEasing(mp.easing ?? 'linear', mp.easingParams)(frameInLayer / layerDuration)` before calling `evaluateMotionPath()`. Overshooting easings (back, elastic, spring) produce *t* outside 0–1. On non-looping paths, at minimum clamp without producing NaN (`evaluateMotionPath` already clamps). Preferably, extrapolate along the end tangent so the overshoot is visible. |
| R3.3 | **`constant-speed` timing.** Build an arc-length table per path (about 32–64 samples per segment, deterministic). Map the eased *t* to a distance, then invert the table to a segment and a position within it. `alignToPath` uses the tangent at that same point. Cache the table per path (by object identity or a cheap hash of its points). |
| R3.4 | **Looping.** `loop: true` applies `t % 1` after easing. |
| R3.5 | **UI.** In `PropertyInspector.tsx` → `MotionPathSection`, add an Easing select using the same options as the keyframe editor's Easing menu, and a "Constant speed" checkbox. Paths created by the section's toggle default to `timing: 'constant-speed'` and `easing: 'linear'`. |
| R3.6 | **Tests** (new `src/renderer/motion-path.test.ts`): (a) with no new fields, positions match today's at t = 0, 0.25, 0.5, 0.9, 1; (b) on a 2-segment path with lengths 100 and 300 in `constant-speed`, t = 0.25 lands on the joint; (c) with `ease-in-out` + `constant-speed`, t = 0.5 is the midpoint by distance; (d) `loop` wraps; (e) a zero-length segment produces no NaN. |

---

## 5. Expected file changes

| File | Change |
|---|---|
| `package.json` | add `mediabunny` (exact version) |
| `src/renderer/video-frames.ts` (new) | frame cache (R1.1–R1.3), `prepareVideoFrames` |
| `src/renderer/video-time.ts` (new; may be merged into the file above) | `sourceTimeFor`, `collectVideoDraws` (R1.4, R1.5) |
| `src/renderer/draw-video.ts` | draw the prepared frame (R1.6) |
| `src/renderer/draw.ts`, `compositor.ts`, `transitions.ts` | pass the frame cache's type through instead of `VideoCache`; motion-path easing (R3.2) |
| `src/renderer/video-cache.ts` | remove, or keep only as the fallback (R1.11) |
| `src/renderer/capture.ts` | prepare before each frame, audio tracks, dispose (R1.7, R2.8) |
| `src/components/storyboard/CanvasWorkspace.tsx` | preview frame cache and `AudioEngine` (R1.8, R2.9) |
| `src/components/RenderPanel.tsx` | undecodable-video warning (R1.9) |
| `src/lib/audio-tracks.ts` (new) | `buildAudioTracks` and timing helper (R2.1–R2.2) |
| `src/lib/media-bytes.ts` (new, optional) | shared byte loader (R1.3, R2.10) |
| `src/renderer/audio.ts` | loader, `endTime`, video audio, preload (R2.10) |
| `src/types/scene.ts`, `src/lib/tauri-bridge.ts` | `AudioTrackSpec` fields (R2.3); `MotionPathDef` fields (R3.1) |
| `src-tauri/src/render/ffmpeg.rs` | `AudioTrackSpec` fields, `build_audio_filter`, input args, mapping, tests (R2.3–R2.6) |
| `src/renderer/motion-path.ts` | arc-length table, constant speed, overshoot (R3.3–R3.4) |
| `src/components/storyboard/PropertyInspector.tsx` | Motion Path easing and constant-speed controls (R3.5) |
| `docs/features.md`, `docs/architecture.md` | describe video decoding, audio export and the echo limitation |
| `THIRD_PARTY_NOTICES.md` (new) | OpenCut MIT notice (§8) |

## 6. Suggested order

Each step is mergeable on its own:

1. **F3** — small and isolated, and it warms up the test setup.
2. **F2 export** — Rust filter builder with unit tests, then `buildAudioTracks`.
3. **F1** — the largest change: pure time functions first, then the frame cache, export, and preview.
4. **F2 preview playback.**

## 7. Test media

```bash
# Frame-ID clip: the brightness of frame N is 16 + (N mod 30) × 7, so a pixel read tells you which source frame was drawn.
ffmpeg -f lavfi -i "nullsrc=s=1080x1920:r=30:d=4,format=yuv444p,geq=lum='16+mod(N,30)*7':cb=128:cr=128" \
  -c:v libx264 -crf 12 -pix_fmt yuv420p -g 30 frame-id.mp4

# Test tones
ffmpeg -f lavfi -i "sine=frequency=440:duration=20" music.wav
ffmpeg -f lavfi -i "sine=frequency=880:duration=3"  tone.wav

# A clip with sound, and one without
ffmpeg -f lavfi -i "testsrc=size=1080x1920:rate=30:duration=3" -f lavfi -i "sine=frequency=660:duration=3" \
  -c:v libx264 -c:a aac -shortest clip-with-audio.mp4
ffmpeg -f lavfi -i "testsrc=size=1080x1920:rate=30:duration=3" -c:v libx264 clip-silent.mp4
```

To decode the frame ID from an exported PNG, take any pixel's luma (or its grey value, since R ≈ G ≈ B) and compute `round((Y − 16) / 7)`. Within one second of source, consecutive IDs are 7 levels apart, which leaves enough margin for H.264 and colour conversion. Keep the generated media in a `test-media/` folder and add it to `.gitignore`, or generate it inside the test setup.

---

## 8. Reference code and licence rules

### 8.1 Copy from OpenCut Classic (MIT)

Clone it next to ArtCraft:

```bash
git clone https://github.com/opencut-app/opencut-classic ~/work/WS/opensource/opencut-classic
git -C ~/work/WS/opensource/opencut-classic checkout cf5e79e9
```

| OpenCut file (`apps/web/src/…`) | Use |
|---|---|
| `services/video-cache/service.ts` | **Copy and adapt** for R1.1–R1.2. Keep the MIT notice in the file header and in `THIRD_PARTY_NOTICES.md`. |
| `services/renderer/resolve.ts` (`resolveRenderTree`, `resolveVideoNode`) | Read for the two-phase async-resolve / sync-draw pattern (§2.1). |
| `media/mediabunny.ts` (`readVideoFile`) | Read for probing `canDecode`, `hasAudio` and duration with mediabunny (R1.9, R2.1). |
| `media/audio-mastering.ts` | Read for why a limiter follows the mix (R2.5's `alimiter`). |
| `core/managers/audio-manager.ts` | Read if `AudioEngine` needs more than the R2.10 fixes. |

OpenCut counts time in ticks (`MediaTime` from `opencut-wasm`), while lc-studio counts frames. Don't bring in `opencut-wasm` or its time model: the frame cache works in seconds and needs neither.

### 8.2 ArtCraft (local: `~/work/WS/opensource/artcraft`)

ArtCraft's video editor is a port of OpenCut Classic. The same files live under `frontend/libs/components/video-editor/src/lib/…`: `services/video-cache/service.ts`, `services/renderer/resolve.ts`, `media/mediabunny.ts`, `media/audio-mastering.ts` and `core/managers/audio-manager.ts`. Read them for comparison. In particular, ArtCraft's `video-cache/service.ts` has a header comment that explains the forward-prefetch and seek-or-iterate decisions.

**Copy code only from OpenCut Classic, never from ArtCraft's port.** ArtCraft's licence (`LICENSE.md`) allows copying for private personal use only and grants no redistribution. Copying from OpenCut keeps lc-studio free to share.

### 8.3 Off limits

Don't copy ArtCraft-original code (anything that isn't in OpenCut Classic) into lc-studio. ArtCraft's own patterns may inform the design, but the code must be written from this spec.

### 8.4 mediabunny

mediabunny is MPL-2.0. Use it as an unmodified npm dependency; if you ever patch one of its files, that file's changes must be published.

---

## 9. Risks

- **WebCodecs on older macOS.** WKWebView without `VideoDecoder` triggers the R1.9 fallback. Check it on the oldest macOS you support.
- **Memory.** `readFile` loads whole files into memory. That's fine for short-form clips; log a warning above roughly 500 MB.
- **Export speed.** Decoding happens at the source resolution. If A1.7 fails, pass `width`/`height` to mediabunny's `CanvasSink` so it scales while decoding.
- **Codecs.** H.264, VP9 and (on Apple Silicon) HEVC should decode; ProRes won't through WebCodecs, so it falls back.
- **FFmpeg version.** `amix`'s `normalize` option needs a reasonably recent FFmpeg. The render error must show FFmpeg's stderr (R2.5).

## 10. Follow-ups (out of scope)

- Update the `lc-studio-project` skill: remove the limitations in `references/schema.md` §12, document the new `motionPath` fields, and teach `lcs.py validate` about them.
- Timeline waveforms (OpenCut `services/waveform-cache/service.ts`, MIT).
- Local captions with Whisper (OpenCut `services/transcription/`, MIT; add Turkish to `transcription/languages.ts`).
