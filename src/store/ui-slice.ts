import type { StateCreator } from 'zustand';

export type ToolMode = 'select' | 'move' | 'hand';

export interface UISlice {
  toolMode: ToolMode;
  canvasZoom: number;
  showGrid: boolean;
  snapToGrid: boolean;
  gridSize: number;
  panX: number;
  panY: number;
  setToolMode: (mode: ToolMode) => void;
  setCanvasZoom: (zoom: number) => void;
  toggleGrid: () => void;
  toggleSnap: () => void;
  setGridSize: (size: number) => void;
  setPan: (x: number, y: number) => void;
  resetView: () => void;
  keyframeEditorOpen: boolean;
  toggleKeyframeEditor: () => void;
}

export const createUISlice: StateCreator<UISlice> = (set) => ({
  toolMode: 'select',
  canvasZoom: 1,
  showGrid: false,
  snapToGrid: false,
  gridSize: 20,
  panX: 0,
  panY: 0,

  setToolMode: (mode) => set({ toolMode: mode }),
  setCanvasZoom: (zoom) => set({ canvasZoom: Math.max(0.1, Math.min(5, zoom)) }),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  toggleSnap: () => set((s) => ({ snapToGrid: !s.snapToGrid })),
  setGridSize: (size) => set({ gridSize: Math.max(5, Math.min(100, size)) }),
  setPan: (x, y) => set({ panX: x, panY: y }),
  resetView: () => set({ canvasZoom: 1, panX: 0, panY: 0 }),
  keyframeEditorOpen: true,
  toggleKeyframeEditor: () => set((s) => ({ keyframeEditorOpen: !s.keyframeEditorOpen })),
});
