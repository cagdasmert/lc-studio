// @vitest-environment node
//
// setKeyframe / removeKeyframe on a text layer's `color` track, as the
// keyframe editor drives them: colour values stay hex strings, and a track
// never ends up mixing colours with numbers.

import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './index';
import { createDefaultComposition } from './composition-slice';
import { resolveColorProperty } from '../renderer/interpolation';
import type { Layer } from '../types';

const LAYER = 'text-intro-title';

function layer(): Layer {
  const found = useStore.getState().composition.scenes[0].layers.find((l) => l.id === LAYER);
  if (!found) throw new Error('fixture layer missing');
  return found;
}

describe('keyframe actions on a colour track', () => {
  beforeEach(() => {
    useStore.getState().setComposition(createDefaultComposition());
  });

  it('stores colour keyframes as hex strings, in frame order', () => {
    const { setKeyframe } = useStore.getState();
    setKeyframe(0, LAYER, 'color', 20, '#0000ff');
    setKeyframe(0, LAYER, 'color', 0, '#ff0000', 'linear');

    expect(layer().keyframes.color.keyframes).toEqual([
      { frame: 0, value: '#ff0000', easing: 'linear' },
      { frame: 20, value: '#0000ff', easing: 'ease-out' },
    ]);
    expect(resolveColorProperty(layer().keyframes, 'color', 10, '#ffffff')).toBe('#800080');
  });

  it('replaces the value at an existing frame and keeps its easing', () => {
    const { setKeyframe } = useStore.getState();
    setKeyframe(0, LAYER, 'color', 0, '#ff0000', 'linear');
    setKeyframe(0, LAYER, 'color', 0, '#00ff00');

    expect(layer().keyframes.color.keyframes).toEqual([
      { frame: 0, value: '#00ff00', easing: 'linear' },
    ]);
  });

  it('removes one keyframe and leaves the rest of the colour track', () => {
    const { setKeyframe, removeKeyframe } = useStore.getState();
    setKeyframe(0, LAYER, 'color', 0, '#ff0000');
    setKeyframe(0, LAYER, 'color', 20, '#0000ff');
    removeKeyframe(0, LAYER, 'color', 0);

    expect(layer().keyframes.color.keyframes).toEqual([
      { frame: 20, value: '#0000ff', easing: 'ease-out' },
    ]);
  });

  it('starts a fresh track rather than mixing a number into colours', () => {
    const { setKeyframe } = useStore.getState();
    setKeyframe(0, LAYER, 'color', 0, '#ff0000');
    setKeyframe(0, LAYER, 'color', 10, 5);

    expect(layer().keyframes.color.keyframes).toEqual([
      { frame: 10, value: 5, easing: 'ease-out' },
    ]);
  });

  it('leaves numeric tracks working as before', () => {
    const { setKeyframe, removeKeyframe } = useStore.getState();
    setKeyframe(0, LAYER, 'fontSize', 0, 40);
    setKeyframe(0, LAYER, 'fontSize', 10, 80);
    removeKeyframe(0, LAYER, 'fontSize', 0);

    expect(layer().keyframes.fontSize.keyframes).toEqual([
      { frame: 10, value: 80, easing: 'ease-out' },
    ]);
  });
});
