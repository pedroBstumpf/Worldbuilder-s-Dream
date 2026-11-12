import { TestBed } from '@angular/core/testing';
import { setUpLocalTestBed } from '@data/local/testing/local-test-bed';
import { DEFAULT_CALENDAR } from '@domain/calendar/default-calendar';
import type { WorldMap } from '@domain/models';
import {
  AssetRepository,
  EntityRepository,
  EventRepository,
  MapRepository,
  WorldRepository,
} from '@domain/ports';
import type { ProcessedMapImage } from '@engine/import/read-map-image';
import { HistoryStore } from './history.store';
import { MapStore } from './map.store';

describe('MapStore (eventos no mapa)', () => {
  let teardown: () => Promise<void>;
  let store: InstanceType<typeof MapStore>;
  let map: WorldMap;
  let eventId: string;

  beforeEach(async () => {
    ({ teardown } = await setUpLocalTestBed([MapStore, HistoryStore]));
    const world = await TestBed.inject(WorldRepository).create(
      { id: crypto.randomUUID(), name: 'Eldoria' },
      DEFAULT_CALENDAR,
    );
    map = await TestBed.inject(MapRepository).create({
      id: crypto.randomUUID(),
      worldId: world.id,
      name: 'Continente',
      width: 1000,
      height: 800,
    });
    const event = await TestBed.inject(EventRepository).create({
      id: crypto.randomUUID(),
      worldId: world.id,
      title: 'Batalha do Vau',
      tickStart: 500,
    });
    eventId = event.id;
    store = TestBed.inject(MapStore);
    await store.load(map, null);
  });

  afterEach(() => teardown());

  it('marca o evento num ponto e grava token e keyframe', async () => {
    await store.placeEvent(eventId, { x: 120, y: 340 }, 500);
    expect(store.eventPoint(eventId)).toEqual({ x: 120, y: 340 });
    const scene = await TestBed.inject(MapRepository).getScene(map.id);
    expect(scene?.tokens).toEqual([expect.objectContaining({ eventId, entityId: null })]);
    expect(scene?.keyframes).toEqual([expect.objectContaining({ x: 120, y: 340, tick: 500 })]);
  });

  it('move o ponto sem criar outro token', async () => {
    await store.placeEvent(eventId, { x: 1, y: 2 }, 500);
    await store.placeEvent(eventId, { x: 9, y: 8 }, 500);
    const scene = await TestBed.inject(MapRepository).getScene(map.id);
    expect(scene?.tokens).toHaveLength(1);
    expect(scene?.keyframes).toEqual([expect.objectContaining({ x: 9, y: 8 })]);
  });

  it('tira o evento do mapa', async () => {
    await store.placeEvent(eventId, { x: 1, y: 2 }, 500);
    await store.removeEventToken(eventId);
    expect(store.eventPoint(eventId)).toBeNull();
    const scene = await TestBed.inject(MapRepository).getScene(map.id);
    expect(scene?.tokens).toEqual([]);
    expect(scene?.keyframes).toEqual([]);
  });

  it('desfaz a marcação se a gravação falhar', async () => {
    const repo = TestBed.inject(MapRepository);
    vi.spyOn(repo, 'saveKeyframe').mockRejectedValueOnce(new Error('offline'));
    await expect(store.placeEvent(eventId, { x: 1, y: 2 }, 500)).rejects.toThrow('offline');
    expect(store.eventPoint(eventId)).toBeNull();
    expect(store.scene()?.tokens).toEqual([]);
    expect((await repo.getScene(map.id))?.tokens).toEqual([]);
  });

  it('desfaz e refaz a marcação, também no repositório', async () => {
    const history = TestBed.inject(HistoryStore);
    const repo = TestBed.inject(MapRepository);
    await store.placeEvent(eventId, { x: 1, y: 2 }, 500);
    await store.placeEvent(eventId, { x: 9, y: 8 }, 500);

    expect(await history.undo()).toBe('placeEvent');
    expect(store.eventPoint(eventId)).toEqual({ x: 1, y: 2 });
    await history.undo();
    expect(store.eventPoint(eventId)).toBeNull();
    expect((await repo.getScene(map.id))?.tokens).toEqual([]);

    await history.redo();
    expect(store.eventPoint(eventId)).toEqual({ x: 1, y: 2 });
    expect((await repo.getScene(map.id))?.keyframes).toEqual([
      expect.objectContaining({ x: 1, y: 2 }),
    ]);
  });

  it('desfaz a remoção de um link', async () => {
    const history = TestBed.inject(HistoryStore);
    const target = await TestBed.inject(MapRepository).create({
      id: crypto.randomUUID(),
      worldId: map.worldId,
      name: 'Cidade',
      width: 10,
      height: 10,
    });
    const link = await store.addLink(
      [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
      target.id,
    );
    await store.removeLink(link.id);
    expect(store.scene()?.links).toEqual([]);
    await history.undo();
    expect(store.scene()?.links).toEqual([link]);
  });

  it('esquece o histórico ao abrir outro mapa', async () => {
    const history = TestBed.inject(HistoryStore);
    await store.placeEvent(eventId, { x: 1, y: 2 }, 500);
    await store.load(map, null);
    expect(history.canUndo()).toBe(false);
  });
});

describe('MapStore (tokens de entidade)', () => {
  let teardown: () => Promise<void>;
  let store: InstanceType<typeof MapStore>;
  let history: InstanceType<typeof HistoryStore>;
  let repo: MapRepository;
  let map: WorldMap;
  let entityId: string;

  const saved = async () => (await repo.getScene(map.id)) ?? { tokens: [], keyframes: [] };
  const positions = () =>
    store.keyframesOf(store.tokenOfEntity(entityId)?.id ?? '').map((k) => [k.tick, k.x, k.y]);

  beforeEach(async () => {
    ({ teardown } = await setUpLocalTestBed([MapStore, HistoryStore]));
    const world = await TestBed.inject(WorldRepository).create(
      { id: crypto.randomUUID(), name: 'Eldoria' },
      DEFAULT_CALENDAR,
    );
    repo = TestBed.inject(MapRepository);
    map = await repo.create({
      id: crypto.randomUUID(),
      worldId: world.id,
      name: 'Continente',
      width: 1000,
      height: 800,
    });
    const entity = await TestBed.inject(EntityRepository).create({
      id: crypto.randomUUID(),
      worldId: world.id,
      kind: 'character',
      name: 'Aria',
    });
    entityId = entity.id;
    store = TestBed.inject(MapStore);
    history = TestBed.inject(HistoryStore);
    await store.load(map, null);
  });

  afterEach(() => teardown());

  it('coloca a entidade no mapa com um keyframe no instante', async () => {
    await store.placeEntity(entityId, { x: 10, y: 20 }, 100);
    expect(store.tokenOfEntity(entityId)).toEqual(expect.objectContaining({ mapId: map.id }));
    expect(positions()).toEqual([[100, 10, 20]]);
    const scene = await saved();
    expect(scene.tokens).toHaveLength(1);
    expect(scene.keyframes).toEqual([expect.objectContaining({ tick: 100, x: 10, y: 20 })]);
  });

  it('soltar de novo cria outro keyframe no mesmo token', async () => {
    await store.placeEntity(entityId, { x: 10, y: 20 }, 100);
    await store.placeEntity(entityId, { x: 50, y: 60 }, 200);
    expect(store.scene()?.tokens).toHaveLength(1);
    expect(positions()).toEqual([
      [100, 10, 20],
      [200, 50, 60],
    ]);
  });

  it('mover no mesmo instante atualiza o keyframe; em outro, cria', async () => {
    await store.placeEntity(entityId, { x: 0, y: 0 }, 100);
    const tokenId = store.tokenOfEntity(entityId)?.id ?? '';
    await store.moveToken(tokenId, { x: 5, y: 5 }, 100);
    await store.moveToken(tokenId, { x: 9, y: 9 }, 300);
    expect(positions()).toEqual([
      [100, 5, 5],
      [300, 9, 9],
    ]);
    expect((await saved()).keyframes).toHaveLength(2);
  });

  it('com Alt, corrige o keyframe em vigor', async () => {
    await store.placeEntity(entityId, { x: 0, y: 0 }, 100);
    const tokenId = store.tokenOfEntity(entityId)?.id ?? '';
    await store.moveToken(tokenId, { x: 7, y: 7 }, 250, { correctPrevious: true });
    expect(positions()).toEqual([[100, 7, 7]]);
  });

  it('sai do mapa no instante, na posição em que estava', async () => {
    await store.placeEntity(entityId, { x: 0, y: 0 }, 100);
    const tokenId = store.tokenOfEntity(entityId)?.id ?? '';
    await store.moveToken(tokenId, { x: 100, y: 0 }, 200);
    await store.hideToken(tokenId, 150);
    const hidden = store.keyframesOf(tokenId).find((k) => k.tick === 150);
    expect(hidden).toEqual(expect.objectContaining({ x: 50, y: 0, visible: false }));
    // Já oculto: nada muda.
    await store.hideToken(tokenId, 160);
    expect(store.keyframesOf(tokenId)).toHaveLength(3);
  });

  it('muda a interpolação e move um ponto do rastro', async () => {
    await store.placeEntity(entityId, { x: 0, y: 0 }, 100);
    const [keyframe] = store.keyframesOf(store.tokenOfEntity(entityId)?.id ?? '');
    await store.setInterpolation(keyframe?.id ?? '', 'ease');
    await store.moveKeyframe(keyframe?.id ?? '', { x: 3, y: 4 });
    expect((await saved()).keyframes).toEqual([
      expect.objectContaining({ interpolation: 'ease', x: 3, y: 4, tick: 100 }),
    ]);
  });

  it('remover o último keyframe tira o token do mapa', async () => {
    await store.placeEntity(entityId, { x: 0, y: 0 }, 100);
    await store.placeEntity(entityId, { x: 1, y: 1 }, 200);
    const [first, second] = store.keyframesOf(store.tokenOfEntity(entityId)?.id ?? '');
    await store.removeKeyframe(first?.id ?? '');
    expect(store.tokenOfEntity(entityId)).not.toBeNull();
    await store.removeKeyframe(second?.id ?? '');
    expect(store.tokenOfEntity(entityId)).toBeNull();
    expect((await saved()).tokens).toEqual([]);
  });

  it('desfaz a remoção do token, com os keyframes', async () => {
    await store.placeEntity(entityId, { x: 0, y: 0 }, 100);
    await store.placeEntity(entityId, { x: 1, y: 1 }, 200);
    await store.removeToken(store.tokenOfEntity(entityId)?.id ?? '');
    expect(store.tokenOfEntity(entityId)).toBeNull();

    expect(await history.undo()).toBe('removeToken');
    expect(positions()).toEqual([
      [100, 0, 0],
      [200, 1, 1],
    ]);
    expect((await saved()).keyframes).toHaveLength(2);
  });

  it('desfaz o movimento e a colocação, na ordem', async () => {
    await store.placeEntity(entityId, { x: 0, y: 0 }, 100);
    await store.moveToken(store.tokenOfEntity(entityId)?.id ?? '', { x: 8, y: 8 }, 100);
    await history.undo();
    expect(positions()).toEqual([[100, 0, 0]]);
    await history.undo();
    expect(store.tokenOfEntity(entityId)).toBeNull();
    expect((await saved()).tokens).toEqual([]);
    await history.redo();
    await history.redo();
    expect(positions()).toEqual([[100, 8, 8]]);
  });

  it('volta ao que está gravado se a gravação falhar', async () => {
    vi.spyOn(repo, 'saveKeyframe').mockRejectedValueOnce(new Error('offline'));
    await expect(store.placeEntity(entityId, { x: 1, y: 1 }, 100)).rejects.toThrow('offline');
    expect(store.tokenOfEntity(entityId)).toBeNull();
    expect((await saved()).tokens).toEqual([]);
    expect(history.canUndo()).toBe(false);
  });
});

describe('MapStore (anotações)', () => {
  let teardown: () => Promise<void>;
  let store: InstanceType<typeof MapStore>;
  let history: InstanceType<typeof HistoryStore>;
  let repo: MapRepository;
  let map: WorldMap;
  const pin = { kind: 'pin', at: { x: 10, y: 20 }, color: '#a33a2a', icon: 'castle' } as const;
  const saved = async () => (await repo.getScene(map.id))?.annotations ?? [];

  beforeEach(async () => {
    ({ teardown } = await setUpLocalTestBed([MapStore, HistoryStore]));
    const world = await TestBed.inject(WorldRepository).create(
      { id: crypto.randomUUID(), name: 'Eldoria' },
      DEFAULT_CALENDAR,
    );
    repo = TestBed.inject(MapRepository);
    map = await repo.create({
      id: crypto.randomUUID(),
      worldId: world.id,
      name: 'Continente',
      width: 1000,
      height: 800,
    });
    store = TestBed.inject(MapStore);
    history = TestBed.inject(HistoryStore);
    await store.load(map, null);
  });

  afterEach(() => teardown());

  it('cria um pino e grava geometria e estilo', async () => {
    const created = await store.addAnnotation(pin, { title: 'Forte' });
    expect(store.scene()?.annotations).toEqual([expect.objectContaining({ id: created.id })]);
    expect(await saved()).toEqual([
      expect.objectContaining({
        kind: 'pin',
        title: 'Forte',
        geometry: { x: 10, y: 20 },
        style: { color: '#a33a2a', icon: 'castle' },
        tickStart: null,
        tickEnd: null,
      }),
    ]);
  });

  it('edita várias vezes seguidas, acompanhando a versão gravada', async () => {
    const created = await store.addAnnotation(pin);
    await store.updateAnnotation(created.id, { title: 'Torre' });
    await store.updateAnnotation(created.id, { tickStart: 300, tickEnd: 450 });
    expect(await saved()).toEqual([
      expect.objectContaining({ title: 'Torre', tickStart: 300, tickEnd: 450, version: 3 }),
    ]);
    expect(store.scene()?.annotations[0]?.version).toBe(3);
  });

  it('recusa validade que termina antes de começar', async () => {
    const created = await store.addAnnotation(pin);
    await expect(
      store.updateAnnotation(created.id, { tickStart: 500, tickEnd: 100 }),
    ).rejects.toThrow();
    expect(store.scene()?.annotations[0]?.tickStart).toBeNull();
  });

  it('desfaz e refaz edição e remoção, também no repositório', async () => {
    const created = await store.addAnnotation(pin);
    await store.updateAnnotation(created.id, { title: 'Torre' });
    await store.removeAnnotations([created.id], 'erase');
    expect(await saved()).toEqual([]);

    expect(await history.undo()).toBe('erase');
    expect(await saved()).toEqual([expect.objectContaining({ title: 'Torre' })]);
    expect(await history.undo()).toBe('editAnnotation');
    expect((await saved())[0]?.title).toBeNull();
    expect(await history.undo()).toBe('addPin');
    expect(await saved()).toEqual([]);

    await history.redo();
    await history.redo();
    expect(await saved()).toEqual([expect.objectContaining({ title: 'Torre' })]);
    expect(store.scene()?.annotations[0]?.title).toBe('Torre');
  });

  it('não grava edição que não muda nada', async () => {
    const created = await store.addAnnotation(pin);
    await store.updateAnnotation(created.id, { title: null });
    expect(history.past()).toHaveLength(1);
  });

  it('volta ao que está gravado se a gravação falhar', async () => {
    vi.spyOn(repo, 'createAnnotation').mockRejectedValueOnce(new Error('offline'));
    await expect(store.addAnnotation(pin)).rejects.toThrow('offline');
    expect(store.scene()?.annotations).toEqual([]);
    expect(history.canUndo()).toBe(false);
  });
});

describe('MapStore (versões da imagem)', () => {
  let teardown: () => Promise<void>;
  let store: InstanceType<typeof MapStore>;
  let map: WorldMap;
  const originalUrl = URL.createObjectURL;

  const processed = (): ProcessedMapImage => ({
    image: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' }),
    thumbnail: new Blob([new Uint8Array([4])], { type: 'image/webp' }),
    bitmap: { width: 1000, height: 800, close: () => undefined } as ImageBitmap,
    width: 1000,
    height: 800,
    originalWidth: 1000,
    originalHeight: 800,
    reduced: false,
  });

  beforeEach(async () => {
    // O jsdom não tem object URLs.
    URL.createObjectURL = () => `blob:test/${crypto.randomUUID()}`;
    ({ teardown } = await setUpLocalTestBed([MapStore, HistoryStore]));
    const world = await TestBed.inject(WorldRepository).create(
      { id: crypto.randomUUID(), name: 'Eldoria' },
      DEFAULT_CALENDAR,
    );
    map = await TestBed.inject(MapRepository).create({
      id: crypto.randomUUID(),
      worldId: world.id,
      name: 'Continente',
      width: 1000,
      height: 800,
    });
    store = TestBed.inject(MapStore);
    await store.load(map, null);
  });

  afterEach(async () => {
    URL.createObjectURL = originalUrl;
    await teardown();
  });

  it('cria versões em ordem de data, com a URL da imagem', async () => {
    const late = await store.addImageVersion(processed(), 900);
    const early = await store.addImageVersion(processed(), 300);

    expect(store.imageVersionInputs()).toEqual([
      { id: early.id, tickStart: 300, url: expect.stringMatching(/^blob:/) },
      { id: late.id, tickStart: 900, url: expect.stringMatching(/^blob:/) },
    ]);
    const scene = await TestBed.inject(MapRepository).getScene(map.id);
    expect(scene?.imageVersions.map((v) => v.tickStart)).toEqual([300, 900]);
  });

  it('não grava duas versões na mesma data e apaga o arquivo enviado', async () => {
    await store.addImageVersion(processed(), 300);
    await expect(store.addImageVersion(processed(), 300)).rejects.toMatchObject({
      code: 'conflict',
    });
    expect(store.scene()?.imageVersions).toHaveLength(1);
  });

  it('muda a data, troca a imagem, remove e restaura', async () => {
    const version = await store.addImageVersion(processed(), 300);
    const firstUrl = store.imageVersionInputs()[0]?.url;

    await store.moveImageVersion(version.id, 500);
    expect(store.imageVersionInputs()[0]?.tickStart).toBe(500);

    await store.replaceImageVersion(version.id, processed());
    const replaced = store.scene()?.imageVersions[0];
    expect(replaced?.imageAssetId).not.toBe(version.imageAssetId);
    expect(store.imageVersionInputs()[0]?.url).not.toBe(firstUrl);
    expect(await TestBed.inject(AssetRepository).get(version.imageAssetId ?? '')).toBeNull();

    await store.removeImageVersion(version.id);
    expect(store.imageVersionInputs()).toEqual([]);
    await store.restoreImageVersion(version.id);
    expect(store.imageVersionInputs()).toEqual([expect.objectContaining({ tickStart: 500 })]);
  });
});
