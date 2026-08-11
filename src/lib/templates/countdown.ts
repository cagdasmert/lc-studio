import type { Template } from '../../types/template';
import type { TextLayerData } from '../../types';

function makeNumberLayer(num: number): TextLayerData {
  return {
    id: `tmpl-countdown-${num}`,
    name: `Number ${num}`,
    type: 'text',
    startFrame: 0, endFrame: 30,
    x: 540, y: 860,
    width: 400, height: 200,
    scaleX: 1, scaleY: 1, rotation: 0, opacity: 1,
    anchorX: 0.5, anchorY: 0.5, zIndex: 1,
    blendMode: 'normal', effects: [], visible: true, locked: false,
    keyframes: {
      scaleX: { keyframes: [{ frame: 0, value: 2, easing: 'ease-out-back' }, { frame: 10, value: 1, easing: 'linear' }] },
      scaleY: { keyframes: [{ frame: 0, value: 2, easing: 'ease-out-back' }, { frame: 10, value: 1, easing: 'linear' }] },
      opacity: { keyframes: [{ frame: 20, value: 1, easing: 'ease-in' }, { frame: 30, value: 0, easing: 'linear' }] },
    },
    content: String(num),
    fontSize: 120, fontFamily: 'sans-serif', fontWeight: 'bold', fontStyle: 'normal',
    color: '#e94560', align: 'center', verticalAlign: 'middle',
    lineHeight: 1, letterSpacing: 0, maxWidth: 0, textStroke: null, textShadow: null,
  };
}

export const countdown: Template = {
  id: 'tmpl-countdown',
  name: 'Countdown',
  description: '3-2-1 countdown with scale-in animation',
  category: 'countdown',
  thumbnail: null,
  composition: {
    id: 'tmpl-countdown-comp',
    name: 'Countdown',
    scenes: [3, 2, 1].map((num) => ({
      id: `tmpl-countdown-scene-${num}`,
      label: String(num),
      durationFrames: 30,
      backgroundColor: '#0d0d0d',
      layers: [makeNumberLayer(num)],
      transition: 'fade' as const,
      transitionDurationFrames: 5,
    })),
    output: { id: 'vertical-1080x1920', label: 'Vertical (1080x1920)', width: 1080, height: 1920, fps: 30 },
  },
  placeholders: [],
};
