import type { GeneratedScene, GeneratedLayer, GeneratedContent, GenerationMode } from '../../types/ai';

/** Why JSON extraction failed — used to build an actionable error message. */
export type ExtractionFailure = 'empty' | 'reasoning-only' | 'no-json' | 'truncated' | 'invalid';

export class JSONExtractionError extends Error {
  constructor(
    message: string,
    readonly reason: ExtractionFailure,
    readonly snippet: string = '',
  ) {
    super(message);
    this.name = 'JSONExtractionError';
  }
}

/**
 * Remove chain-of-thought blocks that reasoning models emit inline in their
 * content (`<think>...</think>`, `<thinking>`, `<reasoning>`, `<scratchpad>`).
 * An unclosed opening tag means the response was cut off mid-thought, so
 * everything from the tag onward is reasoning.
 */
export function stripReasoning(raw: string): string {
  const tags = ['think', 'thinking', 'reasoning', 'scratchpad', 'reflection'];
  let out = raw;
  for (const tag of tags) {
    out = out.replace(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, 'gi'), '');
    out = out.replace(new RegExp(`<${tag}>[\\s\\S]*$`, 'i'), '');
    // Some models emit only the closing tag after an implicit reasoning prefix.
    const closing = out.toLowerCase().lastIndexOf(`</${tag}>`);
    if (closing >= 0) out = out.slice(closing + tag.length + 3);
  }
  return out;
}

interface JSONCandidate {
  text: string;
  complete: boolean;
}

/**
 * Find the first JSON value in `text` by bracket matching, ignoring brackets
 * that appear inside strings. Returns the partial text when the value never
 * closes (a truncated response).
 */
function findCandidate(text: string): JSONCandidate | null {
  const firstBracket = text.indexOf('[');
  const firstBrace = text.indexOf('{');

  let start: number;
  if (firstBracket >= 0 && (firstBrace < 0 || firstBracket < firstBrace)) {
    start = firstBracket;
  } else if (firstBrace >= 0) {
    start = firstBrace;
  } else {
    return null;
  }

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') inString = true;
    else if (ch === '[' || ch === '{') stack.push(ch);
    else if (ch === ']' || ch === '}') {
      stack.pop();
      if (stack.length === 0) return { text: text.slice(start, i + 1), complete: true };
    }
  }

  return { text: text.slice(start), complete: false };
}

/**
 * Salvage a truncated JSON value by cutting back to the last complete nested
 * element and closing the brackets that are still open. Local models routinely
 * hit their token cap mid-array; the scenes generated before the cut are still
 * usable.
 */
function repairTruncated(partial: string): string | null {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  let safeIndex = -1;
  let safeStack: string[] = [];

  for (let i = 0; i < partial.length; i++) {
    const ch = partial[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') {
        inString = false;
        // A closed string directly inside an array is a complete element.
        if (stack[stack.length - 1] === '[') {
          safeIndex = i + 1;
          safeStack = [...stack];
        }
      }
      continue;
    }

    if (ch === '"') inString = true;
    else if (ch === '[' || ch === '{') stack.push(ch);
    else if (ch === ']' || ch === '}') {
      stack.pop();
      if (stack.length > 0) {
        safeIndex = i + 1;
        safeStack = [...stack];
      }
    }
  }

  if (safeIndex < 0 || safeStack.length === 0) return null;

  const closers = safeStack
    .slice()
    .reverse()
    .map((open) => (open === '[' ? ']' : '}'))
    .join('');

  return partial.slice(0, safeIndex) + closers;
}

/** Drop trailing commas, which several local models emit. */
function relaxJSON(text: string): string {
  return text.replace(/,(\s*[}\]])/g, '$1');
}

function tryParse(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch { /* continue */ }
  try {
    return { ok: true, value: JSON.parse(relaxJSON(text)) };
  } catch { /* continue */ }
  return { ok: false };
}

/** Parse the first complete JSON value in `text`, or undefined. */
function findParsable(text: string): { value: unknown } | undefined {
  // Whole response is JSON
  const direct = tryParse(text);
  if (direct.ok) return { value: direct.value };

  // JSON inside a markdown code fence
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    const fenced = tryParse(fenceMatch[1].trim());
    if (fenced.ok) return { value: fenced.value };
  }

  // JSON surrounded by prose — bracket-match, ignoring brackets inside strings
  const candidate = findCandidate(text);
  if (candidate?.complete) {
    const parsed = tryParse(candidate.text);
    if (parsed.ok) return { value: parsed.value };
  }

  return undefined;
}

/**
 * Extract JSON from an LLM response. Handles raw JSON, markdown code fences,
 * surrounding prose, inline reasoning blocks, trailing commas, and responses
 * truncated by the token limit.
 */
