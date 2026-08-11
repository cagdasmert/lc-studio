import type { Template } from '../../types/template';
import type { TextLayerData, ShapeLayerData } from '../../types';

const tagline: TextLayerData = {
  id: 'tmpl-product-tagline',
  name: 'Tagline',
  type: 'text',
  startFrame: 0, endFrame: 90,
  x: 540, y: 700,
  width: 900, height: 80,
  scaleX: 1, scaleY: 1, rotation: 0, opacity: 1,
  anchorX: 0.5, anchorY: 0.5, zIndex: 2,
  blendMode: 'normal', effects: [], visible: true, locked: false,
  keyframes: {
    opacity: { keyframes: [{ frame: 0, value: 0, easing: 'ease-out' }, { frame: 20, value: 1, easing: 'linear' }] },
    y: { keyframes: [{ frame: 0, value: 750, easing: 'ease-out' }, { frame: 20, value: 700, easing: 'linear' }] },
  },
  content: 'INTRODUCING',
  fontSize: 18, fontFamily: 'sans-serif', fontWeight: 'bold', fontStyle: 'normal',
  color: '#e94560', align: 'center', verticalAlign: 'middle',
  lineHeight: 1, letterSpacing: 4, maxWidth: 0, textStroke: null, textShadow: null,
};

const productName: TextLayerData = {
  id: 'tmpl-product-name',
  name: 'Product Name',
  type: 'text',
  startFrame: 0, endFrame: 90,
  x: 540, y: 800,
  width: 900, height: 120,
  scaleX: 1, scaleY: 1, rotation: 0, opacity: 1,
  anchorX: 0.5, anchorY: 0.5, zIndex: 2,
  blendMode: 'normal', effects: [], visible: true, locked: false,
  keyframes: {
    opacity: { keyframes: [{ frame: 5, value: 0, easing: 'ease-out' }, { frame: 25, value: 1, easing: 'linear' }] },
  },
  content: 'Product Name',
  fontSize: 56, fontFamily: 'sans-serif', fontWeight: 'bold', fontStyle: 'normal',
  color: '#ffffff', align: 'center', verticalAlign: 'middle',
  lineHeight: 1.2, letterSpacing: 0, maxWidth: 0, textStroke: null, textShadow: null,
};

const featureLine: TextLayerData = {
  id: 'tmpl-product-feature',
  name: 'Feature',
  type: 'text',
  startFrame: 0, endFrame: 90,
  x: 540, y: 1050,
  width: 800, height: 60,
  scaleX: 1, scaleY: 1, rotation: 0, opacity: 1,
  anchorX: 0.5, anchorY: 0.5, zIndex: 1,
  blendMode: 'normal', effects: [], visible: true, locked: false,
  keyframes: {
    opacity: { keyframes: [{ frame: 20, value: 0, easing: 'ease-out' }, { frame: 40, value: 1, easing: 'linear' }] },
  },
  content: 'Key feature or benefit description',
  fontSize: 24, fontFamily: 'sans-serif', fontWeight: 'normal', fontStyle: 'normal',
  color: '#cccccc', align: 'center', verticalAlign: 'middle',
  lineHeight: 1.4, letterSpacing: 0, maxWidth: 0, textStroke: null, textShadow: null,
};

const accentBar: ShapeLayerData = {
  id: 'tmpl-product-bar',
  name: 'Accent Bar',
  type: 'shape',
  startFrame: 0, endFrame: 90,
  x: 540, y: 960,
  width: 120, height: 4,
  scaleX: 1, scaleY: 1, rotation: 0, opacity: 1,
  anchorX: 0.5, anchorY: 0.5, zIndex: 1,
  blendMode: 'normal', effects: [], visible: true, locked: false,
  keyframes: {
    width: { keyframes: [{ frame: 15, value: 0, easing: 'ease-out' }, { frame: 35, value: 120, easing: 'linear' }] },
  },
  shapeType: 'rect', fill: '#e94560', stroke: '', strokeWidth: 0, cornerRadius: 2,
};

export const productHighlight: Template = {
  id: 'tmpl-product-highlight',
  name: 'Product Highlight',
  description: 'Clean product introduction with tagline, name, and feature',
  category: 'product',
  thumbnail: null,
  composition: {
    id: 'tmpl-product-comp',
    name: 'Product Highlight',
    scenes: [{
      id: 'tmpl-product-scene',
      label: 'Highlight',
      durationFrames: 90,
      backgroundColor: '#0f1923',
      layers: [tagline, productName, accentBar, featureLine],
      transition: 'cut',
      transitionDurationFrames: 0,
    }],
    output: { id: 'vertical-1080x1920', label: 'Vertical (1080x1920)', width: 1080, height: 1920, fps: 30 },
  },
  placeholders: [
    { id: 'tagline', label: 'Tagline', type: 'text', target: { sceneIndex: 0, layerId: 'tmpl-product-tagline', property: 'content' }, defaultValue: 'INTRODUCING' },
    { id: 'name', label: 'Product Name', type: 'text', target: { sceneIndex: 0, layerId: 'tmpl-product-name', property: 'content' }, defaultValue: 'Product Name' },
    { id: 'feature', label: 'Feature Text', type: 'text', target: { sceneIndex: 0, layerId: 'tmpl-product-feature', property: 'content' }, defaultValue: 'Key feature or benefit description' },
  ],
};
