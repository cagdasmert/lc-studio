import { useState } from 'react';
import type { Composition } from './types';
import { SceneEditor } from './components/SceneEditor';
import { PreviewCanvas } from './components/PreviewCanvas';
import { RenderPanel } from './components/RenderPanel';
import './App.css';

const DEFAULT_COMPOSITION: Composition = {
  id: 'demo-1',
  name: 'Demo Composition',
  scenes: [
    {
      id: 'scene-1',
      label: 'Intro',
      durationFrames: 90,
      backgroundColor: '#1a1a2e',
      textLayers: [
        {
          content: 'Local Content Studio',
          fontSize: 64,
          fontFamily: 'sans-serif',
          color: '#e94560',
          x: 0.5,
          y: 0.4,
          align: 'center',
          animation: {
            type: 'fade-in',
            durationFrames: 30,
            delayFrames: 10,
            easing: 'ease-out',
          },
        },
        {
          content: 'Canvas + FFmpeg Render Pipeline',
          fontSize: 28,
          fontFamily: 'sans-serif',
          color: '#ffffff',
          x: 0.5,
          y: 0.55,
          align: 'center',
          animation: {
            type: 'slide-up',
            durationFrames: 30,
            delayFrames: 30,
            easing: 'ease-out',
          },
        },
      ],
      transition: 'fade',
    },
    {
      id: 'scene-2',
      label: 'Feature',
      durationFrames: 90,
      backgroundColor: '#0f3460',
      textLayers: [
        {
          content: 'Deterministic Rendering',
          fontSize: 48,
          fontFamily: 'sans-serif',
          color: '#e94560',
          x: 0.5,
          y: 0.45,
          align: 'center',
          animation: {
            type: 'slide-left',
            durationFrames: 20,
            delayFrames: 5,
            easing: 'ease-in-out',
          },
        },
      ],
      transition: 'cut',
    },
  ],
  output: {
    id: 'vertical-1080x1920',
    label: 'Vertical (1080x1920)',
    width: 1080,
    height: 1920,
    fps: 30,
  },
};

function App() {
  const [composition, setComposition] = useState<Composition>(DEFAULT_COMPOSITION);

  function updateScene(index: number, updated: Composition['scenes'][0]) {
    const scenes = [...composition.scenes];
    scenes[index] = updated;
    setComposition({ ...composition, scenes });
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Local Content Studio</h1>
      </header>

      <div className="app-body">
        <aside className="sidebar">
          <h2>Scenes</h2>
          {composition.scenes.map((scene, i) => (
            <SceneEditor
              key={scene.id}
              scene={scene}
              onChange={(s) => updateScene(i, s)}
            />
          ))}
        </aside>

        <main className="main-content">
          <PreviewCanvas composition={composition} />
          <RenderPanel composition={composition} />
        </main>
      </div>
    </div>
  );
}

export default App;
