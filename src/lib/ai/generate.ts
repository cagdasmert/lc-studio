import type {
  AIProviderConfig,
  GenerationRequest,
  GenerationResult,
  GeneratedContent,
  GeneratedScene,
} from '../../types/ai';
import type { Composition, Scene, Layer, TextLayerData, ShapeLayerData, OutputPreset } from '../../types';
import type { BrandKit } from '../../types/brand';
import type { Template } from '../../types/template';
import type { EasingType, TransitionType } from '../../types';
import { createProvider, MAX_RESPONSE_TOKENS } from './provider';
import type { LLMResponse } from './provider';
import { buildMessages } from './prompts';
import { parseGenerationResponse, JSONExtractionError } from './parse';
import { instantiateTemplate } from '../template-utils';

/**
 * Turn a parse failure into a message that says what the model actually did
 * and what to change. Local models fail in a few recognisable ways: they spend
 * the whole token budget on reasoning, get cut off mid-JSON, or ignore the
 * schema and answer in prose.
 */
function describeFailure(err: unknown, response: LLMResponse): string {
  if (!(err instanceof JSONExtractionError)) return String(err);

  const hitLimit = response.finishReason === 'length';
  const thought = (response.reasoning ?? '').length > 0;
  const budget = response.completionTokens ?? MAX_RESPONSE_TOKENS;

  switch (err.reason) {
    case 'empty':
    case 'reasoning-only':
      if (thought && hitLimit) {
        return `The model spent all ${budget} of its response tokens on reasoning and never wrote an answer. Use a non-reasoning model (for example an instruct/coder model), or load this one with a larger context length.`;
      }
      if (thought) {
        return 'The model produced only reasoning, no answer. Try a non-reasoning model, or rerun the prompt.';
      }
      return 'The model returned an empty response. Check that the model is still loaded in your local server.';

    case 'truncated':
      return `The response was cut off after ${budget} tokens, before the JSON was complete. Try generating fewer scenes, or use a model with a larger context length.`;

    case 'no-json':
      return 'The model replied with plain text instead of JSON. Smaller models often cannot follow the schema — try a larger instruct-tuned model.';

    case 'invalid':
      return 'The model produced malformed JSON that could not be repaired. Rerun the prompt, or try a different model.';
  }
}

export async function generate(
  config: AIProviderConfig,
  request: GenerationRequest,
  output: OutputPreset,
  options: {
    brandKit?: BrandKit | null;
    template?: Template | null;
    texts?: { id: string; name: string; content: string }[];
  } = {},
): Promise<GenerationResult> {
  const provider = createProvider(config);

  let response: LLMResponse;
  try {
    const messages = buildMessages(request.mode, request.prompt, output, {
      brandKit: options.brandKit,
      template: options.template,
      texts: options.texts,
      sceneCount: request.sceneCount,
    });

    response = await provider.chat(messages);
  } catch (err) {
    return { success: false, error: String(err) };
  }

  // Keep the raw text available for inspection whether or not parsing succeeds.
  const raw = response.content || (response.reasoning ? `[reasoning only]\n${response.reasoning}` : '');

  try {
    return {
      success: true,
      data: parseGenerationResponse(response.content, request.mode),
      rawResponse: raw,
    };
  } catch (err) {
    // Some models put the JSON inside their reasoning field instead of content.
    const contentWasBlank = err instanceof JSONExtractionError
      && (err.reason === 'empty' || err.reason === 'reasoning-only');
    if (contentWasBlank && response.reasoning) {
      try {
        return {
          success: true,
          data: parseGenerationResponse(response.reasoning, request.mode),
          rawResponse: raw,
        };
      } catch { /* fall through to the original failure */ }
    }
    return { success: false, error: describeFailure(err, response), rawResponse: raw };
  }
}

/**
 * Convert AI-generated scenes into real Composition scenes
 * that can be added to a composition.
 */
