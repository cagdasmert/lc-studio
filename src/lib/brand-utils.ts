import type { Composition, TextLayerData } from '../types';
import type { BrandKit } from '../types/brand';

/**
 * Apply a brand kit to all text layers in a composition.
 * Maps brand colors and fonts to text layers.
 */
export function applyBrandKit(composition: Composition, kit: BrandKit): Composition {
  return {
    ...composition,
    scenes: composition.scenes.map((scene) => ({
      ...scene,
      backgroundColor: kit.colors.background,
      layers: scene.layers.map((layer) => {
        if (layer.type !== 'text') return layer;
        const text = layer as TextLayerData;
        const isTitle =
          text.fontSize >= 40 || text.name.toLowerCase().includes('title');
        return {
          ...text,
          color: isTitle ? kit.colors.primary : kit.colors.text,
          fontFamily: isTitle ? kit.fonts.heading : kit.fonts.body,
        };
      }),
    })),
  };
}
