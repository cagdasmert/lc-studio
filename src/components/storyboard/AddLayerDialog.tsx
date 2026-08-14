import { useState } from 'react';
import { useStore } from '../../store';
import type {
  TextLayerData, ImageLayerData, ShapeLayerData,
  VideoLayerData, AudioLayerData, SvgLayerData, Scene,
} from '../../types';
import { pickImageFile, pickAudioFile, pickVideoFile } from '../../lib/file-utils';
import { copyAssetToProject } from '../../lib/asset-manager';

function makeBase(scene: Scene, name: string, zIndex: number) {
  return {
    id: `layer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    startFrame: 0,
    endFrame: scene.durationFrames,
    x: 540,
    y: 960,
    width: 400,
    height: 200,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: 1,
    anchorX: 0.5,
    anchorY: 0.5,
    zIndex,
    blendMode: 'normal' as const,
    effects: [],
    visible: true,
    locked: false,
    keyframes: {},
  };
}

function createTextLayer(scene: Scene): TextLayerData {
  return {
    ...makeBase(scene, 'Text Layer', scene.layers.length),
    type: 'text',
    width: 800,
    height: 100,
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

function createShapeLayer(scene: Scene, shapeType: ShapeLayerData['shapeType'] = 'rect'): ShapeLayerData {
  return {
    ...makeBase(scene, `${shapeType.charAt(0).toUpperCase() + shapeType.slice(1)} Shape`, scene.layers.length),
    type: 'shape',
    width: 200,
    height: 200,
    shapeType,
    fill: '#e94560',
    fillType: 'solid',
    stroke: '',
    strokeWidth: 0,
    cornerRadius: 0,
    ...(shapeType === 'polygon' ? { polygonSides: 6 } : {}),
    ...(shapeType === 'star' ? { starPoints: 5, starInnerRadius: 0.4 } : {}),
  };
}

function createImageLayer(scene: Scene, src: string, name: string): ImageLayerData {
  return {
    ...makeBase(scene, name, scene.layers.length),
    type: 'image',
    width: 600,
    height: 400,
    src,
    fitMode: 'contain',
    borderRadius: 0,
  };
}

function createVideoLayer(scene: Scene, src: string, name: string): VideoLayerData {
  return {
    ...makeBase(scene, name, scene.layers.length),
    type: 'video',
    width: 600,
    height: 400,
    src,
    startTime: 0,
    endTime: scene.durationFrames / 30,
    playbackRate: 1,
    muted: false,
  };
}

function createSvgLayer(scene: Scene): SvgLayerData {
  return {
    ...makeBase(scene, 'SVG Layer', scene.layers.length),
    type: 'svg',
    width: 200,
    height: 200,
    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#e94560"/></svg>',
  };
}

function createAudioLayer(scene: Scene, src: string, name: string): AudioLayerData {
  return {
    ...makeBase(scene, name, scene.layers.length),
    type: 'audio',
    width: 0,
    height: 0,
    src,
    startTime: 0,
    endTime: scene.durationFrames / 30,
    volume: 1,
    fadeInFrames: 0,
    fadeOutFrames: 0,
  };
}

export function AddLayerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const composition = useStore((s) => s.composition);
  const selectedSceneIndex = useStore((s) => s.selectedSceneIndex);
  const addLayer = useStore((s) => s.addLayer);
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const scene = composition.scenes[selectedSceneIndex];
  if (!scene) return null;

  function addAndClose(layer: Parameters<typeof addLayer>[1]) {
    addLayer(selectedSceneIndex, layer);
    onClose();
  }

  async function importAsset(pickedPath: string): Promise<string> {
    const projectPath = useStore.getState().projectPath;
    if (projectPath) {
      return copyAssetToProject(pickedPath, projectPath);
    }
    return pickedPath;
  }

  async function handleImageAdd() {
    setLoading(true);
    try {
      const path = await pickImageFile();
      if (!path) return;
      const src = await importAsset(path);
      const fileName = path.split(/[/\\]/).pop() ?? 'Image';
      addAndClose(createImageLayer(scene, src, fileName));
    } finally {
      setLoading(false);
    }
  }

  async function handleAudioAdd() {
    setLoading(true);
    try {
      const path = await pickAudioFile();
      if (!path) return;
      const src = await importAsset(path);
      const fileName = path.split(/[/\\]/).pop() ?? 'Audio';
      addAndClose(createAudioLayer(scene, src, fileName));
    } finally {
      setLoading(false);
    }
  }

  async function handleVideoAdd() {
    setLoading(true);
    try {
      const path = await pickVideoFile();
      if (!path) return;
      const src = await importAsset(path);
      const fileName = path.split(/[/\\]/).pop() ?? 'Video';
      addAndClose(createVideoLayer(scene, src, fileName));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-panel add-layer-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Add Layer</h3>
        <div className="dialog-grid">
          <button className="dialog-option" onClick={() => addAndClose(createTextLayer(scene))}>
            <span className="dialog-icon">T</span>
            <span>Text</span>
          </button>
          <button className="dialog-option" onClick={handleImageAdd} disabled={loading}>
            <span className="dialog-icon">IMG</span>
            <span>Image</span>
          </button>
          <button className="dialog-option" onClick={handleAudioAdd} disabled={loading}>
            <span className="dialog-icon">A</span>
            <span>Audio</span>
          </button>
          <button className="dialog-option" onClick={handleVideoAdd} disabled={loading}>
            <span className="dialog-icon">V</span>
            <span>Video</span>
          </button>
          <button className="dialog-option" onClick={() => addAndClose(createSvgLayer(scene))}>
            <span className="dialog-icon shape-icon-svg"></span>
            <span>SVG</span>
          </button>
        </div>
        <h4 className="dialog-section-label">Shapes</h4>
        <div className="dialog-grid">
          <button className="dialog-option" onClick={() => addAndClose(createShapeLayer(scene, 'rect'))}>
            <span className="dialog-icon shape-icon-rect"></span>
            <span>Rectangle</span>
          </button>
          <button className="dialog-option" onClick={() => addAndClose(createShapeLayer(scene, 'rounded-rect'))}>
            <span className="dialog-icon shape-icon-rounded"></span>
            <span>Rounded</span>
          </button>
          <button className="dialog-option" onClick={() => addAndClose(createShapeLayer(scene, 'circle'))}>
            <span className="dialog-icon shape-icon-circle"></span>
            <span>Circle</span>
          </button>
          <button className="dialog-option" onClick={() => addAndClose(createShapeLayer(scene, 'ellipse'))}>
            <span className="dialog-icon shape-icon-ellipse"></span>
            <span>Ellipse</span>
          </button>
          <button className="dialog-option" onClick={() => addAndClose(createShapeLayer(scene, 'triangle'))}>
            <span className="dialog-icon shape-icon-triangle"></span>
            <span>Triangle</span>
          </button>
          <button className="dialog-option" onClick={() => addAndClose(createShapeLayer(scene, 'star'))}>
            <span className="dialog-icon shape-icon-star"></span>
            <span>Star</span>
          </button>
          <button className="dialog-option" onClick={() => addAndClose(createShapeLayer(scene, 'polygon'))}>
            <span className="dialog-icon shape-icon-polygon"></span>
            <span>Polygon</span>
          </button>
          <button className="dialog-option" onClick={() => addAndClose(createShapeLayer(scene, 'arrow'))}>
            <span className="dialog-icon shape-icon-arrow"></span>
            <span>Arrow</span>
          </button>
        </div>
        <button className="dialog-close" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
