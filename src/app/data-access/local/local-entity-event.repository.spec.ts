import { TestBed } from '@angular/core/testing';
import { EntityRepository, EventRepository } from '@domain/ports';
import { FAKE_USER } from './fake-auth.service';
import { setUpLocalTestBed } from './testing/local-test-bed';

const worldId = crypto.randomUUID();

describe('LocalEntityRepository', () => {
  let entities: EntityRepository;
  let teardown: () => Promise<void>;

  beforeEach(async () => {
    ({ teardown } = await setUpLocalTestBed());
    entities = TestBed.inject(EntityRepository);
  });

  afterEach(() => teardown());

  const create = (name: string) =>
    entities.create({ id: crypto.randomUUID(), worldId, kind: 'character', name });

  it('creates an entity with the database defaults and its author', async () => {
    const entity = await create('Aelin');

    expect(entity).toMatchObject({
      name: 'Aelin',
      aliases: [],
      attributes: {},
      tags: [],
      content: null,
      createdBy: FAKE_USER.id,
      version: 1,
    });
    expect(await entities.get(entity.id)).toEqual(entity);
  });

  it('lists the world entities alphabetically, ignoring accents and case', async () => {
    await create('zélia');
    await create('Ágata');
    await create('Bruno');
    const trashed = await create('Caio');
    await entities.moveToTrash(trashed.id, 1);

    expect((await entities.list(worldId)).map((entity) => entity.name)).toEqual([
      'Ágata',
      'Bruno',
      'zélia',
    ]);
  });

  it('updates, trashes and restores with version checks', async () => {
    const entity = await create('Aelin');
    const updated = await entities.update(entity.id, { aliases: ['Celaena'] }, 1);

    expect(updated).toMatchObject({ aliases: ['Celaena'], version: 2 });
    await expect(entities.moveToTrash(entity.id, 1)).rejects.toMatchObject({ code: 'conflict' });
    await entities.moveToTrash(entity.id, 2);
    expect(await entities.restore(entity.id)).toMatchObject({ version: 4, deletedAt: null });
  });

  it('rejects an invalid color', async () => {
    await expect(
      entities.create({
        id: crypto.randomUUID(),
        worldId,
        kind: 'item',
        name: 'Espada',
        color: 'red',
      }),
    ).rejects.toMatchObject({ code: 'validation' });
  });
});

describe('LocalEventRepository', () => {
  let events: EventRepository;
  let teardown: () => Promise<void>;

  beforeEach(async () => {
    ({ teardown } = await setUpLocalTestBed());
    events = TestBed.inject(EventRepository);
  });

  afterEach(() => teardown());

  const create = (title: string, tickStart: number, tickEnd?: number) =>
    events.create({ id: crypto.randomUUID(), worldId, title, tickStart, tickEnd });

  it('creates an event with the general category by default', async () => {
    const event = await create('Coroação', 100);
    expect(event).toMatchObject({ category: 'general', tickEnd: null, createdBy: FAKE_USER.id });
  });

  it('lists the world events by start tick', async () => {
    await create('Depois', 500);
    await create('Antes da época', -1440);
    await create('Agora', 0, 60);

    expect((await events.list(worldId)).map((event) => event.title)).toEqual([
      'Antes da época',
      'Agora',
      'Depois',
    ]);
  });

  it('rejects an end before the start and non-integer ticks', async () => {
    await expect(create('Ao contrário', 10, 5)).rejects.toMatchObject({ code: 'validation' });
    await expect(create('Fração', 1.5)).rejects.toMatchObject({ code: 'validation' });
    const event = await create('Certo', 10);
    await expect(events.update(event.id, { tickEnd: 9 }, 1)).rejects.toMatchObject({
      code: 'validation',
    });
  });
});
