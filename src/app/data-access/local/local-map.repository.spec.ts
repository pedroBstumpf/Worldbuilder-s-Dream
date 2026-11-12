import { TestBed } from '@angular/core/testing';
import type { WorldMap } from '@domain/models';
import { MapRepository, type MapAnnotationInput, type MapTokenInput } from '@domain/ports';
import { FAKE_USER } from './fake-auth.service';
import { setUpLocalTestBed } from './testing/local-test-bed';

const worldId = crypto.randomUUID();

describe('LocalMapRepository', () => {
  let maps: MapRepository;
  let teardown: () => Promise<void>;

  beforeEach(async () => {
    ({ teardown } = await setUpLocalTestBed());
    maps = TestBed.inject(MapRepository);
  });

  afterEach(() => teardown());

  const createMap = (name = 'Continente', sortOrder?: number) =>
    maps.create({ id: crypto.randomUUID(), worldId, name, width: 4096, height: 2048, sortOrder });

  const token = (map: WorldMap, overrides: Partial<MapTokenInput> = {}): MapTokenInput => ({
    id: crypto.randomUUID(),
    worldId,
    mapId: map.id,
    entityId: crypto.randomUUID(),
    eventId: null,
    size: 1,
    style: {},
    ...overrides,
  });

  const keyframe = (tokenId: string, tick: number, x = 0) => ({
    id: crypto.randomUUID(),
    worldId,
    tokenId,
    tick,
    x,
    y: 0,
    visible: true,
    interpolation: 'linear' as const,
    note: null,
  });

  const annotation = (map: WorldMap, zIndex = 0): MapAnnotationInput => ({
    id: crypto.randomUUID(),
    worldId,
    mapId: map.id,
    kind: 'pin',
    geometry: { x: 10, y: 20 },
    style: {},
    title: null,
    entityId: null,
    eventId: null,
    tickStart: null,
    tickEnd: null,
    zIndex,
  });

  describe('maps', () => {
    it('creates maps with the database defaults and lists them by sort order', async () => {
      const second = await createMap('Ilhas', 2);
      const first = await createMap('Continente', 1);

      expect(first).toMatchObject({ parentMapId: null, scaleValue: null, version: 1 });
      expect((await maps.list(worldId)).map((map) => map.id)).toEqual([first.id, second.id]);
    });

    it('rejects sizes outside the schema limits', async () => {
      await expect(
        maps.create({ id: crypto.randomUUID(), worldId, name: 'Grande', width: 40000, height: 10 }),
      ).rejects.toMatchObject({ code: 'validation' });
    });
  });

  describe('scene', () => {
    it('loads the map with its tokens, keyframes in tick order, annotations and links', async () => {
      const map = await createMap();
      const child = await createMap('Cidade');
      const a = await maps.saveToken(token(map));
      const b = await maps.saveToken(token(map, { entityId: null, eventId: crypto.randomUUID() }));
      await maps.saveKeyframe(keyframe(a.id, 300));
      await maps.saveKeyframe(keyframe(a.id, -60));
      await maps.saveKeyframe(keyframe(b.id, 0));
      const top = await maps.createAnnotation(annotation(map, 5));
      const bottom = await maps.createAnnotation(annotation(map, 1));
      const link = await maps.saveLink({
        id: crypto.randomUUID(),
        worldId,
        mapId: map.id,
        targetMapId: child.id,
        polygon: [
          [0, 0],
          [10, 0],
          [10, 10],
        ],
      });

      const scene = await maps.getScene(map.id);

      expect(scene?.map).toEqual(map);
      expect(scene?.tokens).toHaveLength(2);
      const ticksOfA = scene?.keyframes.filter((k) => k.tokenId === a.id).map((k) => k.tick);
      expect(ticksOfA).toEqual([-60, 300]);
      expect(scene?.keyframes).toHaveLength(3);
      expect(scene?.annotations.map((item) => item.id)).toEqual([bottom.id, top.id]);
      expect(scene?.links).toEqual([link]);
    });

    it('is null for a missing or trashed map', async () => {
      const map = await createMap();
      await maps.moveToTrash(map.id, 1);

      expect(await maps.getScene(map.id)).toBeNull();
      expect(await maps.getScene(crypto.randomUUID())).toBeNull();
    });
  });

  describe('tokens', () => {
    it('keeps createdAt when a token is replaced', async () => {
      const map = await createMap();
      const saved = await maps.saveToken(token(map));
      const replaced = await maps.saveToken({ ...saved, size: 2 });

      expect(replaced).toMatchObject({ size: 2, createdAt: saved.createdAt });
    });

    it('allows one token per target on each map', async () => {
      const map = await createMap();
      const entityId = crypto.randomUUID();
      await maps.saveToken(token(map, { entityId }));

      await expect(maps.saveToken(token(map, { entityId }))).rejects.toMatchObject({
        code: 'conflict',
      });
      const other = await createMap('Outro');
      await expect(maps.saveToken(token(other, { entityId }))).resolves.toBeDefined();
    });

    it('requires exactly one target, a valid size and a live map', async () => {
      const map = await createMap();
      await expect(
        maps.saveToken(token(map, { eventId: crypto.randomUUID() })),
      ).rejects.toMatchObject({ code: 'validation' });
      await expect(maps.saveToken(token(map, { size: 20 }))).rejects.toMatchObject({
        code: 'validation',
      });
      await maps.moveToTrash(map.id, 1);
      await expect(maps.saveToken(token(map))).rejects.toMatchObject({ code: 'not_found' });
    });

    it('deletes the token together with its keyframes', async () => {
      const map = await createMap();
      const saved = await maps.saveToken(token(map));
      await maps.saveKeyframe(keyframe(saved.id, 0));

      await maps.deleteToken(saved.id);

      const scene = await maps.getScene(map.id);
      expect(scene?.tokens).toEqual([]);
      expect(scene?.keyframes).toEqual([]);
      await expect(maps.saveKeyframe(keyframe(saved.id, 10))).rejects.toMatchObject({
        code: 'not_found',
      });
    });
  });

  describe('keyframes', () => {
    it('upserts by token and tick, keeping the existing id', async () => {
      const map = await createMap();
      const saved = await maps.saveToken(token(map));
      const first = await maps.saveKeyframe(keyframe(saved.id, 100, 1));

      const second = await maps.saveKeyframe(keyframe(saved.id, 100, 2));

      expect(second).toMatchObject({ id: first.id, x: 2 });
      expect((await maps.getScene(map.id))?.keyframes).toEqual([second]);
    });

    it('deletes a keyframe and accepts deleting one that is gone', async () => {
      const map = await createMap();
      const saved = await maps.saveToken(token(map));
      const frame = await maps.saveKeyframe(keyframe(saved.id, 0));

      await maps.deleteKeyframe(frame.id);
      await maps.deleteKeyframe(frame.id);

      expect((await maps.getScene(map.id))?.keyframes).toEqual([]);
    });
  });

  describe('annotations', () => {
    it('creates with the author and updates with version checks', async () => {
      const map = await createMap();
      const created = await maps.createAnnotation(annotation(map));
      expect(created).toMatchObject({ version: 1, createdBy: FAKE_USER.id });

      const updated = await maps.updateAnnotation(created.id, { title: 'Torre' }, 1);
      expect(updated).toMatchObject({ title: 'Torre', version: 2 });
      await expect(maps.updateAnnotation(created.id, { title: 'X' }, 1)).rejects.toMatchObject({
        code: 'conflict',
      });
      await expect(
        maps.updateAnnotation(created.id, { tickStart: 10, tickEnd: 5 }, 2),
      ).rejects.toMatchObject({ code: 'validation' });

      await maps.deleteAnnotation(created.id);
      await expect(maps.updateAnnotation(created.id, {}, 2)).rejects.toMatchObject({
        code: 'not_found',
      });
    });
  });

  describe('links', () => {
    it('refuses a link from a map to itself or to a missing map', async () => {
      const map = await createMap();
      const link = { id: crypto.randomUUID(), worldId, mapId: map.id, polygon: [] };

      await expect(maps.saveLink({ ...link, targetMapId: map.id })).rejects.toMatchObject({
        code: 'validation',
      });
      await expect(
        maps.saveLink({ ...link, targetMapId: crypto.randomUUID() }),
      ).rejects.toMatchObject({ code: 'not_found' });
    });
  });

  describe('image versions', () => {
    const draft = (map: WorldMap, tickStart: number) => ({
      id: crypto.randomUUID(),
      worldId,
      mapId: map.id,
      imageAssetId: crypto.randomUUID(),
      tickStart,
    });

    it('lists the versions in the scene in tick order, without the trash', async () => {
      const map = await createMap();
      const late = await maps.createImageVersion(draft(map, 500));
      const early = await maps.createImageVersion(draft(map, 100));
      const trashed = await maps.createImageVersion(draft(map, 300));
      await maps.moveImageVersionToTrash(trashed.id, 1);

      const scene = await maps.getScene(map.id);

      expect(scene?.imageVersions.map((v) => v.id)).toEqual([early.id, late.id]);
      expect(early).toMatchObject({ version: 1, deletedAt: null, createdBy: expect.any(String) });
    });

    it('refuses two live versions at the same tick, but not one in the trash', async () => {
      const map = await createMap();
      const first = await maps.createImageVersion(draft(map, 100));

      await expect(maps.createImageVersion(draft(map, 100))).rejects.toMatchObject({
        code: 'conflict',
      });
      const other = await maps.createImageVersion(draft(map, 200));
      await expect(maps.updateImageVersion(other.id, { tickStart: 100 }, 1)).rejects.toMatchObject({
        code: 'conflict',
      });

      await maps.moveImageVersionToTrash(first.id, 1);
      const reused = await maps.createImageVersion(draft(map, 100));
      expect(reused.tickStart).toBe(100);
      await expect(maps.restoreImageVersion(first.id)).rejects.toMatchObject({ code: 'conflict' });
    });

    it('updates with the version seen and restores from the trash', async () => {
      const map = await createMap();
      const created = await maps.createImageVersion(draft(map, 100));

      const moved = await maps.updateImageVersion(created.id, { tickStart: 150 }, 1);
      expect(moved).toMatchObject({ tickStart: 150, version: 2 });
      await expect(maps.updateImageVersion(created.id, { tickStart: 1 }, 1)).rejects.toMatchObject({
        code: 'conflict',
      });
      await expect(
        maps.updateImageVersion(created.id, { tickStart: 1.5 }, 2),
      ).rejects.toMatchObject({ code: 'validation' });

      await maps.moveImageVersionToTrash(created.id, 2);
      await expect(maps.updateImageVersion(created.id, {}, 3)).rejects.toMatchObject({
        code: 'not_found',
      });
      const restored = await maps.restoreImageVersion(created.id);
      expect(restored).toMatchObject({ deletedAt: null, version: 4 });
    });

    it('needs a live map', async () => {
      const map = await createMap();
      await maps.moveToTrash(map.id, 1);

      await expect(maps.createImageVersion(draft(map, 0))).rejects.toMatchObject({
        code: 'not_found',
      });
    });
  });
});
