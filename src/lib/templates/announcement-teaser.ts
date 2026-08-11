import type { Template } from '../../types/template';
import type { TextLayerData, ShapeLayerData } from '../../types';

const comingSoon: TextLayerData = {
  id: 'tmpl-announce-soon',
  name: 'Coming Soon',
  type: 'text',
  startFrame: 0, endFrame: 90,
  x: 540, y: 750,
  width: 800, height: 50,
  scaleX: 1, scaleY: 1, rotation: 0, opacity: 1,
  anchorX: 0.5, anchorY: 0.5, zIndex: 2,
  blendMode: 'normal', effects: [], visible: true, locked: false,
  keyframes: {
    opacity: { keyframes: [{ frame: 0, value: 0, easing: 'ease-out' }, { frame: 15, value: 1, easing: 'linear' }] },
  },
  content: 'COMING SOON',
  fontSize: 18, fontFamily: 'sans-serif', fontWeight: 'bold', fontStyle: 'normal',
  color: '#e94560', align: 'center', verticalAlign: 'middle',
  lineHeight: 1, letterSpacing: 6, maxWidth: 0, textStroke: null, textShadow: null,
};

const headline: TextLayerData = {
  id: 'tmpl-announce-headline',
  name: 'Headline',
  type: 'text',
  startFrame: 0, endFrame: 90,
  x: 540, y: 870,
  width: 900, height: 140,
  scaleX: 1, scaleY: 1, rotation: 0, opacity: 1,
  anchorX: 0.5, anchorY: 0.5, zIndex: 2,
  blendMode: 'normal', effects: [], visible: true, locked: false,
  keyframes: {
    opacity: { keyframes: [{ frame: 10, value: 0, easing: 'ease-out' }, { frame: 30, value: 1, easing: 'linear' }] },
    y: { keyframes: [{ frame: 10, value: 920, easing: 'ease-out' }, { frame: 30, value: 870, easing: 'linear' }] },
  },
  content: 'Something Big\nIs Coming',
  fontSize: 52, fontFamily: 'sans-serif', fontWeight: 'bold', fontStyle: 'normal',
  color: '#ffffff', align: 'center', verticalAlign: 'middle',
  lineHeight: 1.3, letterSpacing: 0, maxWidth: 0, textStroke: null, textShadow: null,
};

const dateLine: TextLayerData = {
  id: 'tmpl-announce-date',
  name: 'Date',
  type: 'text',
  startFrame: 0, endFrame: 90,
  x: 540, y: 1100,
  width: 600, height: 40,
  scaleX: 1, scaleY: 1, rotation: 0, opacity: 1,
  anchorX: 0.5, anchorY: 0.5, zIndex: 1,
  blendMode: 'normal', effects: [], visible: true, locked: false,
  keyframes: {
    opacity: { keyframes: [{ frame: 25, value: 0, easing: 'ease-out' }, { frame: 45, value: 1, easing: 'linear' }] },
  },
  content: 'August 15, 2026',
  fontSize: 24, fontFamily: 'sans-serif', fontWeight: 'normal', fontStyle: 'normal',
  color: '#888888', align: 'center', verticalAlign: 'middle',
  lineHeight: 1, letterSpacing: 2, maxWidth: 0, textStroke: null, textShadow: null,
};

const divider: ShapeLayerData = {
  id: 'tmpl-announce-divider',
  name: 'Divider',
  type: 'shape',
  startFrame: 0, endFrame: 90,
  x: 540, y: 1020,
  width: 80, height: 2,
  scaleX: 1, scaleY: 1, rotation: 0, opacity: 0.6,
  anchorX: 0.5, anchorY: 0.5, zIndex: 1,
  blendMode: 'normal', effects: [], visible: true, locked: false,
  keyframes: {},
  shapeType: 'rect', fill: '#e94560', stroke: '', strokeWidth: 0, cornerRadius: 0,
};

export const announcementTeaser: Template = {
  id: 'tmpl-announcement',
  name: 'Announcement Teaser',
  description: 'Teaser for an upcoming announcement with date',
  category: 'announcement',
  thumbnail: null,
  composition: {
    id: 'tmpl-announce-comp',
    name: 'Announcement Teaser',
    scenes: [{
      id: 'tmpl-announce-scene',
      label: 'Teaser',
      durationFrames: 90,
      backgroundColor: '#0a0a14',
      layers: [comingSoon, headline, divider, dateLine],
      transition: 'cut',
      transitionDurationFrames: 0,
    }],
    output: { id: 'vertical-1080x1920', label: 'Vertical (1080x1920)', width: 1080, height: 1920, fps: 30 },
  },
  placeholders: [
    { id: 'headline', label: 'Headline', type: 'text', target: { sceneIndex: 0, layerId: 'tmpl-announce-headline', property: 'content' }, defaultValue: 'Something Big\nIs Coming' },
    { id: 'date', label: 'Date', type: 'text', target: { sceneIndex: 0, layerId: 'tmpl-announce-date', property: 'content' }, defaultValue: 'August 15, 2026' },
  ],
};
