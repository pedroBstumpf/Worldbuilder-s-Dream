import MiniSearch from 'minisearch';
import type { Uuid } from '../models/common';
import type { Entity, EntityKind } from '../models/entity';
import type { WorldEvent } from '../models/event';

/** O que a busca encontra: entidades (pelo tipo) e eventos. */
export type SearchKind = EntityKind | 'event';

export interface SearchHit {
  readonly id: Uuid;
  readonly kind: SearchKind;
  readonly title: string;
  readonly subtitle: string | null;
  /** Apelido que casou com a busca, quando o nome não casou (mostrado como "também: …"). */
  readonly alias: string | null;
  readonly score: number;
}

interface SearchDoc {
  id: Uuid;
  kind: SearchKind;
  title: string;
  aliases: string[];
  subtitle: string | null;
  text: string;
}

/** Minúsculas e sem acentos: "Ária" acha "aria" (nomes inventados, docs/07 › Convenções). */
export function foldText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * Índice MiniSearch do mundo (docs/04 › Stack): nome, apelidos, subtítulo e texto das
 * entidades e título e texto dos eventos. Busca por prefixo e com tolerância a erros de
 * digitação; o nome pesa mais que os apelidos, que pesam mais que o texto.
 */
export class WorldSearch {
  private readonly index = new MiniSearch<SearchDoc>({
    fields: ['title', 'aliases', 'subtitle', 'text'],
    storeFields: ['kind', 'title', 'subtitle'],
    extractField: (doc, field) => {
      const value = doc[field as keyof SearchDoc];
      return Array.isArray(value) ? value.join(' ') : (value ?? '');
    },
    processTerm: (term) => foldText(term),
    searchOptions: {
      boost: { title: 4, aliases: 3, subtitle: 1.5 },
      prefix: true,
      fuzzy: (term) => (term.length > 3 ? 0.2 : false),
      combineWith: 'AND',
    },
  });

  /** Apelidos por id (os campos guardados no índice passam pelo `extractField`). */
  private readonly aliases = new Map<Uuid, readonly string[]>();

  constructor(entities: readonly Entity[], events: readonly WorldEvent[] = []) {
    for (const entity of entities) this.aliases.set(entity.id, entity.aliases);
    this.index.addAll([
      ...entities.map((entity) => ({
        id: entity.id,
        kind: entity.kind,
        title: entity.name,
        aliases: entity.aliases,
        subtitle: entity.subtitle,
        text: entity.contentText ?? '',
      })),
      ...events.map((event) => ({
        id: event.id,
        kind: 'event' as const,
        title: event.title,
        aliases: [],
        subtitle: null,
        text: event.contentText ?? '',
      })),
    ]);
  }

  /** Resultados por relevância; `kinds` restringe aos tipos pedidos. */
  search(
    query: string,
    options: { kinds?: readonly SearchKind[]; limit?: number } = {},
  ): SearchHit[] {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const kinds = options.kinds;
    const results = this.index.search(trimmed, {
      filter: kinds ? (result) => kinds.includes(result['kind'] as SearchKind) : undefined,
    });
    const folded = foldText(trimmed);
    return results.slice(0, options.limit ?? 50).map((result) => {
      const title = result['title'] as string;
      const aliases = this.aliases.get(result.id as Uuid) ?? [];
      const nameMatches = foldText(title).includes(folded);
      return {
        id: result.id as Uuid,
        kind: result['kind'] as SearchKind,
        title,
        subtitle: (result['subtitle'] as string | null) ?? null,
        alias: nameMatches ? null : (aliases.find((a) => foldText(a).includes(folded)) ?? null),
        score: result.score,
      };
    });
  }
}
