import type { LayerFxDef, LayerFxType, SceneFxDef, SceneFxType, FxWindow } from '../types';

/**
 * UI metadata for effects: label, default parameters, and the controls to
 * show. The renderer reads none of this — adding an effect here only changes
 * what the inspector offers.
 */

export interface FxFieldOption {
  value: string;
  label: string;
}

export interface FxField {
  key: string;
  label: string;
  kind: 'number' | 'color' | 'select';
  min?: number;
  max?: number;
  step?: number;
  options?: FxFieldOption[];  // required when kind is 'select'
}

export interface FxSpec<T> {
  label: string;
  hint: string;
  /** 'reveal' effects are driven by the envelope; 'continuous' ones are
   *  merely dimmed by it. UI only — the renderer keeps its own REVEAL_FX
   *  list in layer-fx.ts and must not import this module. */
  kind: 'reveal' | 'continuous';
  defaults: T;
  fields: FxField[];
}

const num = (key: string, label: string, min: number, max: number, step = 1): FxField =>
  ({ key, label, kind: 'number', min, max, step });

const color = (key: string, label: string): FxField => ({ key, label, kind: 'color' });

export const select = (key: string, label: string, options: FxFieldOption[]): FxField =>
  ({ key, label, kind: 'select', options });

/** What a reveal gets when you add it: a 12-frame entrance, no exit. */
export const DEFAULT_FX_WINDOW: FxWindow = {
  inDelay: 0, inFrames: 12, outFrames: 0, easing: 'ease-out-cubic',
};

export const LAYER_FX_SPECS: Record<LayerFxType, FxSpec<LayerFxDef>> = {
  echo: {
    label: 'Echo trail',
    hint: 'Copies of the layer from earlier frames — reads as motion blur.',
    kind: 'continuous',
    defaults: { type: 'echo', count: 5, frameGap: 2, decay: 0.6 },
    fields: [
      num('count', 'Copies', 1, 20),
      num('frameGap', 'Frame gap', 1, 20),
      num('decay', 'Decay', 0.1, 0.95, 0.05),
    ],
  },
  'rgb-split': {
    label: 'RGB split',
    hint: 'Colour channels pulled apart — chromatic aberration / glitch.',
    kind: 'continuous',
    defaults: { type: 'rgb-split', offset: 6, angle: 0, jitter: 0 },
    fields: [
      num('offset', 'Offset', 0, 60),
      num('angle', 'Angle', 0, 360, 5),
      num('jitter', 'Jitter', 0, 1, 0.05),
    ],
  },
  shine: {
    label: 'Shine sweep',
    hint: 'A specular band travelling across the layer.',
    kind: 'continuous',
    defaults: { type: 'shine', color: '#ffffff', width: 120, angle: 20, periodFrames: 60, intensity: 0.8 },
    fields: [
      color('color', 'Colour'),
      num('width', 'Band width', 10, 600, 5),
      num('angle', 'Angle', 0, 360, 5),
      num('periodFrames', 'Period', 10, 300, 5),
      num('intensity', 'Intensity', 0, 1, 0.05),
    ],
  },
  glow: {
    label: 'Neon glow',
    hint: 'Coloured bloom around the layer, optionally pulsing.',
    kind: 'continuous',
    defaults: { type: 'glow', color: '#e94560', radius: 24, intensity: 2, pulseFrames: 0 },
    fields: [
      color('color', 'Colour'),
      num('radius', 'Radius', 0, 120),
      num('intensity', 'Passes', 1, 4),
      num('pulseFrames', 'Pulse', 0, 240, 5),
    ],
  },
  'long-shadow': {
    label: 'Long shadow',
    hint: 'Repeated silhouettes receding at an angle — fake 3D extrusion.',
    kind: 'continuous',
    defaults: { type: 'long-shadow', color: '#000000', distance: 40, angle: 45, fade: 0.7 },
    fields: [
      color('color', 'Colour'),
      num('distance', 'Distance', 1, 300),
      num('angle', 'Angle', 0, 360, 5),
      num('fade', 'Fade', 0, 1, 0.05),
    ],
  },
  zoom: {
    label: 'Zoom reveal',
    hint: 'Punches in or recedes as it appears. Set From above 1 to zoom out.',
    kind: 'reveal',
    defaults: { type: 'zoom', from: 0.6, fade: 1, window: { ...DEFAULT_FX_WINDOW } },
    fields: [
      num('from', 'From', 0.1, 3, 0.05),
      num('fade', 'Fade', 0, 1, 0.05),
    ],
  },
  pixelate: {
    label: 'Pixelate reveal',
    hint: 'Content resolves out of coarse blocks, with optional per-block flicker.',
    kind: 'reveal',
    defaults: { type: 'pixelate', maxBlock: 40, flicker: 0.6, fade: 0.4, window: { ...DEFAULT_FX_WINDOW } },
    fields: [
      num('maxBlock', 'Max block', 2, 160),
      num('flicker', 'Flicker', 0, 1, 0.05),
      num('fade', 'Fade', 0, 1, 0.05),
    ],
  },
  slice: {
    label: 'Slice reveal',
    hint: 'The layer arrives in strips. Alternate bands slide in from opposite sides.',
    kind: 'reveal',
    defaults: {
      type: 'slice', bands: 10, direction: 'horizontal',
      order: 'sequential', travel: 60, stagger: 0.5,
      window: { ...DEFAULT_FX_WINDOW },
    },
    fields: [
      num('bands', 'Bands', 1, 40),
      select('direction', 'Direction', [
        { value: 'horizontal', label: 'Horizontal' },
        { value: 'vertical', label: 'Vertical' },
      ]),
      select('order', 'Order', [
        { value: 'sequential', label: 'Sequential' },
        { value: 'center-out', label: 'Centre out' },
        { value: 'random', label: 'Random' },
      ]),
      num('travel', 'Travel', 0, 400, 5),
      num('stagger', 'Stagger', 0, 0.95, 0.05),
    ],
  },
  wipe: {
    label: 'Wipe reveal',
    hint: 'A soft edge sweeps across. Linear, iris, or barn doors.',
    kind: 'reveal',
    defaults: { type: 'wipe', shape: 'linear', angle: 0, softness: 40, window: { ...DEFAULT_FX_WINDOW } },
    fields: [
      select('shape', 'Shape', [
        { value: 'linear', label: 'Linear' },
        { value: 'iris', label: 'Iris' },
        { value: 'barn', label: 'Barn doors' },
      ]),
      num('angle', 'Angle', 0, 360, 5),
      num('softness', 'Softness', 0, 300, 5),
    ],
  },
  glitch: {
    label: 'Glitch blocks',
    hint: 'Horizontal strips tear sideways on random frames, with rgb fringing.',
    kind: 'continuous',
    defaults: { type: 'glitch', bands: 12, maxOffset: 30, channelShift: 6, probability: 0.25 },
    fields: [
      num('bands', 'Bands', 1, 60),
      num('maxOffset', 'Max offset', 0, 200),
      num('channelShift', 'Channel shift', 0, 40),
      num('probability', 'Frequency', 0, 1, 0.05),
    ],
  },
};

