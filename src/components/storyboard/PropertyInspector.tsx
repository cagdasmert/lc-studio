import { useState } from 'react';
import { useStore } from '../../store';
import type {
  Layer, TextLayerData, ShapeLayerData, ImageLayerData, VideoLayerData, SvgLayerData,
  TransitionType, BlendMode, FontWeight, LayerEffect,
  GradientDef, FillType, BackgroundType, Scene, BoxShadow, TintBlendMode,
  ClipPathDef, ClipPathType, MotionPathDef, CharAnimationType, CharAnimationDef, EasingType,
} from '../../types';
import { OUTPUT_PRESETS } from '../../lib/output-presets';
import { FontPicker } from '../shared/FontPicker';
import { pickImageFile } from '../../lib/file-utils';
import { copyAssetToProject } from '../../lib/asset-manager';

const BLEND_MODES: BlendMode[] = [
  'normal', 'multiply', 'screen', 'overlay',
  'darken', 'lighten', 'color-dodge', 'color-burn',
  'hard-light', 'soft-light', 'difference', 'exclusion',
  'hue', 'saturation', 'color', 'luminosity',
];
const TRANSITIONS: TransitionType[] = ['none', 'cut', 'fade', 'slide-left', 'slide-right', 'slide-up', 'slide-down', 'wipe-horizontal', 'wipe-vertical', 'zoom-in', 'zoom-out', 'dissolve'];
const FONT_WEIGHTS: FontWeight[] = ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900'];

