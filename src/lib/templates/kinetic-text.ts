import type { Template } from '../../types/template';
import type { TextLayerData } from '../../types';

const titleLayer: TextLayerData = {
  id: 'tmpl-kinetic-title',
  name: 'Title',
  type: 'text',
  startFrame: 0,
  endFrame: 60,
  x: 540, y: 800,
  width: 900, height: 120,
  scaleX: 1, scaleY: 1, rotation: 0, opacity: 1,
  anchorX: 0.5, anchorY: 0.5, zIndex: 1,
  blendMode: 'normal', effects: [], visible: true, locked: false,
  keyframes: {
    opacity: { keyframes: [{ frame: 0, value: 0, easing: 'ease-out' }, { frame: 15, value: 1, easing: 'linear' }] },
    scaleX: { keyframes: [{ frame: 0, value: 0.5, easing: 'ease-out-back' }, { frame: 15, value: 1, easing: 'linear' }] },
    scaleY: { keyframes: [{ frame: 0, value: 0.5, easing: 'ease-out-back' }, { frame: 15, value: 1, easing: 'linear' }] },
  },
  content: 'YOUR TITLE',
  fontSize: 72, fontFamily: 'sans-serif', fontWeight: 'bold', fontStyle: 'normal',
  color: '#ffffff', align: 'center', verticalAlign: 'middle',
  lineHeight: 1.2, letterSpacing: 2, maxWidth: 0, textStroke: null, textShadow: null,
};

const subtitleLayer: TextLayerData = {
  id: 'tmpl-kinetic-sub',
  name: 'Subtitle',
  type: 'text',
  startFrame: 0,
  endFrame: 60,
  x: 540, y: 1000,
  width: 800, height: 60,
  scaleX: 1, scaleY: 1, rotation: 0, opacity: 1,
  anchorX: 0.5, anchorY: 0.5, zIndex: 0,
  blendMode: 'normal', effects: [], visible: true, locked: false,
  keyframes: {
    opacity: { keyframes: [{ frame: 10, value: 0, easing: 'ease-out' }, { frame: 25, value: 1, easing: 'linear' }] },
    y: { keyframes: [{ frame: 10, value: 1080, easing: 'ease-out' }, { frame: 25, value: 1000, easing: 'linear' }] },
  },
  content: 'Subtitle goes here',
  fontSize: 28, fontFamily: 'sans-serif', fontWeight: 'normal', fontStyle: 'normal',
  color: '#cccccc', align: 'center', verticalAlign: 'middle',
  lineHeight: 1.4, letterSpacing: 0, maxWidth: 0, textStroke: null, textShadow: null,
};

export const kineticTextOpener: Template = {
  id: 'tmpl-kinetic-text',
  name: 'Kinetic Text Opener',
  description: 'Bold title with scale-in animation and sliding subtitle',
  category: 'opener',
  thumbnail: null,
  composition: {
    id: 'tmpl-kinetic-comp',
    name: 'Kinetic Text Opener',
    scenes: [{
      id: 'tmpl-kinetic-scene',
      label: 'Opener',
      durationFrames: 60,
      backgroundColor: '#1a1a2e',
      layers: [titleLayer, subtitleLayer],
      transition: 'cut',
      transitionDurationFrames: 0,
    }],
    output: { id: 'vertical-1080x1920', label: 'Vertical (1080x1920)', width: 1080, height: 1920, fps: 30 },
  },
  placeholders: [
    { id: 'title', label: 'Title Text', type: 'text', target: { sceneIndex: 0, layerId: 'tmpl-kinetic-title', property: 'content' }, defaultValue: 'YOUR TITLE' },
    { id: 'subtitle', label: 'Subtitle Text', type: 'text', target: { sceneIndex: 0, layerId: 'tmpl-kinetic-sub', property: 'content' }, defaultValue: 'Subtitle goes here' },
  ],
};
