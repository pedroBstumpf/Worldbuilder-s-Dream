import { rescaleFactor, scaleFromLine, toMapUnits } from './map-scale';

describe('map scale', () => {
  it('derives units per pixel from a drawn line', () => {
    expect(scaleFromLine(200, 100)).toBe(0.5);
    expect(scaleFromLine(0, 100)).toBeNull();
    expect(scaleFromLine(200, 0)).toBeNull();
    expect(scaleFromLine(200, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('converts pixels to map units only when the scale is set', () => {
    expect(toMapUnits(300, { scaleValue: 0.5, scaleUnit: 'km' })).toBe(150);
    expect(toMapUnits(300, { scaleValue: null, scaleUnit: null })).toBeNull();
  });

  it('computes the factor to rescale coordinates to a new image', () => {
    expect(rescaleFactor({ width: 1000, height: 500 }, { width: 2000, height: 250 })).toEqual({
      x: 2,
      y: 0.5,
    });
  });
});
