// ── Easing ──────────────────────────────────────────────

export type EasingType =
  | 'linear'
  | 'ease-in' | 'ease-out' | 'ease-in-out'
  | 'ease-in-cubic' | 'ease-out-cubic' | 'ease-in-out-cubic'
  | 'ease-in-sine' | 'ease-out-sine' | 'ease-in-out-sine'
  | 'ease-in-expo' | 'ease-out-expo' | 'ease-in-out-expo'
  | 'ease-in-circ' | 'ease-out-circ' | 'ease-in-out-circ'
  | 'ease-in-back' | 'ease-out-back' | 'ease-in-out-back'
  | 'ease-in-elastic' | 'ease-out-elastic' | 'ease-in-out-elastic'
  | 'ease-in-bounce' | 'ease-out-bounce' | 'ease-in-out-bounce'
  | 'steps'
  | 'cubic-bezier'
  | 'spring';

export interface EasingParams {
  controlPoints?: [number, number, number, number]; // cubic-bezier
  steps?: number;
  mass?: number;       // spring
  stiffness?: number;  // spring
  damping?: number;    // spring
}

// ── Keyframes ──────────────────────────────────────────

export interface Keyframe<T = number> {
  frame: number;
  value: T;
  easing: EasingType;
  easingParams?: EasingParams;
}

export interface KeyframeTrack<T = number> {
  keyframes: Keyframe<T>[];
}

/** Numbers for most properties; hex strings for colour (text `color`). */
export type KeyframeValue = number | string;

/** A track as stored on a layer: all numbers or all hex colours, never mixed. */
export type LayerKeyframeTrack = KeyframeTrack<number> | KeyframeTrack<string>;

// ── Gradients ─────────────────────────────────────────

export interface GradientStop {
  offset: number; // 0–1
  color: string;
}

export interface LinearGradientDef {
  type: 'linear';
  angle: number; // degrees: 0 = left→right, 90 = top→bottom
  stops: GradientStop[];
}

export interface RadialGradientDef {
  type: 'radial';
  centerX: number; // 0–1 relative to width
  centerY: number; // 0–1 relative to height
  radius: number;  // 0–1 relative to max(width, height)
  stops: GradientStop[];
}

export type GradientDef = LinearGradientDef | RadialGradientDef;

// ── Clip Paths ────────────────────────────────────────

export type ClipPathType = 'none' | 'rect' | 'circle' | 'ellipse' | 'polygon' | 'path';

export interface ClipPathRect { type: 'rect'; inset: number; borderRadius?: number; }
export interface ClipPathCircle { type: 'circle'; radius: number; cx: number; cy: number; } // 0–1 relative
export interface ClipPathEllipse { type: 'ellipse'; rx: number; ry: number; cx: number; cy: number; }
export interface ClipPathPolygon { type: 'polygon'; points: [number, number][]; } // 0–1 relative
export interface ClipPathSvg { type: 'path'; d: string; } // SVG path data

export type ClipPathDef =
  | ClipPathRect | ClipPathCircle | ClipPathEllipse
  | ClipPathPolygon | ClipPathSvg;

// ── Motion Paths ─────────────────────────────────────

export interface MotionPathPoint {
  x: number;
  y: number;
  cpX?: number; // control point for curve (outgoing)
  cpY?: number;
}

/**
 * How progress spreads over the path: 'per-segment' gives every segment the
 * same share of time (so short segments are slow), 'constant-speed' moves at
 * one speed over the whole length.
 */
export type MotionPathTiming = 'per-segment' | 'constant-speed';

export interface MotionPathDef {
  points: MotionPathPoint[];
  alignToPath?: boolean;  // rotate layer to follow path tangent
  loop?: boolean;
  easing?: EasingType;           // absent = linear
  easingParams?: EasingParams;
  timing?: MotionPathTiming;     // absent = per-segment
}

// ── Per-character text animation ─────────────────────

export type CharAnimationType = 'none' | 'fade-in' | 'slide-up' | 'slide-down'
  | 'scale-in' | 'rotate-in' | 'typewriter' | 'scramble' | 'wave';

export interface CharAnimationDef {
  type: CharAnimationType;
  staggerFrames: number;   // delay between each character
  durationFrames: number;  // animation duration per character
  easing?: EasingType;
}

// ── Layer base ─────────────────────────────────────────

export type BlendMode =
  | 'normal' | 'multiply' | 'screen' | 'overlay'
  | 'darken' | 'lighten' | 'color-dodge' | 'color-burn'
  | 'hard-light' | 'soft-light' | 'difference' | 'exclusion'
  | 'hue' | 'saturation' | 'color' | 'luminosity';

