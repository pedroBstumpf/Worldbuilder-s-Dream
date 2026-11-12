import { inject, Injectable } from '@angular/core';
import type { Asset, World, WorldMember } from '@domain/models';
import { AppError, AuthService, WorldTransferRepository } from '@domain/ports';
import type { WorldBundle } from '@domain/transfer';
import {
  checkAnnotation,
  checkEntity,
  checkEvent,
  checkImageVersion,
  checkKeyframe,
  checkLink,
  checkMap,
  checkToken,
  checkWorld,
} from './local-checks';
import { LocalDatabase, type LocalAssetFile } from './local-database';
import { inTransaction, requireUserId, timestamp } from './local-transaction';
import { validCalendar } from './local-world.repository';
import { collectWorldRows, WORLD_STORES } from './local-world-rows';
import { isLive } from './trashable-table';

/** Exportar e importar mundos no modo local: tudo numa transação sobre `WORLD_STORES`. */
@Injectable()
export class LocalWorldTransferRepository extends WorldTransferRepository {
  private readonly database = inject(LocalDatabase);
  private readonly auth = inject(AuthService);

  override async exportWorld(worldId: string): Promise<WorldBundle> {
    const db = await this.database.ready();
    const rows = await collectWorldRows(db.transaction(WORLD_STORES), worldId);
    if (!rows || !isLive(rows.world) || !rows.calendar) throw new AppError('not_found');
    return {
      world: rows.world,
      calendar: rows.calendar.definition,
      maps: rows.maps,
      mapLinks: rows.links,
      mapImageVersions: rows.imageVersions,
      mapTokens: rows.tokens,
      tokenKeyframes: rows.keyframes,
      mapAnnotations: rows.annotations,
      entities: rows.entities,
      events: rows.events,
      entityMentions: rows.mentions,
      assets: rows.assets.map((asset, i) => {
        const file = rows.files[i];
        return { asset, bytes: file ? new Uint8Array(file.bytes) : null };
      }),
    };
  }

  /**
   * Quem importa vira o dono e o autor das linhas; o mundo entra no topo do sumário
   * (criado agora, versão 1), fora do arquivo e da lixeira. Os `check` do banco valem
   * para cada linha, como valeriam num `insert`.
   */
  override async importWorld(bundle: WorldBundle): Promise<World> {
    const userId = await requireUserId(this.auth);
    const now = timestamp();
    const world: World = {
      ...bundle.world,
      ownerId: userId,
      archivedAt: null,
      deletedAt: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    const calendar = {
      worldId: world.id,
      definition: validCalendar(bundle.calendar),
      updatedAt: now,
    };
    const owner: WorldMember = { worldId: world.id, userId, role: 'owner', createdAt: now };
    const byUser = <T extends { createdBy: string | null }>(row: T): T => ({
      ...row,
      createdBy: userId,
    });
    const maps = bundle.maps;
    const imageVersions = bundle.mapImageVersions.map(byUser);
    const annotations = bundle.mapAnnotations.map(byUser);
    const entities = bundle.entities.map(byUser);
    const events = bundle.events.map(byUser);
    const assets: Asset[] = bundle.assets.map(({ asset, bytes }) => ({
      ...asset,
      createdBy: userId,
      storagePath: asset.source === 'storage' ? `${world.id}/${asset.id}` : asset.storagePath,
      sizeBytes: bytes?.byteLength ?? asset.sizeBytes,
    }));
    // Copiar os bytes antes da transação: esperar outra coisa dentro dela a encerraria.
    const files: LocalAssetFile[] = bundle.assets.flatMap(({ asset, bytes }) =>
      bytes ? [{ id: asset.id, bytes: new Uint8Array(bytes).buffer, type: asset.mimeType }] : [],
    );
    if (bundle.assets.some(({ asset, bytes }) => asset.source === 'storage' && !bytes)) {
      throw new AppError('validation', 'imagem sem os bytes');
    }

    checkWorld(world);
    maps.forEach(checkMap);
    bundle.mapLinks.forEach(checkLink);
    imageVersions.forEach(checkImageVersion);
    bundle.mapTokens.forEach(checkToken);
    bundle.tokenKeyframes.forEach(checkKeyframe);
    annotations.forEach(checkAnnotation);
    entities.forEach(checkEntity);
    events.forEach(checkEvent);

    const db = await this.database.ready();
    await inTransaction(db, WORLD_STORES, async (tx) => {
      await Promise.all([
        tx.objectStore('worlds').add(world),
        tx.objectStore('worldMembers').add(owner),
        tx.objectStore('calendars').add(calendar),
        ...assets.map((row) => tx.objectStore('assets').add(row)),
        ...files.map((row) => tx.objectStore('assetFiles').add(row)),
        ...maps.map((row) => tx.objectStore('maps').add(row)),
        ...bundle.mapLinks.map((row) => tx.objectStore('mapLinks').add(row)),
        ...imageVersions.map((row) => tx.objectStore('mapImageVersions').add(row)),
        ...bundle.mapTokens.map((row) => tx.objectStore('mapTokens').add(row)),
        ...bundle.tokenKeyframes.map((row) => tx.objectStore('tokenKeyframes').add(row)),
        ...annotations.map((row) => tx.objectStore('mapAnnotations').add(row)),
        ...entities.map((row) => tx.objectStore('entities').add(row)),
        ...events.map((row) => tx.objectStore('events').add(row)),
        ...bundle.entityMentions.map((row) => tx.objectStore('entityMentions').add(row)),
      ]);
    });
    return world;
  }
}
