import type { InterpolationMode } from '../models/token';
import {
  evaluateKeyframes,
  findKeyframeIndex,
  type KeyframeSample,
  sortKeyframes,
} from './evaluate';

function kf(
  tick: number,
  x: number,
  y: number,
  interpolation: InterpolationMode = 'linear',
  visible = true,
): KeyframeSample {
  return { tick, x, y, visible, interpolation };
}

describe('findKeyframeIndex', () => {
  const keyframes = [kf(-10, 0, 0), kf(0, 0, 0), kf(10, 0, 0)];

  it('returns the last keyframe at or before the instant', () => {
    expect(findKeyframeIndex(keyframes, -11)).toBe(-1);
    expect(findKeyframeIndex(keyframes, -10)).toBe(0);
    expect(findKeyframeIndex(keyframes, -1)).toBe(0);
    expect(findKeyframeIndex(keyframes, 0)).toBe(1);
    expect(findKeyframeIndex(keyframes, 9)).toBe(1);
    expect(findKeyframeIndex(keyframes, 10)).toBe(2);
    expect(findKeyframeIndex(keyframes, 1e12)).toBe(2);
    expect(findKeyframeIndex([], 0)).toBe(-1);
  });

  it('matches a linear scan on a long list', () => {
    const ticks = Array.from({ length: 1000 }, (_, i) => i * 7 - 3000);
    const list = ticks.map((t) => kf(t, 0, 0));
    for (let t = -3010; t < 4010; t += 3) {
      const expected = ticks.reduce((found, tick, i) => (tick <= t ? i : found), -1);
      expect(findKeyframeIndex(list, t)).toBe(expected);
    }
  });
});

describe('evaluateKeyframes', () => {
  it('hides a token with no keyframes or before its first keyframe', () => {
    expect(evaluateKeyframes([], 0)).toBeNull();
    expect(evaluateKeyframes([kf(100, 5, 5)], 99)).toBeNull();
  });

  it('stays on the last keyframe after it', () => {
    expect(evaluateKeyframes([kf(100, 5, 6)], 100)).toEqual({ x: 5, y: 6 });
    expect(evaluateKeyframes([kf(100, 5, 6)], 1e9)).toEqual({ x: 5, y: 6 });
  });

  it('interpolates linearly by default', () => {
    const path = [kf(0, 0, 0), kf(100, 200, -100)];
    expect(evaluateKeyframes(path, 0)).toEqual({ x: 0, y: 0 });
    expect(evaluateKeyframes(path, 25)).toEqual({ x: 50, y: -25 });
    expect(evaluateKeyframes(path, 100)).toEqual({ x: 200, y: -100 });
  });

  it('teleports with step', () => {
    const path = [kf(0, 0, 0, 'step'), kf(100, 200, 200)];
    expect(evaluateKeyframes(path, 99)).toEqual({ x: 0, y: 0 });
    expect(evaluateKeyframes(path, 100)).toEqual({ x: 200, y: 200 });
  });

  it('eases in and out with ease', () => {
    const path = [kf(0, 0, 0, 'ease'), kf(100, 100, 0)];
    expect(evaluateKeyframes(path, 50)).toEqual({ x: 50, y: 0 });
    expect(evaluateKeyframes(path, 25)?.x).toBeLessThan(25);
    expect(evaluateKeyframes(path, 75)?.x).toBeGreaterThan(75);
  });

  it('uses the interpolation of the earlier keyframe', () => {
    const path = [kf(0, 0, 0, 'linear'), kf(10, 10, 0, 'step'), kf(20, 20, 0)];
    expect(evaluateKeyframes(path, 5)).toEqual({ x: 5, y: 0 });
    expect(evaluateKeyframes(path, 15)).toEqual({ x: 10, y: 0 });
  });

  it('hides the token while a hidden keyframe is in effect and shows it again later', () => {
    const path = [kf(0, 0, 0), kf(10, 10, 0, 'linear', false), kf(20, 50, 50)];
    expect(evaluateKeyframes(path, 5)).toEqual({ x: 5, y: 0 });
    expect(evaluateKeyframes(path, 10)).toBeNull();
    expect(evaluateKeyframes(path, 19)).toBeNull();
    expect(evaluateKeyframes(path, 20)).toEqual({ x: 50, y: 50 });
  });

  it('works with negative ticks', () => {
    const path = [kf(-200, 0, 0), kf(-100, 100, 100)];
    expect(evaluateKeyframes(path, -150)).toEqual({ x: 50, y: 50 });
  });
});

describe('sortKeyframes', () => {
  it('orders by tick without touching the input', () => {
    const input = [kf(10, 1, 1), kf(-5, 2, 2), kf(0, 3, 3)];
    expect(sortKeyframes(input).map((k) => k.tick)).toEqual([-5, 0, 10]);
    expect(input.map((k) => k.tick)).toEqual([10, -5, 0]);
  });
});
