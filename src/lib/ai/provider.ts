import type { AIProviderConfig } from '../../types/ai';
import { createOllamaProvider } from './ollama';
import { createLMStudioProvider } from './lmstudio';
import { createOpenAICompatProvider } from './openai-compat';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Token budget for a generation. Reasoning models spend this on chain-of-thought
 * before writing any content, so it needs headroom well beyond the JSON itself.
 */
export const MAX_RESPONSE_TOKENS = 8192;

export interface LLMResponse {
  content: string;
  model: string;
  finishReason?: string;
  /** Chain-of-thought returned in a separate field by reasoning models. */
  reasoning?: string;
  /** Tokens the model actually generated, when the server reports them. */
  completionTokens?: number;
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
    case 'lmstudio':
      return createLMStudioProvider(config);
    case 'openai-compatible':
      return createOpenAICompatProvider(config);
  }
}
