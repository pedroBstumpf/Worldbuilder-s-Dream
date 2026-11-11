import { inject, Injectable } from '@angular/core';
import {
  parseCalendarDefinition,
  type CalendarDefinition,
} from '@domain/calendar/calendar-definition';
import type { Uuid, World, WorldCalendar, WorldMember } from '@domain/models';
import {
  AppError,
  AuthService,
  WorldRepository,
  type WorldDraft,
  type WorldPatch,
} from '@domain/ports';
import { checkWorld } from './local-checks';
import { LocalDatabase } from './local-database';
import { inTransaction, requireUserId, timestamp } from './local-transaction';
import { isLive, TrashableTable } from './trashable-table';

/** Padrão de `worlds.time_end` no docs/07: 100 anos em minutos. */
export const DEFAULT_WORLD_TIME_END = 525_600 * 100;

@Injectable()
export class LocalWorldRepository extends WorldRepository {
  private readonly database = inject(LocalDatabase);
  private readonly auth = inject(AuthService);
  private readonly worlds = new TrashableTable<World>(this.database, 'worlds', checkWorld);

  /** Mundos de que o usuário é membro, do mais antigo ao mais novo. */
  override async list(): Promise<World[]> {
    const userId = await requireUserId(this.auth);
    const db = await this.database.ready();
    const tx = db.transaction(['worldMembers', 'worlds']);
    const memberships = await tx.objectStore('worldMembers').index('byUser').getAll(userId);
    const worlds = await Promise.all(
      memberships.map((member) => tx.objectStore('worlds').get(member.worldId)),
    );
    return worlds.filter(isLive).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  override get(id: Uuid): Promise<World | null> {
    return this.worlds.get(id);
  }

  /** Como a RPC `create_world`: mundo, dono e calendário numa só transação. */
  override async create(draft: WorldDraft, calendar: CalendarDefinition): Promise<World> {
    const userId = await requireUserId(this.auth);
    const definition = validCalendar(calendar);
    const now = timestamp();
    const world: World = {
      id: draft.id,
      ownerId: userId,
      name: draft.name,
      description: draft.description ?? null,
      coverAssetId: null,
      timeStart: draft.timeStart ?? 0,
      timeEnd: draft.timeEnd ?? DEFAULT_WORLD_TIME_END,
      nowTick: null,
      archivedAt: null,
      deletedAt: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    checkWorld(world);
    const owner: WorldMember = { worldId: world.id, userId, role: 'owner', createdAt: now };
    const db = await this.database.ready();
    await inTransaction(db, ['worlds', 'worldMembers', 'calendars'], async (tx) => {
      await tx.objectStore('worlds').add(world);
      await tx.objectStore('worldMembers').add(owner);
      await tx.objectStore('calendars').add({ worldId: world.id, definition, updatedAt: now });
    });
    return world;
  }

  override update(id: Uuid, patch: WorldPatch, expectedVersion: number): Promise<World> {
    return this.worlds.update(id, patch, expectedVersion);
  }

  override moveToTrash(id: Uuid, expectedVersion: number): Promise<void> {
    return this.worlds.moveToTrash(id, expectedVersion);
  }

  override restore(id: Uuid): Promise<World> {
    return this.worlds.restore(id);
  }

  override async getCalendar(worldId: Uuid): Promise<WorldCalendar> {
    const db = await this.database.ready();
    const tx = db.transaction(['worlds', 'calendars']);
    const [world, calendar] = await Promise.all([
      tx.objectStore('worlds').get(worldId),
      tx.objectStore('calendars').get(worldId),
    ]);
    if (!isLive(world) || !calendar) throw new AppError('not_found');
    return calendar;
  }

  override async saveCalendar(
    worldId: Uuid,
    definition: CalendarDefinition,
  ): Promise<WorldCalendar> {
    const calendar: WorldCalendar = {
      worldId,
      definition: validCalendar(definition),
      updatedAt: timestamp(),
    };
    const db = await this.database.ready();
    return inTransaction(db, ['worlds', 'calendars'], async (tx) => {
      if (!isLive(await tx.objectStore('worlds').get(worldId))) throw new AppError('not_found');
      await tx.objectStore('calendars').put(calendar);
      return calendar;
    });
  }

  override async listMembers(worldId: Uuid): Promise<WorldMember[]> {
    const db = await this.database.ready();
    return db.getAllFromIndex('worldMembers', 'byWorld', worldId);
  }
}

/** O banco só confere as chaves mínimas; o cliente valida o calendário inteiro (docs/07). */
function validCalendar(definition: CalendarDefinition): CalendarDefinition {
  try {
    return parseCalendarDefinition(definition);
  } catch (cause) {
    throw new AppError('validation', 'calendário inválido', { cause });
  }
}