export interface LayerEffect {
  type: 'blur' | 'brightness' | 'contrast' | 'saturate'
      | 'grayscale' | 'sepia' | 'hue-rotate' | 'invert'
      | 'drop-shadow';
  value: number | string;
}

export interface BoxShadow {
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
  spread: number;
}

// ── FX timing envelope ────────────────────────────────
// Any layer FX may carry a window. The renderer collapses it to a single
// scalar `env`: 0 → 1 across the entrance, 1 while held, 1 → 0 across the
// exit. Absent window means env is always 1, i.e. the effect is always on.

export interface FxWindow {
  inDelay: number;    // frames after layer start before the entrance begins
  inFrames: number;   // entrance length; 0 = no entrance
  outFrames: number;  // exit length, measured back from the last frame; 0 = none
  easing: EasingType;
  easingParams?: EasingParams;
}

// ── Layer FX ──────────────────────────────────────────
// Perceptual effects built by compositing the layer more than once, rather
// than by a CSS filter. All are frame-deterministic: the same frame always
// produces the same pixels, in preview and in an FFmpeg render alike.

/** Trailing copies of the layer from earlier frames — reads as motion blur. */
export interface EchoFx {
  type: 'echo';
  count: number;       // number of trailing copies
  frameGap: number;    // frames between copies
  decay: number;       // 0–1 alpha multiplier per step
  window?: FxWindow;
}

/** Colour channels pulled apart — chromatic aberration / glitch. */
export interface RgbSplitFx {
  type: 'rgb-split';
  offset: number;      // px between the red and blue copies
  angle: number;       // degrees, direction of the split
  jitter: number;      // 0–1, per-frame randomisation of the offset
  window?: FxWindow;
}

/** A specular band sweeping across the layer — the classic chrome glint. */
export interface ShineFx {
  type: 'shine';
  color: string;
  width: number;       // band width in px
  angle: number;       // degrees
  periodFrames: number; // frames per sweep
  intensity: number;   // 0–1
  window?: FxWindow;
}

/** Soft coloured bloom around the layer, optionally pulsing. */
export interface GlowFx {
  type: 'glow';
  color: string;
  radius: number;
  intensity: number;    // 0–3, how many passes worth of bloom
  pulseFrames: number;  // 0 = steady
  window?: FxWindow;
}

/** Repeated silhouettes receding at an angle — fake 3D extrusion. */
export interface LongShadowFx {
  type: 'long-shadow';
  color: string;
  distance: number;  // px
  angle: number;     // degrees
  fade: number;      // 0–1, alpha falloff along the extrusion
  window?: FxWindow;
}

/** Scale-based reveal — punches in from `from` (or recedes, when from > 1). */
export interface ZoomFx {
  type: 'zoom';
  from: number;    // starting scale multiplier; <1 punches in, >1 recedes
  fade: number;    // 0–1, how much layer alpha is coupled to the envelope
  window?: FxWindow;
}

/** Mosaic reveal — content resolves out of coarse blocks. */
export interface PixelateFx {
  type: 'pixelate';
  maxBlock: number;  // block size in px at env 0
  flicker: number;   // 0–1, per-block alpha noise so blocks pop rather than sharpen
  fade: number;      // 0–1, how much layer alpha is coupled to the envelope
  window?: FxWindow;
}

/** Banded reveal — the layer arrives in strips. */
export interface SliceFx {
  type: 'slice';
  bands: number;
  direction: 'horizontal' | 'vertical';
  order: 'sequential' | 'center-out' | 'random';
  travel: number;   // px each band slides in from; 0 = fade only
  stagger: number;  // 0 = all bands together, approaching 1 = strictly sequential
  window?: FxWindow;
}

/** Masked reveal — a soft edge sweeps across and the layer appears behind it. */
export interface WipeFx {
  type: 'wipe';
  shape: 'linear' | 'iris' | 'barn';
  angle: number;     // degrees; applies to linear and barn
  softness: number;  // px of gradient ramp; 0 = hard edge
  edgeGlow?: number;   // px width of a glow along the front; absent or 0 = off
  edgeColor?: string;  // glow and spark colour
  sparks?: number;     // 0–1 density of sparks drifting off the front; absent or 0 = off
  window?: FxWindow;
}

