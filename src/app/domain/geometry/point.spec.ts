import { distance, lerp, lerpPoint } from './point';

describe('point', () => {
  it('interpolates numbers and points', () => {
    expect(lerp(10, 20, 0)).toBe(10);
    expect(lerp(10, 20, 1)).toBe(20);
    expect(lerp(10, 20, 0.25)).toBe(12.5);
    expect(lerpPoint({ x: 0, y: 100 }, { x: 50, y: -100 }, 0.5)).toEqual({ x: 25, y: 0 });
  });

  it('measures distances', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(distance({ x: 7, y: 7 }, { x: 7, y: 7 })).toBe(0);
  });
});
