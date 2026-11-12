import { inject, Injectable } from '@angular/core';
import { sortImageVersions } from '@domain/maps';
import type {
  MapAnnotation,
  MapImageVersion,
  MapLink,
  MapToken,
  TokenKeyframe,
  Uuid,
  WorldMap,
} from '@domain/models';
import {
  AppError,
  AuthService,
  MapRepository,
  type MapAnnotationInput,
  type MapAnnotationPatch,
  type MapDraft,
  type MapImageVersionDraft,
  type MapImageVersionPatch,
  type MapPatch,
  type MapScene,
  type MapTokenInput,
  type TokenKeyframeInput,
} from '@domain/ports';
import {
  checkAnnotation,
  checkImageVersion,
  checkKeyframe,
  checkLink,
  checkMap,
  checkToken,
} from './local-checks';
import { LocalDatabase } from './local-database';
import { definedOnly, inTransaction, requireUserId, timestamp } from './local-transaction';
import { isLive, TrashableTable } from './trashable-table';

/** Todos os keyframes de um token no índice `[tokenId, tick]`, já em ordem de tick. */
function keyframesOf(tokenId: Uuid): IDBKeyRange {
  return IDBKeyRange.bound([tokenId, -Infinity], [tokenId, Infinity]);
}

type MapContentStore = 'mapTokens' | 'tokenKeyframes' | 'mapAnnotations' | 'mapLinks';

@Injectable()
export class LocalMapRepository extends MapRepository {
  private readonly database = inject(LocalDatabase);
  private readonly auth = inject(AuthService);
  private readonly maps = new TrashableTable<WorldMap>(this.database, 'maps', checkMap);

  /** Mapas do mundo por `sortOrder`; empate pela criação. */
  override async list(worldId: Uuid): Promise<WorldMap[]> {
    const maps = await this.maps.listByWorld(worldId);
    return maps.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
  }

  override get(id: Uuid): Promise<WorldMap | null> {
    return this.maps.get(id);
  }