export const SCENE_FX_SPECS: Record<SceneFxType, FxSpec<SceneFxDef>> = {
  grain: {
    label: 'Film grain',
    hint: 'Animated noise over the whole frame.',
    kind: 'continuous',
    defaults: { type: 'grain', amount: 0.15, scale: 2 },
    fields: [
      num('amount', 'Amount', 0, 1, 0.01),
      num('scale', 'Grain size', 1, 8),
    ],
  },
  vignette: {
    label: 'Vignette',
    hint: 'Darkened corners that pull the eye to the centre.',
    kind: 'continuous',
    defaults: { type: 'vignette', amount: 0.5, radius: 0.45 },
    fields: [
      num('amount', 'Amount', 0, 1, 0.05),
      num('radius', 'Start', 0, 1, 0.05),
    ],
  },
  scanlines: {
    label: 'Scanlines',
    hint: 'CRT lines, with an optional vertical roll.',
    kind: 'continuous',
    defaults: { type: 'scanlines', amount: 0.25, spacing: 4, rollSpeed: 0 },
    fields: [
      num('amount', 'Amount', 0, 1, 0.05),
      num('spacing', 'Spacing', 2, 20),
      num('rollSpeed', 'Roll', -4, 4, 0.25),
    ],
  },
  shake: {
    label: 'Camera shake',
    hint: 'Jitters the whole frame; decays to still if you set a decay.',
    kind: 'continuous',
    defaults: { type: 'shake', amplitude: 8, frequency: 12, decayFrames: 0 },
    fields: [
      num('amplitude', 'Amplitude', 0, 80),
      num('frequency', 'Frequency', 1, 40),
      num('decayFrames', 'Decay', 0, 300, 5),
    ],
  },
};

export const LAYER_FX_TYPES = Object.keys(LAYER_FX_SPECS) as LayerFxType[];
export const SCENE_FX_TYPES = Object.keys(SCENE_FX_SPECS) as SceneFxType[];
