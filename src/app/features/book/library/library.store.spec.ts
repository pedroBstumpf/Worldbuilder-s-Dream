import { EnvironmentInjector, Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { setUpLocalTestBed } from '@data/local/testing/local-test-bed';
import { DEFAULT_CALENDAR } from '@domain/calendar';
import { AssetRepository, EntityRepository, isAppError, WorldRepository } from '@domain/ports';
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

  it('resolves the map thumbnail of worlds that have a cover', async () => {
    const original = URL.createObjectURL;
    URL.createObjectURL = () => 'blob:test/capa';
    try {
      const repo = TestBed.inject(WorldRepository);
      const world = await repo.create(
        { id: crypto.randomUUID(), name: 'Com capa' },
        DEFAULT_CALENDAR,
      );
      await repo.create({ id: crypto.randomUUID(), name: 'Sem capa' }, DEFAULT_CALENDAR);
      const cover = await TestBed.inject(AssetRepository).upload(
        { id: crypto.randomUUID(), worldId: world.id, mimeType: 'image/webp' },
        new Blob([new Uint8Array([1])], { type: 'image/webp' }),
      );
      await repo.update(world.id, { coverAssetId: cover.id }, world.version);
      const store = createStore();

      await store.load();

      expect(store.coverUrls()).toEqual({ [world.id]: 'blob:test/capa' });
    } finally {
      URL.createObjectURL = original;
    }
  });

  describe('world actions', () => {
    async function loadedWith(...names: string[]) {
      const store = createStore();
      await store.load();
      for (const name of names) await store.create({ name, description: null });
      return store;
    }

    it('renames a world', async () => {
      const store = await loadedWith('Valmora');
      const id = store.worlds()[0]?.id ?? '';

      await store.rename(id, { name: 'Valmora Antiga', description: 'Um reino' });

      expect(store.selected()).toMatchObject({ name: 'Valmora Antiga', description: 'Um reino' });
    });

    it('moves a world to the archived list and back', async () => {
      const store = await loadedWith('Valmora', 'Eldoria');
      const id = store.worlds().find((w) => w.name === 'Valmora')?.id ?? '';

      await store.setArchived(id, true);

      expect(store.worlds().map((w) => w.name)).toEqual(['Eldoria']);
      store.setView('archived');
      expect(store.shown().map((w) => w.name)).toEqual(['Valmora']);
      expect(store.selected()?.archivedAt).not.toBeNull();

      await store.setArchived(id, false);

      expect(store.shown()).toEqual([]);
      expect(store.worlds()).toHaveLength(2);
    });

    it('trashes, restores and deletes a world forever', async () => {
      const store = await loadedWith('Valmora');
      const id = store.worlds()[0]?.id ?? '';

      await store.moveToTrash(id);
      expect(store.worlds()).toEqual([]);
      expect(store.trash().map((w) => w.id)).toEqual([id]);
      expect(store.blank()).toBe(false);

      await store.restore(id);
      expect(store.worlds().map((w) => w.id)).toEqual([id]);

      await store.moveToTrash(id);
      await store.deleteForever(id);
      expect(store.trash()).toEqual([]);
      expect(store.blank()).toBe(true);
      expect(await TestBed.inject(WorldRepository).listTrash()).toEqual([]);
    });

    it('duplicates a world with its content and selects the copy', async () => {
      const store = await loadedWith('Valmora');
      const original = store.worlds()[0];
      await TestBed.inject(EntityRepository).create({
        id: crypto.randomUUID(),
        worldId: original?.id ?? '',
        kind: 'character',
        name: 'Aria',
      });

      const copy = await store.duplicate(original?.id ?? '', 'Valmora (cópia)');

      expect(copy.id).not.toBe(original?.id);
      expect(store.selected()?.id).toBe(copy.id);
      expect(
        store
          .worlds()
          .map((w) => w.name)
          .sort(),
      ).toEqual(['Valmora', 'Valmora (cópia)']);
      const entities = await TestBed.inject(EntityRepository).list(copy.id);
      expect(entities.map((e) => e.name)).toEqual(['Aria']);
    });

    it('exports a world to json and imports it back as a new world', async () => {
      const store = await loadedWith('Valmora');
      const original = store.worlds()[0];

      const file = await store.exportFile(original?.id ?? '');
      const imported = await store.importFile(file.text);

      expect(file.name).toMatch(/^valmora-\d{4}-\d{2}-\d{2}\.json$/);
      expect(imported.id).not.toBe(original?.id);
      expect(imported.name).toBe('Valmora');
      expect(store.view()).toBe('worlds');
      expect(store.selected()?.id).toBe(imported.id);
    });

    it('rejects a file that is not an exported world', async () => {
      const store = await loadedWith();

      const error = await store.importFile('{"hello": 1}').catch((e: unknown) => e);

      expect(isAppError(error, 'validation')).toBe(true);
      expect(store.blank()).toBe(true);
    });
  });
});
