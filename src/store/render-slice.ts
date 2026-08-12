import type { StateCreator } from 'zustand';
import type { Composition, RenderStatus } from '../types';
import { getTotalFrames } from '../renderer/compositor';

export interface RenderJob {
  id: string;
  name: string;
  composition: Composition;
  outputPath: string;
  status: RenderStatus;
  progress: number;
  currentFrame: number;
  totalFrames: number;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface RenderSlice {
  renderQueue: RenderJob[];
  activeJobId: string | null;
  addRenderJob: (composition: Composition, outputPath: string) => string;
  updateJob: (id: string, patch: Partial<RenderJob>) => void;
  removeJob: (id: string) => void;
  retryJob: (id: string) => void;
  cancelJob: (id: string) => void;
  setActiveJob: (id: string | null) => void;
  clearCompleted: () => void;
}

export const createRenderSlice: StateCreator<RenderSlice> = (set) => ({
  renderQueue: [],
  activeJobId: null,

  addRenderJob: (composition, outputPath) => {
    const id = `render-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const job: RenderJob = {
      id,
      name: composition.name,
      composition: JSON.parse(JSON.stringify(composition)), // snapshot
      outputPath,
      status: 'idle',
      progress: 0,
      currentFrame: 0,
      totalFrames: getTotalFrames(composition),
      error: null,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
    };
    set((s) => ({ renderQueue: [...s.renderQueue, job] }));
    return id;
  },

  updateJob: (id, patch) =>
    set((s) => ({
      renderQueue: s.renderQueue.map((j) =>
        j.id === id ? { ...j, ...patch } : j,
      ),
    })),

  removeJob: (id) =>
    set((s) => ({
      renderQueue: s.renderQueue.filter((j) => j.id !== id),
      activeJobId: s.activeJobId === id ? null : s.activeJobId,
    })),

  retryJob: (id) =>
    set((s) => ({
      renderQueue: s.renderQueue.map((j) =>
        j.id === id
          ? { ...j, status: 'idle' as RenderStatus, progress: 0, currentFrame: 0, error: null, startedAt: null, completedAt: null }
          : j,
      ),
    })),

  cancelJob: (id) =>
    set((s) => ({
      renderQueue: s.renderQueue.map((j) =>
        j.id === id && (j.status === 'idle' || j.status === 'rendering')
          ? { ...j, status: 'cancelled' as RenderStatus, completedAt: new Date().toISOString() }
          : j,
      ),
    })),

  setActiveJob: (id) => set({ activeJobId: id }),

  clearCompleted: () =>
    set((s) => ({
      renderQueue: s.renderQueue.filter(
        (j) => j.status !== 'completed' && j.status !== 'cancelled' && j.status !== 'failed',
      ),
    })),
});
