import type { Entity, EntityKind } from '../models/entity';
import type { WorldEvent } from '../models/event';
import { foldText, WorldSearch } from './world-search';

function entity(name: string, kind: EntityKind, extra: Partial<Entity> = {}): Entity {
  return {
    id: name,
    worldId: 'w',
    kind,
    name,
    subtitle: null,
    color: null,
    portraitAssetId: null,
    aliases: [],
    attributes: {},
    content: null,
    contentText: null,
    bornTick: null,
    diedTick: null,
    tags: [],
    createdBy: null,
    version: 1,
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
    ...extra,
  };
}

const event = { id: 'ev', title: 'Queda de Valmora', contentText: null } as WorldEvent;

const search = new WorldSearch(
  [
    entity('Ária', 'character', { aliases: ['A Lâmina Rubra'], subtitle: 'Capitã da guarda' }),
    entity('Valmora', 'location', { contentText: 'Cidade portuária no sul.' }),
    entity('Ordem da Rosa', 'faction'),
  ],
  [event],
);

describe('WorldSearch', () => {
  it('finds names by prefix, ignoring accents and case', () => {
    expect(search.search('ari').map((hit) => hit.title)).toEqual(['Ária']);
    expect(foldText('Ária Lâmina')).toBe('aria lamina');
  });

  it('finds aliases and reports which alias matched', () => {
    const [hit] = search.search('lamina');
    expect(hit).toMatchObject({ id: 'Ária', kind: 'character', alias: 'A Lâmina Rubra' });
  });

  it('ranks names above body text and includes events', () => {
    expect(search.search('valmora').map((hit) => hit.id)).toEqual(['Valmora', 'ev']);
    expect(search.search('portuaria').map((hit) => hit.id)).toEqual(['Valmora']);
  });

  it('tolerates typos in longer words and filters by kind', () => {
    expect(search.search('valmira').map((hit) => hit.id)).toContain('Valmora');
    expect(search.search('valmora', { kinds: ['event'] }).map((hit) => hit.id)).toEqual(['ev']);
  });

  it('returns nothing for a blank query', () => {
    expect(search.search('   ')).toEqual([]);
  });
});
