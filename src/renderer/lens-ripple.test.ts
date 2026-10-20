import { describe, expect, it } from 'vitest';
import { liveImpulses, MAX_LIVE_IMPULSES } from './lens-ripple';
import { hash } from './noise';

describe('liveImpulses', () => {
  it('keeps an impulse live while frame_i ≤ frame < frame_i + life, with its age', () => {
    const lens = { impulses: [{ frame: 10, x: 0.2, y: 0.8 }], life: 30 };
    expect(liveImpulses(lens, 9)).toEqual([]);
    expect(liveImpulses(lens, 10)).toEqual([{ frame: 10, x: 0.2, y: 0.8, age: 0 }]);
    expect(liveImpulses(lens, 39)[0].age).toBe(29);
    expect(liveImpulses(lens, 40)).toEqual([]);
  });

  it('adds ambient impulses every n frames at hashed positions', () => {
    const live = liveImpulses({ impulses: [], life: 25, ambientEvery: 10 }, 32);
    expect(live.map((i) => i.frame)).toEqual([30, 20, 10]);
    expect(live[0]).toMatchObject({ x: hash(3, 71), y: hash(3, 72), age: 2 });
  });

  it('draws at most the 16 newest', () => {
    const impulses = Array.from({ length: 30 }, (_, k) => ({ frame: k, x: 0.5, y: 0.5 }));
    const live = liveImpulses({ impulses, life: 100 }, 40);
    expect(live).toHaveLength(MAX_LIVE_IMPULSES);
    expect(live[0].frame).toBe(29);
    expect(live[15].frame).toBe(14);
  });
});
