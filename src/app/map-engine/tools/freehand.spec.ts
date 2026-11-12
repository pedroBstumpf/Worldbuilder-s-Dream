import { dashSegments, strokeOutline } from './freehand';

describe('strokeOutline', () => {
  it('outlines a stroke as a flat list of coordinates', () => {
    const outline = strokeOutline(
      [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 100, y: 10 },
      ],
      6,
    );
    expect(outline.length).toBeGreaterThan(6);
    expect(outline.length % 2).toBe(0);
    expect(outline.every(Number.isFinite)).toBe(true);
  });
});

describe('dashSegments', () => {
  const line = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
  ];

  it('cuts the line into dashes, across corners', () => {
    const dashes = dashSegments(line, 4, 2);
    expect(dashes.map((d) => d.map((p) => [p.x, p.y]))).toEqual([
      [
        [0, 0],
        [4, 0],
      ],
      [
        [6, 0],
        [10, 0],
      ],
      [
        [10, 2],
        [10, 6],
      ],
      [
        [10, 8],
        [10, 10],
      ],
    ]);
  });

  it('keeps a single point as a dot', () => {
    expect(dashSegments([{ x: 1, y: 1 }], 4, 2)).toEqual([[{ x: 1, y: 1 }]]);
  });
});
