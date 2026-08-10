import type { StateCreator } from 'zustand';

export interface SelectionSlice {
  selectedSceneIndex: number;
  selectedLayerId: string | null;
  selectedProperty: string | null;
  selectScene: (index: number) => void;
  selectLayer: (id: string | null) => void;
  selectProperty: (name: string | null) => void;
}

export const createSelectionSlice: StateCreator<SelectionSlice> = (set) => ({
  selectedSceneIndex: 0,
  selectedLayerId: null,
  selectedProperty: null,

  selectScene: (index) => set({ selectedSceneIndex: index, selectedLayerId: null, selectedProperty: null }),
  selectLayer: (id) => set({ selectedLayerId: id, selectedProperty: null }),
  selectProperty: (name) => set({ selectedProperty: name }),
});
