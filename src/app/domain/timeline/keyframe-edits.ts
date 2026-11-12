import type { Point } from '../geometry/point';
import type { Tick } from '../models/common';
import type { TokenKeyframe } from '../models/token';
import { findKeyframeIndex } from './evaluate';

/** Campos de um keyframe que as edições decidem (o resto vem do token e do adaptador). */
export type KeyframeFields = Pick<
  TokenKeyframe,
  'id' | 'tick' | 'x' | 'y' | 'visible' | 'interpolation' | 'note'
>;

/** Keyframe exatamente no instante, se houver. `keyframes` em ordem crescente de tick. */
export function keyframeAt<T extends Pick<TokenKeyframe, 'tick'>>(
  keyframes: readonly T[],
  tick: Tick,
): T | null {
  const keyframe = keyframes[findKeyframeIndex(keyframes, tick)];
  return keyframe?.tick === tick ? keyframe : null;
}

/** Último keyframe com `tick ≤ t` (o que está em vigor no instante), se houver. */
export function keyframeInEffect<T extends Pick<TokenKeyframe, 'tick'>>(
  keyframes: readonly T[],
  tick: Tick,
): T | null {
  return keyframes[findKeyframeIndex(keyframes, tick)] ?? null;
}

/**
 * Keyframe que um movimento do token grava (docs/06 §3 › Interações): atualiza o keyframe
 * do instante ou cria um novo, que herda a interpolação do anterior. Com `correctPrevious`
 * (`Alt` + arrastar), move o keyframe em vigor em vez de criar outro. `newId` é usado só
 * quando nasce um keyframe.
 */
export function planKeyframeMove(
  keyframes: readonly KeyframeFields[],
  tick: Tick,
  to: Point,
  newId: string,
  options: { correctPrevious?: boolean } = {},
): KeyframeFields {
  const current = keyframeInEffect(keyframes, tick);
  const target =
    options.correctPrevious && current?.visible ? current : keyframeAt(keyframes, tick);
  if (target) return { ...target, x: to.x, y: to.y, visible: true };
  return {
    id: newId,
    tick,
    x: to.x,
    y: to.y,
    visible: true,
    interpolation: current?.interpolation ?? 'linear',
    note: null,
  };
}

/**
 * Keyframe que esconde o token a partir do instante ("Sair do mapa aqui"): mantém a
 * posição em vigor, para o rastro terminar onde o token estava.
 */
export function planKeyframeHide(
  keyframes: readonly KeyframeFields[],
  tick: Tick,
  at: Point,
  newId: string,
): KeyframeFields {
  const existing = keyframeAt(keyframes, tick);
  if (existing) return { ...existing, visible: false };
  return { id: newId, tick, x: at.x, y: at.y, visible: false, interpolation: 'linear', note: null };
}

/** Tick do keyframe seguinte (`1`) ou anterior (`-1`) ao instante, sem contar o do instante. */
export function adjacentKeyframeTick(
  keyframes: readonly Pick<TokenKeyframe, 'tick'>[],
  tick: Tick,
  direction: 1 | -1,
): Tick | null {
  const i = findKeyframeIndex(keyframes, tick);
  if (direction === 1) return keyframes[i + 1]?.tick ?? null;
  const previous = keyframes[i]?.tick === tick ? keyframes[i - 1] : keyframes[i];
  return previous?.tick ?? null;
}

/**
 * Trechos do rastro (docs/05 › Rastro de movimento): cada sequência de keyframes ligados,
 * isto é, em que o token está visível de um ao seguinte. Um keyframe `visible = false`
 * encerra o trecho (o ponto de saída ainda entra, para o rastro terminar nele).
 */
export function trailSegments<T extends Pick<TokenKeyframe, 'x' | 'y' | 'visible'>>(
  keyframes: readonly T[],
): T[][] {
  const segments: T[][] = [];
  let current: T[] = [];
  for (const keyframe of keyframes) {
    if (current.length > 0) current.push(keyframe);
    else if (keyframe.visible) current = [keyframe];
    if (!keyframe.visible && current.length > 0) {
      segments.push(current);
      current = [];
    }
  }
  if (current.length > 0) segments.push(current);
  return segments;
}
