import { EnvironmentInjector, Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { setUpLocalTestBed } from '@data/local/testing/local-test-bed';
import { DEFAULT_CALENDAR } from '@domain/calendar/default-calendar';
import type { World } from '@domain/models';
import { AssetRepository, MapRepository, WorldRepository } from '@domain/ports';
import type { ProcessedMapImage } from '@engine/import/read-map-image';
import { MapStore } from './map.store';
import { WorldStore } from './world.store';

function processed(width: number, height: number): ProcessedMapImage {
  return {
    image: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' }),
    thumbnail: new Blob([new Uint8Array([4])], { type: 'image/webp' }),
    bitmap: { width, height } as ImageBitmap,
    width,
    height,
    originalWidth: width,
    originalHeight: height,
    reduced: false,
  };
}

// O jsdom não tem object URLs.
const originalUrl = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
beforeEach(() => {
  URL.createObjectURL = () => `blob:test/${crypto.randomUUID()}`;
  URL.revokeObjectURL = () => undefined;
});
afterEach(() => {
  URL.createObjectURL = originalUrl.create;
  URL.revokeObjectURL = originalUrl.revoke;
});

/** Espera o envio em segundo plano terminar. */
async function settle(store: InstanceType<typeof WorldStore>): Promise<void> {
  for (let i = 0; i < 50 && store.upload()?.state === 'saving'; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('WorldStore', () => {
  let teardown: () => Promise<void>;
  let store: InstanceType<typeof WorldStore>;
  let world: World;

  beforeEach(async () => {
    ({ teardown } = await setUpLocalTestBed([WorldStore, MapStore]));
    world = await TestBed.inject(WorldRepository).create(
      { id: crypto.randomUUID(), name: 'Eldoria' },
      DEFAULT_CALENDAR,
    );
    store = TestBed.inject(WorldStore);
  });

  afterEach(() => teardown());

  it('opens a world without maps', async () => {
    expect(await store.load(world.id, null)).toBe('ready');
    expect(store.world()?.name).toBe('Eldoria');
    expect(store.activeMap()).toBeNull();
    expect(await store.load(crypto.randomUUID(), null)).toBe('not_found');
  });

  it('creates the map at once, uploads the image and sets the world cover', async () => {
    await store.load(world.id, null);
    const map = await store.createMap(processed(800, 600), 'Valmora', null);

    expect(store.activeMap()?.id).toBe(map.id);
    expect(store.takeLocalImage(map.id)).toMatchObject({ width: 800 });

    await settle(store);
    expect(store.upload()).toBeNull();
    const saved = store.activeMap();
    expect(saved?.imageAssetId).not.toBeNull();
    expect(await TestBed.inject(AssetRepository).get(saved?.imageAssetId ?? '')).toMatchObject({
      mimeType: 'image/webp',
      width: 800,
    });
    expect(store.world()?.coverAssetId).not.toBeNull();
    expect(store.takeLocalImage(map.id)).toBeNull();
  });

  it('builds the tree, renames, moves and restores the map from the url', async () => {
    await store.load(world.id, null);
    const root = await store.createMap(processed(100, 100), 'Mundo', null);
    const city = await store.createMap(processed(100, 100), 'Cidade', root.id);
    await settle(store);

    expect(store.tree().map((row) => `${row.depth}:${row.map.name}`)).toEqual([
      '0:Mundo',
      '1:Cidade',
    ]);
    expect(store.activePath().map((m) => m.name)).toEqual(['Mundo', 'Cidade']);

    await store.renameMap(city.id, 'Porto');
    await store.moveMap(city.id, null);
    expect(store.tree().map((row) => `${row.depth}:${row.map.name}`)).toEqual([
      '0:Mundo',
      '0:Porto',
    ]);

    const reopened = Injector.create({
      providers: [WorldStore],
      parent: TestBed.inject(EnvironmentInjector),
    }).get(WorldStore);
    await reopened.load(world.id, city.id);
    expect(reopened.activeMap()?.name).toBe('Porto');
  });

  it('sets the scale and rescales links when the image is replaced', async () => {
    await store.load(world.id, null);
    const map = await store.createMap(processed(1000, 500), 'Mundo', null);
    const child = await store.createMap(processed(100, 100), 'Cidade', map.id);
    await settle(store);
    await store.setScale(map.id, { pixelLength: 200, realLength: 100, unit: 'km', label: null });
    expect(store.maps().find((m) => m.id === map.id)?.scaleValue).toBe(0.5);

    const repo = TestBed.inject(MapRepository);
    await repo.saveLink({
      id: crypto.randomUUID(),
      worldId: world.id,
      mapId: map.id,
      targetMapId: child.id,
      polygon: [
        [100, 100],
        [200, 100],
        [200, 200],
      ],
    });
    await store.replaceImage(map.id, processed(2000, 1000));
    await settle(store);

    const scene = await repo.getScene(map.id);
    expect(scene?.map).toMatchObject({ width: 2000, height: 1000, scaleValue: 0.25 });
    expect(scene?.links[0]?.polygon).toEqual([
      [200, 200],
      [400, 200],
      [400, 400],
    ]);
  });
});

describe('MapStore', () => {
  let teardown: () => Promise<void>;

  beforeEach(async () => {
    ({ teardown } = await setUpLocalTestBed([WorldStore, MapStore]));
  });

  afterEach(() => teardown());

  it('loads the scene and adds or removes links optimistically', async () => {
    const world = await TestBed.inject(WorldRepository).create(
      { id: crypto.randomUUID(), name: 'Eldoria' },
      DEFAULT_CALENDAR,
    );
    const worldStore = TestBed.inject(WorldStore);
    await worldStore.load(world.id, null);
    const map = await worldStore.createMap(processed(100, 100), 'Mundo', null);
    const child = await worldStore.createMap(processed(100, 100), 'Cidade', map.id);
    await settle(worldStore);

    const store = TestBed.inject(MapStore);
    // O registro atualizado pelo envio, já com a imagem.
    await store.load(worldStore.maps().find((m) => m.id === map.id) ?? map, null);
    expect(store.status()).toBe('ready');
    expect(typeof store.image()).toBe('string');

    const link = await store.addLink(
      [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
      child.id,
    );
    expect(store.scene()?.links.map((l) => l.id)).toEqual([link.id]);
    await store.removeLink(link.id);
    expect(store.scene()?.links).toEqual([]);
    expect((await TestBed.inject(MapRepository).getScene(map.id))?.links).toEqual([]);
  });
});
