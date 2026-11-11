import type { IsoDateTime, JsonObject, Tick, Uuid } from './common';

/**
 * `public.map_tokens` — uma entidade **ou** um evento num mapa
 * (exatamente um dos dois; no máximo um token por alvo em cada mapa).
 */
export interface MapToken {
  id: Uuid;
  worldId: Uuid;
  mapId: Uuid;
  entityId: Uuid | null;
  eventId: Uuid | null;
  /** Entre 0,1 e 10. */
  size: number;
  style: JsonObject;
  createdAt: IsoDateTime;
}

/** Enum `public.interp_mode`. */
export type InterpolationMode = 'linear' | 'step' | 'ease';
export const INTERPOLATION_MODES: readonly InterpolationMode[] = ['linear', 'step', 'ease'];

/** `public.token_keyframes` — único por `(tokenId, tick)`. */
export interface TokenKeyframe {
  id: Uuid;
  worldId: Uuid;
  tokenId: Uuid;
  tick: Tick;
  x: number;
  y: number;
  visible: boolean;
  interpolation: InterpolationMode;
  note: string | null;
  updatedAt: IsoDateTime;
}
