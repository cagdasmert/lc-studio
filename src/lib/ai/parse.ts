import type { GeneratedScene, GeneratedLayer, GeneratedContent, GenerationMode } from '../../types/ai';

/**
 * Extract JSON from an LLM response. Handles raw JSON, markdown code fences,
 * and responses with surrounding text.
 */
export function extractJSON(raw: string): unknown {
  const trimmed = raw.trim();

  // Try parsing directly
  try {
    return JSON.parse(trimmed);
  } catch { /* continue */ }

  // Try extracting from markdown code fence
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch { /* continue */ }
  }

  // Try finding the first [ or { and matching to the last ] or }
  const firstBracket = trimmed.indexOf('[');
  const firstBrace = trimmed.indexOf('{');

  let start: number;
  let end: number;

  if (firstBracket >= 0 && (firstBrace < 0 || firstBracket < firstBrace)) {
    start = firstBracket;
    end = trimmed.lastIndexOf(']');
  } else if (firstBrace >= 0) {
    start = firstBrace;
    end = trimmed.lastIndexOf('}');
  } else {
    throw new Error('No JSON found in response');
  }

  if (end <= start) {
    throw new Error('No valid JSON structure found in response');
  }

  const candidate = trimmed.slice(start, end + 1);
  return JSON.parse(candidate);
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

export function parseGenerationResponse(
  raw: string,
  mode: GenerationMode,
): GeneratedContent {
  const parsed = extractJSON(raw);

  switch (mode) {
    case 'full-composition':
    case 'add-scenes': {
      const arr = Array.isArray(parsed) ? parsed : [parsed];
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
