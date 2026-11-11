import type { HexColor, SoftDeletable, Tick, Uuid, Versioned } from './common';
import type { RichTextDoc } from './rich-text';

/**
 * `public.events`. Chama-se `WorldEvent` para não colidir com o `Event` do DOM.
 * A coluna `search` é gerada pelo banco e não faz parte do modelo.
 */
export interface WorldEvent extends Versioned, SoftDeletable {
  id: Uuid;
  worldId: Uuid;
  title: string;
  /** Lista aberta (batalha, nascimento, viagem…); padrão `general`. */
  category: string;
  tickStart: Tick;
  /** Nulo = evento pontual. */
  tickEnd: Tick | null;
  locationEntityId: Uuid | null;
  content: RichTextDoc | null;
  contentText: string | null;
  color: HexColor | null;
  createdBy: Uuid | null;
}

/** `public.event_participants`. */
export interface EventParticipant {
  eventId: Uuid;
  entityId: Uuid;
  worldId: Uuid;
  role: string | null;
}
