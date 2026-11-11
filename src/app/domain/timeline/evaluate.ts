import { lerpPoint, type Point } from '../geometry/point';
import type { Tick } from '../models/common';
import type { InterpolationMode, TokenKeyframe } from '../models/token';

/** O que a avaliação precisa de um keyframe. */
export type KeyframeSample = Pick<TokenKeyframe, 'tick' | 'x' | 'y' | 'visible' | 'interpolation'>;

/** Curva de cada modo; `step` não interpola (fica no keyframe anterior). */
const EASINGS: Record<Exclude<InterpolationMode, 'step'>, (alpha: number) => number> = {
  linear: (a) => a,
  /** Suave na saída e na chegada (smoothstep). */
  ease: (a) => a * a * (3 - 2 * a),
};

/** Ordena por tick sem alterar a lista original (a avaliação exige ordem crescente). */
export function sortKeyframes<T extends Pick<TokenKeyframe, 'tick'>>(keyframes: readonly T[]): T[] {
  return [...keyframes].sort((a, b) => a.tick - b.tick);
}

/**
 * Índice do último keyframe com `tick ≤ t`, ou -1 se todos forem posteriores.
 * Busca binária: `keyframes` deve estar em ordem crescente de tick.
 */
export function findKeyframeIndex(
  keyframes: readonly Pick<TokenKeyframe, 'tick'>[],
  t: Tick,
): number {
  let low = 0;
  let high = keyframes.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    if ((keyframes[mid]?.tick ?? Infinity) <= t) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}

/**
 * Posição de um token no instante `t`, ou `null` se ele estiver oculto
 * (ainda não apareceu ou tem um keyframe `visible = false` em vigor). Regra do docs/06:
 * entre dois keyframes, interpola conforme o modo do anterior; depois do último, fica parado.
 * `keyframes` deve estar em ordem crescente de tick (ver `sortKeyframes`). O(log n).
 */
export function evaluateKeyframes(keyframes: readonly KeyframeSample[], t: Tick): Point | null {
  const i = findKeyframeIndex(keyframes, t);
  const current = keyframes[i];
  if (!current || !current.visible) return null;

  const next = keyframes[i + 1];
  if (!next || current.interpolation === 'step') return { x: current.x, y: current.y };

  const alpha = (t - current.tick) / (next.tick - current.tick);
  return lerpPoint(current, next, EASINGS[current.interpolation](alpha));
}
