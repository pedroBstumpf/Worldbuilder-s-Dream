import { inject, Injectable } from '@angular/core';
import type { Asset, Uuid } from '@domain/models';
import { AppError, AssetRepository, AuthService, type AssetDraft } from '@domain/ports';
import { LocalDatabase } from './local-database';
import { inTransaction, requireUserId, timestamp } from './local-transaction';

/**
 * Imagens no modo local: os metadados ficam em `assets` (como a tabela) e os bytes em
 * `assetFiles` (no lugar do Storage). Para exibir, cria um object URL, reaproveitado
 * até o asset ser apagado.
 */
@Injectable()
export class LocalAssetRepository extends AssetRepository {
  private readonly database = inject(LocalDatabase);
  private readonly auth = inject(AuthService);
  private readonly objectUrls = new Map<Uuid, string>();

  override async upload(draft: AssetDraft, file: Blob): Promise<Asset> {
    const userId = await requireUserId(this.auth);
    // Ler os bytes antes da transação: esperar outra coisa dentro dela a encerraria.
    const bytes = await file.arrayBuffer();
    const asset: Asset = {
      id: draft.id,
      worldId: draft.worldId,
      source: 'storage',
      storagePath: `${draft.worldId}/${draft.id}`,
      externalId: null,
      externalUrl: null,
      mimeType: draft.mimeType,
      width: draft.width ?? null,
      height: draft.height ?? null,
      sizeBytes: bytes.byteLength,
      createdBy: userId,
      createdAt: timestamp(),
    };
    const db = await this.database.ready();
    await inTransaction(db, ['assets', 'assetFiles'], async (tx) => {
      await tx.objectStore('assets').add(asset);
      await tx.objectStore('assetFiles').put({ id: asset.id, bytes, type: asset.mimeType });
    });
    return asset;
  }

  override async get(id: Uuid): Promise<Asset | null> {
    const db = await this.database.ready();
    return (await db.get('assets', id)) ?? null;
  }

  override async resolveUrl(asset: Asset): Promise<string> {
    if (asset.source === 'external_url' && asset.externalUrl) return asset.externalUrl;
    if (asset.source === 'google_drive') {
      throw new AppError('google_unavailable', 'o modo local não acessa o Google Drive');
    }
    const cached = this.objectUrls.get(asset.id);
    if (cached) return cached;
    const db = await this.database.ready();
    const file = await db.get('assetFiles', asset.id);
    if (!file) throw new AppError('not_found', 'arquivo do asset não encontrado');
    const url = URL.createObjectURL(new Blob([file.bytes], { type: file.type }));
    this.objectUrls.set(asset.id, url);
    return url;
  }

  override async delete(id: Uuid): Promise<void> {
    const db = await this.database.ready();
    await inTransaction(db, ['assets', 'assetFiles'], async (tx) => {
      await tx.objectStore('assets').delete(id);
      await tx.objectStore('assetFiles').delete(id);
    });
    const url = this.objectUrls.get(id);
    if (url) {
      URL.revokeObjectURL(url);
      this.objectUrls.delete(id);
    }
  }
}
