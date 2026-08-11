export interface BrandColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
}

export interface BrandFonts {
  heading: string;
  body: string;
}

export interface BrandKit {
  id: string;
  name: string;
  colors: BrandColors;
  fonts: BrandFonts;
  logoSource: string | null;
  watermarkSource: string | null;
  watermarkOpacity: number;
  watermarkPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

export function createDefaultBrandKit(): BrandKit {
  return {
    id: `brand-${Date.now()}`,
    name: 'New Brand Kit',
    colors: {
      primary: '#e94560',
      secondary: '#0f3460',
      accent: '#16213e',
      background: '#1a1a2e',
      text: '#ffffff',
    },
    fonts: {
      heading: 'sans-serif',
      body: 'sans-serif',
    },
    logoSource: null,
    watermarkSource: null,
    watermarkOpacity: 0.3,
    watermarkPosition: 'bottom-right',
  };
}
