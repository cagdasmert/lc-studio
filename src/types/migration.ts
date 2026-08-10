import type { TextLayerData, Scene, Composition, KeyframeTrack, EasingType } from './scene';

// V1 types (old format)
interface V1TextAnimation {
  type: 'none' | 'fade-in' | 'slide-up' | 'slide-left' | 'typewriter';
  durationFrames: number;
  delayFrames: number;
  easing: EasingType;
}

interface V1TextLayer {
  content: string;
  fontSize: number;
  fontFamily: string;
  color: string;
  x: number;
  y: number;
  align: 'left' | 'center' | 'right';
  animation: V1TextAnimation;
}

interface V1Scene {
  id: string;
  label: string;
  durationFrames: number;
  backgroundColor: string;
  textLayers: V1TextLayer[];
  transition: 'none' | 'fade' | 'cut';
}

interface V1Composition {
  id: string;
  name: string;
  scenes: V1Scene[];
  output: { id: string; label: string; width: number; height: number; fps: number };
}

function migrateTextLayer(
  v1: V1TextLayer,
  index: number,
  sceneDuration: number,
  canvasWidth: number,
  canvasHeight: number,
): TextLayerData {
  const keyframes: Record<string, KeyframeTrack> = {};
  const anim = v1.animation;

  // Convert normalized 0-1 coords to pixel coords
  const pixelX = v1.x * canvasWidth;
  const pixelY = v1.y * canvasHeight;

  if (anim.type === 'fade-in') {
    keyframes['opacity'] = {
      keyframes: [
        { frame: anim.delayFrames, value: 0, easing: anim.easing },
        { frame: anim.delayFrames + anim.durationFrames, value: 1, easing: 'linear' },
      ],
    };
  } else if (anim.type === 'slide-up') {
    const offset = canvasHeight * 0.1;
    keyframes['opacity'] = {
      keyframes: [
        { frame: anim.delayFrames, value: 0, easing: anim.easing },
        { frame: anim.delayFrames + anim.durationFrames, value: 1, easing: 'linear' },
      ],
    };
    keyframes['y'] = {
      keyframes: [
        { frame: anim.delayFrames, value: pixelY + offset, easing: anim.easing },
        { frame: anim.delayFrames + anim.durationFrames, value: pixelY, easing: 'linear' },
      ],
    };
  } else if (anim.type === 'slide-left') {
    const offset = canvasHeight * 0.1;
    keyframes['opacity'] = {
      keyframes: [
        { frame: anim.delayFrames, value: 0, easing: anim.easing },
        { frame: anim.delayFrames + anim.durationFrames, value: 1, easing: 'linear' },
      ],
    };
    keyframes['x'] = {
      keyframes: [
        { frame: anim.delayFrames, value: pixelX + offset, easing: anim.easing },
        { frame: anim.delayFrames + anim.durationFrames, value: pixelX, easing: 'linear' },
      ],
    };
  }

  return {
    id: `text-${index}-${Date.now()}`,
    name: v1.content.slice(0, 20) || `Text ${index + 1}`,
    type: 'text',
    startFrame: 0,
    endFrame: sceneDuration,
    x: pixelX,
    y: pixelY,
    width: canvasWidth * 0.8,
    height: v1.fontSize * 2,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: anim.type === 'none' ? 1 : 0,
    anchorX: 0.5,
    anchorY: 0.5,
    zIndex: index,
    blendMode: 'normal',
    effects: [],
    visible: true,
    locked: false,
    keyframes,
    content: v1.content,
    fontSize: v1.fontSize,
    fontFamily: v1.fontFamily,
    fontWeight: 'normal',
    fontStyle: 'normal',
    color: v1.color,
    align: v1.align,
    verticalAlign: 'middle',
    lineHeight: 1.4,
    letterSpacing: 0,
    maxWidth: 0,
    textStroke: null,
    textShadow: null,
  };
}

export function migrateV1ToV2(v1: V1Composition): Composition {
  const { width, height } = v1.output;

  const scenes: Scene[] = v1.scenes.map((s) => ({
    id: s.id,
    label: s.label,
    durationFrames: s.durationFrames,
    backgroundColor: s.backgroundColor,
    layers: s.textLayers.map((tl, i) =>
      migrateTextLayer(tl, i, s.durationFrames, width, height),
    ),
    transition: s.transition,
    transitionDurationFrames: s.transition === 'fade' ? 15 : 0,
  }));

  return {
    id: v1.id,
    name: v1.name,
    scenes,
    output: v1.output,
  };
}
