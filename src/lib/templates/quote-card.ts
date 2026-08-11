import type { Template } from '../../types/template';
import type { TextLayerData, ShapeLayerData } from '../../types';

const bgShape: ShapeLayerData = {
  id: 'tmpl-quote-bg',
  name: 'Card Background',
  type: 'shape',
  startFrame: 0, endFrame: 90,
  x: 540, y: 960,
  width: 900, height: 600,
  scaleX: 1, scaleY: 1, rotation: 0, opacity: 0.9,
  anchorX: 0.5, anchorY: 0.5, zIndex: 0,
  blendMode: 'normal', effects: [], visible: true, locked: false,
  keyframes: {},
  shapeType: 'rect', fill: '#16213e', stroke: '#e94560', strokeWidth: 3, cornerRadius: 16,
};

const quoteText: TextLayerData = {
  id: 'tmpl-quote-text',
  name: 'Quote',
  type: 'text',
  startFrame: 0, endFrame: 90,
  x: 540, y: 900,
  width: 780, height: 300,
  scaleX: 1, scaleY: 1, rotation: 0, opacity: 1,
  anchorX: 0.5, anchorY: 0.5, zIndex: 1,
  blendMode: 'normal', effects: [], visible: true, locked: false,
  keyframes: {
    opacity: { keyframes: [{ frame: 0, value: 0, easing: 'ease-out' }, { frame: 20, value: 1, easing: 'linear' }] },
  },
  content: '"Your inspiring quote goes here."',
  fontSize: 36, fontFamily: 'serif', fontWeight: 'normal', fontStyle: 'italic',
  color: '#ffffff', align: 'center', verticalAlign: 'middle',
  lineHeight: 1.6, letterSpacing: 0, maxWidth: 0, textStroke: null, textShadow: null,
};

const authorText: TextLayerData = {
  id: 'tmpl-quote-author',
  name: 'Author',
  type: 'text',
  startFrame: 0, endFrame: 90,
  x: 540, y: 1100,
  width: 780, height: 40,
  scaleX: 1, scaleY: 1, rotation: 0, opacity: 1,
  anchorX: 0.5, anchorY: 0.5, zIndex: 2,
  blendMode: 'normal', effects: [], visible: true, locked: false,
  keyframes: {
    opacity: { keyframes: [{ frame: 15, value: 0, easing: 'ease-out' }, { frame: 35, value: 1, easing: 'linear' }] },
  },
  content: '— Author Name',
  fontSize: 22, fontFamily: 'sans-serif', fontWeight: 'normal', fontStyle: 'normal',
  color: '#e94560', align: 'center', verticalAlign: 'middle',
  lineHeight: 1.4, letterSpacing: 1, maxWidth: 0, textStroke: null, textShadow: null,
};

export const quoteCard: Template = {
  id: 'tmpl-quote-card',
  name: 'Quote Card',
  description: 'Elegant quote with author attribution on a card background',
  category: 'quote',
  thumbnail: null,
  composition: {
    id: 'tmpl-quote-comp',
    name: 'Quote Card',
    scenes: [{
      id: 'tmpl-quote-scene',
      label: 'Quote',
      durationFrames: 90,
      backgroundColor: '#0d0d0d',
      layers: [bgShape, quoteText, authorText],
      transition: 'cut',
      transitionDurationFrames: 0,
    }],
    output: { id: 'square-1080x1080', label: 'Square (1080x1080)', width: 1080, height: 1080, fps: 30 },
  },
  placeholders: [
    { id: 'quote', label: 'Quote Text', type: 'text', target: { sceneIndex: 0, layerId: 'tmpl-quote-text', property: 'content' }, defaultValue: '"Your inspiring quote goes here."' },
    { id: 'author', label: 'Author', type: 'text', target: { sceneIndex: 0, layerId: 'tmpl-quote-author', property: 'content' }, defaultValue: '— Author Name' },
  ],
};
