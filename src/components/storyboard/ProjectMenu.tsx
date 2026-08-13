import { useState, useRef, useEffect } from 'react';
import { useStore } from '../../store';
import {
  saveProject, saveProjectAs, openProject, loadProjectFromPath,
  getRecentProjects, removeFromRecent, type RecentProject,
} from '../../lib/project-io';

export function ProjectMenu({ onNewFromTemplate }: { onNewFromTemplate?: () => void } = {}) {
  const composition = useStore((s) => s.composition);
  const projectPath = useStore((s) => s.projectPath);
  const isDirty = useStore((s) => s.isDirty);
  const setComposition = useStore((s) => s.setComposition);
  const setProjectPath = useStore((s) => s.setProjectPath);
  const markClean = useStore((s) => s.markClean);

  const [menuOpen, setMenuOpen] = useState(false);
  const [recents, setRecents] = useState<RecentProject[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (menuOpen) {
      setRecents(getRecentProjects());
    }
  }, [menuOpen]);

  // Close on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  async function handleNew() {
    setMenuOpen(false);
    const { createDefaultComposition } = await import('../../store/composition-slice');
    setComposition(createDefaultComposition());
    setProjectPath(null);
  }

  async function handleOpen() {
    setMenuOpen(false);
    try {
      const result = await openProject();
      if (result) {
        setComposition(result.composition);
        setProjectPath(result.path);
      }
    } catch (err) {
      console.error('Failed to open project:', err);
    }
  }

  async function handleSave() {
    setMenuOpen(false);
    try {
      if (projectPath) {
        const result = await saveProject(projectPath, composition);
        setComposition(result.composition);
        markClean();
      } else {
        await handleSaveAs();
      }
    } catch (err) {
      console.error('Failed to save project:', err);
    }
  }

  async function handleSaveAs() {
    setMenuOpen(false);
    try {
      const result = await saveProjectAs(composition);
      if (result) {
        setProjectPath(result.path);
        setComposition(result.composition);
        markClean();
      }
    } catch (err) {
      console.error('Failed to save project:', err);
    }
  }

  async function handleOpenRecent(path: string) {
    setMenuOpen(false);
    try {
      const result = await loadProjectFromPath(path);
      setComposition(result.composition);
      setProjectPath(result.path);
    } catch (err) {
      console.error('Failed to open recent project:', err);
      removeFromRecent(path);
    }
  }

  const fileName = projectPath
    ? projectPath.split(/[/\\]/).pop()
    : 'Untitled';

  return (
    <div className="project-menu" ref={menuRef}>
      <button className="project-menu-trigger" onClick={() => setMenuOpen(!menuOpen)}>
        {fileName}{isDirty ? ' *' : ''}
      </button>

      {menuOpen && (
        <div className="project-menu-dropdown">
          <button onClick={handleNew}>New Project</button>
          {onNewFromTemplate && <button onClick={() => { setMenuOpen(false); onNewFromTemplate(); }}>New from Template...</button>}
          <button onClick={handleOpen}>Open...</button>
          <button onClick={handleSave}>Save</button>
          <button onClick={handleSaveAs}>Save As...</button>

          {recents.length > 0 && (
            <>
              <div className="menu-divider" />
              <div className="menu-label">Recent</div>
              {recents.map((r) => (
                <button key={r.path} onClick={() => handleOpenRecent(r.path)} title={r.path}>
                  {r.path.split(/[/\\]/).pop()}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
