import type { StateCreator } from 'zustand';
import type { Composition, Scene, Layer, KeyframeTrack } from '../types';

export interface CompositionSlice {
  composition: Composition;
  setComposition: (composition: Composition) => void;
  updateScene: (sceneIndex: number, patch: Partial<Scene>) => void;
  addScene: (scene: Scene, insertIndex?: number) => void;
  removeScene: (sceneIndex: number) => void;
  reorderScenes: (fromIndex: number, toIndex: number) => void;
  duplicateScene: (sceneIndex: number) => void;
  addLayer: (sceneIndex: number, layer: Layer) => void;
  updateLayer: (sceneIndex: number, layerId: string, patch: Partial<Layer>) => void;
  removeLayer: (sceneIndex: number, layerId: string) => void;
  reorderLayers: (sceneIndex: number, fromIndex: number, toIndex: number) => void;
  setKeyframe: (
    sceneIndex: number,
    layerId: string,
    property: string,
    frame: number,
    value: number,
    easing?: string,
  ) => void;
  removeKeyframe: (
    sceneIndex: number,
    layerId: string,
    property: string,
    frame: number,
  ) => void;
}

export const createCompositionSlice: StateCreator<CompositionSlice> = (set) => ({
  composition: {
    id: 'default',
    name: 'Untitled',
    scenes: [],
    output: { id: 'vertical-1080x1920', label: 'Vertical (1080x1920)', width: 1080, height: 1920, fps: 30 },
  },

  setComposition: (composition) => set({ composition }),

  updateScene: (sceneIndex, patch) =>
    set((state) => {
      const scenes = [...state.composition.scenes];
      scenes[sceneIndex] = { ...scenes[sceneIndex], ...patch };
      return { composition: { ...state.composition, scenes } };
    }),

  addScene: (scene, insertIndex) =>
    set((state) => {
      const scenes = [...state.composition.scenes];
      const idx = insertIndex ?? scenes.length;
      scenes.splice(idx, 0, scene);
      return { composition: { ...state.composition, scenes } };
    }),

  removeScene: (sceneIndex) =>
    set((state) => {
      const scenes = state.composition.scenes.filter((_, i) => i !== sceneIndex);
      return { composition: { ...state.composition, scenes } };
    }),

  reorderScenes: (fromIndex, toIndex) =>
    set((state) => {
      const scenes = [...state.composition.scenes];
      const [moved] = scenes.splice(fromIndex, 1);
      scenes.splice(toIndex, 0, moved);
      return { composition: { ...state.composition, scenes } };
    }),

  duplicateScene: (sceneIndex) =>
    set((state) => {
      const scenes = [...state.composition.scenes];
      const source = scenes[sceneIndex];
      const dup: Scene = {
        ...source,
        id: `${source.id}-copy-${Date.now()}`,
        label: `${source.label} (copy)`,
        layers: source.layers.map((l) => ({
          ...l,
          id: `${l.id}-copy-${Date.now()}`,
        })),
      };
      scenes.splice(sceneIndex + 1, 0, dup);
      return { composition: { ...state.composition, scenes } };
    }),

  addLayer: (sceneIndex, layer) =>
    set((state) => {
      const scenes = [...state.composition.scenes];
      scenes[sceneIndex] = {
        ...scenes[sceneIndex],
        layers: [...scenes[sceneIndex].layers, layer],
      };
      return { composition: { ...state.composition, scenes } };
    }),

  updateLayer: (sceneIndex, layerId, patch) =>
    set((state) => {
      const scenes = [...state.composition.scenes];
      scenes[sceneIndex] = {
        ...scenes[sceneIndex],
        layers: scenes[sceneIndex].layers.map((l) =>
          l.id === layerId ? ({ ...l, ...patch } as Layer) : l,
        ),
      };
      return { composition: { ...state.composition, scenes } };
    }),

  removeLayer: (sceneIndex, layerId) =>
    set((state) => {
      const scenes = [...state.composition.scenes];
      scenes[sceneIndex] = {
        ...scenes[sceneIndex],
        layers: scenes[sceneIndex].layers.filter((l) => l.id !== layerId),
      };
      return { composition: { ...state.composition, scenes } };
    }),

  reorderLayers: (sceneIndex, fromIndex, toIndex) =>
    set((state) => {
      const scenes = [...state.composition.scenes];
      const layers = [...scenes[sceneIndex].layers];
      const [moved] = layers.splice(fromIndex, 1);
      layers.splice(toIndex, 0, moved);
      scenes[sceneIndex] = { ...scenes[sceneIndex], layers };
      return { composition: { ...state.composition, scenes } };
    }),

  setKeyframe: (sceneIndex, layerId, property, frame, value, easing = 'ease-out') =>
    set((state) => {
      const scenes = [...state.composition.scenes];
      scenes[sceneIndex] = {
        ...scenes[sceneIndex],
        layers: scenes[sceneIndex].layers.map((l) => {
          if (l.id !== layerId) return l;
          const keyframes = { ...l.keyframes };
          const track: KeyframeTrack = keyframes[property]
            ? { keyframes: [...keyframes[property].keyframes] }
            : { keyframes: [] };

          // Replace existing keyframe at this frame, or insert new
          const existing = track.keyframes.findIndex((k) => k.frame === frame);
          if (existing >= 0) {
            track.keyframes[existing] = { ...track.keyframes[existing], value };
          } else {
            track.keyframes.push({ frame, value, easing: easing as import('../types').EasingType });
            track.keyframes.sort((a, b) => a.frame - b.frame);
          }

          keyframes[property] = track;
          return { ...l, keyframes } as Layer;
        }),
      };
      return { composition: { ...state.composition, scenes } };
    }),

  removeKeyframe: (sceneIndex, layerId, property, frame) =>
    set((state) => {
      const scenes = [...state.composition.scenes];
      scenes[sceneIndex] = {
        ...scenes[sceneIndex],
        layers: scenes[sceneIndex].layers.map((l) => {
          if (l.id !== layerId) return l;
          const keyframes = { ...l.keyframes };
          const track = keyframes[property];
          if (!track) return l;
          keyframes[property] = {
            keyframes: track.keyframes.filter((k) => k.frame !== frame),
          };
          return { ...l, keyframes } as Layer;
        }),
      };
      return { composition: { ...state.composition, scenes } };
    }),
});
