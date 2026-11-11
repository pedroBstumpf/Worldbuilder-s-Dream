import type { SoftDeletable, Uuid, Versioned } from './common';

export type ScaleUnit = 'm' | 'km' | 'mi' | 'league' | 'day_walk' | 'custom';
export const SCALE_UNITS: readonly ScaleUnit[] = ['m', 'km', 'mi', 'league', 'day_walk', 'custom'];

/** Limite das colunas `width`/`height` de `maps`. */
export const MAP_MAX_DIMENSION = 32768;

/**
 * `public.maps`. Chama-se `WorldMap` para não colidir com o `Map` nativo.
 * Coordenadas do mundo = pixels da imagem original (docs/06).
 */
export interface WorldMap extends Versioned, SoftDeletable {
  id: Uuid;
  worldId: Uuid;
  parentMapId: Uuid | null;
  name: string;
  imageAssetId: Uuid | null;
  width: number;
  height: number;
  /** Unidades por pixel; nulo até o usuário definir a escala. */
  scaleValue: number | null;
  scaleUnit: ScaleUnit | null;
  scaleLabel: string | null;
  sortOrder: number;
}

/** Vértice `[x, y]` em coordenadas do mapa. */
export type PolygonVertex = [x: number, y: number];

/** `public.map_links` — região do mapa-pai que abre o mapa-filho. */
export interface MapLink {
  id: Uuid;
  worldId: Uuid;
  mapId: Uuid;
  targetMapId: Uuid;
  polygon: PolygonVertex[];
}
