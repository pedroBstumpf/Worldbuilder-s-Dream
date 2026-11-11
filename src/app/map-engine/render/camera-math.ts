import type { Point } from '@domain/geometry';
import type { Camera, ViewportInsets } from '../map-engine';

export interface Size {
  width: number;
  height: number;
}

/** Folga em volta do mapa enquadrado (fração da área visível). */
const FIT_MARGIN = 0.94;

/** Zoom máximo: 8 pixels de tela por pixel do mapa. */
export const MAX_ZOOM = 8;

/** Área visível da tela (sem as barras), nunca menor que 1 px. */
export function visibleArea(screen: Size, insets: ViewportInsets): Size {
  return {
    width: Math.max(1, screen.width - insets.left - insets.right),
    height: Math.max(1, screen.height - insets.top - insets.bottom),
  };
}

/** Zoom que faz o mapa inteiro caber na área visível. */
export function fitZoom(map: Size, screen: Size, insets: ViewportInsets): number {
  const area = visibleArea(screen, insets);
  return Math.min(area.width / map.width, area.height / map.height) * FIT_MARGIN;
}

/** Limites de zoom: de metade do enquadramento até `MAX_ZOOM` (ou o enquadramento, se maior). */
export function zoomLimits(
  map: Size,
  screen: Size,
  insets: ViewportInsets,
): { min: number; max: number } {
  const fit = fitZoom(map, screen, insets);
  return { min: fit / 2, max: Math.max(MAX_ZOOM, fit) };
}

export function clampZoom(zoom: number, limits: { min: number; max: number }): number {
  return Math.min(limits.max, Math.max(limits.min, zoom));
}

/**
 * Centro da **tela** (em coordenadas do mapa) que põe `focus` no meio da área visível.
 * As barras deslocam o centro: com a barra direita aberta, o mapa fica um pouco à esquerda.
 */
export function screenCenterFor(focus: Point, zoom: number, insets: ViewportInsets): Point {
  return {
    x: focus.x - (insets.left - insets.right) / 2 / zoom,
    y: focus.y - (insets.top - insets.bottom) / 2 / zoom,
  };
}

/** Inverso de `screenCenterFor`: o ponto do mapa no meio da área visível. */
export function focusFor(screenCenter: Point, zoom: number, insets: ViewportInsets): Point {
  return {
    x: screenCenter.x + (insets.left - insets.right) / 2 / zoom,
    y: screenCenter.y + (insets.top - insets.bottom) / 2 / zoom,
  };
}

/** Câmera que enquadra o mapa inteiro. */
export function fitCamera(map: Size, screen: Size, insets: ViewportInsets): Camera {
  return { center: { x: map.width / 2, y: map.height / 2 }, zoom: fitZoom(map, screen, insets) };
}
