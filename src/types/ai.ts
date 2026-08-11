export type AIProviderType = 'ollama' | 'lmstudio' | 'openai-compatible';

export interface OllamaConfig {
  type: 'ollama';
  baseUrl: string;    // default: http://localhost:11434
  model: string;      // e.g. 'llama3', 'mistral', 'gemma2'
}

export interface LMStudioConfig {
  type: 'lmstudio';
  baseUrl: string;    // default: http://localhost:1234/v1
  model: string;      // e.g. 'lmstudio-community/Meta-Llama-3-8B-Instruct-GGUF'
}

export interface OpenAICompatConfig {
  type: 'openai-compatible';
  baseUrl: string;    // e.g. https://api.openai.com/v1
  apiKey: string;
  model: string;      // e.g. 'gpt-4o', 'claude-sonnet-4-20250514'
}

export type AIProviderConfig = OllamaConfig | LMStudioConfig | OpenAICompatConfig;

export type GenerationMode = 'full-composition' | 'template-fill' | 'add-scenes' | 'rewrite-text';

export interface GenerationRequest {
  mode: GenerationMode;
  prompt: string;
  templateId?: string;       // for template-fill mode
  sceneCount?: number;       // for full-composition / add-scenes
  layerIds?: string[];       // for rewrite-text mode
}

export interface GenerationResult {
  success: boolean;
  data?: GeneratedContent;
  error?: string;
  rawResponse?: string;
}

export interface GeneratedContent {
  mode: GenerationMode;
  scenes?: GeneratedScene[];
  placeholderValues?: Record<string, string>;  // for template-fill
  textRewrites?: Record<string, string>;       // layerId → new text
}

export interface GeneratedScene {
  label: string;
  durationSeconds: number;
  backgroundColor: string;
  layers: GeneratedLayer[];
  transition: string;
}

export interface GeneratedLayer {
  name: string;
  type: 'text' | 'shape';
  content?: string;          // text content
  fontSize?: number;
  fontWeight?: string;
  color?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  align?: string;
  shapeType?: string;        // for shape layers
  fill?: string;
  cornerRadius?: number;
  animation?: {
    property: string;
    from: number;
    to: number;
    startFrame: number;
    endFrame: number;
    easing: string;
  }[];
}
