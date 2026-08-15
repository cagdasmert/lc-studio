import type { LMStudioConfig } from '../../types/ai';
import type { LLMProvider, ChatMessage, LLMResponse } from './provider';
import { MAX_RESPONSE_TOKENS } from './provider';
import { aiFetch } from './http';

export function createLMStudioProvider(config: LMStudioConfig): LLMProvider {
  const baseUrl = config.baseUrl.replace(/\/+$/, '');

  return {
    async chat(messages: ChatMessage[]): Promise<LLMResponse> {
      const res = await aiFetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.model,
          messages,
          temperature: 0.7,
          max_tokens: MAX_RESPONSE_TOKENS,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`LM Studio error (${res.status}): ${text}`);
      }

      const data = await res.json();
      const choice = data.choices?.[0];
      return {
        content: choice?.message?.content ?? '',
        model: data.model ?? config.model,
        finishReason: choice?.finish_reason,
        reasoning: choice?.message?.reasoning_content ?? choice?.message?.reasoning ?? undefined,
        completionTokens: data.usage?.completion_tokens,
      };
    },

    async listModels(): Promise<string[]> {
      try {
        const res = await aiFetch(`${baseUrl}/models`);
        if (!res.ok) return [];
        const data = await res.json();
        return (data.data ?? []).map((m: { id: string }) => m.id);
      } catch {
        return [];
      }
    },

    async isAvailable(): Promise<boolean> {
      try {
        const res = await aiFetch(`${baseUrl}/models`);
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}
