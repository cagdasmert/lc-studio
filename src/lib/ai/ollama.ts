import type { OllamaConfig } from '../../types/ai';
import type { LLMProvider, ChatMessage, LLMResponse } from './provider';
import { MAX_RESPONSE_TOKENS } from './provider';
import { aiFetch } from './http';

export function createOllamaProvider(config: OllamaConfig): LLMProvider {
  const baseUrl = config.baseUrl.replace(/\/+$/, '');

  return {
    async chat(messages: ChatMessage[]): Promise<LLMResponse> {
      const base = {
        model: config.model,
        messages,
        stream: false,
        options: {
          temperature: 0.7,
          num_predict: MAX_RESPONSE_TOKENS,
        },
      };

      // `format: 'json'` constrains decoding to valid JSON; `think: false`
      // stops reasoning models from spending the whole budget thinking.
      // Older Ollama builds and non-thinking models reject these, so fall
      // back to a plain request when the server rejects the body.
      let res = await aiFetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...base, format: 'json', think: false }),
      });

      if (res.status === 400) {
        res = await aiFetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...base, format: 'json' }),
        });
        if (res.status === 400) {
          res = await aiFetch(`${baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(base),
          });
        }
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Ollama error (${res.status}): ${text}`);
      }

      const data = await res.json();
      return {
        content: data.message?.content ?? '',
        model: data.model ?? config.model,
        finishReason: data.done_reason,
        reasoning: data.message?.thinking ?? undefined,
        completionTokens: data.eval_count,
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
