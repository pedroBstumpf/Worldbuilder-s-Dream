import type { Uuid } from '../models/common';
import type { EntityMention, MentionSourceKind } from '../models/entity';

/** Texto (de uma entidade ou de um evento) que contém menções. */
export interface MentionSource {
  readonly worldId: Uuid;
  readonly kind: MentionSourceKind;
  readonly id: Uuid;
}

/**
 * Porta de `entity_mentions` (ADR-0010): o cliente regrava as menções de um texto
 * sempre que salva o conteúdo, e a ficha consulta "onde esta entidade é citada".
 */
export abstract class MentionRepository {
  /** Substitui todas as menções do texto `source` pelas entidades `targetEntityIds`. */
  abstract replace(source: MentionSource, targetEntityIds: readonly Uuid[]): Promise<void>;
  /** Menções que apontam para a entidade. */
  abstract listCiting(targetEntityId: Uuid): Promise<EntityMention[]>;
}
