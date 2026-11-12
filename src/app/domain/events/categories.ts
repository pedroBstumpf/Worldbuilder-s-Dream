import type { HexColor } from '../models/common';
import type { WorldEvent } from '../models/event';

/** Categoria sugerida de evento (docs/06 §4). `events.category` aceita qualquer texto. */
export interface EventCategory {
  readonly id: string;
  /** Símbolo do Material Symbols. */
  readonly icon: string;
  /** Cor do marcador quando o evento não tem cor própria; `null` = ouro. */
  readonly color: HexColor | null;
}

/**
 * Categorias oferecidas na ficha. As cores repetem a paleta "de tintas antigas"
 * (`ENTITY_INK_COLORS`): são dados de marcador, não estilos.
 */
export const EVENT_CATEGORIES: readonly EventCategory[] = [
  { id: 'general', icon: 'diamond', color: null },
  { id: 'battle', icon: 'swords', color: '#a33a2a' },
  { id: 'birth', icon: 'child_care', color: '#7f9a62' },
  { id: 'death', icon: 'skull', color: '#8a6444' },
  { id: 'travel', icon: 'hiking', color: '#5c7fa3' },
  { id: 'politics', icon: 'gavel', color: '#7b4f7a' },
  { id: 'founding', icon: 'castle', color: null },
  { id: 'discovery', icon: 'explore', color: '#5c7fa3' },
  { id: 'disaster', icon: 'local_fire_department', color: '#a33a2a' },
  { id: 'celebration', icon: 'celebration', color: null },
];

export const DEFAULT_EVENT_CATEGORY = 'general';

export function eventCategory(id: string): EventCategory | null {
  return EVENT_CATEGORIES.find((category) => category.id === id) ?? null;
}

/** Cor do marcador: a do evento, a da categoria ou `null` (ouro). */
export function eventColor(event: Pick<WorldEvent, 'color' | 'category'>): HexColor | null {
  return event.color ?? eventCategory(event.category)?.color ?? null;
}

/** Ordem da linha do tempo: início, depois o mais longo primeiro, depois o título. */
export function compareEvents(
  a: Pick<WorldEvent, 'tickStart' | 'tickEnd' | 'title'>,
  b: Pick<WorldEvent, 'tickStart' | 'tickEnd' | 'title'>,
): number {
  return (
    a.tickStart - b.tickStart ||
    (b.tickEnd ?? b.tickStart) - (a.tickEnd ?? a.tickStart) ||
    a.title.localeCompare(b.title, 'pt-BR')
  );
}