/** Horizontal strips jumping sideways on random frames — digital tearing. */
export interface GlitchFx {
  type: 'glitch';
  bands: number;
  maxOffset: number;    // px of horizontal displacement
  channelShift: number; // px of rgb fringing on displaced bands
  probability: number;  // 0–1, chance a given band tears on a given frame
  window?: FxWindow;
}

/** Sticker-style border hugging the layer's silhouette. */
export interface OutlineFx {
  type: 'outline';
  color: string;
  width: number;  // px
  window?: FxWindow;
}

/** Blur-plus-contrast melt — neighbouring shapes fuse like liquid. */
export interface GooeyFx {
  type: 'gooey';
  blur: number;      // px
  contrast: number;  // multiplier; higher tightens the edge
  window?: FxWindow;
}

/** The layer assembles from (or blows away into) grains of its own pixels. */
export interface DisintegrateFx {
  type: 'disintegrate';
  grain: number;      // px per grain, 1–8
  scatter: number;    // px a grain is away from home at env 0
  angle: number;      // degrees, direction of the dust cloud (the wind)
  spread: number;     // 0–1, how far each grain's direction varies around `angle`
  gravity: number;    // px of extra downward offset at env 0; negative lifts
  sweep: number;      // degrees, direction the release sweeps across the layer
  stagger: number;    // 0 = all grains move together, up to 0.95 = a strict sweep
  fade: number;       // 0–1, grain alpha lost at full scatter (1 = invisible at env 0)
  window?: FxWindow;
}

/** Cells of cipher glyphs that scramble, then resolve into the layer. */
export interface DecryptFx {
  type: 'decrypt';
  cell: number;           // px cell size, 6–40
  charset: 'cipher' | 'ramp' | 'binary';
  color: string;          // glyph ink
  tint: number;           // 0 = glyph takes the cell's own colour, 1 = `color`
  scrambleFrames: number; // frames between glyph changes, 1–12
  order: 'random' | 'sweep' | 'center-out';
  angle: number;          // degrees, for 'sweep'
  stagger: number;        // 0–0.95
  edgeGlow: number;       // 0–1, brightness surge on cells about to resolve
  window?: FxWindow;
}

export type LayerFxDef = EchoFx | RgbSplitFx | ShineFx | GlowFx | LongShadowFx | ZoomFx | PixelateFx | SliceFx | WipeFx | GlitchFx | OutlineFx | GooeyFx | DisintegrateFx | DecryptFx;
export type LayerFxType = LayerFxDef['type'];

// ── Scene FX ──────────────────────────────────────────
// Full-frame treatments applied after the scene is composited.

/** Animated film grain. */
export interface GrainFx {
  type: 'grain';
  amount: number;  // 0–1
  scale: number;   // px per noise cell
}

/** Darkened corners. */
export interface VignetteFx {
  type: 'vignette';
  amount: number;  // 0–1
  radius: number;  // 0–1, where the falloff starts
}

/** CRT scanlines with an optional vertical roll. */
export interface ScanlinesFx {
  type: 'scanlines';
  amount: number;    // 0–1
  spacing: number;   // px between lines
  rollSpeed: number; // px per frame, 0 = static
}

/** Camera shake — the frame is scaled up slightly and jittered. */
export interface ShakeFx {
  type: 'shake';
  amplitude: number;    // px
  frequency: number;    // oscillations per second
  decayFrames: number;  // 0 = never settles
}

/** Worn tape playback. */
export interface VhsFx {
  type: 'vhs';
  wave: number;            // px amplitude of the slow horizontal wave
  jitter: number;          // px of per-line horizontal jitter
  bleed: number;           // px red/blue horizontal offset (chroma bleed)
  switching: number;       // 0–1 strength of the head-switching noise band
  switchingHeight: number; // 0–0.2, band height as a fraction of the frame
  crease: number;          // 0–1, a travelling tape-crease band
  saturation: number;      // 0–2
  barrel: number;          // 0–1 tube curvature; WebGL2 only, skipped without it
}

export type SceneFxDef = GrainFx | VignetteFx | ScanlinesFx | ShakeFx | VhsFx;
export type SceneFxType = SceneFxDef['type'];

export interface LayerBase {
  id: string;
  name: string;
  type: LayerType;
  startFrame: number;
  endFrame: number;
  x: number;
  y: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  rotation: number; // degrees
  opacity: number;  // 0–1
  anchorX: number;  // 0–1 (transform origin)
  anchorY: number;  // 0–1
  skewX?: number;   // degrees
  skewY?: number;   // degrees
  zIndex: number;
  blendMode: BlendMode;
  effects: LayerEffect[];
  layerFx?: LayerFxDef[];
  boxShadow?: BoxShadow | null;
  clipPath?: ClipPathDef | null;
  motionPath?: MotionPathDef | null;
  visible: boolean;
  locked: boolean;
  keyframes: Record<string, LayerKeyframeTrack>;
}

