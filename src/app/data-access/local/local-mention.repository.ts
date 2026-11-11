import { inject, Injectable } from '@angular/core';
import type { EntityMention, Uuid } from '@domain/models';
import { AppError, MentionRepository, type MentionSource } from '@domain/ports';
import { LocalDatabase } from './local-database';
import { inTransaction } from './local-transaction';

/** `entity_mentions` no IndexedDB, com a chave estrangeira e o `world_id` conferidos. */
@Injectable()
export class LocalMentionRepository extends MentionRepository {
  private readonly database = inject(LocalDatabase);

  override async replace(source: MentionSource, targetEntityIds: readonly Uuid[]): Promise<void> {
    const db = await this.database.ready();
    const targets = [...new Set(targetEntityIds)];
    await inTransaction(db, ['entityMentions', 'entities'], async (tx) => {
      const store = tx.objectStore('entityMentions');
      for (const id of targets) {
        const entity = await tx.objectStore('entities').get(id);
        // FK de target_entity_id e trigger check_world_consistency.
        if (!entity) throw new AppError('validation', `entidade citada não existe: ${id}`);
        if (entity.worldId !== source.worldId) {
          throw new AppError('validation', 'a entidade citada é de outro mundo');
        }
      }
      const current = await store.index('bySource').getAllKeys([source.kind, source.id]);
      for (const key of current) await store.delete(key);
      for (const targetEntityId of targets) {
        await store.put({
          worldId: source.worldId,
          sourceKind: source.kind,
          sourceId: source.id,
          targetEntityId,
        });
      }
    });
  }

  override async listCiting(targetEntityId: Uuid): Promise<EntityMention[]> {
    const db = await this.database.ready();
    return db.getAllFromIndex('entityMentions', 'byTarget', targetEntityId);
  }
}
