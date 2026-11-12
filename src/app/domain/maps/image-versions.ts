import type { MapImageVersion, Tick } from '../models';
import type { Size } from './map-image';

/** Acima desta diferença de proporção, a nova versão pede corte ou margens (docs/06 §1). */
export const IMAGE_ASPECT_TOLERANCE = 0.01;

/** Versões em ordem crescente de `tickStart`. */
export function sortImageVersions<T extends Pick<MapImageVersion, 'tickStart'>>(
  versions: readonly T[],
): T[] {
  return [...versions].sort((a, b) => a.tickStart - b.tickStart);
}

/**
 * Índice da versão em vigor no instante: a de maior `tickStart ≤ tick` (busca binária,
 * como os keyframes). `-1` = vale a imagem inicial do mapa. `versions` em ordem crescente.
 */
export function imageVersionIndexAt(
  versions: readonly Pick<MapImageVersion, 'tickStart'>[],
  tick: Tick,
): number {
  let low = 0;
  let high = versions.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if ((versions[middle]?.tickStart ?? Infinity) <= tick) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

/** Diferença relativa entre as proporções (largura/altura) de duas imagens. */
export function aspectDifference(a: Size, b: Size): number {
  const ratioA = a.width / a.height;
  const ratioB = b.width / b.height;
  return Math.abs(ratioA - ratioB) / ratioB;
}

/** A imagem `candidate` ficaria deformada esticada para `base` (mais de 1 % de diferença). */
export function aspectMismatch(candidate: Size, base: Size): boolean {
  return aspectDifference(candidate, base) > IMAGE_ASPECT_TOLERANCE;
}

/** Cortar o que sobra ou enquadrar com margens transparentes. */
export type AspectFitMode = 'crop' | 'pad';

/** Como desenhar a imagem numa tela da proporção do mapa. */
export interface AspectFitPlan {
  /** Tamanho da tela final. */
  canvas: Size;
  /** Onde a imagem inteira é desenhada na tela (pode passar das bordas no corte). */
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Leva `image` à proporção de `target`, centrada: `crop` corta as sobras (a tela cabe
 * dentro da imagem), `pad` põe margens (a imagem cabe dentro da tela). A tela respeita
 * `maxSide`, reduzindo tudo se preciso.
 */
export function planAspectFit(
  image: Size,
  target: Size,
  mode: AspectFitMode,
  maxSide: number,
): AspectFitPlan {
  const ratio = target.width / target.height;
  const imageRatio = image.width / image.height;
  // Tela na proporção do alvo, no tamanho da imagem: limitada por ela (corte) ou contendo-a.
  const wider = imageRatio > ratio;
  let canvas: Size =
    mode === 'crop'
      ? wider
        ? { width: image.height * ratio, height: image.height }
        : { width: image.width, height: image.width / ratio }
      : wider
        ? { width: image.width, height: image.width / ratio }
        : { width: image.height * ratio, height: image.height };
  let scale = 1;
  const longest = Math.max(canvas.width, canvas.height);
  if (longest > maxSide) {
    scale = maxSide / longest;
    canvas = { width: canvas.width * scale, height: canvas.height * scale };
  }
  const width = image.width * scale;
  const height = image.height * scale;
  const rounded = {
    width: Math.max(1, Math.round(canvas.width)),
    height: Math.max(1, Math.round(canvas.height)),
  };
  return {
    canvas: rounded,
    x: (rounded.width - width) / 2,
    y: (rounded.height - height) / 2,
    width,
    height,
  };
}