function NumericField({ label, value, onChange, min, max, step = 1 }: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number;
}) {
  return (
    <label className="prop-field">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function ColorField({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <label className="prop-field">
      <span>{label}</span>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function KeyframeButton({ sceneIndex, layerId, property, frame, value }: {
  sceneIndex: number; layerId: string; property: string; frame: number; value: number;
}) {
  const composition = useStore((s) => s.composition);
  const setKeyframe = useStore((s) => s.setKeyframe);
  const removeKeyframe = useStore((s) => s.removeKeyframe);

  const scene = composition.scenes[sceneIndex];
  const layer = scene?.layers.find((l) => l.id === layerId);
  const track = layer?.keyframes[property];
  const hasKeyframe = track?.keyframes.some((k) => k.frame === frame);

  return (
    <button
      className={`keyframe-btn ${hasKeyframe ? 'active' : ''}`}
      onClick={() => {
        if (hasKeyframe) {
          removeKeyframe(sceneIndex, layerId, property, frame);
        } else {
          setKeyframe(sceneIndex, layerId, property, frame, value);
        }
      }}
      title={hasKeyframe ? 'Remove keyframe' : 'Add keyframe'}
    >
      {hasKeyframe ? '\u25C6' : '\u25C7'}
    </button>
  );
}

function TransformSection({ layer, sceneIndex, frameInScene }: {
  layer: Layer; sceneIndex: number; frameInScene: number;
}) {
  const updateLayer = useStore((s) => s.updateLayer);

  const update = (patch: Partial<Layer>) => updateLayer(sceneIndex, layer.id, patch);

  return (
    <div className="prop-section">
      <h4>Transform</h4>
      <div className="prop-row">
        <NumericField label="X" value={layer.x} onChange={(v) => update({ x: v } as Partial<Layer>)} />
        <KeyframeButton sceneIndex={sceneIndex} layerId={layer.id} property="x" frame={frameInScene} value={layer.x} />
      </div>
      <div className="prop-row">
        <NumericField label="Y" value={layer.y} onChange={(v) => update({ y: v } as Partial<Layer>)} />
        <KeyframeButton sceneIndex={sceneIndex} layerId={layer.id} property="y" frame={frameInScene} value={layer.y} />
      </div>
      <div className="prop-row">
        <NumericField label="W" value={layer.width} onChange={(v) => update({ width: v } as Partial<Layer>)} min={1} />
        <NumericField label="H" value={layer.height} onChange={(v) => update({ height: v } as Partial<Layer>)} min={1} />
      </div>
      <div className="prop-row">
        <NumericField label="Rotation" value={layer.rotation} onChange={(v) => update({ rotation: v } as Partial<Layer>)} />
        <KeyframeButton sceneIndex={sceneIndex} layerId={layer.id} property="rotation" frame={frameInScene} value={layer.rotation} />
      </div>
      <div className="prop-row">
        <NumericField label="Scale X" value={layer.scaleX} onChange={(v) => update({ scaleX: v } as Partial<Layer>)} step={0.1} />
        <NumericField label="Scale Y" value={layer.scaleY} onChange={(v) => update({ scaleY: v } as Partial<Layer>)} step={0.1} />
      </div>
      <div className="prop-row">
        <NumericField label="Skew X" value={layer.skewX ?? 0} onChange={(v) => update({ skewX: v } as Partial<Layer>)} step={1} />
        <NumericField label="Skew Y" value={layer.skewY ?? 0} onChange={(v) => update({ skewY: v } as Partial<Layer>)} step={1} />
      </div>
      <div className="prop-row">
        <NumericField label="Opacity" value={layer.opacity} onChange={(v) => update({ opacity: v } as Partial<Layer>)} min={0} max={1} step={0.05} />
        <KeyframeButton sceneIndex={sceneIndex} layerId={layer.id} property="opacity" frame={frameInScene} value={layer.opacity} />
      </div>
      <label className="prop-field">
        <span>Blend</span>
        <select value={layer.blendMode} onChange={(e) => update({ blendMode: e.target.value as BlendMode } as Partial<Layer>)}>
          {BLEND_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </label>
    </div>
  );
}

const DEFAULT_LINEAR_GRADIENT: GradientDef = {
  type: 'linear', angle: 90,
  stops: [{ offset: 0, color: '#e94560' }, { offset: 1, color: '#0f3460' }],
};
const DEFAULT_RADIAL_GRADIENT: GradientDef = {
  type: 'radial', centerX: 0.5, centerY: 0.5, radius: 0.7,
  stops: [{ offset: 0, color: '#e94560' }, { offset: 1, color: '#0f3460' }],
};

function GradientControls({ gradient, onChange }: {
  gradient: GradientDef; onChange: (g: GradientDef) => void;
}) {
  const stops = gradient.stops;
  const setStop = (i: number, color: string) => {
    const next = [...stops];
    next[i] = { ...next[i], color };
    onChange({ ...gradient, stops: next } as GradientDef);
  };

  return (
    <div className="gradient-controls">
      {gradient.type === 'linear' && (
        <NumericField label="Angle" value={gradient.angle} onChange={(v) => onChange({ ...gradient, angle: v })} min={0} max={360} step={5} />
      )}
      {gradient.type === 'radial' && (
        <>
          <NumericField label="Center X" value={gradient.centerX} onChange={(v) => onChange({ ...gradient, centerX: v })} min={0} max={1} step={0.05} />
          <NumericField label="Center Y" value={gradient.centerY} onChange={(v) => onChange({ ...gradient, centerY: v })} min={0} max={1} step={0.05} />
          <NumericField label="Radius" value={gradient.radius} onChange={(v) => onChange({ ...gradient, radius: v })} min={0.05} max={2} step={0.05} />
        </>
      )}
      <div className="gradient-stops">
        <ColorField label="Start" value={stops[0]?.color ?? '#000000'} onChange={(c) => setStop(0, c)} />
        <ColorField label="End" value={stops[1]?.color ?? '#ffffff'} onChange={(c) => setStop(1, c)} />
      </div>
    </div>
  );
}

function TextSection({ layer, sceneIndex }: { layer: TextLayerData; sceneIndex: number }) {
  const updateLayer = useStore((s) => s.updateLayer);
  const projectPath = useStore((s) => s.projectPath);
  const update = (patch: Partial<TextLayerData>) => updateLayer(sceneIndex, layer.id, patch as Partial<Layer>);
  const [fontPickerOpen, setFontPickerOpen] = useState(false);

  return (
    <div className="prop-section">
      <h4>Text</h4>
      <label className="prop-field">
        <span>Content</span>
        <textarea
          value={layer.content}
          onChange={(e) => update({ content: e.target.value })}
          rows={3}
        />
      </label>
      <NumericField label="Font Size" value={layer.fontSize} onChange={(v) => update({ fontSize: v })} min={8} max={200} />
      <label className="prop-field">
        <span>Font</span>
        <button
          className="font-family-trigger"
          style={{ fontFamily: layer.fontFamily }}
          onClick={() => setFontPickerOpen(true)}
          title="Click to pick a font"
        >
          {layer.fontFamily}
        </button>
      </label>
      {fontPickerOpen && (
        <FontPicker
          value={layer.fontFamily}
          projectDir={projectPath}
          onSelect={(family) => update({ fontFamily: family })}
          onClose={() => setFontPickerOpen(false)}
        />
      )}
      <label className="prop-field">
        <span>Weight</span>
        <select value={layer.fontWeight} onChange={(e) => update({ fontWeight: e.target.value as FontWeight })}>
          {FONT_WEIGHTS.map((w) => <option key={w} value={w}>{w}</option>)}
        </select>
      </label>
      <label className="prop-field">
        <span>Fill</span>
        <select value={layer.fillType ?? 'solid'} onChange={(e) => {
          const ft = e.target.value as FillType;
          const patch: Partial<TextLayerData> = { fillType: ft };
          if (ft !== 'solid' && !layer.fillGradient) {
            patch.fillGradient = ft === 'linear-gradient' ? { ...DEFAULT_LINEAR_GRADIENT } : { ...DEFAULT_RADIAL_GRADIENT };
          }
          if (ft !== 'solid' && layer.fillGradient && layer.fillGradient.type !== (ft === 'linear-gradient' ? 'linear' : 'radial')) {
            patch.fillGradient = ft === 'linear-gradient'
              ? { ...DEFAULT_LINEAR_GRADIENT, stops: layer.fillGradient.stops }
              : { ...DEFAULT_RADIAL_GRADIENT, stops: layer.fillGradient.stops };
          }
          update(patch);
        }}>
          <option value="solid">Solid</option>
          <option value="linear-gradient">Linear Gradient</option>
          <option value="radial-gradient">Radial Gradient</option>
        </select>
      </label>
      {(layer.fillType ?? 'solid') === 'solid' && (
        <ColorField label="Color" value={layer.color} onChange={(v) => update({ color: v })} />
      )}
      {(layer.fillType ?? 'solid') !== 'solid' && layer.fillGradient && (
        <GradientControls gradient={layer.fillGradient} onChange={(g) => update({ fillGradient: g })} />
      )}
      <label className="prop-field">
        <span>Align</span>
        <select value={layer.align} onChange={(e) => update({ align: e.target.value as TextLayerData['align'] })}>
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </label>
      <NumericField label="Line Height" value={layer.lineHeight} onChange={(v) => update({ lineHeight: v })} min={0.5} max={3} step={0.1} />
      <NumericField label="Letter Spacing" value={layer.letterSpacing} onChange={(v) => update({ letterSpacing: v })} step={0.5} />
      <NumericField label="Max Width" value={layer.maxWidth} onChange={(v) => update({ maxWidth: v })} min={0} />
    </div>
  );
}

function ShapeSection({ layer, sceneIndex }: { layer: ShapeLayerData; sceneIndex: number }) {
  const updateLayer = useStore((s) => s.updateLayer);
  const update = (patch: Partial<ShapeLayerData>) => updateLayer(sceneIndex, layer.id, patch as Partial<Layer>);

  const fillType = layer.fillType ?? 'solid';

  function setFillType(ft: FillType) {
    const patch: Partial<ShapeLayerData> = { fillType: ft };
    if (ft !== 'solid' && !layer.fillGradient) {
      patch.fillGradient = ft === 'linear-gradient' ? { ...DEFAULT_LINEAR_GRADIENT } : { ...DEFAULT_RADIAL_GRADIENT };
    }
    if (ft !== 'solid' && layer.fillGradient && layer.fillGradient.type !== (ft === 'linear-gradient' ? 'linear' : 'radial')) {
      patch.fillGradient = ft === 'linear-gradient'
        ? { ...DEFAULT_LINEAR_GRADIENT, stops: layer.fillGradient.stops }
        : { ...DEFAULT_RADIAL_GRADIENT, stops: layer.fillGradient.stops };
    }
    update(patch);
  }

  return (
    <div className="prop-section">
      <h4>Shape</h4>
      <label className="prop-field">
        <span>Type</span>
        <select value={layer.shapeType} onChange={(e) => update({ shapeType: e.target.value as ShapeLayerData['shapeType'] })}>
          <option value="rect">Rectangle</option>
          <option value="rounded-rect">Rounded Rect</option>
          <option value="circle">Circle</option>
          <option value="ellipse">Ellipse</option>
          <option value="triangle">Triangle</option>
          <option value="star">Star</option>
          <option value="polygon">Polygon</option>
          <option value="arrow">Arrow</option>
          <option value="line">Line</option>
        </select>
      </label>
      {layer.shapeType === 'polygon' && (
        <NumericField label="Sides" value={layer.polygonSides ?? 6} onChange={(v) => update({ polygonSides: v })} min={3} max={20} />
      )}
      {layer.shapeType === 'star' && (
        <>
          <NumericField label="Points" value={layer.starPoints ?? 5} onChange={(v) => update({ starPoints: v })} min={3} max={20} />
          <NumericField label="Inner R" value={layer.starInnerRadius ?? 0.4} onChange={(v) => update({ starInnerRadius: v })} min={0.1} max={0.9} step={0.05} />
        </>
      )}
      <label className="prop-field">
        <span>Fill</span>
        <select value={fillType} onChange={(e) => setFillType(e.target.value as FillType)}>
          <option value="solid">Solid</option>
          <option value="linear-gradient">Linear Gradient</option>
          <option value="radial-gradient">Radial Gradient</option>
        </select>
      </label>
      {fillType === 'solid' && (
        <ColorField label="Color" value={layer.fill} onChange={(v) => update({ fill: v })} />
      )}
      {fillType !== 'solid' && layer.fillGradient && (
        <GradientControls gradient={layer.fillGradient} onChange={(g) => update({ fillGradient: g })} />
      )}
      <ColorField label="Stroke" value={layer.stroke || '#000000'} onChange={(v) => update({ stroke: v })} />
      <NumericField label="Stroke W" value={layer.strokeWidth} onChange={(v) => update({ strokeWidth: v })} min={0} />
      {layer.strokeWidth > 0 && (
        <label className="prop-field">
          <span>Dash</span>
          <select
            value={layer.strokeDash?.join(',') ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              update({ strokeDash: v ? v.split(',').map(Number) : undefined, strokeDashOffset: 0 });
            }}
          >
            <option value="">Solid</option>
            <option value="10,5">Dashed</option>
            <option value="3,3">Dotted</option>
            <option value="15,5,3,5">Dash-dot</option>
            <option value="20,10">Long dash</option>
          </select>
        </label>
      )}
      {(layer.shapeType === 'rounded-rect') && (
        <NumericField label="Corner R" value={layer.cornerRadius} onChange={(v) => update({ cornerRadius: v })} min={0} />
      )}
    </div>
  );
}

function ImageSection({ layer, sceneIndex }: { layer: ImageLayerData; sceneIndex: number }) {
  const updateLayer = useStore((s) => s.updateLayer);
  const projectPath = useStore((s) => s.projectPath);
  const update = (patch: Partial<ImageLayerData>) => updateLayer(sceneIndex, layer.id, patch as Partial<Layer>);

  async function handleBrowse() {
    const path = await pickImageFile();
    if (!path) return;
    let src = path;
    if (projectPath) {
      src = await copyAssetToProject(path, projectPath);
    }
    update({ src });
  }

  return (
    <div className="prop-section">
      <h4>Image</h4>
      <label className="prop-field">
        <span>Source</span>
        <input type="text" value={layer.src} onChange={(e) => update({ src: e.target.value })} placeholder="Image URL or path" />
      </label>
      <button className="prop-browse-btn" onClick={handleBrowse}>Browse...</button>
      <label className="prop-field">
        <span>Fit</span>
        <select value={layer.fitMode} onChange={(e) => update({ fitMode: e.target.value as ImageLayerData['fitMode'] })}>
          <option value="cover">Cover</option>
          <option value="contain">Contain</option>
          <option value="fill">Fill</option>
          <option value="none">None</option>
        </select>
      </label>
      <NumericField label="Border R" value={layer.borderRadius} onChange={(v) => update({ borderRadius: v })} min={0} />
      <label className="prop-field">
        <span>Tint</span>
        <input
          type="color"
          value={layer.tintColor ?? '#000000'}
          onChange={(e) => update({ tintColor: e.target.value })}
        />
        <label className="prop-checkbox">
          <input
            type="checkbox"
            checked={!!layer.tintColor}
            onChange={(e) => update({ tintColor: e.target.checked ? '#e94560' : null })}
          />
          <span>On</span>
        </label>
      </label>
      {layer.tintColor && (
        <label className="prop-field">
          <span>Tint Mode</span>
          <select value={layer.tintBlend ?? 'multiply'} onChange={(e) => update({ tintBlend: e.target.value as TintBlendMode })}>
            <option value="multiply">Multiply</option>
            <option value="screen">Screen</option>
            <option value="overlay">Overlay</option>
            <option value="color">Color</option>
          </select>
        </label>
      )}
    </div>
  );
}

function VideoSection({ layer, sceneIndex }: { layer: VideoLayerData; sceneIndex: number }) {
  const updateLayer = useStore((s) => s.updateLayer);
  const update = (patch: Partial<VideoLayerData>) => updateLayer(sceneIndex, layer.id, patch as Partial<Layer>);

  return (
    <div className="prop-section">
      <h4>Video</h4>
      <label className="prop-field">
        <span>Source</span>
        <input type="text" value={layer.src} onChange={(e) => update({ src: e.target.value })} placeholder="Video URL or path" />
      </label>
      <NumericField label="Start (s)" value={layer.startTime} onChange={(v) => update({ startTime: v })} min={0} step={0.1} />
      <NumericField label="End (s)" value={layer.endTime} onChange={(v) => update({ endTime: v })} min={0} step={0.1} />
      <NumericField label="Speed" value={layer.playbackRate} onChange={(v) => update({ playbackRate: v })} min={0.1} max={4} step={0.1} />
      <label className="prop-field">
        <span>Muted</span>
        <input type="checkbox" checked={layer.muted} onChange={(e) => update({ muted: e.target.checked })} />
      </label>
    </div>
  );
}

const EFFECT_TYPES: LayerEffect['type'][] = [
  'blur', 'brightness', 'contrast', 'saturate', 'grayscale', 'sepia', 'hue-rotate', 'invert',
];

const EFFECT_DEFAULTS: Record<string, number> = {
  blur: 5, brightness: 1.5, contrast: 1.5, saturate: 2, grayscale: 1, sepia: 1, 'hue-rotate': 90, invert: 1,
};

const EFFECT_RANGES: Record<string, { min: number; max: number; step: number }> = {
  blur: { min: 0, max: 50, step: 1 },
  brightness: { min: 0, max: 3, step: 0.05 },
  contrast: { min: 0, max: 3, step: 0.05 },
  saturate: { min: 0, max: 3, step: 0.05 },
  grayscale: { min: 0, max: 1, step: 0.05 },
  sepia: { min: 0, max: 1, step: 0.05 },
  'hue-rotate': { min: 0, max: 360, step: 5 },
  invert: { min: 0, max: 1, step: 0.05 },
};

function EffectsSection({ layer, sceneIndex }: { layer: Layer; sceneIndex: number }) {
  const updateLayer = useStore((s) => s.updateLayer);

  function addEffect(type: LayerEffect['type']) {
    const effects = [...layer.effects, { type, value: EFFECT_DEFAULTS[type] ?? 0 }];
    updateLayer(sceneIndex, layer.id, { effects } as Partial<Layer>);
  }

  function updateEffect(index: number, value: number) {
    const effects = [...layer.effects];
    effects[index] = { ...effects[index], value };
    updateLayer(sceneIndex, layer.id, { effects } as Partial<Layer>);
  }

  function removeEffect(index: number) {
    const effects = layer.effects.filter((_, i) => i !== index);
    updateLayer(sceneIndex, layer.id, { effects } as Partial<Layer>);
  }

  function moveEffect(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= layer.effects.length) return;
    const effects = [...layer.effects];
    [effects[index], effects[target]] = [effects[target], effects[index]];
    updateLayer(sceneIndex, layer.id, { effects } as Partial<Layer>);
  }

  return (
    <div className="prop-section">
      <h4>Effects</h4>
      {layer.effects.map((effect, i) => {
        const range = EFFECT_RANGES[effect.type] || { min: 0, max: 100, step: 1 };
        return (
          <div key={i} className="effect-row">
            <span className="effect-label">{effect.type}</span>
            <input
              type="range"
              min={range.min}
              max={range.max}
              step={range.step}
              value={effect.value as number}
              onChange={(e) => updateEffect(i, Number(e.target.value))}
              className="effect-slider"
            />
            <span className="effect-value">{Number(effect.value).toFixed(1)}</span>
            <button className="effect-move-btn" onClick={() => moveEffect(i, -1)} title="Move up">&uarr;</button>
            <button className="effect-move-btn" onClick={() => moveEffect(i, 1)} title="Move down">&darr;</button>
            <button className="effect-remove-btn" onClick={() => removeEffect(i)} title="Remove">x</button>
          </div>
        );
      })}
      <select
        className="effect-add-select"
        value=""
        onChange={(e) => {
          if (e.target.value) {
            addEffect(e.target.value as LayerEffect['type']);
            e.target.value = '';
          }
        }}
      >
        <option value="">+ Add effect...</option>
        {EFFECT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
    </div>
  );
}

const DEFAULT_BOX_SHADOW: BoxShadow = { color: 'rgba(0,0,0,0.5)', blur: 10, offsetX: 4, offsetY: 4, spread: 0 };

function BoxShadowSection({ layer, sceneIndex }: { layer: Layer; sceneIndex: number }) {
  const updateLayer = useStore((s) => s.updateLayer);
  const shadow = layer.boxShadow;
  const enabled = !!shadow;

  function toggle() {
    updateLayer(sceneIndex, layer.id, {
      boxShadow: enabled ? null : { ...DEFAULT_BOX_SHADOW },
    } as Partial<Layer>);
  }

  function updateShadow(patch: Partial<BoxShadow>) {
    updateLayer(sceneIndex, layer.id, {
      boxShadow: { ...(shadow ?? DEFAULT_BOX_SHADOW), ...patch },
    } as Partial<Layer>);
  }

  return (
    <div className="prop-section">
      <h4>
        Box Shadow
        <label className="prop-checkbox section-toggle">
          <input type="checkbox" checked={enabled} onChange={toggle} />
          <span>{enabled ? 'On' : 'Off'}</span>
        </label>
      </h4>
      {enabled && shadow && (
        <>
          <ColorField label="Color" value={shadow.color.startsWith('rgba') ? '#000000' : shadow.color} onChange={(v) => updateShadow({ color: v })} />
          <NumericField label="Blur" value={shadow.blur} onChange={(v) => updateShadow({ blur: v })} min={0} max={100} />
          <NumericField label="Spread" value={shadow.spread} onChange={(v) => updateShadow({ spread: v })} min={0} max={50} />
          <div className="prop-row">
            <NumericField label="Off X" value={shadow.offsetX} onChange={(v) => updateShadow({ offsetX: v })} />
            <NumericField label="Off Y" value={shadow.offsetY} onChange={(v) => updateShadow({ offsetY: v })} />
          </div>
        </>
      )}
    </div>
  );
}

// ── Clip Path ─────────────────────────────────────────

const CLIP_PATH_TYPES: ClipPathType[] = ['none', 'rect', 'circle', 'ellipse', 'polygon'];

function ClipPathSection({ layer, sceneIndex }: { layer: Layer; sceneIndex: number }) {
  const updateLayer = useStore((s) => s.updateLayer);
  const clip = layer.clipPath;
  const clipType: ClipPathType = clip?.type ?? 'none';

  function setClipType(t: ClipPathType) {
    if (t === 'none') {
      updateLayer(sceneIndex, layer.id, { clipPath: null } as Partial<Layer>);
      return;
    }
    let def: ClipPathDef;
    switch (t) {
      case 'rect': def = { type: 'rect', inset: 10, borderRadius: 0 }; break;
      case 'circle': def = { type: 'circle', radius: 0.4, cx: 0.5, cy: 0.5 }; break;
      case 'ellipse': def = { type: 'ellipse', rx: 0.4, ry: 0.3, cx: 0.5, cy: 0.5 }; break;
      case 'polygon': def = { type: 'polygon', points: [[0.5, 0], [1, 1], [0, 1]] }; break;
      default: def = { type: 'rect', inset: 10 }; break;
    }
    updateLayer(sceneIndex, layer.id, { clipPath: def } as Partial<Layer>);
  }

  function updateClip(patch: Partial<ClipPathDef>) {
    updateLayer(sceneIndex, layer.id, { clipPath: { ...clip!, ...patch } } as Partial<Layer>);
  }

  return (
    <div className="prop-section">
      <h4>Clip Path</h4>
      <label className="prop-field">
        <span>Type</span>
        <select value={clipType} onChange={(e) => setClipType(e.target.value as ClipPathType)}>
          {CLIP_PATH_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      {clip?.type === 'rect' && (
        <>
          <NumericField label="Inset" value={clip.inset} onChange={(v) => updateClip({ inset: v })} min={0} />
          <NumericField label="Radius" value={clip.borderRadius ?? 0} onChange={(v) => updateClip({ borderRadius: v })} min={0} />
        </>
      )}
      {clip?.type === 'circle' && (
        <>
          <NumericField label="Radius" value={clip.radius} onChange={(v) => updateClip({ radius: v })} min={0.01} max={1} step={0.05} />
          <div className="prop-row">
            <NumericField label="CX" value={clip.cx} onChange={(v) => updateClip({ cx: v })} min={0} max={1} step={0.05} />
            <NumericField label="CY" value={clip.cy} onChange={(v) => updateClip({ cy: v })} min={0} max={1} step={0.05} />
          </div>
        </>
      )}
      {clip?.type === 'ellipse' && (
        <>
          <div className="prop-row">
            <NumericField label="RX" value={clip.rx} onChange={(v) => updateClip({ rx: v })} min={0.01} max={1} step={0.05} />
            <NumericField label="RY" value={clip.ry} onChange={(v) => updateClip({ ry: v })} min={0.01} max={1} step={0.05} />
          </div>
          <div className="prop-row">
            <NumericField label="CX" value={clip.cx} onChange={(v) => updateClip({ cx: v })} min={0} max={1} step={0.05} />
            <NumericField label="CY" value={clip.cy} onChange={(v) => updateClip({ cy: v })} min={0} max={1} step={0.05} />
          </div>
        </>
      )}
      {clip?.type === 'polygon' && (
        <p className="prop-hint">Triangle clip (edit points in code)</p>
      )}
    </div>
  );
}

// ── Motion Path ───────────────────────────────────────

function MotionPathSection({ layer, sceneIndex }: { layer: Layer; sceneIndex: number }) {
  const updateLayer = useStore((s) => s.updateLayer);
  const mp = layer.motionPath;
  const enabled = !!(mp && mp.points.length >= 2);

  function toggle() {
    if (enabled) {
      updateLayer(sceneIndex, layer.id, { motionPath: null } as Partial<Layer>);
    } else {
      // Default: simple line from current pos to offset pos
      const def: MotionPathDef = {
        points: [
          { x: layer.x, y: layer.y },
          { x: layer.x + 200, y: layer.y },
        ],
        alignToPath: false,
        loop: false,
      };
      updateLayer(sceneIndex, layer.id, { motionPath: def } as Partial<Layer>);
    }
  }

  function updateMP(patch: Partial<MotionPathDef>) {
    updateLayer(sceneIndex, layer.id, { motionPath: { ...mp!, ...patch } } as Partial<Layer>);
  }

  return (
    <div className="prop-section">
      <h4>
        Motion Path
        <label className="prop-checkbox section-toggle">
          <input type="checkbox" checked={enabled} onChange={toggle} />
          <span>{enabled ? 'On' : 'Off'}</span>
        </label>
      </h4>
      {enabled && mp && (
        <>
          <label className="prop-checkbox">
            <input type="checkbox" checked={mp.alignToPath ?? false} onChange={(e) => updateMP({ alignToPath: e.target.checked })} />
            <span>Align to path</span>
          </label>
          <label className="prop-checkbox">
            <input type="checkbox" checked={mp.loop ?? false} onChange={(e) => updateMP({ loop: e.target.checked })} />
            <span>Loop</span>
          </label>
          <p className="prop-hint">{mp.points.length} points defined</p>
        </>
      )}
    </div>
  );
}

// ── Character Animation (text only) ───────────────────

const CHAR_ANIM_TYPES: CharAnimationType[] = ['none', 'fade-in', 'slide-up', 'slide-down', 'scale-in', 'rotate-in', 'typewriter'];
const CHAR_ANIM_EASINGS: EasingType[] = ['linear', 'ease-out', 'ease-in', 'ease-in-out', 'ease-out-cubic', 'ease-out-bounce', 'ease-out-elastic'];

function CharAnimationSection({ layer, sceneIndex }: { layer: TextLayerData; sceneIndex: number }) {
  const updateLayer = useStore((s) => s.updateLayer);
  const anim = layer.charAnimation;
  const animType = anim?.type ?? 'none';

  function setAnimType(t: CharAnimationType) {
    if (t === 'none') {
      updateLayer(sceneIndex, layer.id, { charAnimation: null } as Partial<Layer>);
      return;
    }
    const def: CharAnimationDef = {
      type: t,
      staggerFrames: anim?.staggerFrames ?? 2,
      durationFrames: anim?.durationFrames ?? 10,
      easing: anim?.easing ?? 'ease-out',
    };
    updateLayer(sceneIndex, layer.id, { charAnimation: def } as Partial<Layer>);
  }

  function updateAnim(patch: Partial<CharAnimationDef>) {
    updateLayer(sceneIndex, layer.id, { charAnimation: { ...anim!, ...patch } } as Partial<Layer>);
  }

  return (
    <div className="prop-section">
      <h4>Character Animation</h4>
      <label className="prop-field">
        <span>Type</span>
        <select value={animType} onChange={(e) => setAnimType(e.target.value as CharAnimationType)}>
          {CHAR_ANIM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      {animType !== 'none' && anim && (
        <>
          <NumericField label="Stagger" value={anim.staggerFrames} onChange={(v) => updateAnim({ staggerFrames: v })} min={1} max={30} />
          <NumericField label="Duration" value={anim.durationFrames} onChange={(v) => updateAnim({ durationFrames: v })} min={1} max={60} />
          <label className="prop-field">
            <span>Easing</span>
            <select value={anim.easing ?? 'ease-out'} onChange={(e) => updateAnim({ easing: e.target.value as EasingType })}>
              {CHAR_ANIM_EASINGS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        </>
      )}
    </div>
  );
}

// ── SVG Layer ─────────────────────────────────────────

function SvgSection({ layer, sceneIndex }: { layer: SvgLayerData; sceneIndex: number }) {
  const updateLayer = useStore((s) => s.updateLayer);
  const update = (patch: Partial<SvgLayerData>) => updateLayer(sceneIndex, layer.id, patch as Partial<Layer>);

  return (
    <div className="prop-section">
      <h4>SVG</h4>
      <label className="prop-field">
        <span>Content</span>
        <textarea
          value={layer.content}
          onChange={(e) => update({ content: e.target.value })}
          rows={5}
          className="svg-content-input"
          placeholder="<svg>...</svg> or SVG path markup"
        />
      </label>
      <label className="prop-field">
        <span>ViewBox</span>
        <input
          type="text"
          value={layer.viewBox ?? ''}
          onChange={(e) => update({ viewBox: e.target.value || undefined })}
          placeholder="0 0 100 100"
        />
      </label>
      <ColorField label="Fill Override" value={layer.fillColor ?? '#000000'} onChange={(v) => update({ fillColor: v })} />
      <label className="prop-checkbox">
        <input
          type="checkbox"
          checked={!!layer.fillColor}
          onChange={(e) => update({ fillColor: e.target.checked ? '#ffffff' : undefined })}
        />
        <span>Override fill</span>
      </label>
      <ColorField label="Stroke Override" value={layer.strokeColor ?? '#000000'} onChange={(v) => update({ strokeColor: v })} />
      <label className="prop-checkbox">
        <input
          type="checkbox"
          checked={!!layer.strokeColor}
          onChange={(e) => update({ strokeColor: e.target.checked ? '#ffffff' : undefined })}
        />
        <span>Override stroke</span>
      </label>
    </div>
  );
}

const BG_TYPES: BackgroundType[] = ['solid', 'linear-gradient', 'radial-gradient', 'image'];

function SceneSection({ scene, sceneIndex, fps }: { scene: Scene; sceneIndex: number; fps: number }) {
  const updateScene = useStore((s) => s.updateScene);
  const projectPath = useStore((s) => s.projectPath);

  const bgType = scene.backgroundType ?? 'solid';

  function setBgType(t: BackgroundType) {
    const patch: Partial<Scene> = { backgroundType: t };
    if ((t === 'linear-gradient' || t === 'radial-gradient') && !scene.backgroundGradient) {
      patch.backgroundGradient = t === 'linear-gradient' ? { ...DEFAULT_LINEAR_GRADIENT } : { ...DEFAULT_RADIAL_GRADIENT };
    }
    if (t === 'linear-gradient' && scene.backgroundGradient?.type === 'radial') {
      patch.backgroundGradient = { ...DEFAULT_LINEAR_GRADIENT, stops: scene.backgroundGradient.stops };
    }
    if (t === 'radial-gradient' && scene.backgroundGradient?.type === 'linear') {
      patch.backgroundGradient = { ...DEFAULT_RADIAL_GRADIENT, stops: scene.backgroundGradient.stops };
    }
    updateScene(sceneIndex, patch);
  }

  async function handleBgImageBrowse() {
    const path = await pickImageFile();
    if (!path) return;
    let src = path;
    if (projectPath) {
      src = await copyAssetToProject(path, projectPath);
    }
    updateScene(sceneIndex, { backgroundImage: src, backgroundType: 'image' });
  }

  return (
    <div className="prop-section">
      <h4>Scene: {scene.label}</h4>
      <label className="prop-field">
        <span>Label</span>
        <input
          type="text"
          value={scene.label}
          onChange={(e) => updateScene(sceneIndex, { label: e.target.value })}
        />
      </label>

      <label className="prop-field">
        <span>Background</span>
        <select value={bgType} onChange={(e) => setBgType(e.target.value as BackgroundType)}>
          {BG_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>

      {bgType === 'solid' && (
        <ColorField
          label="Color"
          value={scene.backgroundColor}
          onChange={(v) => updateScene(sceneIndex, { backgroundColor: v })}
        />
      )}

      {(bgType === 'linear-gradient' || bgType === 'radial-gradient') && scene.backgroundGradient && (
        <GradientControls
          gradient={scene.backgroundGradient}
          onChange={(g) => updateScene(sceneIndex, { backgroundGradient: g })}
        />
      )}

      {bgType === 'image' && (
        <>
          <ColorField
            label="Fallback"
            value={scene.backgroundColor}
            onChange={(v) => updateScene(sceneIndex, { backgroundColor: v })}
          />
          <label className="prop-field">
            <span>Image</span>
            <input
              type="text"
              value={scene.backgroundImage ?? ''}
              onChange={(e) => updateScene(sceneIndex, { backgroundImage: e.target.value })}
              placeholder="Image path or URL"
            />
          </label>
          <button className="prop-browse-btn" onClick={handleBgImageBrowse}>Browse...</button>
          <label className="prop-field">
            <span>Fit</span>
            <select
              value={scene.backgroundImageFit ?? 'cover'}
              onChange={(e) => updateScene(sceneIndex, { backgroundImageFit: e.target.value as Scene['backgroundImageFit'] })}
            >
              <option value="cover">Cover</option>
              <option value="contain">Contain</option>
              <option value="fill">Fill</option>
              <option value="none">None</option>
            </select>
          </label>
        </>
      )}

      <NumericField
        label="Duration (s)"
        value={scene.durationFrames / fps}
        onChange={(v) => updateScene(sceneIndex, { durationFrames: Math.round(v * fps) })}
        min={0.5}
        step={0.5}
      />
      <label className="prop-field">
        <span>Transition</span>
        <select
          value={scene.transition}
          onChange={(e) => updateScene(sceneIndex, { transition: e.target.value as TransitionType })}
        >
          {TRANSITIONS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      {scene.transition !== 'none' && scene.transition !== 'cut' && (
        <NumericField
          label="Trans. Frames"
          value={scene.transitionDurationFrames}
          onChange={(v) => updateScene(sceneIndex, { transitionDurationFrames: v })}
          min={1}
          max={scene.durationFrames}
        />
      )}
    </div>
  );
}

export function PropertyInspector() {
  const composition = useStore((s) => s.composition);
  const selectedSceneIndex = useStore((s) => s.selectedSceneIndex);
  const selectedLayerId = useStore((s) => s.selectedLayerId);
  const currentFrame = useStore((s) => s.currentFrame);
  const updateLayer = useStore((s) => s.updateLayer);
  const setComposition = useStore((s) => s.setComposition);

  const scene = composition.scenes[selectedSceneIndex];
  if (!scene) return <div className="property-inspector"><p>No scene</p></div>;

  // Frame within the current scene
  let frameOffset = 0;
  for (let i = 0; i < selectedSceneIndex; i++) {
    frameOffset += composition.scenes[i].durationFrames;
  }
  const frameInScene = currentFrame - frameOffset;

  const layer = selectedLayerId
    ? scene.layers.find((l) => l.id === selectedLayerId)
    : null;

  return (
    <div className="property-inspector">
      {/* Scene properties */}
      <SceneSection
        scene={scene}
        sceneIndex={selectedSceneIndex}
        fps={composition.output.fps}
      />

      {/* Output preset */}
      <div className="prop-section">
        <h4>Output</h4>
        <label className="prop-field">
          <span>Preset</span>
          <select
            value={composition.output.id}
            onChange={(e) => {
              const preset = OUTPUT_PRESETS.find((p) => p.id === e.target.value);
              if (preset && preset.id !== 'custom') {
                setComposition({ ...composition, output: { ...preset } });
              } else if (preset) {
                setComposition({ ...composition, output: { ...composition.output, id: 'custom', label: 'Custom' } });
              }
            }}
          >
            {OUTPUT_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        <div className="prop-row">
          <NumericField label="W" value={composition.output.width} onChange={(v) => setComposition({ ...composition, output: { ...composition.output, id: 'custom', label: 'Custom', width: v } })} min={100} />
          <NumericField label="H" value={composition.output.height} onChange={(v) => setComposition({ ...composition, output: { ...composition.output, id: 'custom', label: 'Custom', height: v } })} min={100} />
        </div>
        <NumericField label="FPS" value={composition.output.fps} onChange={(v) => setComposition({ ...composition, output: { ...composition.output, id: 'custom', label: 'Custom', fps: v } })} min={1} max={120} />
      </div>

      {/* Layer properties */}
      {layer && (
        <>
          <div className="prop-section">
            <h4>Layer: {layer.name}</h4>
            <label className="prop-field">
              <span>Name</span>
              <input
                type="text"
                value={layer.name}
                onChange={(e) => updateLayer(selectedSceneIndex, layer.id, { name: e.target.value } as Partial<Layer>)}
              />
            </label>
            <div className="prop-row">
              <NumericField label="Start" value={layer.startFrame} onChange={(v) => updateLayer(selectedSceneIndex, layer.id, { startFrame: v } as Partial<Layer>)} min={0} />
              <NumericField label="End" value={layer.endFrame} onChange={(v) => updateLayer(selectedSceneIndex, layer.id, { endFrame: v } as Partial<Layer>)} min={1} />
            </div>
          </div>

          <TransformSection layer={layer} sceneIndex={selectedSceneIndex} frameInScene={frameInScene} />

          {layer.type === 'text' && <TextSection layer={layer} sceneIndex={selectedSceneIndex} />}
          {layer.type === 'text' && <CharAnimationSection layer={layer} sceneIndex={selectedSceneIndex} />}
          {layer.type === 'shape' && <ShapeSection layer={layer} sceneIndex={selectedSceneIndex} />}
          {layer.type === 'image' && <ImageSection layer={layer} sceneIndex={selectedSceneIndex} />}
          {layer.type === 'video' && <VideoSection layer={layer} sceneIndex={selectedSceneIndex} />}
          {layer.type === 'svg' && <SvgSection layer={layer} sceneIndex={selectedSceneIndex} />}

          <EffectsSection layer={layer} sceneIndex={selectedSceneIndex} />
          <BoxShadowSection layer={layer} sceneIndex={selectedSceneIndex} />
          <ClipPathSection layer={layer} sceneIndex={selectedSceneIndex} />
          <MotionPathSection layer={layer} sceneIndex={selectedSceneIndex} />
        </>
      )}

      {!layer && (
        <p className="prop-hint">Select a layer to edit its properties</p>
      )}
    </div>
  );
}
