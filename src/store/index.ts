import { create } from 'zustand';
import { temporal } from 'zundo';
import { createCompositionSlice, type CompositionSlice } from './composition-slice';
import { createSelectionSlice, type SelectionSlice } from './selection-slice';
import { createPlaybackSlice, type PlaybackSlice } from './playback-slice';
import { createUISlice, type UISlice } from './ui-slice';
import { createRenderSlice, type RenderSlice } from './render-slice';
import { createBrandSlice, type BrandSlice } from './brand-slice';
import { createAISlice, type AISlice } from './ai-slice';

export type StoreState = CompositionSlice & SelectionSlice & PlaybackSlice & UISlice & RenderSlice & BrandSlice & AISlice;

export const useStore = create<StoreState>()(
  temporal(
    (...a) => ({
      ...createCompositionSlice(...a),
      ...createSelectionSlice(...a),
      ...createPlaybackSlice(...a),
      ...createUISlice(...a),
      ...createRenderSlice(...a),
      ...createBrandSlice(...a),
      ...createAISlice(...a),
    }),
    {
      // Only track composition changes for undo/redo, not UI state
      partialize: (state) => ({
        composition: state.composition,
      }),
      limit: 50,
    },
  ),
);
