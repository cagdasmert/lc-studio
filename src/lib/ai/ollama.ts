import type { OllamaConfig } from '../../types/ai';
import type { LLMProvider, ChatMessage, LLMResponse } from './provider';
import { aiFetch } from './http';

export function createOllamaProvider(config: OllamaConfig): LLMProvider {
  const baseUrl = config.baseUrl.replace(/\/+$/, '');

  return {
    async chat(messages: ChatMessage[]): Promise<LLMResponse> {
      const res = await aiFetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.model,
          messages,
          stream: false,
          options: {
            temperature: 0.7,
            num_predict: 4096,
          },
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Ollama error (${res.status}): ${text}`);
      }

      const data = await res.json();
      return {
        content: data.message?.content ?? '',
        model: data.model ?? config.model,
        finishReason: data.done_reason,
      };
    },

    async listModels(): Promise<string[]> {
      const res = await aiFetch(`${baseUrl}/api/tags`);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.models ?? []).map((m: { name: string }) => m.name);
    },

    async isAvailable(): Promise<boolean> {
      try {
        const res = await aiFetch(`${baseUrl}/api/tags`);
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}
