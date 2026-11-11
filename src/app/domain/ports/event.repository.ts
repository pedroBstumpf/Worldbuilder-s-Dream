import type { Uuid } from '../models/common';
import type { WorldEvent } from '../models/event';

export type WorldEventDraft = Pick<WorldEvent, 'id' | 'worldId' | 'title' | 'tickStart'> &
  Partial<
    Pick<
      WorldEvent,
      'category' | 'tickEnd' | 'locationEntityId' | 'content' | 'contentText' | 'color'
    >
  >;

export type WorldEventPatch = Partial<Omit<WorldEventDraft, 'id' | 'worldId'>>;

/** Porta dos eventos da linha do tempo. Convenções em `WorldRepository`. */
export abstract class EventRepository {
  /** Eventos do mundo em ordem crescente de `tickStart`. */
  abstract list(worldId: Uuid): Promise<WorldEvent[]>;
  abstract get(id: Uuid): Promise<WorldEvent | null>;
  abstract create(draft: WorldEventDraft): Promise<WorldEvent>;
  abstract update(id: Uuid, patch: WorldEventPatch, expectedVersion: number): Promise<WorldEvent>;
  abstract moveToTrash(id: Uuid, expectedVersion: number): Promise<void>;
  abstract restore(id: Uuid): Promise<WorldEvent>;
}
