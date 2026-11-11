import {
  fitCamera,
  fitZoom,
  focusFor,
  MAX_ZOOM,
  screenCenterFor,
  visibleArea,
  zoomLimits,
} from './camera-math';

const none = { top: 0, right: 0, bottom: 0, left: 0 };
const bars = { top: 48, right: 320, bottom: 0, left: 72 };

describe('camera math', () => {
  it('fits the map in the area not covered by the bars', () => {
    expect(visibleArea({ width: 1400, height: 900 }, bars)).toEqual({ width: 1008, height: 852 });
    expect(fitZoom({ width: 2000, height: 1000 }, { width: 1000, height: 1000 }, none)).toBeCloseTo(
      0.47,
    );
    expect(fitCamera({ width: 2000, height: 1000 }, { width: 1000, height: 1000 }, none)).toEqual({
      center: { x: 1000, y: 500 },
      zoom: fitZoom({ width: 2000, height: 1000 }, { width: 1000, height: 1000 }, none),
    });
  });

  it('limits zoom between half the fit and the maximum', () => {
    const limits = zoomLimits({ width: 8192, height: 8192 }, { width: 1024, height: 1024 }, none);
    expect(limits.min).toBeCloseTo(0.0587, 3);
    expect(limits.max).toBe(MAX_ZOOM);
    // Mapa minúsculo: o enquadramento passa do máximo e vira o limite.
    expect(zoomLimits({ width: 10, height: 10 }, { width: 1000, height: 1000 }, none).max).toBe(94);
  });

  it('offsets the screen center so the focus sits in the visible area', () => {
    const focus = { x: 500, y: 500 };
    const center = screenCenterFor(focus, 2, bars);
    expect(center).toEqual({ x: 500 + 62, y: 500 - 12 });
    expect(focusFor(center, 2, bars)).toEqual(focus);
  });
});
