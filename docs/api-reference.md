# API Reference

## Type System

### Composition

```typescript
interface Composition {
  id: string;
  name: string;
  scenes: Scene[];
  output: OutputPreset;
}

interface OutputPreset {
  id: string;
  label: string;
  width: number;    // pixels
  height: number;   // pixels
  fps: number;      // frames per second
}
```

### Scene

```typescript
interface Scene {
  id: string;
  label: string;
  durationFrames: number;
  backgroundColor: string;        // hex color
  layers: Layer[];
  transition: TransitionType;
  transitionDurationFrames: number;
}

type TransitionType =
  | 'none' | 'cut' | 'fade'
  | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down'
  | 'wipe-horizontal' | 'wipe-vertical'
  | 'zoom-in' | 'zoom-out'
  | 'dissolve';
```

### Layer Base

```typescript
interface LayerBase {
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
  rotation: number;       // degrees
  opacity: number;        // 0-1
  anchorX: number;        // 0-1, transform origin
  anchorY: number;        // 0-1
  zIndex: number;
  blendMode: BlendMode;
  effects: LayerEffect[];
  visible: boolean;
  locked: boolean;
  keyframes: Record<string, KeyframeTrack>;
}

type LayerType = 'text' | 'image' | 'shape' | 'video' | 'audio';

type BlendMode =
  | 'normal' | 'multiply' | 'screen' | 'overlay'
  | 'darken' | 'lighten' | 'color-dodge' | 'color-burn';

interface LayerEffect {
  type: 'blur' | 'brightness' | 'contrast' | 'saturate'
      | 'grayscale' | 'sepia' | 'hue-rotate' | 'drop-shadow';
  value: number | string;
}
```

### Layer Types

```typescript
// Discriminated union
type Layer = TextLayerData | ImageLayerData | ShapeLayerData
           | VideoLayerData | AudioLayerData;

interface TextLayerData extends LayerBase {
  type: 'text';
  content: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: FontWeight;
  fontStyle: FontStyle;           // 'normal' | 'italic'
  color: string;                  // hex
  align: TextAlign;               // 'left' | 'center' | 'right'
  verticalAlign: VerticalAlign;   // 'top' | 'middle' | 'bottom'
  lineHeight: number;             // multiplier (e.g. 1.4)
  letterSpacing: number;          // px
  maxWidth: number;               // px, 0 = no wrap
  textStroke: TextStroke | null;
  textShadow: TextShadow | null;
}

interface ImageLayerData extends LayerBase {
  type: 'image';
  src: string;                    // URL or blob URL
  fitMode: ImageFitMode;          // 'cover' | 'contain' | 'fill' | 'none'
  borderRadius: number;
}

interface ShapeLayerData extends LayerBase {
  type: 'shape';
  shapeType: ShapeType;           // 'rect' | 'circle' | 'ellipse' | 'rounded-rect' | 'line'
  fill: string;                   // hex
  stroke: string;                 // hex
  strokeWidth: number;
  cornerRadius: number;
}

interface VideoLayerData extends LayerBase {
  type: 'video';
  src: string;
  startTime: number;              // seconds into source
  endTime: number;
  playbackRate: number;
  muted: boolean;
}

interface AudioLayerData extends LayerBase {
  type: 'audio';
  src: string;
  startTime: number;              // seconds into source
  endTime: number;
  volume: number;                 // 0-1
  fadeInFrames: number;
  fadeOutFrames: number;
}
```

### Keyframes

```typescript
interface Keyframe<T = number> {
  frame: number;
  value: T;
  easing: EasingType;
  easingParams?: EasingParams;
}

interface KeyframeTrack<T = number> {
  keyframes: Keyframe<T>[];
}

interface EasingParams {
  controlPoints?: [number, number, number, number];  // cubic-bezier
  steps?: number;
  mass?: number;        // spring
  stiffness?: number;   // spring
  damping?: number;     // spring
}
```

## Store API

### Composition Slice

```typescript
interface CompositionSlice {
  composition: Composition;
  setComposition(composition: Composition): void;
  updateScene(sceneIndex: number, patch: Partial<Scene>): void;
  addScene(scene: Scene, insertIndex?: number): void;
  removeScene(sceneIndex: number): void;
  reorderScenes(fromIndex: number, toIndex: number): void;
  duplicateScene(sceneIndex: number): void;
  addLayer(sceneIndex: number, layer: Layer): void;
  updateLayer(sceneIndex: number, layerId: string, patch: Partial<Layer>): void;
  removeLayer(sceneIndex: number, layerId: string): void;
  reorderLayers(sceneIndex: number, fromIndex: number, toIndex: number): void;
  setKeyframe(sceneIndex: number, layerId: string, property: string,
              frame: number, value: number, easing?: string): void;
  removeKeyframe(sceneIndex: number, layerId: string, property: string,
                 frame: number): void;
}
```

