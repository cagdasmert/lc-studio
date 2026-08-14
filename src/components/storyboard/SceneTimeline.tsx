import { useState, useRef, useEffect } from 'react';
import { useStore } from '../../store';
import { getTotalFrames } from '../../renderer/compositor';
import type { Scene, TextLayerData } from '../../types';
import { ContextMenu, type ContextMenuItem } from '../shared/ContextMenu';

function createDefaultScene(index: number): Scene {
  const id = `scene-${Date.now()}-${index}`;
  const defaultText: TextLayerData = {
    id: `text-${Date.now()}`,
    name: 'Text',
    type: 'text',
    startFrame: 0,
    endFrame: 90,
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
    zIndex: 0,
    blendMode: 'normal',
    effects: [],
    visible: true,
    locked: false,
    keyframes: {},
    content: 'New Scene',
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

  return {
    id,
    label: `Scene ${index + 1}`,
    durationFrames: 90,
    backgroundColor: '#1a1a2e',
    layers: [defaultText],
    transition: 'cut',
    transitionDurationFrames: 0,
  };
}

export function SceneTimeline() {
  const composition = useStore((s) => s.composition);
  const selectedSceneIndex = useStore((s) => s.selectedSceneIndex);
  const currentFrame = useStore((s) => s.currentFrame);
  const selectScene = useStore((s) => s.selectScene);
  const addScene = useStore((s) => s.addScene);
  const removeScene = useStore((s) => s.removeScene);
  const reorderScenes = useStore((s) => s.reorderScenes);
  const duplicateScene = useStore((s) => s.duplicateScene);
  const updateScene = useStore((s) => s.updateScene);
  const setCurrentFrame = useStore((s) => s.setCurrentFrame);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sceneIndex: number } | null>(null);
  const [editingSceneIndex, setEditingSceneIndex] = useState<number | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const totalFrames = getTotalFrames(composition);
  const fps = composition.output.fps;

  // Focus rename input when entering edit mode
  useEffect(() => {
    if (editingSceneIndex !== null && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [editingSceneIndex]);

  function handleSceneClick(sceneIndex: number) {
    selectScene(sceneIndex);
    let frameOffset = 0;
    for (let i = 0; i < sceneIndex; i++) {
      frameOffset += composition.scenes[i].durationFrames;
    }
    setCurrentFrame(frameOffset);
  }

  function handleDragStart(e: React.DragEvent, index: number) {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleDrop(e: React.DragEvent, targetIndex: number) {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== targetIndex) {
      reorderScenes(dragIndex, targetIndex);
    }
    setDragIndex(null);
  }

  function handleDragEnd() {
    setDragIndex(null);
  }

  function handleContextMenu(e: React.MouseEvent, sceneIndex: number) {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, sceneIndex });
  }

  function handleRenameCommit(sceneIndex: number, newLabel: string) {
    const trimmed = newLabel.trim();
    if (trimmed) {
      updateScene(sceneIndex, { label: trimmed });
    }
    setEditingSceneIndex(null);
  }

  function handleRenameKeyDown(e: React.KeyboardEvent, sceneIndex: number) {
    if (e.key === 'Enter') {
      handleRenameCommit(sceneIndex, (e.target as HTMLInputElement).value);
    } else if (e.key === 'Escape') {
      setEditingSceneIndex(null);
    }
  }

  function getContextMenuItems(sceneIndex: number): ContextMenuItem[] {
    return [
      { label: 'Rename', action: () => setEditingSceneIndex(sceneIndex) },
      { label: 'Duplicate', action: () => duplicateScene(sceneIndex) },
      { label: 'Delete', action: () => removeScene(sceneIndex), danger: true, divider: true, disabled: composition.scenes.length <= 1 },
    ];
  }

  return (
    <div className="scene-timeline">
      <div className="timeline-header">
        <span className="timeline-label">Scenes</span>
        <button
          className="timeline-add-btn"
          onClick={() => addScene(createDefaultScene(composition.scenes.length))}
          title="Add scene"
        >
          +
        </button>
      </div>

      <div className="timeline-track">
        {composition.scenes.map((scene, i) => {
          const widthPercent = totalFrames > 0
            ? (scene.durationFrames / totalFrames) * 100
            : 100 / composition.scenes.length;

          return (
            <div
              key={scene.id}
              className={`timeline-scene ${i === selectedSceneIndex ? 'selected' : ''} ${dragIndex === i ? 'dragging' : ''}`}
              style={{ width: `${widthPercent}%` }}
              onClick={() => handleSceneClick(i)}
              onContextMenu={(e) => handleContextMenu(e, i)}
              draggable
              onDragStart={(e) => handleDragStart(e, i)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, i)}
              onDragEnd={handleDragEnd}
            >
              {editingSceneIndex === i ? (
                <input
                  ref={renameInputRef}
                  className="scene-rename-input"
                  defaultValue={scene.label}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => handleRenameCommit(i, e.target.value)}
                  onKeyDown={(e) => handleRenameKeyDown(e, i)}
                />
              ) : (
                <span
                  className="scene-label"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingSceneIndex(i);
                  }}
                >
                  {scene.label}
                </span>
              )}
              <span className="scene-duration">{(scene.durationFrames / fps).toFixed(1)}s</span>
              {composition.scenes.length > 1 && (
                <button
                  className="scene-delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeScene(i);
                  }}
                  title="Delete scene"
                >
                  x
                </button>
              )}
              <button
                className="scene-dup-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  duplicateScene(i);
                }}
                title="Duplicate scene"
              >
                d
              </button>
            </div>
          );
        })}

        {totalFrames > 0 && (
          <div
            className="timeline-cursor"
            style={{ left: `${(currentFrame / totalFrames) * 100}%` }}
          />
        )}
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems(contextMenu.sceneIndex)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
