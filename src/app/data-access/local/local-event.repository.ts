import { inject, Injectable } from '@angular/core';
import type { Uuid, WorldEvent } from '@domain/models';
import {
  AuthService,
  EventRepository,
  type WorldEventDraft,
  type WorldEventPatch,
} from '@domain/ports';
import { checkEvent } from './local-checks';
import { LocalDatabase } from './local-database';
import { definedOnly, requireUserId, timestamp } from './local-transaction';
import { TrashableTable } from './trashable-table';

/** Padrão de `events.category` no docs/07. */
export const DEFAULT_EVENT_CATEGORY = 'general';

@Injectable()
export class LocalEventRepository extends EventRepository {
  private readonly auth = inject(AuthService);
  private readonly events = new TrashableTable<WorldEvent>(
    inject(LocalDatabase),
    'events',
    checkEvent,
  );

  /** Em ordem crescente de `tickStart`; empate pela criação. */
  override async list(worldId: Uuid): Promise<WorldEvent[]> {
    const events = await this.events.listByWorld(worldId);
    return events.sort(
      (a, b) => a.tickStart - b.tickStart || a.createdAt.localeCompare(b.createdAt),
    );
  }

  override get(id: Uuid): Promise<WorldEvent | null> {
    return this.events.get(id);
  }

  override async create(draft: WorldEventDraft): Promise<WorldEvent> {
    const userId = await requireUserId(this.auth);
    const now = timestamp();
    return this.events.insert({
      category: DEFAULT_EVENT_CATEGORY,
      tickEnd: null,
      locationEntityId: null,
      content: null,
      contentText: null,
      color: null,
      ...definedOnly(draft),
      createdBy: userId,
      version: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  override update(id: Uuid, patch: WorldEventPatch, expectedVersion: number): Promise<WorldEvent> {
    return this.events.update(id, patch, expectedVersion);
  }

  override moveToTrash(id: Uuid, expectedVersion: number): Promise<void> {
    return this.events.moveToTrash(id, expectedVersion);
  }

  override restore(id: Uuid): Promise<WorldEvent> {
    return this.events.restore(id);
  }
}