// ── Layer types ────────────────────────────────────────

export type LayerType = 'text' | 'image' | 'shape' | 'video' | 'audio' | 'svg' | 'lens';

export type TextAlign = 'left' | 'center' | 'right';
export type VerticalAlign = 'top' | 'middle' | 'bottom';
export type FontWeight = 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900';
export type FontStyle = 'normal' | 'italic';

export interface TextStroke {
  color: string;
  width: number;
}

export interface TextShadow {
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
}

export interface TextLayerData extends LayerBase {
  type: 'text';
  content: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: FontWeight;
  fontStyle: FontStyle;
  color: string;
  fillType?: FillType;
  fillGradient?: GradientDef;
  align: TextAlign;
  verticalAlign: VerticalAlign;
  lineHeight: number;    // multiplier (e.g. 1.4)
  letterSpacing: number; // px
  maxWidth: number;      // px, 0 = no wrap
  textStroke: TextStroke | null;
  textShadow: TextShadow | null;
  charAnimation?: CharAnimationDef | null;
}

export type ImageFitMode = 'cover' | 'contain' | 'fill' | 'none';

export type TintBlendMode = 'multiply' | 'screen' | 'overlay' | 'color';

/** 0–1 position in an image's own pixel space (not the layer box). */
export interface MorphPoint {
  x: number;
  y: number;
}

export interface MorphPair {
  id: string;
  a: MorphPoint;            // on the layer's own image (`src`)
  b: MorphPoint;            // on the target image
  source: 'auto' | 'manual';
  confidence?: number;      // 0–1; auto pairs only
}

export interface ImageMorphDef {
  target: string;           // second image; same path rules as `src`
  pairs: MorphPair[];
  progress: number;         // 0–1 static value; a 'morphProgress' keyframe track overrides it
}

export interface ImageLayerData extends LayerBase {
  type: 'image';
  src: string;
  fitMode: ImageFitMode;
  borderRadius: number;
  tintColor?: string | null;
  tintBlend?: TintBlendMode;
  morph?: ImageMorphDef | null;
}

export type ShapeType = 'rect' | 'circle' | 'ellipse' | 'rounded-rect' | 'line'
  | 'triangle' | 'star' | 'polygon' | 'arrow';

export type FillType = 'solid' | 'linear-gradient' | 'radial-gradient';

export interface ShapeLayerData extends LayerBase {
  type: 'shape';
  shapeType: ShapeType;
  fill: string;
  fillType?: FillType;
  fillGradient?: GradientDef;
  stroke: string;
  strokeWidth: number;
  strokeDash?: number[];     // e.g. [10, 5] for dashed
  strokeDashOffset?: number;
  cornerRadius: number;
  polygonSides?: number;    // for 'polygon', default 6
  starPoints?: number;      // for 'star', default 5
  starInnerRadius?: number; // 0–1, inner/outer radius ratio, default 0.4
}

export interface VideoLayerData extends LayerBase {
  type: 'video';
  src: string;
  startTime: number;   // seconds into the source video
  endTime: number;
  playbackRate: number;
  muted: boolean;
}

export interface AudioLayerData extends LayerBase {
  type: 'audio';
  src: string;
  startTime: number; // seconds into the source audio
  endTime: number;
  volume: number;    // 0–1
  fadeInFrames: number;
  fadeOutFrames: number;
}

export interface SvgLayerData extends LayerBase {
  type: 'svg';
  content: string;     // SVG markup string
  viewBox?: string;    // e.g. "0 0 100 100"
  fillColor?: string;  // override fill color
  strokeColor?: string;
}

/** What a lens does to the pixels under it. 'refract' and 'ripple' need WebGL2. */
export type LensMode = 'magnify' | 'pixelate' | 'dither' | 'ascii' | 'refract' | 'ripple';

/**
 * A lens changes whatever is drawn *under* it (lower zIndex) inside its
 * shape. It moves on keyframes or a motion path like any layer. Lenses ignore
 * effects, layerFx, boxShadow, blendMode and clipPath, and never echo.
 */
