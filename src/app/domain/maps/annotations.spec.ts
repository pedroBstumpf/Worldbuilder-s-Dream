import {
  annotationAnchor,
  distanceToSegment,
  eraserTouches,
  isAnnotationVisible,
  MAX_STROKE_POINTS,
  polylineLength,
  readAnnotation,
  segmentDistance,
  simplifyStroke,
  validRegion,
  writeAnnotation,
  type AnnotationShape,
} from './annotations';

describe('readAnnotation / writeAnnotation', () => {
  const shapes: AnnotationShape[] = [
    { kind: 'pin', at: { x: 10, y: 20 }, color: '#a33a2a', icon: 'castle' },
    { kind: 'label', at: { x: 5, y: 6 }, color: '#f4ead3', size: 'lg' },
    {
      kind: 'stroke',
      points: [
        { x: 0, y: 0 },
        { x: 10.25, y: 3 },
      ],
      color: '#5c7fa3',
      width: 2.5,
      opacity: 0.6,
      dashed: true,
    },
    {
      kind: 'region',
      polygon: [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
      color: '#7f9a62',
      opacity: 0.3,
    },
    {
      kind: 'measure',
      points: [
        { x: 0, y: 0 },
        { x: 3, y: 4 },
      ],
    },
  ];

  it('round-trips each kind', () => {
    for (const shape of shapes) {
      const stored = writeAnnotation(shape);
      const read = readAnnotation({ kind: shape.kind, ...stored });
      if (shape.kind === 'stroke') {
        expect(read).toEqual({ ...shape, points: [shape.points[0], { x: 10.3, y: 3 }] });
      } else {
        expect(read).toEqual(shape);
      }
    }
  });

  it('falls back to defaults on unknown style values', () => {
    const pin = readAnnotation({
      kind: 'pin',
      geometry: { x: 1, y: 1 },
      style: { color: 'red', icon: 'rocket' },
    });
    expect(pin).toEqual({ kind: 'pin', at: { x: 1, y: 1 }, color: '#8a6444', icon: 'location_on' });
  });

  it('rejects geometry that does not fit the kind', () => {
    expect(readAnnotation({ kind: 'pin', geometry: { x: 'a' }, style: {} })).toBeNull();
    expect(
      readAnnotation({ kind: 'region', geometry: { polygon: [[0, 0]] }, style: {} }),
    ).toBeNull();
    expect(readAnnotation({ kind: 'measure', geometry: {}, style: {} })).toBeNull();
  });
});

describe('isAnnotationVisible', () => {
  it('treats null ends as open', () => {
    expect(isAnnotationVisible({ tickStart: null, tickEnd: null }, -5)).toBe(true);
    expect(isAnnotationVisible({ tickStart: 300, tickEnd: 450 }, 299)).toBe(false);
    expect(isAnnotationVisible({ tickStart: 300, tickEnd: 450 }, 450)).toBe(true);
    expect(isAnnotationVisible({ tickStart: 300, tickEnd: 450 }, 451)).toBe(false);
    expect(isAnnotationVisible({ tickStart: null, tickEnd: 10 }, 11)).toBe(false);
  });
});

describe('geometry', () => {
  it('measures a polyline', () => {
    expect(
      polylineLength([
        { x: 0, y: 0 },
        { x: 3, y: 4 },
        { x: 3, y: 10 },
      ]),
    ).toBe(11);
  });

  it('measures point and segment distances', () => {
    expect(distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
    expect(distanceToSegment({ x: -4, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
    const crossing = segmentDistance(
      { x: 0, y: -1 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 1, y: 0 },
    );
    expect(crossing).toBe(0);
    const apart = segmentDistance({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 4 }, { x: 10, y: 4 });
    expect(apart).toBe(4);
  });

  it('erases a stroke the eraser path crosses, even when it moves fast', () => {
    const stroke = {
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      width: 2,
    };
    expect(eraserTouches(stroke, { x: 50, y: -40 }, { x: 50, y: 40 }, 3)).toBe(true);
    expect(eraserTouches(stroke, { x: 50, y: 4 }, { x: 60, y: 4 }, 3)).toBe(true);
    expect(eraserTouches(stroke, { x: 50, y: 8 }, { x: 60, y: 8 }, 3)).toBe(false);
    const dot = { points: [{ x: 0, y: 0 }], width: 4 };
    expect(eraserTouches(dot, { x: 3, y: 0 }, { x: 3, y: 0 }, 2)).toBe(true);
  });

  it('thins out close pointer samples and keeps the last point', () => {
    const points = [0, 0.5, 1, 3, 3.2, 3.4].map((x) => ({ x, y: 0 }));
    expect(simplifyStroke(points, 2).map((p) => p.x)).toEqual([0, 3.4]);
    const many = Array.from({ length: MAX_STROKE_POINTS + 10 }, (_, x) => ({ x, y: 0 }));
    expect(simplifyStroke(many, 0.5)).toHaveLength(MAX_STROKE_POINTS);
  });

  it('accepts only regions with area', () => {
    expect(
      validRegion([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 0, y: 10 },
      ]),
    ).toEqual([
      [0, 0],
      [10, 0],
      [0, 10],
    ]);
    expect(
      validRegion([
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 10, y: 0 },
      ]),
    ).toBeNull();
  });

  it('anchors each kind', () => {
    const stroke = readAnnotation({
      kind: 'stroke',
      geometry: {
        points: [
          [0, 0],
          [5, 5],
          [10, 10],
        ],
      },
      style: {},
    });
    expect(stroke && annotationAnchor(stroke)).toEqual({ x: 5, y: 5 });
  });
});
