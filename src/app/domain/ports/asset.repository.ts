import type { Asset } from '../models/asset';
import type { Uuid } from '../models/common';

/** Dados de um arquivo já processado (WebP, sem EXIF) a enviar; `id` gerado no cliente. */
export type AssetDraft = Pick<Asset, 'id' | 'worldId' | 'mimeType'> &
  Partial<Pick<Asset, 'width' | 'height'>>;

/**
 * Porta das imagens. O modo local guarda o arquivo em IndexedDB; o Supabase, no Storage
 * (ou no Drive, ADR-0007). Assets não têm lixeira.
 */
export abstract class AssetRepository {
  abstract upload(draft: AssetDraft, file: Blob): Promise<Asset>;
  abstract get(id: Uuid): Promise<Asset | null>;
  /** URL para exibir a imagem (object URL local, URL assinada ou do Drive). */
  abstract resolveUrl(asset: Asset): Promise<string>;
  abstract delete(id: Uuid): Promise<void>;
}
