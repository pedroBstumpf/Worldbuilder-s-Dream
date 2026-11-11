import type { Uuid } from '../models/common';
import type { Entity } from '../models/entity';

export type EntityDraft = Pick<Entity, 'id' | 'worldId' | 'kind' | 'name'> &
  Partial<
    Pick<
      Entity,
      | 'subtitle'
      | 'color'
      | 'portraitAssetId'
      | 'aliases'
      | 'attributes'
      | 'content'
      | 'contentText'
      | 'bornTick'
      | 'diedTick'
      | 'tags'
    >
  >;

export type EntityPatch = Partial<Omit<EntityDraft, 'id' | 'worldId'>>;

/** Porta das entidades (personagens, locais, facções, itens, notas). Convenções em `WorldRepository`. */
export abstract class EntityRepository {
  abstract list(worldId: Uuid): Promise<Entity[]>;
  abstract get(id: Uuid): Promise<Entity | null>;
  abstract create(draft: EntityDraft): Promise<Entity>;
  abstract update(id: Uuid, patch: EntityPatch, expectedVersion: number): Promise<Entity>;
  abstract moveToTrash(id: Uuid, expectedVersion: number): Promise<void>;
  abstract restore(id: Uuid): Promise<Entity>;
}
