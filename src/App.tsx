import { LayerPanel } from './components/storyboard/LayerPanel';
import { CanvasWorkspace } from './components/storyboard/CanvasWorkspace';
import { PropertyInspector } from './components/storyboard/PropertyInspector';
import { SceneTimeline } from './components/storyboard/SceneTimeline';
import { PlaybackControls } from './components/storyboard/PlaybackControls';
import { RenderPanel } from './components/RenderPanel';
import './App.css';

function App() {

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
