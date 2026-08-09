export interface OutputPreset {
  id: string;
  label: string;
  width: number;
  height: number;
  fps: number;
}

export type Color = string;

export type EasingType = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';

export type AnimationType = 'none' | 'fade-in' | 'slide-up' | 'slide-left' | 'typewriter';

export interface TextAnimation {
  type: AnimationType;
  durationFrames: number;
  delayFrames: number;
  easing: EasingType;
}

export interface TextLayer {
  content: string;
  fontSize: number;
  fontFamily: string;
  color: Color;
  x: number; // 0–1 normalized
  y: number; // 0–1 normalized
  align: 'left' | 'center' | 'right';
  animation: TextAnimation;
}

export type TransitionType = 'none' | 'fade' | 'cut';

export interface Scene {
  id: string;
  label: string;
  durationFrames: number;
  backgroundColor: Color;
  textLayers: TextLayer[];
  transition: TransitionType;
}

export interface Composition {
  id: string;
  name: string;
  scenes: Scene[];
  output: OutputPreset;
}

export type RenderStatus = 'idle' | 'rendering' | 'completed' | 'failed' | 'cancelled';

export interface RenderProgress {
  current_frame: number;
  total_frames: number;
  percent: number;
  status: RenderStatus;
  error?: string;
}
