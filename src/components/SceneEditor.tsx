import type { Scene, AnimationType } from '../types';

const ANIMATION_TYPES: AnimationType[] = [
  'none',
  'fade-in',
  'slide-up',
  'slide-left',
  'typewriter',
];

interface SceneEditorProps {
  scene: Scene;
  onChange: (scene: Scene) => void;
}

export function SceneEditor({ scene, onChange }: SceneEditorProps) {
  const layer = scene.textLayers[0];

  function updateLayer(patch: Record<string, unknown>) {
    const updated = { ...layer, ...patch };
    onChange({ ...scene, textLayers: [updated, ...scene.textLayers.slice(1)] });
  }

  return (
    <div className="scene-editor">
      <h3>{scene.label}</h3>

      <label>
        Text
        <input
          type="text"
          value={layer?.content ?? ''}
          onChange={(e) => updateLayer({ content: e.target.value })}
        />
      </label>

      <label>
        Font Size
        <input
          type="range"
          min={12}
          max={120}
          value={layer?.fontSize ?? 48}
          onChange={(e) => updateLayer({ fontSize: Number(e.target.value) })}
        />
        <span>{layer?.fontSize ?? 48}px</span>
      </label>

      <label>
        Text Color
        <input
          type="color"
          value={layer?.color ?? '#ffffff'}
          onChange={(e) => updateLayer({ color: e.target.value })}
        />
      </label>

      <label>
        Background
        <input
          type="color"
          value={scene.backgroundColor}
          onChange={(e) =>
            onChange({ ...scene, backgroundColor: e.target.value })
          }
        />
      </label>

      <label>
        Duration (seconds)
        <input
          type="number"
          min={1}
          max={30}
          step={0.5}
          value={scene.durationFrames / 30}
          onChange={(e) =>
            onChange({
              ...scene,
              durationFrames: Math.round(Number(e.target.value) * 30),
            })
          }
        />
      </label>

      <label>
        Animation
        <select
          value={layer?.animation.type ?? 'none'}
          onChange={(e) =>
            updateLayer({
              animation: {
                ...layer.animation,
                type: e.target.value as AnimationType,
              },
            })
          }
        >
          {ANIMATION_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
