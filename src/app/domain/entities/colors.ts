import type { HexColor } from '../models/common';

/**
 * Paleta "de tintas antigas" para o anel das entidades (docs/05 › Cores por tipo). São
 * dados gravados em `entities.color` (formato `#rrggbb` do check), não estilos; os
 * valores repetem os primitivos de `palette.css` quando existem.
 */
export const ENTITY_INK_COLORS = [
  { id: 'sepia', hex: '#8a6444' },
  { id: 'lacre', hex: '#a33a2a' },
  { id: 'musgo', hex: '#7f9a62' },
  { id: 'tinta', hex: '#5c7fa3' },
  { id: 'amora', hex: '#7b4f7a' },
] as const satisfies readonly { id: string; hex: HexColor }[];

export type EntityInkId = (typeof ENTITY_INK_COLORS)[number]['id'];
