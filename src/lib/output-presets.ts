import type { OutputPreset } from '../types';

export const OUTPUT_PRESETS: OutputPreset[] = [
  { id: 'vertical-1080x1920', label: 'Vertical (1080x1920)', width: 1080, height: 1920, fps: 30 },
  { id: 'square-1080x1080', label: 'Square (1080x1080)', width: 1080, height: 1080, fps: 30 },
  { id: 'landscape-1920x1080', label: 'Landscape (1920x1080)', width: 1920, height: 1080, fps: 30 },
  { id: 'ig-story', label: 'Instagram Story', width: 1080, height: 1920, fps: 30 },
  { id: 'tiktok', label: 'TikTok', width: 1080, height: 1920, fps: 30 },
  { id: 'yt-shorts', label: 'YouTube Shorts', width: 1080, height: 1920, fps: 60 },
  { id: 'yt-landscape', label: 'YouTube (1080p)', width: 1920, height: 1080, fps: 30 },
  { id: 'custom', label: 'Custom', width: 1080, height: 1920, fps: 30 },
];

export function findPreset(id: string): OutputPreset | undefined {
  return OUTPUT_PRESETS.find((p) => p.id === id);
}
