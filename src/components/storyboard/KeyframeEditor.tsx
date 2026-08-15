import { useState, useRef, useCallback, useEffect } from 'react';
import { useStore } from '../../store';
import type { Layer, EasingType, Keyframe } from '../../types';

// Animatable properties per layer type
const BASE_PROPERTIES = ['x', 'y', 'width', 'height', 'scaleX', 'scaleY', 'rotation', 'opacity'];
const TEXT_PROPERTIES = [...BASE_PROPERTIES, 'fontSize', 'letterSpacing', 'lineHeight'];
const SHAPE_PROPERTIES = [...BASE_PROPERTIES, 'strokeWidth', 'cornerRadius'];
const IMAGE_PROPERTIES = [...BASE_PROPERTIES, 'borderRadius'];

function getAnimatableProperties(layer: Layer): string[] {
  switch (layer.type) {
    case 'text': return TEXT_PROPERTIES;
    case 'shape': return SHAPE_PROPERTIES;
    case 'image': return IMAGE_PROPERTIES;
    default: return BASE_PROPERTIES;
  }
}

function getPropertyValue(layer: Layer, property: string): number {
  return (layer as unknown as Record<string, number>)[property] ?? 0;
}

const EASING_OPTIONS: { group: string; values: EasingType[] }[] = [
  { group: 'Basic', values: ['linear', 'ease-in', 'ease-out', 'ease-in-out'] },
  { group: 'Sine', values: ['ease-in-sine', 'ease-out-sine', 'ease-in-out-sine'] },
  { group: 'Cubic', values: ['ease-in-cubic', 'ease-out-cubic', 'ease-in-out-cubic'] },
  { group: 'Expo', values: ['ease-in-expo', 'ease-out-expo', 'ease-in-out-expo'] },
  { group: 'Circ', values: ['ease-in-circ', 'ease-out-circ', 'ease-in-out-circ'] },
  { group: 'Back', values: ['ease-in-back', 'ease-out-back', 'ease-in-out-back'] },
  { group: 'Elastic', values: ['ease-in-elastic', 'ease-out-elastic', 'ease-in-out-elastic'] },
  { group: 'Bounce', values: ['ease-in-bounce', 'ease-out-bounce', 'ease-in-out-bounce'] },
  { group: 'Special', values: ['steps', 'cubic-bezier', 'spring'] },
];

const TRACK_HEIGHT = 20;
const RULER_HEIGHT = 20;
const MIN_PPF = 1;
const MAX_PPF = 20;
const DEFAULT_PPF = 4;

interface SelectedKeyframe {
  property: string;
  frame: number;
}

