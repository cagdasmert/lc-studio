import type { BrandKit } from '../../types/brand';
import type { Template } from '../../types/template';
import type { OutputPreset } from '../../types';
import type { GenerationMode } from '../../types/ai';
import type { ChatMessage } from './provider';

const SCENE_SCHEMA = `{
  "label": "Scene name",
  "durationSeconds": 3,
  "backgroundColor": "#1a1a2e",
  "layers": [
    {
      "name": "Layer name",
      "type": "text",
      "content": "Your text here",
      "fontSize": 48,
      "fontWeight": "bold",
      "color": "#ffffff",
      "x": 540, "y": 800,
      "width": 900, "height": 100,
      "align": "center",
      "animation": [
        { "property": "opacity", "from": 0, "to": 1, "startFrame": 0, "endFrame": 15, "easing": "ease-out" }
      ]
    },
    {
      "name": "Shape name",
      "type": "shape",
      "shapeType": "rect",
      "fill": "#e94560",
      "x": 540, "y": 960,
      "width": 200, "height": 4,
      "cornerRadius": 2
    }
  ],
  "transition": "fade"
}`;

function buildSystemPrompt(
  mode: GenerationMode,
  output: OutputPreset,
  brandKit: BrandKit | null,
): string {
  let prompt = `You are a motion graphics content generator for a video creation tool. You produce structured JSON that defines animated video compositions.

Canvas dimensions: ${output.width}x${output.height} pixels at ${output.fps} FPS.
Coordinate system: (0,0) is top-left. Center is (${output.width / 2}, ${output.height / 2}).

Layer types available: "text" and "shape".
- Text layers: content, fontSize (16-120), fontWeight ("normal"/"bold"), fontStyle ("normal"/"italic"), color (hex), align ("left"/"center"/"right"), verticalAlign ("top"/"middle"/"bottom"), lineHeight (1-2), letterSpacing (0-10).
- Shape layers: shapeType ("rect"/"circle"/"ellipse"/"rounded-rect"/"line"), fill (hex), stroke (hex), strokeWidth (0-10), cornerRadius (0-50).

Animations: each layer can have an animation array. Each animation targets a property (opacity, x, y, scaleX, scaleY, rotation, width, height) with from/to values, startFrame/endFrame, and easing (linear, ease-in, ease-out, ease-in-out, ease-out-back, ease-in-out-cubic).

Transitions between scenes: "cut", "fade", "slide-left", "slide-right", "slide-up", "slide-down", "dissolve", "zoom-in", "zoom-out".`;

  if (brandKit) {
    prompt += `\n\nActive brand kit "${brandKit.name}":
- Primary color: ${brandKit.colors.primary}
- Secondary color: ${brandKit.colors.secondary}
- Accent color: ${brandKit.colors.accent}
- Background color: ${brandKit.colors.background}
- Text color: ${brandKit.colors.text}
- Heading font: ${brandKit.fonts.heading}
- Body font: ${brandKit.fonts.body}
Use these colors and fonts consistently in generated content.`;
  }

  if (mode === 'full-composition' || mode === 'add-scenes') {
    prompt += `\n\nRespond ONLY with a JSON array of scene objects. No markdown, no explanation, no code fences. Each scene follows this schema:
${SCENE_SCHEMA}

Tips for good compositions:
- Use 2-4 scenes for short videos, 4-8 for longer ones
- Each scene should be 2-4 seconds (60-120 frames at 30fps)
- Animate text entrance with opacity and position
- Use accent shapes (bars, circles) to add visual interest
- Vary text sizes: large titles (56-72px), medium subtitles (28-36px), small body text (18-24px)
- Place text and shapes intentionally — avoid overlapping content`;
  }

  return prompt;
}

function buildTemplateFillPrompt(template: Template): string {
  const placeholderList = template.placeholders
    .map((p) => `- "${p.id}" (${p.type}): ${p.label} (default: "${p.defaultValue}")`)
    .join('\n');

  return `You are filling in a "${template.name}" template: ${template.description}

Placeholders to fill:
${placeholderList}

Respond ONLY with a JSON object mapping placeholder IDs to values. No markdown, no explanation, no code fences. Example:
{"title": "My Video Title", "subtitle": "An amazing subtitle"}

Generate creative, engaging content that fits the template's purpose. Keep text concise — suitable for video titles and short-form content.`;
}

function buildRewritePrompt(texts: { id: string; name: string; content: string }[]): string {
  const textList = texts.map((t) => `- "${t.id}" (${t.name}): "${t.content}"`).join('\n');

  return `You are rewriting text content for video layers. Here are the current texts:
${textList}

Respond ONLY with a JSON object mapping layer IDs to new text content. No markdown, no explanation, no code fences. Example:
{"layer-id-1": "New text for layer 1", "layer-id-2": "New text for layer 2"}

Keep the rewrites concise and impactful — suitable for short-form video.`;
}

export function buildMessages(
  mode: GenerationMode,
  userPrompt: string,
  output: OutputPreset,
  options: {
    brandKit?: BrandKit | null;
    template?: Template | null;
    texts?: { id: string; name: string; content: string }[];
    sceneCount?: number;
  } = {},
): ChatMessage[] {
  const messages: ChatMessage[] = [];

  if (mode === 'template-fill' && options.template) {
    messages.push({ role: 'system', content: buildTemplateFillPrompt(options.template) });
  } else if (mode === 'rewrite-text' && options.texts) {
    messages.push({ role: 'system', content: buildRewritePrompt(options.texts) });
  } else {
    messages.push({ role: 'system', content: buildSystemPrompt(mode, output, options.brandKit ?? null) });
  }

  let userMsg = userPrompt;
  if (mode === 'full-composition' && options.sceneCount) {
    userMsg += `\n\nGenerate exactly ${options.sceneCount} scenes.`;
  }
  if (mode === 'add-scenes' && options.sceneCount) {
    userMsg += `\n\nGenerate exactly ${options.sceneCount} new scenes to add.`;
  }

  messages.push({ role: 'user', content: userMsg });

  return messages;
}
