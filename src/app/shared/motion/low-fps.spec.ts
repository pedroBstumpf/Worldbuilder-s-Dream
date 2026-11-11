import { isLowFps } from './low-fps';

describe('isLowFps', () => {
  it('accepts a steady 60 fps start', () => {
    expect(isLowFps([12, 16.7, 16.6, 16.8, 16.7, 16.7])).toBe(false);
  });

  it('flags a first frame slower than 50 ms', () => {
    expect(isLowFps([51, 16.7, 16.7, 16.7])).toBe(true);
  });

  it('flags more than 20% of long frames', () => {
    // 2 de 6 quadros acima de 25 ms (33%).
    expect(isLowFps([16, 30, 16.7, 40, 16.7, 16.7])).toBe(true);
  });

  it('tolerates a few long frames', () => {
    // 1 de 6 quadros acima de 25 ms (17%).
    expect(isLowFps([16, 30, 16.7, 16.7, 16.7, 16.7])).toBe(false);
  });

  it('draws no conclusion without frames', () => {
    expect(isLowFps([])).toBe(false);
  });
});
