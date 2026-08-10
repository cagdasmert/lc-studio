import { useStore } from '../../store';
import type { ToolMode } from '../../store/ui-slice';

const TOOLS: { mode: ToolMode; label: string; title: string }[] = [
  { mode: 'select', label: 'V', title: 'Select (V)' },
  { mode: 'move', label: 'M', title: 'Move (M)' },
  { mode: 'hand', label: 'H', title: 'Hand / Pan (H)' },
];

const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3];

export function Toolbar() {
  const toolMode = useStore((s) => s.toolMode);
  const setToolMode = useStore((s) => s.setToolMode);
  const canvasZoom = useStore((s) => s.canvasZoom);
  const setCanvasZoom = useStore((s) => s.setCanvasZoom);
  const showGrid = useStore((s) => s.showGrid);
  const toggleGrid = useStore((s) => s.toggleGrid);
  const snapToGrid = useStore((s) => s.snapToGrid);
  const toggleSnap = useStore((s) => s.toggleSnap);

  const temporal = useStore.temporal;
  const canUndo = temporal.getState().pastStates.length > 0;
  const canRedo = temporal.getState().futureStates.length > 0;

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <button
          className="toolbar-btn"
          onClick={() => temporal.getState().undo()}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
        >
          Undo
        </button>
        <button
          className="toolbar-btn"
          onClick={() => temporal.getState().redo()}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
        >
          Redo
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        {TOOLS.map((t) => (
          <button
            key={t.mode}
            className={`toolbar-btn ${toolMode === t.mode ? 'active' : ''}`}
            onClick={() => setToolMode(t.mode)}
            title={t.title}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <button
          className="toolbar-btn"
          onClick={() => setCanvasZoom(canvasZoom - 0.25)}
          title="Zoom out"
        >
          -
        </button>
        <select
          className="zoom-select"
          value={canvasZoom}
          onChange={(e) => setCanvasZoom(Number(e.target.value))}
        >
          {ZOOM_PRESETS.map((z) => (
            <option key={z} value={z}>{Math.round(z * 100)}%</option>
          ))}
        </select>
        <button
          className="toolbar-btn"
          onClick={() => setCanvasZoom(canvasZoom + 0.25)}
          title="Zoom in"
        >
          +
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <button
          className={`toolbar-btn ${showGrid ? 'active' : ''}`}
          onClick={toggleGrid}
          title="Toggle grid"
        >
          Grid
        </button>
        <button
          className={`toolbar-btn ${snapToGrid ? 'active' : ''}`}
          onClick={toggleSnap}
          title="Toggle snap to grid"
        >
          Snap
        </button>
      </div>
    </div>
  );
}
