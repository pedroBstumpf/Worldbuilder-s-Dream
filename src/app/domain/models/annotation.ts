import type { IsoDateTime, JsonObject, Tick, Uuid } from './common';

export type AnnotationKind = 'pin' | 'stroke' | 'region' | 'label' | 'measure';
export const ANNOTATION_KINDS: readonly AnnotationKind[] = [
  'pin',
  'stroke',
  'region',
  'label',
  'measure',
];

/**
 * `public.map_annotations` — pinos, traços, regiões, rótulos e medições.
 * `tickStart`/`tickEnd` nulos = sempre visível. O formato de `geometry` por tipo
 * é definido junto com as ferramentas do mapa.
 */
export interface MapAnnotation {
  id: Uuid;
  worldId: Uuid;
  mapId: Uuid;
  kind: AnnotationKind;
  geometry: JsonObject;
  style: JsonObject;
  title: string | null;
  entityId: Uuid | null;
  eventId: Uuid | null;
  tickStart: Tick | null;
  tickEnd: Tick | null;
  zIndex: number;
  version: number;
  createdBy: Uuid | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}