export function KeyframeEditor() {
  const composition = useStore((s) => s.composition);
  const selectedSceneIndex = useStore((s) => s.selectedSceneIndex);
  const selectedLayerId = useStore((s) => s.selectedLayerId);
  const currentFrame = useStore((s) => s.currentFrame);
  const setCurrentFrame = useStore((s) => s.setCurrentFrame);
  const setKeyframe = useStore((s) => s.setKeyframe);
  const removeKeyframe = useStore((s) => s.removeKeyframe);
  const keyframeEditorOpen = useStore((s) => s.keyframeEditorOpen);
  const toggleKeyframeEditor = useStore((s) => s.toggleKeyframeEditor);

  const [pixelsPerFrame, setPixelsPerFrame] = useState(DEFAULT_PPF);
  const [selectedKf, setSelectedKf] = useState<SelectedKeyframe | null>(null);
  const [dragState, setDragState] = useState<{
    property: string;
    originalFrame: number;
    currentFrame: number;
    value: number;
    easing: EasingType;
  } | null>(null);

  const timelineRef = useRef<HTMLDivElement>(null);

  // Get scene and layer
  const scene = composition.scenes[selectedSceneIndex];
  const layer = scene?.layers.find((l) => l.id === selectedLayerId);

  // Frame offset for this scene
  let sceneStartFrame = 0;
  for (let i = 0; i < selectedSceneIndex; i++) {
    sceneStartFrame += composition.scenes[i].durationFrames;
  }
  const frameInScene = currentFrame - sceneStartFrame;
  const sceneDuration = scene?.durationFrames ?? 0;

  // Animatable properties
  const properties = layer ? getAnimatableProperties(layer) : [];
  const totalWidth = sceneDuration * pixelsPerFrame;

  // Get selected keyframe's easing
  const selectedKfData: Keyframe | undefined =
    selectedKf && layer
      ? layer.keyframes[selectedKf.property]?.keyframes.find(
          (k) => k.frame === selectedKf.frame,
        )
      : undefined;

  // Clear selection when layer changes
  useEffect(() => {
    setSelectedKf(null);
  }, [selectedLayerId]);

  // Convert mouse X to frame number
  const xToFrame = useCallback(
    (clientX: number): number => {
      const timeline = timelineRef.current;
      if (!timeline) return 0;
      const rect = timeline.getBoundingClientRect();
      const x = clientX - rect.left + timeline.scrollLeft;
      return Math.max(0, Math.min(sceneDuration - 1, Math.round(x / pixelsPerFrame)));
    },
    [pixelsPerFrame, sceneDuration],
  );

  // Ruler click → seek
  function handleRulerClick(e: React.MouseEvent) {
    const frame = xToFrame(e.clientX);
    setCurrentFrame(sceneStartFrame + frame);
  }

  // Track click → add keyframe
  function handleTrackClick(e: React.MouseEvent, property: string) {
    if (!layer || dragState) return;
    // Don't add if clicking on a diamond
    if ((e.target as HTMLElement).classList.contains('ke-diamond')) return;

    const frame = xToFrame(e.clientX);
    const value = getPropertyValue(layer, property);
    setKeyframe(selectedSceneIndex, layer.id, property, frame, value);
    setSelectedKf({ property, frame });
  }

  // Diamond click → select
  function handleDiamondClick(e: React.MouseEvent, property: string, frame: number) {
    e.stopPropagation();
    setSelectedKf({ property, frame });
  }

  // Diamond double-click → delete
  function handleDiamondDoubleClick(e: React.MouseEvent, property: string, frame: number) {
    e.stopPropagation();
    if (!layer) return;
    removeKeyframe(selectedSceneIndex, layer.id, property, frame);
    if (selectedKf?.property === property && selectedKf.frame === frame) {
      setSelectedKf(null);
    }
  }

  // Diamond drag start
  function handleDiamondMouseDown(e: React.MouseEvent, property: string, kf: Keyframe) {
    if (e.detail >= 2) return; // skip double-click
    e.stopPropagation();
    e.preventDefault();
    setSelectedKf({ property, frame: kf.frame });
    setDragState({
      property,
      originalFrame: kf.frame,
      currentFrame: kf.frame,
      value: kf.value,
      easing: kf.easing,
    });
  }

  // Global mouse handlers for drag
  useEffect(() => {
    if (!dragState || !layer) return;

    function handleMouseMove(e: MouseEvent) {
      const frame = xToFrame(e.clientX);
      setDragState((prev) => prev ? { ...prev, currentFrame: frame } : null);
    }

    function handleMouseUp() {
      if (!dragState || !layer) return;
      const { property, originalFrame, currentFrame: newFrame, value, easing } = dragState;
      if (newFrame !== originalFrame) {
        removeKeyframe(selectedSceneIndex, layer.id, property, originalFrame);
        setKeyframe(selectedSceneIndex, layer.id, property, newFrame, value, easing);
        setSelectedKf({ property, frame: newFrame });
      }
      setDragState(null);
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, layer, selectedSceneIndex, removeKeyframe, setKeyframe, xToFrame]);

  // Zoom via mouse wheel
  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    setPixelsPerFrame((prev) => {
      const delta = e.deltaY > 0 ? -1 : 1;
      return Math.max(MIN_PPF, Math.min(MAX_PPF, prev + delta));
    });
  }

  // Change easing of selected keyframe
  function handleEasingChange(easing: EasingType) {
    if (!selectedKf || !layer) return;
    const track = layer.keyframes[selectedKf.property];
    const kf = track?.keyframes.find((k) => k.frame === selectedKf.frame);
    if (kf) {
      setKeyframe(selectedSceneIndex, layer.id, selectedKf.property, selectedKf.frame, kf.value, easing);
    }
  }

  // Playhead position
  const playheadX = frameInScene * pixelsPerFrame;

  if (!keyframeEditorOpen) {
    return (
      <div className="ke-collapsed">
        <button className="ke-toggle-btn" onClick={toggleKeyframeEditor} title="Show keyframe editor">
          Keyframes {'\u25B2'}
        </button>
      </div>
    );
  }

  if (!layer || layer.type === 'audio') {
    // Header only — an empty 170px panel would just steal room from the canvas.
    return (
      <div className="keyframe-editor is-empty">
        <div className="ke-header">
          <button className="ke-toggle-btn" onClick={toggleKeyframeEditor} title="Hide keyframe editor">
            Keyframes {'\u25BC'}
          </button>
          <span className="ke-hint">Select a layer to edit keyframes</span>
        </div>
      </div>
    );
  }

  return (
    <div className="keyframe-editor">
      <div className="ke-header">
        <button className="ke-toggle-btn" onClick={toggleKeyframeEditor} title="Hide keyframe editor">
          Keyframes {'\u25BC'}
        </button>
        <span className="ke-layer-name">{layer.name}</span>
        <div className="ke-easing-group">
          <span className="ke-easing-label">Easing</span>
          <select
            className="ke-easing-select"
            value={selectedKfData?.easing ?? 'ease-out'}
            onChange={(e) => handleEasingChange(e.target.value as EasingType)}
            disabled={!selectedKf}
          >
            {EASING_OPTIONS.map((group) => (
              <optgroup key={group.group} label={group.group}>
                {group.values.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      <div className="ke-body">
        {/* Property labels */}
        <div className="ke-labels">
          <div className="ke-label-ruler" />
          {properties.map((prop) => (
            <div
              key={prop}
              className={`ke-label ${selectedKf?.property === prop ? 'selected' : ''}`}
              style={{ height: TRACK_HEIGHT }}
            >
              {prop}
            </div>
          ))}
        </div>

        {/* Timeline area */}
        <div className="ke-timeline" ref={timelineRef} onWheel={handleWheel}>
          {/* Ruler */}
          <div
            className="ke-ruler"
            style={{ width: totalWidth, height: RULER_HEIGHT }}
            onClick={handleRulerClick}
          >
            {Array.from({ length: Math.ceil(sceneDuration / 10) + 1 }, (_, i) => i * 10).map((f) => (
              f < sceneDuration && (
                <span
                  key={f}
                  className="ke-ruler-tick"
                  style={{ left: f * pixelsPerFrame }}
                >
                  {f}
                </span>
              )
            ))}
          </div>

          {/* Tracks */}
          <div className="ke-tracks" style={{ width: totalWidth }}>
            {properties.map((prop, idx) => {
              const track = layer.keyframes[prop];
              const keyframes = track?.keyframes ?? [];

              return (
                <div
                  key={prop}
                  className={`ke-track ${idx % 2 === 0 ? 'even' : 'odd'}`}
                  style={{ height: TRACK_HEIGHT }}
                  onClick={(e) => handleTrackClick(e, prop)}
                >
                  {keyframes.map((kf) => {
                    const isDragging = dragState?.property === prop && dragState.originalFrame === kf.frame;
                    const displayFrame = isDragging ? dragState.currentFrame : kf.frame;
                    const isSelected = selectedKf?.property === prop && selectedKf.frame === kf.frame;

                    return (
                      <div
                        key={kf.frame}
                        className={`ke-diamond ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
                        style={{ left: displayFrame * pixelsPerFrame }}
                        onClick={(e) => handleDiamondClick(e, prop, kf.frame)}
                        onDoubleClick={(e) => handleDiamondDoubleClick(e, prop, kf.frame)}
                        onMouseDown={(e) => handleDiamondMouseDown(e, prop, kf)}
                        title={`Frame ${kf.frame}: ${kf.value} (${kf.easing})`}
                      >
                        {'\u25C6'}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Playhead */}
            <div className="ke-playhead" style={{ left: playheadX, height: properties.length * TRACK_HEIGHT }} />
          </div>
        </div>
      </div>
    </div>
  );
}
