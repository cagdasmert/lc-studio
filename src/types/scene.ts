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
  boxShadow?: BoxShadow | null;
  visible: boolean;
  locked: boolean;
  keyframes: Record<string, KeyframeTrack>;
}

// ── Layer types ────────────────────────────────────────

export type LayerType = 'text' | 'image' | 'shape' | 'video' | 'audio';

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

export type Layer =
  | TextLayerData
  | ImageLayerData
  | ShapeLayerData
  | VideoLayerData
  | AudioLayerData;

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