export function extractJSON(raw: string): unknown {
  if (!raw.trim()) {
    throw new JSONExtractionError('The model returned an empty response.', 'empty');
  }

  const trimmed = stripReasoning(raw).trim();

  const found = findParsable(trimmed);
  if (found) return found.value;

  // Reasoning stripping is heuristic: if it left nothing usable but the
  // untouched response parses, trust the untouched response.
  if (trimmed !== raw.trim()) {
    const inRaw = findParsable(raw.trim());
    if (inRaw) return inRaw.value;
  }

  if (!trimmed) {
    throw new JSONExtractionError(
      'The model returned only reasoning, no answer.',
      'reasoning-only',
      raw.slice(0, 400),
    );
  }

  const candidate = findCandidate(trimmed);
  if (!candidate) {
    throw new JSONExtractionError(
      'No JSON found in the response — the model replied with plain text.',
      'no-json',
      trimmed.slice(0, 400),
    );
  }

  // A complete candidate would have parsed in findParsable above, so anything
  // left here is either truncated or malformed.
  if (!candidate.complete) {
    const repaired = repairTruncated(candidate.text);
    if (repaired) {
      const salvaged = tryParse(repaired);
      if (salvaged.ok) return salvaged.value;
    }
    throw new JSONExtractionError(
      'The response was cut off before the JSON was complete.',
      'truncated',
      candidate.text.slice(-400),
    );
  }

  throw new JSONExtractionError(
    'The response contained JSON-like text that could not be parsed.',
    'invalid',
    candidate.text.slice(0, 400),
  );
}

function validateLayer(raw: unknown): GeneratedLayer | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const type = obj.type as string;
  if (type !== 'text' && type !== 'shape') return null;

  return {
    name: String(obj.name ?? `${type} layer`),
    type,
    content: obj.content != null ? String(obj.content) : undefined,
    fontSize: typeof obj.fontSize === 'number' ? obj.fontSize : undefined,
    fontWeight: typeof obj.fontWeight === 'string' ? obj.fontWeight : undefined,
    color: typeof obj.color === 'string' ? obj.color : undefined,
    x: typeof obj.x === 'number' ? obj.x : 540,
    y: typeof obj.y === 'number' ? obj.y : 960,
    width: typeof obj.width === 'number' ? obj.width : 800,
    height: typeof obj.height === 'number' ? obj.height : 100,
    align: typeof obj.align === 'string' ? obj.align : undefined,
    shapeType: typeof obj.shapeType === 'string' ? obj.shapeType : undefined,
    fill: typeof obj.fill === 'string' ? obj.fill : undefined,
    cornerRadius: typeof obj.cornerRadius === 'number' ? obj.cornerRadius : undefined,
    animation: Array.isArray(obj.animation)
      ? obj.animation.filter((a): a is GeneratedLayer['animation'] extends (infer U)[] | undefined ? U : never => {
          if (!a || typeof a !== 'object') return false;
          return typeof a.property === 'string';
        }).map((a: Record<string, unknown>) => ({
          property: String(a.property),
          from: Number(a.from ?? 0),
          to: Number(a.to ?? 1),
          startFrame: Number(a.startFrame ?? 0),
          endFrame: Number(a.endFrame ?? 15),
          easing: String(a.easing ?? 'ease-out'),
        }))
      : undefined,
  };
}

function validateScene(raw: unknown): GeneratedScene | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const layers = Array.isArray(obj.layers)
    ? obj.layers.map(validateLayer).filter((l): l is GeneratedLayer => l !== null)
    : [];

  if (layers.length === 0) return null;

  return {
    label: String(obj.label ?? 'Scene'),
    durationSeconds: typeof obj.durationSeconds === 'number' ? obj.durationSeconds : 3,
    backgroundColor: typeof obj.backgroundColor === 'string' ? obj.backgroundColor : '#1a1a2e',
    layers,
    transition: typeof obj.transition === 'string' ? obj.transition : 'fade',
  };
}

/**
 * Models frequently wrap the scene array in an object (`{"scenes": [...]}`)
 * despite being asked for a bare array. Unwrap the common key names.
 */
function unwrapScenes(parsed: unknown): unknown {
  if (!parsed || typeof parsed !== 'object') return parsed;
  const obj = parsed as Record<string, unknown>;
  for (const key of ['scenes', 'composition', 'data', 'result']) {
    if (Array.isArray(obj[key])) return obj[key];
  }
  return parsed;
}

export function parseGenerationResponse(
  raw: string,
  mode: GenerationMode,
): GeneratedContent {
  const parsed = extractJSON(raw);

  switch (mode) {
    case 'full-composition':
    case 'add-scenes': {
      const arr = Array.isArray(parsed) ? parsed : [unwrapScenes(parsed)].flat();
      const scenes = arr.map(validateScene).filter((s): s is GeneratedScene => s !== null);
      if (scenes.length === 0) {
        throw new Error('No valid scenes found in AI response');
      }
      return { mode, scenes };
    }

    case 'template-fill': {
      if (typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Expected a JSON object for template fill');
      }
      const values: Record<string, string> = {};
      for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
        values[key] = String(val);
      }
      return { mode, placeholderValues: values };
    }

    case 'rewrite-text': {
      if (typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Expected a JSON object for text rewrite');
      }
      const rewrites: Record<string, string> = {};
      for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
        rewrites[key] = String(val);
      }
      return { mode, textRewrites: rewrites };
    }
  }
}