export function convertGeneratedScenes(
  generated: GeneratedScene[],
  fps: number,
): Scene[] {
  return generated.map((gs, i) => {
    const durationFrames = Math.round(gs.durationSeconds * fps);
    const layers: Layer[] = gs.layers.map((gl, j) => {
      const baseId = `ai-${Date.now()}-${i}-${j}`;

      // Build keyframes from animation descriptors
      const keyframes: Record<string, { keyframes: { frame: number; value: number; easing: EasingType }[] }> = {};
      if (gl.animation) {
        for (const anim of gl.animation) {
          const easing = (anim.easing || 'ease-out') as EasingType;
          keyframes[anim.property] = {
            keyframes: [
              { frame: anim.startFrame, value: anim.from, easing },
              { frame: anim.endFrame, value: anim.to, easing: 'linear' as EasingType },
            ],
          };
        }
      }

      if (gl.type === 'text') {
        const layer: TextLayerData = {
          id: baseId,
          name: gl.name,
          type: 'text',
          startFrame: 0,
          endFrame: durationFrames,
          x: gl.x,
          y: gl.y,
          width: gl.width,
          height: gl.height,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          opacity: 1,
          anchorX: 0.5,
          anchorY: 0.5,
          zIndex: j,
          blendMode: 'normal',
          effects: [],
          visible: true,
          locked: false,
          keyframes,
          content: gl.content ?? 'Text',
          fontSize: gl.fontSize ?? 48,
          fontFamily: 'sans-serif',
          fontWeight: (gl.fontWeight ?? 'normal') as TextLayerData['fontWeight'],
          fontStyle: 'normal',
          color: gl.color ?? '#ffffff',
          align: (gl.align ?? 'center') as TextLayerData['align'],
          verticalAlign: 'middle',
          lineHeight: 1.4,
          letterSpacing: 0,
          maxWidth: 0,
          textStroke: null,
          textShadow: null,
        };
        return layer;
      } else {
        const layer: ShapeLayerData = {
          id: baseId,
          name: gl.name,
          type: 'shape',
          startFrame: 0,
          endFrame: durationFrames,
          x: gl.x,
          y: gl.y,
          width: gl.width,
          height: gl.height,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          opacity: 1,
          anchorX: 0.5,
          anchorY: 0.5,
          zIndex: j,
          blendMode: 'normal',
          effects: [],
          visible: true,
          locked: false,
          keyframes,
          shapeType: (gl.shapeType ?? 'rect') as ShapeLayerData['shapeType'],
          fill: gl.fill ?? '#e94560',
          stroke: '',
          strokeWidth: 0,
          cornerRadius: gl.cornerRadius ?? 0,
        };
        return layer;
      }
    });

    const transition = gs.transition as TransitionType;
    const validTransitions: TransitionType[] = [
      'none', 'cut', 'fade', 'slide-left', 'slide-right', 'slide-up', 'slide-down',
      'wipe-horizontal', 'wipe-vertical', 'zoom-in', 'zoom-out', 'dissolve',
    ];

    return {
      id: `scene-ai-${Date.now()}-${i}`,
      label: gs.label,
      durationFrames,
      backgroundColor: gs.backgroundColor,
      layers,
      transition: validTransitions.includes(transition) ? transition : 'fade',
      transitionDurationFrames: transition !== 'cut' && transition !== 'none' ? Math.min(15, Math.floor(durationFrames / 4)) : 0,
    };
  });
}

/**
 * Apply generated content to a composition.
 */
export function applyGeneration(
  composition: Composition,
  content: GeneratedContent,
  options: {
    template?: Template | null;
  } = {},
): Composition {
  switch (content.mode) {
    case 'full-composition': {
      if (!content.scenes) return composition;
      const scenes = convertGeneratedScenes(content.scenes, composition.output.fps);
      return { ...composition, scenes, id: `comp-ai-${Date.now()}` };
    }

    case 'add-scenes': {
      if (!content.scenes) return composition;
      const newScenes = convertGeneratedScenes(content.scenes, composition.output.fps);
      return { ...composition, scenes: [...composition.scenes, ...newScenes] };
    }

    case 'template-fill': {
      if (!content.placeholderValues || !options.template) return composition;
      return instantiateTemplate(options.template, content.placeholderValues);
    }

    case 'rewrite-text': {
      if (!content.textRewrites) return composition;
      const rewrites = content.textRewrites;
      return {
        ...composition,
        scenes: composition.scenes.map((scene) => ({
          ...scene,
          layers: scene.layers.map((layer) => {
            if (layer.type === 'text' && rewrites[layer.id]) {
              return { ...layer, content: rewrites[layer.id] };
            }
            return layer;
          }),
        })),
      };
    }
  }
}
