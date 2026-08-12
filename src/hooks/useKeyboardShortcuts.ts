import { useEffect } from 'react';
import { useStore } from '../store';
import { getTotalFrames } from '../renderer/compositor';

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' ||
    (el as HTMLElement).isContentEditable;
}

export function useKeyboardShortcuts(actions: {
  save: () => void;
  saveAs: () => void;
  open: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;

      // Always allow mod shortcuts, even when input is focused
      if (mod) {
        switch (e.key.toLowerCase()) {
          case 'z':
            e.preventDefault();
            if (e.shiftKey) {
              useStore.temporal.getState().redo();
            } else {
              useStore.temporal.getState().undo();
            }
            return;
          case 'y':
            e.preventDefault();
            useStore.temporal.getState().redo();
            return;
          case 's':
            e.preventDefault();
            if (e.shiftKey) {
              actions.saveAs();
            } else {
              actions.save();
            }
            return;
          case 'o':
            e.preventDefault();
            actions.open();
            return;
          case 'd':
            if (!isInputFocused()) {
              e.preventDefault();
              const state = useStore.getState();
              const { selectedSceneIndex, selectedLayerId } = state;
              if (selectedLayerId) {
                const scene = state.composition.scenes[selectedSceneIndex];
                const layer = scene?.layers.find((l) => l.id === selectedLayerId);
                if (layer) {
                  const dup: import('../types').Layer = JSON.parse(JSON.stringify(layer));
                  dup.id = `${layer.id}-dup-${Date.now()}`;
                  dup.name = `${layer.name} (copy)`;
                  dup.y = layer.y + 20;
                  state.addLayer(selectedSceneIndex, dup);
                }
              }
            }
            return;
        }
      }

      // Don't handle non-mod shortcuts when typing in inputs
      if (isInputFocused()) return;

      const state = useStore.getState();

      switch (e.key) {
        case ' ':
          e.preventDefault();
          state.togglePlay();
          break;
        case 'Delete':
        case 'Backspace': {
          const { selectedLayerId, selectedSceneIndex } = state;
          if (selectedLayerId) {
            e.preventDefault();
            state.removeLayer(selectedSceneIndex, selectedLayerId);
            state.selectLayer(null);
          }
          break;
        }
        case 'ArrowLeft':
          e.preventDefault();
          state.stepBackward();
          break;
        case 'ArrowRight':
          e.preventDefault();
          state.stepForward();
          break;
        case 'Home':
          e.preventDefault();
          state.setCurrentFrame(0);
          break;
        case 'End': {
          e.preventDefault();
          const total = getTotalFrames(state.composition);
          state.setCurrentFrame(Math.max(0, total - 1));
          break;
        }
        case 'v':
        case 'V':
          state.setToolMode('select');
          break;
        case 'm':
        case 'M':
          state.setToolMode('move');
          break;
        case 'h':
        case 'H':
          state.setToolMode('hand');
          break;
        case 'g':
        case 'G':
          state.toggleGrid();
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [actions]);
}
