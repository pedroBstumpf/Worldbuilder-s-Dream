import type { IsoDateTime, Uuid } from './common';

/** Enum `public.asset_source` (ADR-0007). */
export type AssetSource = 'storage' | 'google_drive' | 'external_url';
export const ASSET_SOURCES: readonly AssetSource[] = ['storage', 'google_drive', 'external_url'];

/** `public.assets` — imagens (mapas, retratos, capas). */
export interface Asset {
  id: Uuid;
  worldId: Uuid;
  source: AssetSource;
  /** Preenchido quando `source = 'storage'`. */
  storagePath: string | null;
  /** Id do arquivo no Drive, quando `source = 'google_drive'`. */
  externalId: string | null;
  /** URL `https://`, quando `source = 'external_url'`. */
  externalUrl: string | null;
  mimeType: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  createdBy: Uuid;
  createdAt: IsoDateTime;
}
