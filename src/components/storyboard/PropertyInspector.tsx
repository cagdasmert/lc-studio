import { useState } from 'react';
import { useStore } from '../../store';
import type {
  Layer, TextLayerData, ShapeLayerData, ImageLayerData, VideoLayerData,
  TransitionType, BlendMode, FontWeight, LayerEffect,
} from '../../types';
import { OUTPUT_PRESETS } from '../../lib/output-presets';
import { FontPicker } from '../shared/FontPicker';

const BLEND_MODES: BlendMode[] = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn'];
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
      <ColorField label="Color" value={layer.color} onChange={(v) => update({ color: v })} />
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
          <option value="line">Line</option>
        </select>
      </label>
      <ColorField label="Fill" value={layer.fill} onChange={(v) => update({ fill: v })} />
      <ColorField label="Stroke" value={layer.stroke || '#000000'} onChange={(v) => update({ stroke: v })} />
      <NumericField label="Stroke W" value={layer.strokeWidth} onChange={(v) => update({ strokeWidth: v })} min={0} />
      <NumericField label="Corner R" value={layer.cornerRadius} onChange={(v) => update({ cornerRadius: v })} min={0} />
    </div>
  );
}

function ImageSection({ layer, sceneIndex }: { layer: ImageLayerData; sceneIndex: number }) {
  const updateLayer = useStore((s) => s.updateLayer);
  const update = (patch: Partial<ImageLayerData>) => updateLayer(sceneIndex, layer.id, patch as Partial<Layer>);

  return (
    <div className="prop-section">
      <h4>Image</h4>
      <label className="prop-field">
        <span>Source</span>
        <input type="text" value={layer.src} onChange={(e) => update({ src: e.target.value })} placeholder="Image URL or path" />
      </label>
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
  'blur', 'brightness', 'contrast', 'saturate', 'grayscale', 'sepia', 'hue-rotate',
];

const EFFECT_DEFAULTS: Record<string, number> = {
  blur: 5, brightness: 1.5, contrast: 1.5, saturate: 2, grayscale: 1, sepia: 1, 'hue-rotate': 90,
};

const EFFECT_RANGES: Record<string, { min: number; max: number; step: number }> = {
  blur: { min: 0, max: 50, step: 1 },
  brightness: { min: 0, max: 3, step: 0.05 },
  contrast: { min: 0, max: 3, step: 0.05 },
  saturate: { min: 0, max: 3, step: 0.05 },
  grayscale: { min: 0, max: 1, step: 0.05 },
  sepia: { min: 0, max: 1, step: 0.05 },
  'hue-rotate': { min: 0, max: 360, step: 5 },
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

export function PropertyInspector() {
  const composition = useStore((s) => s.composition);
  const selectedSceneIndex = useStore((s) => s.selectedSceneIndex);
  const selectedLayerId = useStore((s) => s.selectedLayerId);
  const currentFrame = useStore((s) => s.currentFrame);
  const updateScene = useStore((s) => s.updateScene);
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
      <div className="prop-section">
        <h4>Scene: {scene.label}</h4>
        <label className="prop-field">
          <span>Label</span>
          <input
            type="text"
            value={scene.label}
            onChange={(e) => updateScene(selectedSceneIndex, { label: e.target.value })}
          />
        </label>
        <ColorField
          label="Background"
          value={scene.backgroundColor}
          onChange={(v) => updateScene(selectedSceneIndex, { backgroundColor: v })}
        />
        <NumericField
          label="Duration (s)"
          value={scene.durationFrames / composition.output.fps}
          onChange={(v) => updateScene(selectedSceneIndex, { durationFrames: Math.round(v * composition.output.fps) })}
          min={0.5}
          step={0.5}
        />
        <label className="prop-field">
          <span>Transition</span>
          <select
            value={scene.transition}
            onChange={(e) => updateScene(selectedSceneIndex, { transition: e.target.value as TransitionType })}
          >
            {TRANSITIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        {scene.transition !== 'none' && scene.transition !== 'cut' && (
          <NumericField
            label="Trans. Frames"
            value={scene.transitionDurationFrames}
            onChange={(v) => updateScene(selectedSceneIndex, { transitionDurationFrames: v })}
            min={1}
            max={scene.durationFrames}
          />
        )}
      </div>

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
          {layer.type === 'shape' && <ShapeSection layer={layer} sceneIndex={selectedSceneIndex} />}
          {layer.type === 'image' && <ImageSection layer={layer} sceneIndex={selectedSceneIndex} />}
          {layer.type === 'video' && <VideoSection layer={layer} sceneIndex={selectedSceneIndex} />}

          <EffectsSection layer={layer} sceneIndex={selectedSceneIndex} />
        </>
      )}

      {!layer && (
        <p className="prop-hint">Select a layer to edit its properties</p>
      )}
    </div>
  );
}
