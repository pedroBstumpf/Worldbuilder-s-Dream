import type { HexColor, JsonObject, SoftDeletable, Tick, Uuid, Versioned } from './common';
import type { RichTextDoc } from './rich-text';

export type EntityKind = 'character' | 'location' | 'faction' | 'item' | 'note';
export const ENTITY_KINDS: readonly EntityKind[] = [
  'character',
  'location',
  'faction',
  'item',
  'note',
];

/** `public.entities`. A coluna `search` é gerada pelo banco e não faz parte do modelo. */
export interface Entity extends Versioned, SoftDeletable {
  id: Uuid;
  worldId: Uuid;
  kind: EntityKind;
  name: string;
  subtitle: string | null;
  color: HexColor | null;
  portraitAssetId: Uuid | null;
  /** Apelidos, usados para reconhecer a entidade nos Google Docs. */
  aliases: string[];
  attributes: JsonObject;
  content: RichTextDoc | null;
  /** Texto puro derivado de `content` no cliente. */
  contentText: string | null;
  bornTick: Tick | null;
  diedTick: Tick | null;
  tags: string[];
  createdBy: Uuid | null;
}

/** `public.entity_relations`. */
export interface EntityRelation {
  id: Uuid;
  worldId: Uuid;
  fromId: Uuid;
  toId: Uuid;
  /** Ex.: "pai de", "aliado", "membro de". */
  relation: string;
  tickStart: Tick | null;
  tickEnd: Tick | null;
}

export type MentionSourceKind = 'entity' | 'event';

/** `public.entity_mentions` — menções (@entidade) dentro de textos ricos. */
export interface EntityMention {
  worldId: Uuid;
  sourceKind: MentionSourceKind;
  sourceId: Uuid;
  targetEntityId: Uuid;
}
