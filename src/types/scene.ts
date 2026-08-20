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

export interface MotionPathDef {
  points: MotionPathPoint[];
  alignToPath?: boolean;  // rotate layer to follow path tangent
  loop?: boolean;
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

export type LayerFxDef = EchoFx | RgbSplitFx | ShineFx | GlowFx | LongShadowFx;
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

export type SceneFxDef = GrainFx | VignetteFx | ScanlinesFx | ShakeFx;
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
  keyframes: Record<string, KeyframeTrack>;
}

// ── Layer types ────────────────────────────────────────

export type LayerType = 'text' | 'image' | 'shape' | 'video' | 'audio' | 'svg';

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

export interface ImageLayerData extends LayerBase {
  type: 'image';
  src: string;
  fitMode: ImageFitMode;
  borderRadius: number;
  tintColor?: string | null;
  tintBlend?: TintBlendMode;
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

export type Layer =
  | TextLayerData
  | ImageLayerData
  | ShapeLayerData
  | VideoLayerData
  | AudioLayerData
  | SvgLayerData;

// ── Scene & Composition ────────────────────────────────

export type TransitionType =
  | 'none' | 'cut' | 'fade'
  | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down'
  | 'wipe-horizontal' | 'wipe-vertical'
  | 'zoom-in' | 'zoom-out'
  | 'dissolve';

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

export interface AudioTrackSpec {
  path: string;
  startTimeSecs: number;
  durationSecs: number;
  volume: number;
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
