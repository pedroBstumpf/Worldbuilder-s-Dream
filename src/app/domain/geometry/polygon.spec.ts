import { pointInPolygon, polygonArea, polygonCenter, type Polygon } from './polygon';

const square: Polygon = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];

describe('polygon', () => {
  it('hit-tests points', () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false);
    expect(pointInPolygon({ x: 5, y: -1 }, square)).toBe(false);
    expect(
      pointInPolygon({ x: 1, y: 1 }, [
        [0, 0],
        [5, 5],
      ]),
    ).toBe(false);
  });

  it('handles concave shapes', () => {
    const l: Polygon = [
      [0, 0],
      [10, 0],
      [10, 4],
      [4, 4],
      [4, 10],
      [0, 10],
    ];
    expect(pointInPolygon({ x: 2, y: 8 }, l)).toBe(true);
    expect(pointInPolygon({ x: 8, y: 8 }, l)).toBe(false);
    expect(polygonArea(l)).toBe(64);
  });

  it('finds the bounding box center and the area', () => {
    expect(polygonCenter(square)).toEqual({ x: 5, y: 5 });
    expect(polygonCenter([])).toEqual({ x: 0, y: 0 });
    expect(polygonArea(square)).toBe(100);
  });
});
