# Phase E: AI Generation Layer

> **Status: COMPLETED.** Fully implemented. LM Studio was added as a third provider. HTTP calls use Tauri HTTP plugin (`@tauri-apps/plugin-http`) for CORS bypass instead of direct browser fetch.

## Design Decisions

- **Local-first**: Ollama (localhost:11434) is the primary LLM backend — works fully offline
- **Optional cloud**: OpenAI-compatible API support for users who want cloud models
- **LM Studio**: Added as a third provider (localhost:1234/v1) for local model serving
- **Tauri HTTP**: LLM calls routed through Tauri's Rust HTTP client to bypass browser CORS restrictions with localhost services
- **Structured output**: Prompts request JSON matching our Composition schema; responses are parsed and validated
- **Brand-aware**: Active brand kit colors/fonts are injected into the system prompt
- **Template-aware**: Can fill template placeholders or generate full compositions

## Generation Modes

1. **Full composition** — Generate a complete multi-scene composition from a prompt
2. **Template fill** — AI fills template placeholders based on a prompt
3. **Scene addition** — Add AI-generated scenes to existing composition
4. **Text rewrite** — Rewrite text content of selected text layers

## Architecture

```
User prompt
    ↓
[Prompt Builder] — injects brand kit, template, output preset, schema
    ↓
[LLM Provider] — Ollama or OpenAI-compatible HTTP API
    ↓
[Response Parser] — extract JSON from LLM response, validate against schema
    ↓
[Preview] — user reviews generated content
    ↓
[Apply] — merge into composition via store actions
```

## Files

| File | Action | Purpose |
|------|--------|---------|
| `src/types/ai.ts` | NEW | Provider config, generation request/response types |
| `src/lib/ai/provider.ts` | NEW | LLM provider interface |
| `src/lib/ai/ollama.ts` | NEW | Ollama HTTP API client (localhost:11434) |
| `src/lib/ai/openai-compat.ts` | NEW | OpenAI-compatible API client |
| `src/lib/ai/prompts.ts` | NEW | System prompts and output schema definitions |
| `src/lib/ai/generate.ts` | NEW | Generation orchestrator: prompt → LLM → parse → validate |
| `src/lib/ai/parse.ts` | NEW | Extract and validate JSON from LLM responses |
| `src/store/ai-slice.ts` | NEW | Provider config, generation state |
| `src/store/index.ts` | UPDATE | Add AISlice |
| `src/components/storyboard/AIPanel.tsx` | NEW | Main generation UI: prompt, mode, preview, apply |
| `src/components/storyboard/AISettings.tsx` | NEW | Provider config dialog |
| `src/App.tsx` | UPDATE | Add AI panel toggle |
| `src/App.css` | UPDATE | AI panel styles |

## Implementation Order

1. Types + Provider interface + Ollama client + OpenAI client
2. Prompt engineering + Response parser
3. Generation service
4. Store slice
5. UI: AISettings + AIPanel
6. Wire into App
