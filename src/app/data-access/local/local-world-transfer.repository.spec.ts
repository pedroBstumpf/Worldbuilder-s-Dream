import { TestBed } from '@angular/core/testing';
import { DEFAULT_CALENDAR } from '@domain/calendar/default-calendar';
import type { World } from '@domain/models';
import {
  AssetRepository,
  EntityRepository,
  EventRepository,
  isAppError,
  MapRepository,
  MentionRepository,
  WorldRepository,
  WorldTransferRepository,
} from '@domain/ports';
import { asWorldCopy } from '@domain/transfer';
import { FAKE_USER } from './fake-auth.service';
import { LocalDatabase } from './local-database';
import { setUpLocalTestBed } from './testing/local-test-bed';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7]);

describe('LocalWorldTransferRepository', () => {
  let teardown: () => Promise<void>;
  let worlds: WorldRepository;
  let transfer: WorldTransferRepository;

  beforeEach(async () => {
    ({ teardown } = await setUpLocalTestBed());
    worlds = TestBed.inject(WorldRepository);
    transfer = TestBed.inject(WorldTransferRepository);
  });

  afterEach(() => teardown());

  /** Mundo com mapa e imagem, versão da imagem, personagem com token e posição, evento citando o personagem. */
  async function richWorld(): Promise<World> {
    const maps = TestBed.inject(MapRepository);
    const assets = TestBed.inject(AssetRepository);
    const world = await worlds.create(
      { id: crypto.randomUUID(), name: 'Valmora' },
      DEFAULT_CALENDAR,
    );
    const upload = () =>
      assets.upload(
        { id: crypto.randomUUID(), worldId: world.id, mimeType: 'image/png', width: 4, height: 3 },
        new Blob([PNG], { type: 'image/png' }),
      );
    const image = await upload();
    const later = await upload();
    const map = await maps.create({
      id: crypto.randomUUID(),
      worldId: world.id,
      name: 'Continente',
      width: 4,
      height: 3,
      imageAssetId: image.id,
    });
    await maps.createImageVersion({
      id: crypto.randomUUID(),
      worldId: world.id,
      mapId: map.id,
      imageAssetId: later.id,
      tickStart: 100,
    });
    const hero = await TestBed.inject(EntityRepository).create({
      id: crypto.randomUUID(),
      worldId: world.id,
      kind: 'character',
      name: 'Aria',
    });
    const token = await maps.saveToken({
      id: crypto.randomUUID(),
      worldId: world.id,
      mapId: map.id,
      entityId: hero.id,
      eventId: null,
      size: 1,
      style: {},
    });
    await maps.saveKeyframe({
      id: crypto.randomUUID(),
      worldId: world.id,
      tokenId: token.id,
      tick: 0,
      x: 1,
      y: 2,
      visible: true,
      interpolation: 'linear',
      note: null,
    });
    const event = await TestBed.inject(EventRepository).create({
      id: crypto.randomUUID(),
      worldId: world.id,
      title: 'Coroação',
      tickStart: 10,
      content: {
        type: 'doc',
        content: [{ type: 'mention', attrs: { id: hero.id, label: 'Aria' } }],
      },
    });
    await TestBed.inject(MentionRepository).replace(
      { worldId: world.id, kind: 'event', id: event.id },
      [hero.id],
    );
    return (await worlds.update(world.id, { coverAssetId: image.id }, world.version)) as World;
  }

  it('exports a whole world with the bytes of its images', async () => {
    const world = await richWorld();

    const bundle = await transfer.exportWorld(world.id);

    expect(bundle.world).toEqual(world);
    expect(bundle.calendar).toEqual(DEFAULT_CALENDAR);
    expect(bundle.maps).toHaveLength(1);
    expect(bundle.mapImageVersions).toHaveLength(1);
    expect(bundle.mapTokens).toHaveLength(1);
    expect(bundle.tokenKeyframes).toHaveLength(1);
    expect(bundle.entities).toHaveLength(1);
    expect(bundle.events).toHaveLength(1);
    expect(bundle.entityMentions).toHaveLength(1);
    expect(bundle.assets.map((a) => a.bytes)).toEqual([PNG, PNG]);
  });

  it('imports a copy as a new world of the current user, everything readable', async () => {
    const original = await richWorld();
    const copy = asWorldCopy(await transfer.exportWorld(original.id), { name: 'Valmora II' });

    const imported = await transfer.importWorld(copy);

    expect(imported).toMatchObject({ name: 'Valmora II', ownerId: FAKE_USER.id, version: 1 });
    expect((await worlds.list()).map((w) => w.name).sort()).toEqual(['Valmora', 'Valmora II']);
    const [map] = await TestBed.inject(MapRepository).list(imported.id);
    const scene = await TestBed.inject(MapRepository).getScene(map?.id ?? '');
    expect(scene?.tokens).toHaveLength(1);
    expect(scene?.keyframes).toHaveLength(1);
    expect(scene?.imageVersions).toHaveLength(1);
    const assets = TestBed.inject(AssetRepository);
    const cover = await assets.get(imported.coverAssetId ?? '');
    expect(cover?.storagePath).toBe(`${imported.id}/${cover?.id}`);
    const [hero] = await TestBed.inject(EntityRepository).list(imported.id);
    expect(await TestBed.inject(MentionRepository).listCiting(hero?.id ?? '')).toHaveLength(1);
    // A exportação da cópia tem o mesmo conteúdo, com os ids novos.
    expect((await transfer.exportWorld(imported.id)).assets.map((a) => a.bytes)).toEqual([
      PNG,
      PNG,
    ]);
  });

  it('rejects a bundle whose ids already exist and writes nothing', async () => {
    const world = await richWorld();
    const bundle = await transfer.exportWorld(world.id);

    const error = await transfer.importWorld(bundle).catch((e: unknown) => e);

    expect(isAppError(error, 'conflict')).toBe(true);
    expect(await worlds.list()).toHaveLength(1);
  });

  it('does not export a world in the trash', async () => {
    const world = await richWorld();
    await worlds.moveToTrash(world.id, world.version);

    const error = await transfer.exportWorld(world.id).catch((e: unknown) => e);

    expect(isAppError(error, 'not_found')).toBe(true);
  });

  it('lists the trash and deletes a trashed world forever, with all its rows', async () => {
    const world = await richWorld();
    const other = await worlds.create({ id: crypto.randomUUID(), name: 'Outro' }, DEFAULT_CALENDAR);
    expect(
      isAppError(await worlds.deleteForever(world.id).catch((e: unknown) => e), 'not_found'),
    ).toBe(true);
    await worlds.moveToTrash(world.id, world.version);

    expect((await worlds.listTrash()).map((w) => w.id)).toEqual([world.id]);
    await worlds.deleteForever(world.id);

    expect(await worlds.listTrash()).toEqual([]);
    expect((await worlds.list()).map((w) => w.id)).toEqual([other.id]);
    const db = await TestBed.inject(LocalDatabase).ready();
    for (const store of [
      'assets',
      'assetFiles',
      'maps',
      'mapImageVersions',
      'mapTokens',
      'tokenKeyframes',
      'entities',
      'events',
      'entityMentions',
    ] as const) {
      expect(await db.count(store)).toBe(0);
    }
    expect(await db.count('worlds')).toBe(1);
    expect(await db.count('calendars')).toBe(1);
    expect(await db.count('worldMembers')).toBe(1);
  });
});
