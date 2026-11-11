import { LONG_FRAME_MS, summarizeFrames } from './frame-stats';

describe('summarizeFrames', () => {
  it('returns zeros when no frame was painted', () => {
    expect(summarizeFrames([])).toEqual({
      frames: 0,
      durationMs: 0,
      avgFps: 0,
      p95FrameMs: 0,
      worstFrameMs: 0,
      longFramePct: 0,
      firstFrameMs: 0,
    });
  });

  it('reports 60 fps for steady 16.67 ms frames', () => {
    const stats = summarizeFrames(Array.from({ length: 60 }, () => 1000 / 60));

    expect(stats.frames).toBe(60);
    expect(stats.durationMs).toBe(1000);
    expect(stats.avgFps).toBe(60);
    expect(stats.p95FrameMs).toBe(16.7);
    expect(stats.longFramePct).toBe(0);
  });

  it('flags long frames and keeps the first and worst frame', () => {
    const deltas = [40, ...Array.from({ length: 18 }, () => 16), 100];

    const stats = summarizeFrames(deltas);

    expect(stats.firstFrameMs).toBe(40);
    expect(stats.worstFrameMs).toBe(100);
    expect(stats.p95FrameMs).toBe(40);
    expect(stats.longFramePct).toBe(10);
    expect(deltas.filter((d) => d > LONG_FRAME_MS)).toHaveLength(2);
  });
});
