/** Identificador `uuid`, gerado no cliente com `crypto.randomUUID()` (docs/10). */
export type Uuid = string;

/** Data e hora real em ISO 8601 (colunas `timestamptz`). */
export type IsoDateTime = string;

/**
 * Tempo do mundo: inteiro de minutos desde a época zero; negativo = antes da época.
 * No banco é `bigint`; no front, `number` é seguro até 2⁵³ (docs/06, ADR-0006).
 */
export type Tick = number;

/** Valor JSON (colunas `jsonb`). */
export type Json = string | number | boolean | null | Json[] | JsonObject;
export interface JsonObject {
  [key: string]: Json;
}

/** Cor `#rrggbb` (check das colunas `color`). */
export type HexColor = string;

/** Colunas das tabelas principais com controle de concorrência e lixeira (docs/07, "Convenções"). */
export interface Versioned {
  version: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface SoftDeletable {
  deletedAt: IsoDateTime | null;
}

export function isTick(value: unknown): value is Tick {
  return typeof value === 'number' && Number.isSafeInteger(value);
}
