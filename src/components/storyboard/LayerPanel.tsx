import { useState } from 'react';
import { useStore } from '../../store';
import type { Layer, TextLayerData, ShapeLayerData } from '../../types';

const LAYER_TYPE_ICONS: Record<string, string> = {
  text: 'T',
  image: 'IMG',
  shape: 'S',
  video: 'V',
  audio: 'A',
};

function createDefaultTextLayer(scene: import('../../types').Scene): TextLayerData {
  return {
    id: `text-${Date.now()}`,
    name: 'Text Layer',
    type: 'text',
    startFrame: 0,
    endFrame: scene.durationFrames,
    x: 540,
    y: 960,
    width: 800,
    height: 100,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: 1,
    anchorX: 0.5,
    anchorY: 0.5,
    zIndex: scene.layers.length,
    blendMode: 'normal',
    effects: [],
    visible: true,
    locked: false,
    keyframes: {},
    content: 'New Text',
    fontSize: 48,
    fontFamily: 'sans-serif',
    fontWeight: 'normal',
    fontStyle: 'normal',
    color: '#ffffff',
    align: 'center',
    verticalAlign: 'middle',
    lineHeight: 1.4,
    letterSpacing: 0,
    maxWidth: 0,
    textStroke: null,
    textShadow: null,
  };
}

function createDefaultShapeLayer(scene: import('../../types').Scene): ShapeLayerData {
  return {
    id: `shape-${Date.now()}`,
    name: 'Shape Layer',
    type: 'shape',
    startFrame: 0,
    endFrame: scene.durationFrames,
    x: 440,
    y: 860,
    width: 200,
    height: 200,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: 1,
    anchorX: 0.5,
    anchorY: 0.5,
    zIndex: scene.layers.length,
    blendMode: 'normal',
    effects: [],
    visible: true,
    locked: false,
    keyframes: {},
    shapeType: 'rect',
    fill: '#e94560',
    stroke: '',
    strokeWidth: 0,
    cornerRadius: 0,
  };
}

export function LayerPanel({ onAddLayer }: { onAddLayer?: () => void }) {
  const composition = useStore((s) => s.composition);
  const selectedSceneIndex = useStore((s) => s.selectedSceneIndex);
  const selectedLayerId = useStore((s) => s.selectedLayerId);
  const selectLayer = useStore((s) => s.selectLayer);
  const addLayer = useStore((s) => s.addLayer);
  const removeLayer = useStore((s) => s.removeLayer);
  const updateLayer = useStore((s) => s.updateLayer);
  const reorderLayers = useStore((s) => s.reorderLayers);

  const [dragLayerId, setDragLayerId] = useState<string | null>(null);

  const scene = composition.scenes[selectedSceneIndex];
  if (!scene) return <div className="layer-panel"><p>No scene selected</p></div>;

  const sortedLayers = [...scene.layers].sort((a, b) => b.zIndex - a.zIndex);

  function handleDragStart(e: React.DragEvent, layerId: string) {
    setDragLayerId(layerId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', layerId);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleDrop(e: React.DragEvent, targetLayerId: string) {
    e.preventDefault();
    if (!dragLayerId || dragLayerId === targetLayerId) return;
    const fromIndex = scene.layers.findIndex((l) => l.id === dragLayerId);
    const toIndex = scene.layers.findIndex((l) => l.id === targetLayerId);
    if (fromIndex >= 0 && toIndex >= 0) {
      reorderLayers(selectedSceneIndex, fromIndex, toIndex);
    }
    setDragLayerId(null);
  }

  function handleDragEnd() {
    setDragLayerId(null);
  }

  return (
    <div className="layer-panel">
      <div className="layer-panel-header">
        <span>Layers</span>
        <div className="layer-add-buttons">
          <button onClick={() => addLayer(selectedSceneIndex, createDefaultTextLayer(scene))} title="Add text layer">T+</button>
          <button onClick={() => addLayer(selectedSceneIndex, createDefaultShapeLayer(scene))} title="Add shape layer">S+</button>
          {onAddLayer && <button onClick={onAddLayer} title="Add layer (all types)">+</button>}
        </div>
      </div>

      <div className="layer-list">
        {sortedLayers.map((layer) => (
          <div
            key={layer.id}
            className={`layer-item ${layer.id === selectedLayerId ? 'selected' : ''} ${layer.locked ? 'locked' : ''} ${dragLayerId === layer.id ? 'dragging' : ''}`}
            onClick={() => !layer.locked && selectLayer(layer.id)}
            draggable={!layer.locked}
            onDragStart={(e) => handleDragStart(e, layer.id)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, layer.id)}
            onDragEnd={handleDragEnd}
          >
            <span className="layer-drag-handle">::</span>

            <button
              className={`layer-visibility ${layer.visible ? 'visible' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                updateLayer(selectedSceneIndex, layer.id, { visible: !layer.visible } as Partial<Layer>);
              }}
              title={layer.visible ? 'Hide' : 'Show'}
            >
              {layer.visible ? 'E' : '-'}
            </button>

            <button
              className={`layer-lock ${layer.locked ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                updateLayer(selectedSceneIndex, layer.id, { locked: !layer.locked } as Partial<Layer>);
              }}
              title={layer.locked ? 'Unlock' : 'Lock'}
            >
              {layer.locked ? 'L' : 'U'}
            </button>

            <span className="layer-type-icon">{LAYER_TYPE_ICONS[layer.type]}</span>
            <span className="layer-name">{layer.name}</span>

            <button
              className="layer-delete-btn"
              onClick={(e) => {
                e.stopPropagation();
                removeLayer(selectedSceneIndex, layer.id);
              }}
              title="Delete layer"
            >
              x
            </button>
          </div>
        ))}

        {scene.layers.length === 0 && (
          <p className="layer-empty">No layers. Add one above.</p>
        )}
      </div>
    </div>
  );
}
