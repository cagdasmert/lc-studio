import { useEffect } from 'react';
import { useStore } from './store';
import type { Composition, TextLayerData } from './types';
import { LayerPanel } from './components/storyboard/LayerPanel';
import { CanvasWorkspace } from './components/storyboard/CanvasWorkspace';
import { PropertyInspector } from './components/storyboard/PropertyInspector';
import { SceneTimeline } from './components/storyboard/SceneTimeline';
import { PlaybackControls } from './components/storyboard/PlaybackControls';
import { RenderPanel } from './components/RenderPanel';
import './App.css';

function createDefaultComposition(): Composition {
  const introTitle: TextLayerData = {
    id: 'text-intro-title',
    name: 'Title',
    type: 'text',
    startFrame: 0,
    endFrame: 90,
    x: 540,
    y: 768,
    width: 900,
    height: 100,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: 1,
    anchorX: 0.5,
    anchorY: 0.5,
    zIndex: 1,
    blendMode: 'normal',
    effects: [],
    visible: true,
    locked: false,
    keyframes: {
      opacity: {
        keyframes: [
          { frame: 0, value: 0, easing: 'ease-out' },
          { frame: 30, value: 1, easing: 'linear' },
        ],
      },
    },
    content: 'Local Content Studio',
    fontSize: 64,
    fontFamily: 'sans-serif',
    fontWeight: 'bold',
    fontStyle: 'normal',
    color: '#e94560',
    align: 'center',
    verticalAlign: 'middle',
    lineHeight: 1.4,
    letterSpacing: 0,
    maxWidth: 0,
    textStroke: null,
    textShadow: null,
  };

  const introSubtitle: TextLayerData = {
    id: 'text-intro-sub',
    name: 'Subtitle',
    type: 'text',
    startFrame: 0,
    endFrame: 90,
    x: 540,
    y: 1056,
    width: 900,
    height: 60,
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
    keyframes: {
      opacity: {
        keyframes: [
          { frame: 20, value: 0, easing: 'ease-out' },
          { frame: 50, value: 1, easing: 'linear' },
        ],
      },
      y: {
        keyframes: [
          { frame: 20, value: 1150, easing: 'ease-out' },
          { frame: 50, value: 1056, easing: 'linear' },
        ],
      },
    },
    content: 'Canvas + FFmpeg Render Pipeline',
    fontSize: 28,
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

  const featureText: TextLayerData = {
    id: 'text-feature',
    name: 'Feature Title',
    type: 'text',
    startFrame: 0,
    endFrame: 90,
    x: 540,
    y: 864,
    width: 900,
    height: 80,
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
    keyframes: {
      opacity: {
        keyframes: [
          { frame: 0, value: 0, easing: 'ease-in-out' },
          { frame: 20, value: 1, easing: 'linear' },
        ],
      },
      x: {
        keyframes: [
          { frame: 0, value: 640, easing: 'ease-in-out' },
          { frame: 20, value: 540, easing: 'linear' },
        ],
      },
    },
    content: 'Deterministic Rendering',
    fontSize: 48,
    fontFamily: 'sans-serif',
    fontWeight: 'bold',
    fontStyle: 'normal',
    color: '#e94560',
    align: 'center',
    verticalAlign: 'middle',
    lineHeight: 1.4,
    letterSpacing: 0,
    maxWidth: 0,
    textStroke: null,
    textShadow: null,
  };

  return {
    id: 'demo-1',
    name: 'Demo Composition',
    scenes: [
      {
        id: 'scene-1',
        label: 'Intro',
        durationFrames: 90,
        backgroundColor: '#1a1a2e',
        layers: [introTitle, introSubtitle],
        transition: 'fade',
        transitionDurationFrames: 15,
      },
      {
        id: 'scene-2',
        label: 'Feature',
        durationFrames: 90,
        backgroundColor: '#0f3460',
        layers: [featureText],
        transition: 'cut',
        transitionDurationFrames: 0,
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
}

function App() {
  const setComposition = useStore((s) => s.setComposition);

  useEffect(() => {
    setComposition(createDefaultComposition());
  }, [setComposition]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Local Content Studio</h1>
      </header>

      <div className="app-body">
        <aside className="panel-left">
          <LayerPanel />
        </aside>

        <main className="panel-center">
          <CanvasWorkspace />
          <RenderPanel />
        </main>

        <aside className="panel-right">
          <PropertyInspector />
        </aside>
      </div>

      <footer className="app-footer">
        <SceneTimeline />
        <PlaybackControls />
      </footer>
    </div>
  );
}

export default App;
