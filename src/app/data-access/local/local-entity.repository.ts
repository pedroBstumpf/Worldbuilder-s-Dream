import { inject, Injectable } from '@angular/core';
import type { Entity, Uuid } from '@domain/models';
import { AuthService, EntityRepository, type EntityDraft, type EntityPatch } from '@domain/ports';
import { checkEntity } from './local-checks';
import { LocalDatabase } from './local-database';
import { definedOnly, requireUserId, timestamp } from './local-transaction';
import { TrashableTable } from './trashable-table';

const byName = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

@Injectable()
export class LocalEntityRepository extends EntityRepository {
  private readonly auth = inject(AuthService);
  private readonly entities = new TrashableTable<Entity>(
    inject(LocalDatabase),
    'entities',
    checkEntity,
  );

  /** Entidades do mundo em ordem alfabética. */
  override async list(worldId: Uuid): Promise<Entity[]> {
    const entities = await this.entities.listByWorld(worldId);
    return entities.sort((a, b) => byName.compare(a.name, b.name));
  }

  override get(id: Uuid): Promise<Entity | null> {
    return this.entities.get(id);
  }

  override async create(draft: EntityDraft): Promise<Entity> {
    const userId = await requireUserId(this.auth);
    const now = timestamp();
    return this.entities.insert({
      subtitle: null,
      color: null,
      portraitAssetId: null,
      aliases: [],
      attributes: {},
      content: null,
      contentText: null,
      bornTick: null,
      diedTick: null,
      tags: [],
      ...definedOnly(draft),
      createdBy: userId,
      version: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  override update(id: Uuid, patch: EntityPatch, expectedVersion: number): Promise<Entity> {
    return this.entities.update(id, patch, expectedVersion);
  }

  override moveToTrash(id: Uuid, expectedVersion: number): Promise<void> {
    return this.entities.moveToTrash(id, expectedVersion);
  }

  override restore(id: Uuid): Promise<Entity> {
    return this.entities.restore(id);
  }
}
