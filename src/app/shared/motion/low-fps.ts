/**
 * Detecção de fps baixo do livro (ADR-0011 › Decisões, item 7). Se o primeiro quadro
 * de uma animação demorar demais, ou se muitos quadros do começo forem longos, as
 * próximas transições da sessão usam a versão curta.
 */

/** Janela observada no começo de cada etapa animada, em ms. */
export const LOW_FPS_WINDOW_MS = 300;
/** Primeiro quadro acima disso já indica máquina lenta. */
export const LOW_FPS_FIRST_FRAME_MS = 50;
/** Quadro "longo": passou de 1,5 quadro a 60 Hz (abaixo de 40 fps). */
export const LONG_FRAME_MS = 25;
/** Fração máxima de quadros longos na janela. */
export const LOW_FPS_LONG_FRAME_RATIO = 0.2;

/**
 * Decide pelos intervalos entre quadros; o primeiro conta a partir do início da etapa.
 * Sem quadros (aba escondida), não conclui nada.
 */
export function isLowFps(deltas: readonly number[]): boolean {
  const [first] = deltas;
  if (first === undefined) return false;
  if (first > LOW_FPS_FIRST_FRAME_MS) return true;
  const long = deltas.filter((delta) => delta > LONG_FRAME_MS).length;
  return long / deltas.length > LOW_FPS_LONG_FRAME_RATIO;
}

/**
 * Amostra os quadros com requestAnimationFrame durante `windowMs` e diz se o fps está baixo.
 * Com a aba escondida o navegador não pinta: devolve `false` sem esperar.
 */
export function watchLowFps(windowMs = LOW_FPS_WINDOW_MS): Promise<boolean> {
  if (typeof document === 'undefined' || document.visibilityState !== 'visible') {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    const deltas: number[] = [];
    const start = performance.now();
    let last = start;
    const tick = (now: number) => {
      deltas.push(Math.max(0, now - last));
      last = now;
      if (now - start < windowMs) requestAnimationFrame(tick);
      else resolve(isLowFps(deltas));
    };
    requestAnimationFrame(tick);
  });
}
