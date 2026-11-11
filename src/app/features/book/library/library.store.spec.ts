import { EnvironmentInjector, Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { setUpLocalTestBed } from '@data/local/testing/local-test-bed';
import { DEFAULT_CALENDAR } from '@domain/calendar';
import { WorldRepository } from '@domain/ports';
import { LibraryStore } from './library.store';

describe('LibraryStore', () => {
  let teardown: () => Promise<void>;

  beforeEach(async () => {
    ({ teardown } = await setUpLocalTestBed());
  });

  afterEach(() => teardown());

  /** O store é fornecido pelo BookShell, não pela raiz. */
  function createStore() {
    const parent = TestBed.inject(EnvironmentInjector);
    return Injector.create({ providers: [LibraryStore], parent }).get(LibraryStore);
  }

  it('starts as a blank book', async () => {
    const store = createStore();

    await store.load();

    expect(store.status()).toBe('ready');
    expect(store.worlds()).toEqual([]);
    expect(store.selected()).toBeNull();
  });

  it('creates a world and selects it on the frontispiece', async () => {
    const store = createStore();
    await store.load();

    const world = await store.create({ name: 'Valmora', description: null });

    expect(store.selected()?.id).toBe(world.id);
    expect(store.worlds().map((w) => w.name)).toEqual(['Valmora']);
  });

  it('lists the most recently edited world first and leaves archived ones out', async () => {
    const repo = TestBed.inject(WorldRepository);
    const old = await repo.create({ id: crypto.randomUUID(), name: 'Antigo' }, DEFAULT_CALENDAR);
    const recent = await repo.create(
      { id: crypto.randomUUID(), name: 'Recente' },
      DEFAULT_CALENDAR,
    );
    const archived = await repo.create(
      { id: crypto.randomUUID(), name: 'Arquivado' },
      DEFAULT_CALENDAR,
    );
    await repo.update(archived.id, { archivedAt: new Date().toISOString() }, archived.version);
    // Garante um updatedAt posterior ao dos outros.
    await new Promise((resolve) => setTimeout(resolve, 5));
    await repo.update(old.id, { name: 'Antigo editado' }, old.version);
    const store = createStore();

    await store.load();

    expect(store.worlds().map((w) => w.id)).toEqual([old.id, recent.id]);
    expect(store.selected()?.id).toBe(old.id);
  });
});
