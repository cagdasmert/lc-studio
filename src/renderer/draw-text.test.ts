// @vitest-environment node
//
// CLI spec A2.1: layoutText's lines are the lines drawTextLayer draws, and
// drawnLineWidth is their width as drawn, with and without letter spacing.
import { describe, expect, it } from 'vitest';
import { createCanvas } from 'canvas';
import type { ResolvedTransform, TextLayerData } from '../types';
import { drawTextLayer, drawnLineWidth, layoutText } from './draw-text';

const box: ResolvedTransform = { x: 0, y: 0, width: 300, height: 400, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, anchorX: 0.5, anchorY: 0.5, skewX: 0, skewY: 0 };

const text = (extra: Partial<TextLayerData> = {}): TextLayerData => ({
  id: 't', name: 't', type: 'text', startFrame: 0, endFrame: 30, x: 0, y: 0, width: 300, height: 400,
  scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, anchorX: 0.5, anchorY: 0.5, zIndex: 0, blendMode: 'normal',
  effects: [], visible: true, locked: false, keyframes: {},
  content: 'Stop scrolling, the spring launch is here', fontSize: 40, fontFamily: 'sans-serif', fontWeight: 'bold',
  fontStyle: 'normal', color: '#ffffff', align: 'left', verticalAlign: 'top', lineHeight: 1.2, letterSpacing: 0,
  maxWidth: 0, textStroke: null, textShadow: null, ...extra,
} as TextLayerData);

/** drawTextLayer's fillText calls, as [text, x, y]. */
function drawn(layer: TextLayerData): [string, number, number][] {
  const ctx = createCanvas(300, 400).getContext('2d') as unknown as CanvasRenderingContext2D;
  const calls: [string, number, number][] = [];
  const fill = ctx.fillText.bind(ctx);
  ctx.fillText = (t: string, x: number, y: number) => { calls.push([t, x, y]); fill(t, x, y); };
  drawTextLayer(ctx, layer, box, 0);
  return calls;
}

/** The drawn calls joined back into lines, by their y. */
function drawnLines(calls: [string, number, number][]): string[] {
  const byY = new Map<number, string>();
  for (const [t, , y] of calls) byY.set(y, (byY.get(y) ?? '') + t);
  return [...byY.entries()].sort(([a], [b]) => a - b).map(([, t]) => t);
}

const ctx2d = () => createCanvas(300, 400).getContext('2d') as unknown as CanvasRenderingContext2D;

describe('layoutText', () => {
  for (const align of ['left', 'center', 'right'] as const) {
    for (const letterSpacing of [0, 6]) {
      it(`gives the lines drawTextLayer draws (${align}, letter spacing ${letterSpacing})`, () => {
        const layer = text({ align, letterSpacing });
        const layout = layoutText(ctx2d(), layer, box, 0);
        expect(layout.lines.length).toBeGreaterThan(1);
        expect(drawnLines(drawn(layer))).toEqual(layout.lines);
        expect(layout.height).toBeCloseTo(layout.lines.length * 40 * 1.2);
        expect(layout.perChar).toBe(letterSpacing !== 0);
      });
    }
  }

  it('reads keyframed font size', () => {
    const layer = text({ keyframes: { fontSize: { keyframes: [{ frame: 0, value: 40, easing: 'linear' }, { frame: 10, value: 80, easing: 'linear' }] } } });
    expect(layoutText(ctx2d(), layer, box, 10).lineHeightPx).toBeCloseTo(96);
  });
});

describe('drawnLineWidth', () => {
  it('spans the characters as drawn, spacing included', () => {
    const layer = text({ content: 'WIDE', letterSpacing: 10 });
    const calls = drawn(layer);
    const ctx = ctx2d();
    const { lines, letterSpacing, perChar } = layoutText(ctx, layer, box, 0);
    const last = calls[calls.length - 1];
    const extent = last[1] + ctx.measureText(last[0]).width - calls[0][1];
    expect(drawnLineWidth(ctx, lines[0], letterSpacing, perChar)).toBeCloseTo(extent);
    // Wrapping measured without the spacing, so the drawn line is wider than the measured one.
    expect(drawnLineWidth(ctx, lines[0], letterSpacing, perChar)).toBeGreaterThan(ctx.measureText(lines[0]).width);
  });

  it('is the measured width without spacing', () => {
    const ctx = ctx2d();
    const { lines, letterSpacing, perChar } = layoutText(ctx, text({ content: 'NARROW' }), box, 0);
    expect(drawnLineWidth(ctx, lines[0], letterSpacing, perChar)).toBe(ctx.measureText('NARROW').width);
  });
});
