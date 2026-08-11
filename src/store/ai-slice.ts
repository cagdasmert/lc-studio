import type { StateCreator } from 'zustand';
import type { AIProviderConfig, GenerationMode } from '../types/ai';

export interface AISlice {
  aiProvider: AIProviderConfig;
  aiAvailable: boolean | null; // null = not checked yet
  generationMode: GenerationMode;
  isGenerating: boolean;
  lastError: string | null;
  setAIProvider: (config: AIProviderConfig) => void;
  setAIAvailable: (available: boolean | null) => void;
  setGenerationMode: (mode: GenerationMode) => void;
  setGenerating: (generating: boolean) => void;
  setLastError: (error: string | null) => void;
}

export const createAISlice: StateCreator<AISlice> = (set) => ({
  aiProvider: {
    type: 'ollama',
    baseUrl: 'http://localhost:11434',
    model: 'llama3',
  },
  aiAvailable: null,
  generationMode: 'full-composition',
  isGenerating: false,
  lastError: null,

  setAIProvider: (config) => set({ aiProvider: config, aiAvailable: null }),
  setAIAvailable: (available) => set({ aiAvailable: available }),
  setGenerationMode: (mode) => set({ generationMode: mode }),
  setGenerating: (generating) => set({ isGenerating: generating }),
  setLastError: (error) => set({ lastError: error }),
});
