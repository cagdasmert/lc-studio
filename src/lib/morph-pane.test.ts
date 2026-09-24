import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW, hitPoint, paneXf, toBox, zoomAt } from './morph-pane';

// Pane 232² with a 16 px margin leaves 200² for a 100² box: s = 2, origin (16,16).
describe('paneXf', () => {
  it('fits the box with a margin, centred', () => {
    expect(paneXf(232, 232, 100, 100, DEFAULT_VIEW)).toEqual({ s: 2, x: 16, y: 16 });
  });
});

describe('zoomAt', () => {
  it('keeps the box point under the cursor fixed', () => {
    // Cursor (66,66) is box (25,25). At zoom 2, s = 4 and the unpanned origin
    // is (232 − 400)/2 = −84, so (25,25) would sit at 16; pan by 50 to keep it at 66.
    const v = zoomAt(232, 232, 100, 100, DEFAULT_VIEW, 66, 66, 2);
    expect(v).toEqual({ zoom: 2, panX: 50, panY: 50 });
    expect(toBox(paneXf(232, 232, 100, 100, v), 66, 66)).toEqual({ x: 25, y: 25 });
  });

  it('does not zoom out past the fitted view', () => {
    expect(zoomAt(232, 232, 100, 100, DEFAULT_VIEW, 66, 66, 0.5)).toEqual(DEFAULT_VIEW);
  });
});

describe('hitPoint', () => {
  const pts = [{ id: 'far', x: 0, y: 0 }, { id: 'near', x: 10, y: 10 }];

  it('returns the nearest point within the radius', () => {
    expect(hitPoint(pts, 8, 8, 9)).toBe('near');
  });

  it('returns null when nothing is within the radius', () => {
    expect(hitPoint(pts, 40, 40, 9)).toBeNull();
  });
});
