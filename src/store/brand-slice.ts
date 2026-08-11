import type { StateCreator } from 'zustand';
import type { BrandKit } from '../types/brand';
import { createDefaultBrandKit } from '../types/brand';

export interface BrandSlice {
  brandKits: BrandKit[];
  activeBrandKitId: string | null;
  addBrandKit: () => string;
  updateBrandKit: (id: string, patch: Partial<BrandKit>) => void;
  removeBrandKit: (id: string) => void;
  setActiveBrandKit: (id: string | null) => void;
}

export const createBrandSlice: StateCreator<BrandSlice> = (set) => ({
  brandKits: [],
  activeBrandKitId: null,

  addBrandKit: () => {
    const kit = createDefaultBrandKit();
    set((s) => ({ brandKits: [...s.brandKits, kit] }));
    return kit.id;
  },

  updateBrandKit: (id, patch) =>
    set((s) => ({
      brandKits: s.brandKits.map((k) =>
        k.id === id ? { ...k, ...patch } : k,
      ),
    })),

  removeBrandKit: (id) =>
    set((s) => ({
      brandKits: s.brandKits.filter((k) => k.id !== id),
      activeBrandKitId: s.activeBrandKitId === id ? null : s.activeBrandKitId,
    })),

  setActiveBrandKit: (id) => set({ activeBrandKitId: id }),
});
