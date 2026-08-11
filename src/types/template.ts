import type { Composition } from './scene';

export interface TemplatePlaceholder {
  id: string;
  label: string;
  type: 'text' | 'image' | 'color';
  target: { sceneIndex: number; layerId: string; property: string };
  defaultValue: string;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  category: 'opener' | 'quote' | 'countdown' | 'product' | 'announcement' | 'custom';
  thumbnail: string | null;
  composition: Composition;
  placeholders: TemplatePlaceholder[];
}
