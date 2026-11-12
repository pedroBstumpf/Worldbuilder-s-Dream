import type { CalendarDefinition } from '../calendar/calendar-definition';
import type { Uuid } from '../models/common';
import type { World, WorldCalendar, WorldMember } from '../models/world';

/** Dados para criar um mundo; `id` gerado no cliente. Ausentes usam os padrões do banco. */
export type WorldDraft = Pick<World, 'id' | 'name'> &
  Partial<Pick<World, 'description' | 'timeStart' | 'timeEnd'>>;

export type WorldPatch = Partial<
  Pick<
    World,
    'name' | 'description' | 'coverAssetId' | 'timeStart' | 'timeEnd' | 'nowTick' | 'archivedAt'
  >
>;

/**
 * Porta dos mundos, seus calendários e membros.
 * Convenções de todas as portas de repositório:
 * - `update` e `moveToTrash` recebem a `version` que o cliente viu e rejeitam com
 *   `AppError('conflict')` se o item mudou desde então;
 * - itens inexistentes ou na lixeira: `get` devolve `null`, as escritas rejeitam com `AppError('not_found')`;
 * - listas não incluem itens na lixeira.
 */
export abstract class WorldRepository {
  /** Mundos de que o usuário atual é membro. */
  abstract list(): Promise<World[]>;
  abstract get(id: Uuid): Promise<World | null>;
  /** Cria o mundo com o usuário atual como `owner` e o calendário inicial (RPC `create_world`). */
  abstract create(draft: WorldDraft, calendar: CalendarDefinition): Promise<World>;
  abstract update(id: Uuid, patch: WorldPatch, expectedVersion: number): Promise<World>;
  abstract moveToTrash(id: Uuid, expectedVersion: number): Promise<void>;
  abstract restore(id: Uuid): Promise<World>;
  /** Mundos do usuário que estão na lixeira, o último a entrar primeiro. */
  abstract listTrash(): Promise<World[]>;
  /**
   * Exclui para sempre um mundo da lixeira e tudo o que há nele (RPC `empty_trash`).
   * Mundo fora da lixeira: `AppError('not_found')`.
   */
  abstract deleteForever(id: Uuid): Promise<void>;

  abstract getCalendar(worldId: Uuid): Promise<WorldCalendar>;
  abstract saveCalendar(worldId: Uuid, definition: CalendarDefinition): Promise<WorldCalendar>;

  abstract listMembers(worldId: Uuid): Promise<WorldMember[]>;
}
