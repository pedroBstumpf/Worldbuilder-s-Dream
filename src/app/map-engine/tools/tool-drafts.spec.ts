import { CalibrationDraft, ClickTracker, PolygonDraft } from './tool-drafts';

describe('tool drafts', () => {
  it('recognizes double clicks close in time and space', () => {
    const clicks = new ClickTracker();
    expect(clicks.click({ x: 10, y: 10 }, 0)).toBe(false);
    expect(clicks.click({ x: 12, y: 11 }, 200)).toBe(true);
    // Um terceiro clique começa outra contagem.
    expect(clicks.click({ x: 12, y: 11 }, 300)).toBe(false);
    expect(clicks.click({ x: 40, y: 11 }, 400)).toBe(false);
    expect(clicks.click({ x: 40, y: 11 }, 1000)).toBe(false);
  });

  it('measures the calibration line on the second click', () => {
    const draft = new CalibrationDraft();
    expect(draft.add({ x: 0, y: 0 })).toBeNull();
    expect(draft.add({ x: 30, y: 40 })).toEqual({
      points: [
        { x: 0, y: 0 },
        { x: 30, y: 40 },
      ],
      distance: 50,
    });
    expect(draft.add({ x: 5, y: 5 })).toBeNull();
    expect(draft.vertices).toEqual([{ x: 5, y: 5 }]);
  });

  it('closes polygons with at least three vertices and some area', () => {
    const draft = new PolygonDraft();
    draft.add({ x: 0, y: 0 });
    draft.add({ x: 100.4, y: 0 });
    expect(draft.isNearStart({ x: 1, y: 1 }, 5)).toBe(false);
    draft.add({ x: 100, y: 100 });
    expect(draft.isNearStart({ x: 1, y: 1 }, 5)).toBe(true);
    expect(draft.close()).toEqual([
      [0, 0],
      [100, 0],
      [100, 100],
    ]);
    expect(draft.vertices).toEqual([]);

    draft.add({ x: 0, y: 0 });
    draft.add({ x: 10, y: 0 });
    draft.add({ x: 20, y: 0 });
    expect(draft.close()).toBeNull();
  });
});
