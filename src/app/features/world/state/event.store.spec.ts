import { TestBed } from '@angular/core/testing';
import { setUpLocalTestBed } from '@data/local/testing/local-test-bed';
import type { RichTextDoc } from '@domain/models';
import { EntityRepository, EventRepository, MentionRepository } from '@domain/ports';
import { SAVE_DELAY_MS } from './autosave';
import { EventStore } from './event.store';

const WORLD = crypto.randomUUID();

function mention(id: string, label: string): RichTextDoc {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'mention', attrs: { id, label } }],
      },
    ],
  };
}

describe('EventStore', () => {
  let teardown: () => Promise<void>;
  let store: InstanceType<typeof EventStore>;

  beforeEach(async () => {
    ({ teardown } = await setUpLocalTestBed([EventStore]));
    store = TestBed.inject(EventStore);
    await store.load(WORLD);
  });

  afterEach(() => teardown());

  it('cria eventos e os ordena pela linha do tempo', async () => {
    await store.create('Coroação', 500);
    await store.create('Fundação', 100);
    expect(store.sorted().map((e) => e.title)).toEqual(['Fundação', 'Coroação']);
    expect(store.events()[0]?.category).toBe('general');
  });

  it('aplica as edições na hora e grava juntas', async () => {
    const event = await store.create('Batalha', 10);
    store.edit(event.id, { title: 'Batalha do Vau' });
    store.setDates(event.id, 50, 20);
    expect(store.byId().get(event.id)?.tickEnd).toBe(50);
    expect(store.saveStatus()[event.id]).toBe('saving');
    expect(SAVE_DELAY_MS).toBeGreaterThan(0);
    await store.flush();
    const saved = await TestBed.inject(EventRepository).get(event.id);
    expect(saved?.title).toBe('Batalha do Vau');
    expect(saved?.tickStart).toBe(50);
    expect(saved?.version).toBe(2);
    expect(store.saveStatus()[event.id]).toBe('saved');
  });

  it('grava o texto e as menções do evento', async () => {
    const entity = await TestBed.inject(EntityRepository).create({
      id: crypto.randomUUID(),
      worldId: WORLD,
      kind: 'character',
      name: 'Aria',
    });
    const event = await store.create('Nascimento', 0);
    store.editContent(event.id, mention(entity.id, 'Aria'));
    await store.flush(event.id);
    const citing = await TestBed.inject(MentionRepository).listCiting(entity.id);
    expect(citing).toEqual([expect.objectContaining({ sourceKind: 'event', sourceId: event.id })]);
    expect(store.byId().get(event.id)?.contentText).toContain('Aria');
  });

  it('move para a lixeira, fecha a ficha e restaura', async () => {
    const event = await store.create('Eclipse', 0);
    store.open(event.id);
    expect(store.openEvent()?.title).toBe('Eclipse');
    await store.trash(event.id);
    expect(store.events()).toEqual([]);
    expect(store.openId()).toBeNull();
    await store.restore(event.id);
    expect(store.events().map((e) => e.title)).toEqual(['Eclipse']);
  });

  it('recarrega o evento quando a gravação dá conflito', async () => {
    const event = await store.create('Tratado', 0);
    const repo = TestBed.inject(EventRepository);
    await repo.update(event.id, { title: 'Tratado de Paz' }, event.version);
    store.edit(event.id, { title: 'Outro título' });
    await store.flush(event.id);
    expect(store.byId().get(event.id)?.title).toBe('Tratado de Paz');
    expect(store.saveFailure()).toEqual(
      expect.objectContaining({ entityId: event.id, conflict: true }),
    );
  });
});
