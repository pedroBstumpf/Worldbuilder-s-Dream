import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import type { Entity } from '@domain/models';
import { AppError } from '@domain/ports';
import { deleteDB } from 'idb';
import { checkEntity } from './local-checks';
import { DEFAULT_LOCAL_DATA_OPTIONS, LOCAL_DATA_OPTIONS, LocalDatabase } from './local-database';
import { inTransaction } from './local-transaction';
import { TrashableTable } from './trashable-table';

const worldId = crypto.randomUUID();

function entity(overrides: Partial<Entity> = {}): Entity {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    worldId,
    kind: 'character',
    name: 'Aelin',
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
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

describe('TrashableTable', () => {
  let database: LocalDatabase;
  let table: TrashableTable<Entity>;
  const dbName = `test-${crypto.randomUUID()}`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        LocalDatabase,
        { provide: LOCAL_DATA_OPTIONS, useValue: { ...DEFAULT_LOCAL_DATA_OPTIONS, dbName } },
      ],
    });
    database = TestBed.inject(LocalDatabase);
    table = new TrashableTable<Entity>(database, 'entities', checkEntity);
  });

  afterEach(async () => {
    await database.close();
    await deleteDB(dbName);
  });

  it('inserts and reads rows, listing only the live ones of the world', async () => {
    const kept = await table.insert(entity());
    const trashed = await table.insert(entity({ name: 'Borin' }));
    await table.insert(entity({ worldId: crypto.randomUUID() }));
    await table.moveToTrash(trashed.id, 1);

    expect(await table.get(kept.id)).toEqual(kept);
    expect(await table.get(trashed.id)).toBeNull();
    expect(await table.listByWorld(worldId)).toEqual([kept]);
  });

  it('rejects a repeated id with conflict', async () => {
    const row = await table.insert(entity());
    await expect(table.insert(row)).rejects.toMatchObject({ code: 'conflict' });
  });

  it('bumps version and updatedAt on update, ignoring undefined fields', async () => {
    const row = await table.insert(
      entity({ subtitle: 'a ladra', updatedAt: '2000-01-01T00:00:00.000Z' }),
    );

    const updated = await table.update(
      row.id,
      { name: 'Aelin Galathynius', subtitle: undefined },
      1,
    );

    expect(updated).toMatchObject({ name: 'Aelin Galathynius', subtitle: 'a ladra', version: 2 });
    expect(updated.updatedAt > row.updatedAt).toBe(true);
    expect(updated.createdAt).toBe(row.createdAt);
    expect(await table.get(row.id)).toEqual(updated);
  });

  it('rejects a stale version with conflict and a missing or trashed item with not_found', async () => {
    const row = await table.insert(entity());
    await table.update(row.id, { name: 'Outro nome' }, 1);

    await expect(table.update(row.id, { name: 'Velho' }, 1)).rejects.toMatchObject({
      code: 'conflict',
    });
    await expect(table.update(crypto.randomUUID(), {}, 1)).rejects.toMatchObject({
      code: 'not_found',
    });
    await table.moveToTrash(row.id, 2);
    await expect(table.moveToTrash(row.id, 3)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('validates the row with the schema checks', async () => {
    await expect(table.insert(entity({ name: '' }))).rejects.toMatchObject({ code: 'validation' });
    const row = await table.insert(entity());
    await expect(table.update(row.id, { color: 'azul' }, 1)).rejects.toMatchObject({
      code: 'validation',
    });
    expect(await table.get(row.id)).toEqual(row);
  });

  it('restores from the trash with a new version; a live item comes back unchanged', async () => {
    const row = await table.insert(entity());
    await table.moveToTrash(row.id, 1);

    const restored = await table.restore(row.id);
    expect(restored).toMatchObject({ deletedAt: null, version: 3 });
    expect(await table.restore(row.id)).toEqual(restored);
    await expect(table.restore(crypto.randomUUID())).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('inTransaction', () => {
  const dbName = `test-${crypto.randomUUID()}`;
  let database: LocalDatabase;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        LocalDatabase,
        { provide: LOCAL_DATA_OPTIONS, useValue: { ...DEFAULT_LOCAL_DATA_OPTIONS, dbName } },
      ],
    });
    database = TestBed.inject(LocalDatabase);
  });

  afterEach(async () => {
    await database.close();
    await deleteDB(dbName);
  });

  it('aborts the whole transaction when the work fails, leaving no partial write', async () => {
    const db = await database.ready();
    const row = entity();

    await expect(
      inTransaction(db, ['entities'], async (tx) => {
        await tx.objectStore('entities').add(row);
        throw new AppError('validation');
      }),
    ).rejects.toMatchObject({ code: 'validation' });

    expect(await db.get('entities', row.id)).toBeUndefined();
  });
});

describe('LocalDatabase', () => {
  it('simulates a network failure when asked to', async () => {
    TestBed.configureTestingModule({
      providers: [
        LocalDatabase,
        {
          provide: LOCAL_DATA_OPTIONS,
          useValue: { ...DEFAULT_LOCAL_DATA_OPTIONS, failureRate: 1 },
        },
      ],
    });
    await expect(TestBed.inject(LocalDatabase).ready()).rejects.toMatchObject({
      code: 'network',
    });
  });
});
