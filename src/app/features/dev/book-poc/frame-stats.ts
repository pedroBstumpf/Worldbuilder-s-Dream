/**
 * Medição de quadros da prova de conceito do livro (F0-07, ADR-0011).
 * `summarizeFrames` é pura (testável); `measureFrames` amostra com
 * requestAnimationFrame enquanto uma etapa da animação roda.
 */

/** Quadro "longo": passou de 1,5 quadro a 60 Hz (abaixo de 40 fps). */
export const LONG_FRAME_MS = 25;

export interface FrameStats {
  /** Quadros pintados durante a etapa. */
  readonly frames: number;
  /** Duração amostrada, em ms. */
  readonly durationMs: number;
  readonly avgFps: number;
  /** Intervalo entre quadros no percentil 95, em ms. */
  readonly p95FrameMs: number;
  readonly worstFrameMs: number;
  /** % de quadros acima de LONG_FRAME_MS. */
  readonly longFramePct: number;
  /** Do início da etapa ao primeiro quadro, em ms (base da detecção de fps baixo). */
  readonly firstFrameMs: number;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/** Resume os intervalos entre quadros (o primeiro conta a partir do início da etapa). */
export function summarizeFrames(deltas: readonly number[]): FrameStats {
  if (deltas.length === 0) {
    return {
      frames: 0,
      durationMs: 0,
      avgFps: 0,
      p95FrameMs: 0,
      worstFrameMs: 0,
      longFramePct: 0,
      firstFrameMs: 0,
    };
  }
  const durationMs = deltas.reduce((sum, delta) => sum + delta, 0);
  const sorted = [...deltas].sort((a, b) => a - b);
  const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0;
  const long = deltas.filter((delta) => delta > LONG_FRAME_MS).length;
  return {
    frames: deltas.length,
    durationMs: round1(durationMs),
    avgFps: durationMs > 0 ? round1((deltas.length * 1000) / durationMs) : 0,
    p95FrameMs: round1(p95),
    worstFrameMs: round1(sorted[sorted.length - 1] ?? 0),
    longFramePct: round1((long * 100) / deltas.length),
    firstFrameMs: round1(deltas[0] ?? 0),
  };
}

/** Roda `work` amostrando os quadros até a Promise terminar. */
export async function measureFrames<T>(
  work: () => Promise<T>,
): Promise<{ readonly result: T; readonly stats: FrameStats }> {
  const deltas: number[] = [];
  let last = performance.now();
  let running = true;
  const tick = (now: number) => {
    if (!running) return;
    deltas.push(Math.max(0, now - last));
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  try {
    const result = await work();
    return { result, stats: summarizeFrames(deltas) };
  } finally {
    running = false;
  }
}