export interface LensLayerData extends LayerBase {
  type: 'lens';
  shape: 'circle' | 'rect' | 'rounded-rect';
  cornerRadius: number;
  feather: number;          // px soft edge, 0 = hard
  intensity: number;        // 0–1, keyframable ('intensity' track); 0 = no effect
  ring: { color: string; width: number } | null;  // HUD outline
  mode: LensMode;
  magnify: number;          // 1–6, 'magnify'
  block: number;            // px, 'pixelate'
  ditherLevels: number;     // 2–8 per channel, 'dither'
  ink?: string;             // 'dither'/'ascii' foreground; unset = keep the source colours
  paper?: string;           // 'dither'/'ascii' background; unset = source darkened to 25%
  cell: number;             // px, 'ascii'
  // 'refract' (WebGL2): a glass dome. Absent fields take REFRACT_DEFAULTS.
  strength?: number;        // px the sample moves along the dome's normal at the rim, × intensity
  dispersion?: number;      // 0–1, splits the red and blue offsets
  highlight?: number;       // 0–1, a soft specular highlight
  // 'ripple' (WebGL2): rings from impulses. Absent fields take RIPPLE_DEFAULTS.
  impulses?: { frame: number; x: number; y: number }[];  // layer frame; x, y 0–1 in the lens box
  amplitude?: number;       // px of ring height, × intensity
  wavelength?: number;      // px
  speed?: number;           // px per frame the ring front travels
  decay?: number;           // per frame, exponential fade with age
  refraction?: number;      // px of displacement per unit of slope
  life?: number;            // frames an impulse lasts
  ambientEvery?: number;    // frames between automatic impulses at hashed positions; 0 = off
}

export type Layer =
  | TextLayerData
  | ImageLayerData
  | ShapeLayerData
  | VideoLayerData
  | AudioLayerData
  | SvgLayerData
  | LensLayerData;

// ── Scene & Composition ────────────────────────────────

export type TransitionType =
  | 'none' | 'cut' | 'fade'
  | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down'
  | 'wipe-horizontal' | 'wipe-vertical'
  | 'zoom-in' | 'zoom-out'
  | 'dissolve'
  // Drawn by a WebGL2 shader; fall back to 'fade' without WebGL.
  | 'cube' | 'doorway' | 'grid-flip' | 'water-drop' | 'crosswarp'
  | 'glitch-displace' | 'film-burn' | 'page-curl' | 'ascii-sweep';

export type BackgroundType = 'solid' | 'linear-gradient' | 'radial-gradient' | 'image';

export interface Scene {
  id: string;
  label: string;
  durationFrames: number;
  backgroundColor: string;
  backgroundType?: BackgroundType;
  backgroundGradient?: GradientDef;
  backgroundImage?: string;
  backgroundImageFit?: ImageFitMode;
  layers: Layer[];
  sceneFx?: SceneFxDef[];
  transition: TransitionType;
  transitionDurationFrames: number;
  /** Shader parameters for a GPU transition (TRANSITION_SPECS); absent = its defaults. */
  transitionParams?: Record<string, number>;
}

export interface OutputPreset {
  id: string;
  label: string;
  width: number;
  height: number;
  fps: number;
}

export interface Composition {
  id: string;
  name: string;
  scenes: Scene[];
  output: OutputPreset;
}

// ── Export formats & quality ──────────────────────────

export type ExportFormat = 'mp4' | 'webm' | 'gif' | 'png-sequence' | 'mov';

export type QualityPreset = 'low' | 'medium' | 'high' | 'lossless';

// ── Render progress ────────────────────────────────────

export type RenderStatus = 'idle' | 'rendering' | 'completed' | 'failed' | 'cancelled';

export interface RenderProgress {
  current_frame: number;
  total_frames: number;
  percent: number;
  status: RenderStatus;
  error?: string;
}

// ── Audio track spec (for FFmpeg) ──────────────────────

/** One sound placed on the output timeline; built by buildAudioTracks (src/lib/audio-tracks.ts). */
export interface AudioTrackSpec {
  path: string;               // absolute filesystem path (or URL) of the source
  startTimeSecs: number;      // where to start reading in the source
  durationSecs: number;       // how long it lasts in the output, after the speed change
  volume: number;
  timelineOffsetSecs: number; // where it starts in the output
  fadeInSecs: number;
  fadeOutSecs: number;
  playbackRate: number;
}

// ── Resolved transform (output of interpolation) ──────

export interface ResolvedTransform {
  x: number;
  y: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
  anchorX: number;
  anchorY: number;
  skewX: number;
  skewY: number;
}
