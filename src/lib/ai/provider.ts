import type { AIProviderConfig } from '../../types/ai';
import { createOllamaProvider } from './ollama';
import { createOpenAICompatProvider } from './openai-compat';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  model: string;
  finishReason?: string;
}

export interface LLMProvider {
  chat(messages: ChatMessage[]): Promise<LLMResponse>;
  listModels(): Promise<string[]>;
  isAvailable(): Promise<boolean>;
}

export function createProvider(config: AIProviderConfig): LLMProvider {
  switch (config.type) {
    case 'ollama':
      return createOllamaProvider(config);
    case 'openai-compatible':
      return createOpenAICompatProvider(config);
  }
}
