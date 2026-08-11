import type { OpenAICompatConfig } from '../../types/ai';
import type { LLMProvider, ChatMessage, LLMResponse } from './provider';

export function createOpenAICompatProvider(config: OpenAICompatConfig): LLMProvider {
  const baseUrl = config.baseUrl.replace(/\/+$/, '');

  return {
    async chat(messages: ChatMessage[]): Promise<LLMResponse> {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          temperature: 0.7,
          max_tokens: 4096,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`API error (${res.status}): ${text}`);
      }

      const data = await res.json();
      const choice = data.choices?.[0];
      return {
        content: choice?.message?.content ?? '',
        model: data.model ?? config.model,
        finishReason: choice?.finish_reason,
      };
    },

    async listModels(): Promise<string[]> {
      try {
        const res = await fetch(`${baseUrl}/models`, {
          headers: { 'Authorization': `Bearer ${config.apiKey}` },
        });
        if (!res.ok) return [];
        const data = await res.json();
        return (data.data ?? []).map((m: { id: string }) => m.id);
      } catch {
        return [];
      }
    },

    async isAvailable(): Promise<boolean> {
      try {
        const res = await fetch(`${baseUrl}/models`, {
          headers: { 'Authorization': `Bearer ${config.apiKey}` },
          signal: AbortSignal.timeout(5000),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}
