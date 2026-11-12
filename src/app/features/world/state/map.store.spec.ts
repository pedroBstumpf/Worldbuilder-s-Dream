import { TestBed } from '@angular/core/testing';
import { setUpLocalTestBed } from '@data/local/testing/local-test-bed';
import { DEFAULT_CALENDAR } from '@domain/calendar/default-calendar';
import type { WorldMap } from '@domain/models';
import { EventRepository, MapRepository, WorldRepository } from '@domain/ports';
import { MapStore } from './map.store';

describe('MapStore (eventos no mapa)', () => {
  let teardown: () => Promise<void>;
  let store: InstanceType<typeof MapStore>;
  let map: WorldMap;
  let eventId: string;

  beforeEach(async () => {
    ({ teardown } = await setUpLocalTestBed([MapStore]));
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
});
