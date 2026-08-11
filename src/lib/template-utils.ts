import type { Composition } from '../types';
import type { Template, TemplatePlaceholder } from '../types/template';

/**
 * Create a new composition from a template, applying placeholder values.
 */
export function instantiateTemplate(
  template: Template,
  values: Record<string, string> = {},
): Composition {
  // Deep clone the template composition
  const comp: Composition = JSON.parse(JSON.stringify(template.composition));
  comp.id = `comp-${Date.now()}`;
  comp.name = template.name;

  // Apply placeholder values
  for (const placeholder of template.placeholders) {
    const value = values[placeholder.id] ?? placeholder.defaultValue;
    const scene = comp.scenes[placeholder.target.sceneIndex];
    if (!scene) continue;

    const layer = scene.layers.find((l) => l.id === placeholder.target.layerId);
    if (!layer) continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (layer as any)[placeholder.target.property] = value;
  }

  return comp;
}

/**
 * Save a composition as a template with placeholder metadata.
 */
export function saveAsTemplate(
  composition: Composition,
  name: string,
  description: string,
  category: Template['category'],
  placeholders: TemplatePlaceholder[] = [],
): Template {
  return {
    id: `tmpl-${Date.now()}`,
    name,
    description,
    category,
    thumbnail: null,
    composition: JSON.parse(JSON.stringify(composition)),
    placeholders,
  };
}
