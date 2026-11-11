import { TestBed } from '@angular/core/testing';
import { DEFAULT_CALENDAR } from '@domain/calendar/calendar-definition';
import { AuthService, WorldRepository } from '@domain/ports';
import { FAKE_USER } from './fake-auth.service';
import { DEFAULT_WORLD_TIME_END } from './local-world.repository';
import { setUpLocalTestBed } from './testing/local-test-bed';

describe('LocalWorldRepository', () => {
  let worlds: WorldRepository;
  let teardown: () => Promise<void>;

  beforeEach(async () => {
    ({ teardown } = await setUpLocalTestBed());
    worlds = TestBed.inject(WorldRepository);
  });

  afterEach(() => teardown());

  const create = (name = 'Eldoria') =>
    worlds.create({ id: crypto.randomUUID(), name }, DEFAULT_CALENDAR);

  it('creates a world with the database defaults, its owner and its calendar', async () => {
    const world = await create();

    expect(world).toMatchObject({
      name: 'Eldoria',
      ownerId: FAKE_USER.id,
      description: null,
      timeStart: 0,
      timeEnd: DEFAULT_WORLD_TIME_END,
      version: 1,
      deletedAt: null,
    });
    expect(await worlds.get(world.id)).toEqual(world);
    expect(await worlds.listMembers(world.id)).toEqual([
      { worldId: world.id, userId: FAKE_USER.id, role: 'owner', createdAt: world.createdAt },
    ]);
    expect((await worlds.getCalendar(world.id)).definition).toEqual(DEFAULT_CALENDAR);
  });

  it('lists the worlds of the current user, without the trash', async () => {
    const first = await create('Primeiro');
    const second = await create('Segundo');
    const trashed = await create('Lixo');
    await worlds.moveToTrash(trashed.id, 1);

    expect((await worlds.list()).map((world) => world.id)).toEqual([first.id, second.id]);
  });

  it('requires a signed-in user', async () => {
    await TestBed.inject(AuthService).signOut();
    await expect(worlds.list()).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(create()).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('rejects invalid worlds and calendars without writing anything', async () => {
    const id = crypto.randomUUID();
    await expect(
      worlds.create({ id, name: 'Ao contrário', timeStart: 10, timeEnd: 5 }, DEFAULT_CALENDAR),
    ).rejects.toMatchObject({ code: 'validation' });
    await expect(
      worlds.create({ id, name: 'Sem meses' }, { ...DEFAULT_CALENDAR, months: [] }),
    ).rejects.toMatchObject({ code: 'validation' });
    expect(await worlds.get(id)).toBeNull();
  });

  it('updates with optimistic concurrency', async () => {
    const world = await create();
    const updated = await worlds.update(world.id, { nowTick: 1440 }, 1);

    expect(updated).toMatchObject({ nowTick: 1440, version: 2 });
    await expect(worlds.update(world.id, { name: 'Velho' }, 1)).rejects.toMatchObject({
      code: 'conflict',
    });
  });

  it('saves the calendar of a live world only', async () => {
    const world = await create();
    const calendar = { ...DEFAULT_CALENDAR, epochLabel: 'Fundação' };

    expect((await worlds.saveCalendar(world.id, calendar)).definition.epochLabel).toBe('Fundação');
    expect((await worlds.getCalendar(world.id)).definition.epochLabel).toBe('Fundação');

    await worlds.moveToTrash(world.id, 1);
    await expect(worlds.getCalendar(world.id)).rejects.toMatchObject({ code: 'not_found' });
    await expect(worlds.saveCalendar(world.id, calendar)).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('restores a world from the trash', async () => {
    const world = await create();
    await worlds.moveToTrash(world.id, 1);

    expect(await worlds.restore(world.id)).toMatchObject({ deletedAt: null, version: 3 });
    expect(await worlds.list()).toHaveLength(1);
  });
});
