import { describe, expect, it, vi } from 'vitest';
import type { Composition, ImageLayerData } from '../types';

vi.mock('@tauri-apps/plugin-fs', () => ({}));
vi.mock('@tauri-apps/api/path', () => ({}));

const { assetRefs } = await import('./asset-refs');
const { rewriteAssetPaths } = await import('./asset-manager');
const { scanCompositionAssets } = await import('./asset-utils');
const { getImageSources } = await import('../renderer/media-cache');

function image(morphTarget?: string): ImageLayerData {
  return {
    id: 'l1', name: 'Hero', type: 'image', startFrame: 0, endFrame: 30,
    x: 0, y: 0, width: 100, height: 100, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1,
    anchorX: 0, anchorY: 0, zIndex: 0, blendMode: 'normal', effects: [],
    visible: true, locked: false, keyframes: {},
    src: '/abs/a.png', fitMode: 'cover', borderRadius: 0,
    morph: morphTarget === undefined ? undefined : { target: morphTarget, pairs: [], progress: 0 },
  };
}

function comp(l: ImageLayerData): Composition {
  return {
    id: 'c', name: 'c', output: { id: 'o', label: 'o', width: 100, height: 100, fps: 30 },
    scenes: [{
      id: 's', label: 'Intro', durationFrames: 30, backgroundColor: '#000',
      layers: [l], transition: 'cut', transitionDurationFrames: 0,
    }],
  };
}

describe('assetRefs', () => {
  it('lists only src for a plain image', () => {
    expect(assetRefs(image()).map((r) => r.get())).toEqual(['/abs/a.png']);
  });

  it('adds the morph target and writes through to it', () => {
    const l = image('/abs/b.png');
    const refs = assetRefs(l);
    expect(refs.map((r) => r.get())).toEqual(['/abs/a.png', '/abs/b.png']);
    refs[1].set('assets/b.png');
    expect(l.morph?.target).toBe('assets/b.png');
  });
});

describe('morph target reaches every asset consumer', () => {
  it('is rewritten with src', () => {
    const out = rewriteAssetPaths(comp(image('/abs/b.png')), (p) => p.replace('/abs/', 'assets/'));
    const l = out.scenes[0].layers[0] as ImageLayerData;
    expect([l.src, l.morph?.target]).toEqual(['assets/a.png', 'assets/b.png']);
  });

  it('is preloaded', () => {
    expect(getImageSources([image('/abs/b.png')])).toEqual(['/abs/a.png', '/abs/b.png']);
  });

  it('is listed in the asset panel', () => {
    expect(scanCompositionAssets(comp(image('/abs/b.png'))).map((r) => [r.path, r.type])).toEqual([
      ['/abs/a.png', 'image'], ['/abs/b.png', 'image'],
    ]);
  });
});
