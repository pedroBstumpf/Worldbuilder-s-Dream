import type { InterpolationMode } from '../models/token';
import {
  adjacentKeyframeTick,
  keyframeAt,
  keyframeInEffect,
  type KeyframeFields,
  planKeyframeHide,
  planKeyframeMove,
  trailSegments,
} from './keyframe-edits';

function kf(
  id: string,
  tick: number,
  x: number,
  y: number,
  options: { visible?: boolean; interpolation?: InterpolationMode } = {},
): KeyframeFields {
  return {
    id,
    tick,
    x,
    y,
    visible: options.visible ?? true,
    interpolation: options.interpolation ?? 'linear',
    note: null,
  };
}

const keyframes = [
  kf('a', 0, 0, 0),
  kf('b', 10, 10, 0, { interpolation: 'ease' }),
  kf('c', 20, 20, 0),
];

describe('keyframeAt and keyframeInEffect', () => {
  it('finds the keyframe exactly at the instant', () => {
    expect(keyframeAt(keyframes, 10)?.id).toBe('b');
    expect(keyframeAt(keyframes, 11)).toBeNull();
    expect(keyframeAt([], 0)).toBeNull();
  });

  it('finds the keyframe in effect at the instant', () => {
    expect(keyframeInEffect(keyframes, 15)?.id).toBe('b');
    expect(keyframeInEffect(keyframes, -1)).toBeNull();
  });
});

describe('planKeyframeMove', () => {
  it('updates the keyframe at the instant', () => {
    expect(planKeyframeMove(keyframes, 10, { x: 5, y: 6 }, 'new')).toEqual({
      ...keyframes[1],
      x: 5,
      y: 6,
    });
  });

  it('creates a keyframe that inherits the interpolation in effect', () => {
    expect(planKeyframeMove(keyframes, 15, { x: 5, y: 6 }, 'new')).toEqual(
      kf('new', 15, 5, 6, { interpolation: 'ease' }),
    );
  });

  it('starts with linear interpolation before the first keyframe', () => {
    expect(planKeyframeMove(keyframes, -5, { x: 1, y: 1 }, 'new').interpolation).toBe('linear');
    expect(planKeyframeMove([], 0, { x: 1, y: 1 }, 'new')).toEqual(kf('new', 0, 1, 1));
  });

  it('corrects the keyframe in effect with Alt', () => {
    const plan = planKeyframeMove(keyframes, 15, { x: 7, y: 8 }, 'new', { correctPrevious: true });
    expect(plan).toEqual({ ...keyframes[1], x: 7, y: 8 });
  });

  it('creates a keyframe with Alt when nothing visible is in effect', () => {
    const hidden = [kf('a', 0, 0, 0, { visible: false })];
    const plan = planKeyframeMove(hidden, 5, { x: 1, y: 2 }, 'new', { correctPrevious: true });
    expect(plan.id).toBe('new');
    expect(plan.tick).toBe(5);
  });

  it('shows the token again when moving a hidden keyframe', () => {
    const hidden = [kf('a', 0, 0, 0, { visible: false })];
    expect(planKeyframeMove(hidden, 0, { x: 3, y: 3 }, 'new')).toEqual(kf('a', 0, 3, 3));
  });
});

describe('planKeyframeHide', () => {
  it('creates a hidden keyframe at the current position', () => {
    expect(planKeyframeHide(keyframes, 15, { x: 12, y: 0 }, 'new')).toEqual(
      kf('new', 15, 12, 0, { visible: false }),
    );
  });

  it('hides the keyframe at the instant', () => {
    expect(planKeyframeHide(keyframes, 20, { x: 0, y: 0 }, 'new')).toEqual({
      ...keyframes[2],
      visible: false,
    });
  });
});

describe('adjacentKeyframeTick', () => {
  it('goes to the next keyframe', () => {
    expect(adjacentKeyframeTick(keyframes, 0, 1)).toBe(10);
    expect(adjacentKeyframeTick(keyframes, 5, 1)).toBe(10);
    expect(adjacentKeyframeTick(keyframes, -5, 1)).toBe(0);
    expect(adjacentKeyframeTick(keyframes, 20, 1)).toBeNull();
  });

  it('goes to the previous keyframe', () => {
    expect(adjacentKeyframeTick(keyframes, 10, -1)).toBe(0);
    expect(adjacentKeyframeTick(keyframes, 15, -1)).toBe(10);
    expect(adjacentKeyframeTick(keyframes, 0, -1)).toBeNull();
    expect(adjacentKeyframeTick(keyframes, 99, -1)).toBe(20);
  });
});

describe('trailSegments', () => {
  it('links the keyframes while the token is visible', () => {
    expect(trailSegments(keyframes).map((s) => s.map((k) => k.id))).toEqual([['a', 'b', 'c']]);
  });

  it('ends a segment at the exit and starts another when the token comes back', () => {
    const list = [
      kf('a', 0, 0, 0),
      kf('b', 10, 10, 0, { visible: false }),
      kf('c', 20, 0, 0, { visible: false }),
      kf('d', 30, 5, 5),
      kf('e', 40, 6, 6),
    ];
    expect(trailSegments(list).map((s) => s.map((k) => k.id))).toEqual([
      ['a', 'b'],
      ['d', 'e'],
    ]);
  });

  it('keeps a lone keyframe as a segment of one point', () => {
    expect(trailSegments([kf('a', 0, 1, 1)]).map((s) => s.length)).toEqual([1]);
    expect(trailSegments([])).toEqual([]);
  });
});
