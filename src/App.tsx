import { useState } from 'react';
import { LayerPanel } from './components/storyboard/LayerPanel';
import { CanvasWorkspace } from './components/storyboard/CanvasWorkspace';
import { PropertyInspector } from './components/storyboard/PropertyInspector';
import { SceneTimeline } from './components/storyboard/SceneTimeline';
import { PlaybackControls } from './components/storyboard/PlaybackControls';
import { Toolbar } from './components/storyboard/Toolbar';
import { AddLayerDialog } from './components/storyboard/AddLayerDialog';
import { RenderPanel } from './components/RenderPanel';
import './App.css';

function App() {
  const [addLayerOpen, setAddLayerOpen] = useState(false);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Local Content Studio</h1>
        <Toolbar />
      </header>

      <div className="app-body">
        <aside className="panel-left">
          <LayerPanel onAddLayer={() => setAddLayerOpen(true)} />
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

      <AddLayerDialog open={addLayerOpen} onClose={() => setAddLayerOpen(false)} />
    </div>
  );
}

export default App;
