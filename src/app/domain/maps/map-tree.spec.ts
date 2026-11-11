import type { WorldMap } from '../models/map';
import { buildMapTree, descendantIds, mapPath } from './map-tree';

let clock = 0;
function map(id: string, parentMapId: string | null = null, sortOrder = 0): WorldMap {
  clock += 1;
  return {
    id,
    worldId: 'w',
    parentMapId,
    name: id,
    imageAssetId: null,
    width: 100,
    height: 100,
    scaleValue: null,
    scaleUnit: null,
    scaleLabel: null,
    sortOrder,
    version: 1,
    createdAt: `2026-01-01T00:00:${String(clock).padStart(2, '0')}Z`,
    updatedAt: '2026-01-01T00:00:00Z',
    deletedAt: null,
  };
}

const rows = (maps: WorldMap[]) => buildMapTree(maps).map((r) => `${r.depth}:${r.map.id}`);

describe('map tree', () => {
  it('lists parents before children, by sort order then creation', () => {
    const maps = [
      map('cidade', 'continente'),
      map('mundo'),
      map('continente', 'mundo'),
      map('ilha', 'mundo', -1),
      map('outro'),
    ];
    expect(rows(maps)).toEqual(['0:mundo', '1:ilha', '1:continente', '2:cidade', '0:outro']);
    expect(buildMapTree(maps).find((r) => r.map.id === 'continente')?.hasChildren).toBe(true);
    expect(buildMapTree(maps).find((r) => r.map.id === 'cidade')?.hasChildren).toBe(false);
  });

  it('promotes orphans to the root and survives cycles', () => {
    expect(rows([map('orfao', 'apagado')])).toEqual(['0:orfao']);
    const cycle = [map('a', 'b'), map('b', 'a'), map('raiz')];
    expect(rows(cycle)).toEqual(['0:raiz', '0:a', '1:b']);
  });

  it('collects descendants and the path from the root', () => {
    const maps = [map('mundo'), map('continente', 'mundo'), map('cidade', 'continente')];
    expect([...descendantIds(maps, 'continente')].sort()).toEqual(['cidade', 'continente']);
    expect(mapPath(maps, 'cidade').map((m) => m.id)).toEqual(['mundo', 'continente', 'cidade']);
    expect(mapPath(maps, 'nenhum')).toEqual([]);
  });
});
