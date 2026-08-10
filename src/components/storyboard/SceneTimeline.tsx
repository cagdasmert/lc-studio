import { useStore } from '../../store';
import { getTotalFrames } from '../../renderer/compositor';
import type { Scene, TextLayerData } from '../../types';

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
  const duplicateScene = useStore((s) => s.duplicateScene);
  const setCurrentFrame = useStore((s) => s.setCurrentFrame);

  const totalFrames = getTotalFrames(composition);
  const fps = composition.output.fps;

  // Calculate the frame offset where the cursor clicked in the timeline
  function handleSceneClick(sceneIndex: number) {
    selectScene(sceneIndex);
    // Jump playback to the start of this scene
    let frameOffset = 0;
    for (let i = 0; i < sceneIndex; i++) {
      frameOffset += composition.scenes[i].durationFrames;
    }
    setCurrentFrame(frameOffset);
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
              className={`timeline-scene ${i === selectedSceneIndex ? 'selected' : ''}`}
              style={{ width: `${widthPercent}%` }}
              onClick={() => handleSceneClick(i)}
              onContextMenu={(e) => {
                e.preventDefault();
                // Simple context actions via prompt for now
              }}
            >
              <span className="scene-label">{scene.label}</span>
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

        {/* Playback cursor */}
        {totalFrames > 0 && (
          <div
            className="timeline-cursor"
            style={{ left: `${(currentFrame / totalFrames) * 100}%` }}
          />
        )}
      </div>
    </div>
  );
}
