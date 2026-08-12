import { useState, useCallback, useEffect, useRef } from 'react';
import { useStore } from './store';
import { LayerPanel } from './components/storyboard/LayerPanel';
import { CanvasWorkspace } from './components/storyboard/CanvasWorkspace';
import { PropertyInspector } from './components/storyboard/PropertyInspector';
import { SceneTimeline } from './components/storyboard/SceneTimeline';
import { PlaybackControls } from './components/storyboard/PlaybackControls';
import { Toolbar } from './components/storyboard/Toolbar';
import { ProjectMenu } from './components/storyboard/ProjectMenu';
import { AddLayerDialog } from './components/storyboard/AddLayerDialog';
import { RenderPanel } from './components/RenderPanel';
import { AssetPanel } from './components/storyboard/AssetPanel';
import { BrandKitEditor } from './components/storyboard/BrandKitEditor';
import { TemplateBrowser } from './components/storyboard/TemplateBrowser';
import { AIPanel } from './components/storyboard/AIPanel';
import { AISettings } from './components/storyboard/AISettings';
import { KeyframeEditor } from './components/storyboard/KeyframeEditor';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { saveProject, saveProjectAs, openProject } from './lib/project-io';
import './App.css';

const AUTO_SAVE_INTERVAL = 60_000; // 60 seconds

function App() {
  const [addLayerOpen, setAddLayerOpen] = useState(false);
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [brandOpen, setBrandOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);

  const composition = useStore((s) => s.composition);
  const projectPath = useStore((s) => s.projectPath);
  const isDirty = useStore((s) => s.isDirty);
  const setComposition = useStore((s) => s.setComposition);
  const setProjectPath = useStore((s) => s.setProjectPath);
  const markClean = useStore((s) => s.markClean);

  const handleSave = useCallback(async () => {
    if (projectPath) {
      await saveProject(projectPath, composition);
      markClean();
    } else {
      const path = await saveProjectAs(composition);
      if (path) {
        setProjectPath(path);
        markClean();
      }
    }
  }, [projectPath, composition, markClean, setProjectPath]);

  const handleSaveAs = useCallback(async () => {
    const path = await saveProjectAs(composition);
    if (path) {
      setProjectPath(path);
      markClean();
    }
  }, [composition, markClean, setProjectPath]);

  const handleOpen = useCallback(async () => {
    const result = await openProject();
    if (result) {
      setComposition(result.composition);
      setProjectPath(result.path);
    }
  }, [setComposition, setProjectPath]);

  useKeyboardShortcuts({ save: handleSave, saveAs: handleSaveAs, open: handleOpen });

  // Auto-save
  const autoSaveRef = useRef({ composition, projectPath, isDirty });
  autoSaveRef.current = { composition, projectPath, isDirty };

  useEffect(() => {
    const timer = setInterval(async () => {
      const { composition: comp, projectPath: path, isDirty: dirty } = autoSaveRef.current;
      if (path && dirty) {
        try {
          await saveProject(path, comp);
          markClean();
        } catch {
          // Silent auto-save failure
        }
      }
    }, AUTO_SAVE_INTERVAL);
    return () => clearInterval(timer);
  }, [markClean]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Local Content Studio</h1>
        <ProjectMenu onNewFromTemplate={() => setTemplatesOpen(true)} />
        <Toolbar />
        <div className="header-actions">
          <button className="toolbar-btn" onClick={() => setAssetsOpen(true)} title="Assets">Assets</button>
          <button className="toolbar-btn" onClick={() => setBrandOpen(true)} title="Brand Kits">Brand</button>
          <button className="toolbar-btn" onClick={() => setTemplatesOpen(true)} title="Templates">Tmpl</button>
        </div>
      </header>

      <div className="app-body">
        <aside className="panel-left">
          <LayerPanel onAddLayer={() => setAddLayerOpen(true)} />
        </aside>

        <main className="panel-center">
          <CanvasWorkspace />
          <KeyframeEditor />
          <RenderPanel />
        </main>

        <aside className="panel-right">
          <PropertyInspector />
          <AIPanel onSettings={() => setAiSettingsOpen(true)} />
        </aside>
      </div>

      <footer className="app-footer">
        <SceneTimeline />
        <PlaybackControls />
      </footer>

      <AddLayerDialog open={addLayerOpen} onClose={() => setAddLayerOpen(false)} />
      {assetsOpen && <AssetPanel onClose={() => setAssetsOpen(false)} />}
      {brandOpen && <BrandKitEditor onClose={() => setBrandOpen(false)} />}
      {templatesOpen && <TemplateBrowser onClose={() => setTemplatesOpen(false)} />}
      {aiSettingsOpen && <AISettings onClose={() => setAiSettingsOpen(false)} />}
    </div>
  );
}

export default App;
