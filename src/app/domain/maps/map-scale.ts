import type { WorldMap } from '../models/map';

/**
 * Escala do mapa (docs/06 › Sistema de coordenadas): `scaleValue` unidades por pixel da
 * imagem original. O usuário desenha uma linha sobre a escala gráfica e diz o comprimento.
 */
export function scaleFromLine(pixelLength: number, realLength: number): number | null {
  if (!(pixelLength > 0) || !(realLength > 0) || !Number.isFinite(realLength)) return null;
  return realLength / pixelLength;
}

/** Distância em pixels do mapa convertida na unidade da escala; `null` sem escala. */
export function toMapUnits(
  pixels: number,
  map: Pick<WorldMap, 'scaleValue' | 'scaleUnit'>,
): number | null {
  if (map.scaleValue === null || map.scaleUnit === null) return null;
  return pixels * map.scaleValue;
}

/**
 * Ao trocar a imagem por outra de resolução diferente, as coordenadas são reescalonadas
 * proporcionalmente (docs/06) e a escala acompanha: cada pixel novo cobre mais ou menos chão.
 */
export function rescaleFactor(
  from: Pick<WorldMap, 'width' | 'height'>,
  to: { width: number; height: number },
): { x: number; y: number } {
  return { x: to.width / from.width, y: to.height / from.height };
}