### Selection Slice

```typescript
interface SelectionSlice {
  selectedSceneIndex: number;
  selectedLayerId: string | null;
  selectedProperty: string | null;
  selectScene(index: number): void;
  selectLayer(id: string | null): void;
  selectProperty(property: string | null): void;
}
```

### Playback Slice

```typescript
type PlaybackSpeed = 0.25 | 0.5 | 1 | 2;

interface PlaybackSlice {
  currentFrame: number;
  playing: boolean;
  loop: boolean;
  speed: PlaybackSpeed;
  setCurrentFrame(frame: number): void;
  setPlaying(playing: boolean): void;
  togglePlay(): void;
  setLoop(loop: boolean): void;
  setSpeed(speed: PlaybackSpeed): void;
  stepForward(): void;
  stepBackward(): void;
}
```

### UI Slice

```typescript
type ToolMode = 'select' | 'move' | 'hand';

interface UISlice {
  toolMode: ToolMode;
  canvasZoom: number;       // 0.1 to 5.0
  showGrid: boolean;
  snapToGrid: boolean;
  setToolMode(mode: ToolMode): void;
  setCanvasZoom(zoom: number): void;
  toggleGrid(): void;
  toggleSnap(): void;
}
```

## Renderer API

### Compositor

```typescript
function getTotalFrames(composition: Composition): number;
function resolveFrame(composition: Composition, globalFrame: number):
  { sceneIndex: number; frameInScene: number };
function drawCompositionFrame(ctx: CanvasRenderingContext2D,
  composition: Composition, globalFrame: number, mediaCache: MediaCache): void;
```

### Interpolation

```typescript
function interpolateNumeric(track: KeyframeTrack<number>, frame: number): number;
function interpolateColor(track: KeyframeTrack<string>, frame: number): string;
function resolveNumericProperty(keyframes: Record<string, KeyframeTrack>,
  propertyName: string, frame: number, defaultValue: number): number;
function resolveColorProperty(keyframes: Record<string, KeyframeTrack<string>>,
  propertyName: string, frame: number, defaultValue: string): string;
function resolveLayerTransform(layer: LayerBase, frameInLayer: number): ResolvedTransform;
```

### Easing

```typescript
function getEasing(type: EasingType, params?: EasingParams): (t: number) => number;
```

### Media Cache

```typescript
type MediaCache = Map<string, ImageBitmap>;
function createMediaCache(): MediaCache;
function loadImage(cache: MediaCache, src: string): Promise<void>;
function preloadScene(cache: MediaCache, scene: Scene): Promise<void>;
function preloadComposition(cache: MediaCache, scenes: Scene[]): Promise<void>;
function clearCache(cache: MediaCache): void;
```

### Audio Engine

```typescript
class AudioEngine {
  loadAudio(src: string): Promise<void>;
  preloadSceneAudio(scene: Scene): Promise<void>;
  seekTo(globalFrame: number, fps: number, scenes: Scene[]): void;
  pause(): void;
  resume(): void;
  stopAll(): void;
  dispose(): void;
}
```

### Capture

```typescript
function renderComposition(composition: Composition, outputPath: string,
  onProgress?: (current: number, total: number) => void): Promise<void>;
```

## Tauri Bridge API

```typescript
function checkFfmpeg(): Promise<string>;
function startRender(params: {
  outputPath: string; width: number; height: number;
  fps: number; totalFrames: number; audioTracks?: AudioTrackSpec[];
}): Promise<void>;
function writeFrame(rgbaPixels: Uint8Array): Promise<void>;
function finishRender(): Promise<void>;
function cancelRender(): Promise<void>;
function onRenderProgress(callback: (progress: RenderProgress) => void): Promise<UnlistenFn>;
```

## File Utilities API

```typescript
function pickImageFile(): Promise<string | null>;
function pickAudioFile(): Promise<string | null>;
function pickVideoFile(): Promise<string | null>;
function fileToBlobUrl(filePath: string): Promise<string>;
```
