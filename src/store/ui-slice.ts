import type { StateCreator } from 'zustand';

export type ToolMode = 'select' | 'move' | 'hand';

export interface UISlice {
  toolMode: ToolMode;
  canvasZoom: number;
  showGrid: boolean;
  snapToGrid: boolean;
  setToolMode: (mode: ToolMode) => void;
  setCanvasZoom: (zoom: number) => void;
  toggleGrid: () => void;
  toggleSnap: () => void;
}

export const createUISlice: StateCreator<UISlice> = (set) => ({
  toolMode: 'select',
  canvasZoom: 1,
  showGrid: false,
  snapToGrid: false,

  setToolMode: (mode) => set({ toolMode: mode }),
  setCanvasZoom: (zoom) => set({ canvasZoom: Math.max(0.1, Math.min(5, zoom)) }),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  toggleSnap: () => set((s) => ({ snapToGrid: !s.snapToGrid })),
});
