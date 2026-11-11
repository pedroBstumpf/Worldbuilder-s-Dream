import type { Uuid } from '../models/common';
import type { WorldMap } from '../models/map';

/** Linha da árvore de mapas já achatada na ordem de exibição (pai antes dos filhos). */
export interface MapTreeRow {
  map: WorldMap;
  /** 0 para os mapas de raiz. */
  depth: number;
  hasChildren: boolean;
}

function byOrder(a: WorldMap, b: WorldMap): number {
  return a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt);
}

/**
 * Árvore Mundo → Continente → Cidade (`maps.parent_map_id`, docs/06 §8). Mapa cujo pai
 * não está na lista (na lixeira, por exemplo) sobe para a raiz; ciclos são cortados.
 */
export function buildMapTree(maps: readonly WorldMap[]): MapTreeRow[] {
  const ids = new Set(maps.map((map) => map.id));
  const children = new Map<Uuid | null, WorldMap[]>();
  for (const map of maps) {
    const parent = map.parentMapId && ids.has(map.parentMapId) ? map.parentMapId : null;
    const list = children.get(parent) ?? [];
    list.push(map);
    children.set(parent, list);
  }
  const rows: MapTreeRow[] = [];
  const visited = new Set<Uuid>();
  const walk = (parent: Uuid | null, depth: number) => {
    for (const map of (children.get(parent) ?? []).sort(byOrder)) {
      if (visited.has(map.id)) continue;
      visited.add(map.id);
      rows.push({ map, depth, hasChildren: (children.get(map.id)?.length ?? 0) > 0 });
      walk(map.id, depth + 1);
    }
  };
  walk(null, 0);
  // Mapas presos num ciclo (sem caminho até a raiz) aparecem no fim, na raiz.
  for (const map of [...maps].sort(byOrder)) {
    if (!visited.has(map.id)) {
      visited.add(map.id);
      rows.push({ map, depth: 0, hasChildren: (children.get(map.id)?.length ?? 0) > 0 });
      walk(map.id, 1);
    }
  }
  return rows;
}

/** O mapa e todos os seus descendentes (não podem virar pai dele). */
export function descendantIds(maps: readonly WorldMap[], id: Uuid): Set<Uuid> {
  const result = new Set<Uuid>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const map of maps) {
      if (map.parentMapId && result.has(map.parentMapId) && !result.has(map.id)) {
        result.add(map.id);
        grew = true;
      }
    }
  }
  return result;
}

/** Caminho da raiz até o mapa (inclusive), para a trilha "Mundo › Continente › Cidade". */
export function mapPath(maps: readonly WorldMap[], id: Uuid): WorldMap[] {
  const byId = new Map(maps.map((map) => [map.id, map]));
  const path: WorldMap[] = [];
  let current = byId.get(id);
  while (current && !path.includes(current)) {
    path.unshift(current);
    current = current.parentMapId ? byId.get(current.parentMapId) : undefined;
  }
  return path;
}