  override create(draft: MapDraft): Promise<WorldMap> {
    const now = timestamp();
    return this.maps.insert({
      parentMapId: null,
      imageAssetId: null,
      scaleValue: null,
      scaleUnit: null,
      scaleLabel: null,
      sortOrder: 0,
      ...definedOnly(draft),
      version: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  override update(id: Uuid, patch: MapPatch, expectedVersion: number): Promise<WorldMap> {
    return this.maps.update(id, patch, expectedVersion);
  }

  override moveToTrash(id: Uuid, expectedVersion: number): Promise<void> {
    return this.maps.moveToTrash(id, expectedVersion);
  }

  override restore(id: Uuid): Promise<WorldMap> {
    return this.maps.restore(id);
  }

  /** Como a RPC `get_map_scene`: tudo numa só transação de leitura. */
  override async getScene(mapId: Uuid): Promise<MapScene | null> {
    const db = await this.database.ready();
    const tx = db.transaction([
      'maps',
      'mapTokens',
      'tokenKeyframes',
      'mapAnnotations',
      'mapLinks',
      'mapImageVersions',
    ]);
    const map = await tx.objectStore('maps').get(mapId);
    if (!isLive(map)) return null;
    const [tokens, annotations, links, versions] = await Promise.all([
      tx.objectStore('mapTokens').index('byMap').getAll(mapId),
      tx.objectStore('mapAnnotations').index('byMap').getAll(mapId),
      tx.objectStore('mapLinks').index('byMap').getAll(mapId),
      tx.objectStore('mapImageVersions').index('byMap').getAll(mapId),
    ]);
    const byTokenTick = tx.objectStore('tokenKeyframes').index('byTokenTick');
    const keyframes = await Promise.all(
      tokens.map((token) => byTokenTick.getAll(keyframesOf(token.id))),
    );
    annotations.sort((a, b) => a.zIndex - b.zIndex || a.createdAt.localeCompare(b.createdAt));
    return {
      map,
      tokens,
      keyframes: keyframes.flat(),
      annotations,
      links,
      imageVersions: sortImageVersions(versions.filter(isLive)),
    };
  }

  /** Cria ou substitui o token; um segundo token do mesmo alvo no mapa é `conflict`. */
  override async saveToken(input: MapTokenInput): Promise<MapToken> {
    const db = await this.database.ready();
    return inTransaction(db, ['maps', 'mapTokens'], async (tx) => {
      await requireLiveMap(tx.objectStore('maps'), input.mapId);
      const tokens = tx.objectStore('mapTokens');
      const existing = await tokens.get(input.id);
      const token: MapToken = { ...input, createdAt: existing?.createdAt ?? timestamp() };
      checkToken(token);
      await tokens.put(token);
      return token;
    });
  }

  override async deleteToken(id: Uuid): Promise<void> {
    const db = await this.database.ready();
    await inTransaction(db, ['mapTokens', 'tokenKeyframes'], async (tx) => {
      const keyframes = tx.objectStore('tokenKeyframes');
      const keys = await keyframes.index('byTokenTick').getAllKeys(keyframesOf(id));
      await Promise.all(keys.map((key) => keyframes.delete(key)));
      await tx.objectStore('mapTokens').delete(id);
    });
  }

  /**
   * Upsert por `(tokenId, tick)`, como `on conflict (token_id, tick)`: se o token já tem
   * keyframe nesse tick, ele é atualizado e mantém o próprio id.
   */
  override async saveKeyframe(input: TokenKeyframeInput): Promise<TokenKeyframe> {
    const db = await this.database.ready();
    return inTransaction(db, ['mapTokens', 'tokenKeyframes'], async (tx) => {
      if (!(await tx.objectStore('mapTokens').get(input.tokenId))) {
        throw new AppError('not_found', 'token não encontrado');
      }
      const keyframes = tx.objectStore('tokenKeyframes');
      const atTick = await keyframes.index('byTokenTick').get([input.tokenId, input.tick]);
      const keyframe: TokenKeyframe = {
        ...input,
        id: atTick?.id ?? input.id,
        updatedAt: timestamp(),
      };
      checkKeyframe(keyframe);
      await keyframes.put(keyframe);
      return keyframe;
    });
  }

  override deleteKeyframe(id: Uuid): Promise<void> {
    return this.remove('tokenKeyframes', id);
  }

  override async createAnnotation(input: MapAnnotationInput): Promise<MapAnnotation> {
    const userId = await requireUserId(this.auth);
    const now = timestamp();
    const annotation: MapAnnotation = {
      ...input,
      version: 1,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    };
    checkAnnotation(annotation);
    const db = await this.database.ready();
    return inTransaction(db, ['maps', 'mapAnnotations'], async (tx) => {
      await requireLiveMap(tx.objectStore('maps'), input.mapId);
      await tx.objectStore('mapAnnotations').add(annotation);
      return annotation;
    });
  }

  override async updateAnnotation(
    id: Uuid,
    patch: MapAnnotationPatch,
    expectedVersion: number,
  ): Promise<MapAnnotation> {
    const changes = definedOnly(patch);
    const db = await this.database.ready();
    return inTransaction(db, ['mapAnnotations'], async (tx) => {
      const annotations = tx.objectStore('mapAnnotations');
      const row = await annotations.get(id);
      if (!row) throw new AppError('not_found');
      if (row.version !== expectedVersion) throw new AppError('conflict');
      const next: MapAnnotation = {
        ...row,
        ...changes,
        version: row.version + 1,
        updatedAt: timestamp(),
      };
      checkAnnotation(next);
      await annotations.put(next);
      return next;
    });
  }

  override deleteAnnotation(id: Uuid): Promise<void> {
    return this.remove('mapAnnotations', id);
  }

  override async saveLink(link: MapLink): Promise<MapLink> {
    checkLink(link);
    const db = await this.database.ready();
    return inTransaction(db, ['maps', 'mapLinks'], async (tx) => {
      const maps = tx.objectStore('maps');
      await requireLiveMap(maps, link.mapId);
      await requireLiveMap(maps, link.targetMapId);
      await tx.objectStore('mapLinks').put(link);
      return link;
    });
  }

  override deleteLink(id: Uuid): Promise<void> {
    return this.remove('mapLinks', id);
  }

  override async createImageVersion(draft: MapImageVersionDraft): Promise<MapImageVersion> {
    const userId = await requireUserId(this.auth);
    const now = timestamp();
    const version: MapImageVersion = {
      ...draft,
      createdBy: userId,
      deletedAt: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    checkImageVersion(version);
    const db = await this.database.ready();
    return inTransaction(db, ['maps', 'mapImageVersions'], async (tx) => {
      await requireLiveMap(tx.objectStore('maps'), draft.mapId);
      const versions = tx.objectStore('mapImageVersions');
      await requireFreeTick(versions, version);
      await versions.add(version);
      return version;
    });
  }

  override updateImageVersion(
    id: Uuid,
    patch: MapImageVersionPatch,
    expectedVersion: number,
  ): Promise<MapImageVersion> {
    const changes = definedOnly(patch);
    return this.changeImageVersion(id, (row) => {
      if (!isLive(row)) throw new AppError('not_found');
      if (row.version !== expectedVersion) throw new AppError('conflict');
      return { ...row, ...changes };
    });
  }

  override async moveImageVersionToTrash(id: Uuid, expectedVersion: number): Promise<void> {
    await this.changeImageVersion(id, (row, now) => {
      if (!isLive(row)) throw new AppError('not_found');
      if (row.version !== expectedVersion) throw new AppError('conflict');
      return { ...row, deletedAt: now };
    });
  }

  /** Tira da lixeira; se outra versão ocupou o mesmo instante, `conflict`. */
  override restoreImageVersion(id: Uuid): Promise<MapImageVersion> {
    return this.changeImageVersion(id, (row) => ({ ...row, deletedAt: null }));
  }

  /**
   * Lê, aplica e grava uma versão numa transação, com o `+1` de `version`, o
   * `updated_at` e a unicidade de `(mapId, tickStart)` entre as que não estão na lixeira.
   */
  private async changeImageVersion(
    id: Uuid,
    apply: (row: MapImageVersion, now: string) => MapImageVersion,
  ): Promise<MapImageVersion> {
    const db = await this.database.ready();
    return inTransaction(db, ['mapImageVersions'], async (tx) => {
      const versions = tx.objectStore('mapImageVersions');
      const row = await versions.get(id);
      if (!row) throw new AppError('not_found');
      const now = timestamp();
      const next: MapImageVersion = {
        ...apply(row, now),
        id: row.id,
        mapId: row.mapId,
        worldId: row.worldId,
        createdAt: row.createdAt,
        version: row.version + 1,
        updatedAt: now,
      };
      checkImageVersion(next);
      if (next.deletedAt === null) await requireFreeTick(versions, next);
      await versions.put(next);
      return next;
    });
  }

  /** Apagar o que não existe não é erro (um `delete` sem linhas no Postgres também não). */
  private async remove(store: MapContentStore, id: Uuid): Promise<void> {
    const db = await this.database.ready();
    await inTransaction(db, [store], (tx) => tx.objectStore(store).delete(id));
  }
}

/** O índice único parcial `(map_id, tick_start) where deleted_at is null`. */
async function requireFreeTick(
  versions: { index(name: 'byMap'): { getAll(mapId: Uuid): Promise<MapImageVersion[]> } },
  version: MapImageVersion,
): Promise<void> {
  const siblings = await versions.index('byMap').getAll(version.mapId);
  const taken = siblings.some(
    (other) => isLive(other) && other.id !== version.id && other.tickStart === version.tickStart,
  );
  if (taken) throw new AppError('conflict', 'já há uma versão da imagem neste instante');
}

/** A chave estrangeira para `maps`, que no modo local também recusa mapa na lixeira. */
async function requireLiveMap(
  maps: { get(id: Uuid): Promise<WorldMap | undefined> },
  id: Uuid,
): Promise<void> {
  if (!isLive(await maps.get(id))) throw new AppError('not_found', 'mapa não encontrado');
}
