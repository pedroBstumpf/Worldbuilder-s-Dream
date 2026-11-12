import { TestBed } from '@angular/core/testing';
import { setUpLocalTestBed } from '@data/local/testing/local-test-bed';
import { Calendar } from '@domain/calendar/calendar';
import { DEFAULT_CALENDAR } from '@domain/calendar/default-calendar';
import type { World } from '@domain/models';
import { WorldRepository } from '@domain/ports';
import { MapStore } from './map.store';
import { TimelineStore } from './timeline.store';
import { WorldStore } from './world.store';

const calendar = new Calendar(DEFAULT_CALENDAR);
const YEAR = calendar.add('year', 1, 0);
const yearStart = (year: number) =>
  calendar.fromDate({ year, monthIndex: 0, day: 1, hour: 0, minute: 0 });

describe('TimelineStore', () => {
  let teardown: () => Promise<void>;
  let world: World;
  let worldStore: InstanceType<typeof WorldStore>;
  let timeline: InstanceType<typeof TimelineStore>;

  beforeEach(async () => {
    ({ teardown } = await setUpLocalTestBed([WorldStore, MapStore, TimelineStore]));
    world = await TestBed.inject(WorldRepository).create(
      { id: crypto.randomUUID(), name: 'Eldoria', timeStart: 0, timeEnd: YEAR * 100 },
      DEFAULT_CALENDAR,
    );
    worldStore = TestBed.inject(WorldStore);
    await worldStore.load(world.id, null);
    timeline = TestBed.inject(TimelineStore);
  });

  afterEach(() => teardown());

  it('começa no ?t=, no "agora da narrativa" ou no início do mundo', () => {
    timeline.init(YEAR * 3, YEAR * 7);
    expect(timeline.currentTick()).toBe(YEAR * 3);
    timeline.init(null, YEAR * 7);
    expect(timeline.currentTick()).toBe(YEAR * 7);
    timeline.init(null, null);
    expect(timeline.currentTick()).toBe(0);
    timeline.init(-YEAR, null);
    expect(timeline.currentTick()).toBe(0);
  });

  it('mostra o mundo inteiro e formata a data na precisão do zoom', () => {
    timeline.init(yearStart(4), null);
    timeline.setWidth(1000);
    expect(timeline.precision()).toBe('year');
    expect(timeline.label()).toBe('5 EC');
    timeline.zoom(0.001);
    expect(timeline.precision()).toBe('day');
    expect(timeline.label()).toBe('1 de Janeiro de 5 EC');
  });

  it('dá passos pela precisão e revela o cursor', () => {
    timeline.init(YEAR * 4, null);
    timeline.setWidth(1000);
    timeline.step(1);
    expect(timeline.label()).toBe('6 EC');
    timeline.step(1, true);
    expect(timeline.label()).toBe('16 EC');
    timeline.step(-1);
    expect(timeline.label()).toBe('15 EC');
  });

  it('avança no play e para no fim (ou volta ao início com repetição)', () => {
    timeline.init(YEAR * 99, null);
    timeline.setSpeed('year');
    timeline.advance(50);
    expect(timeline.currentTick()).toBe(YEAR * 99 + Math.round(1440 * 365.25 * 0.05));
    timeline.advance(100);
    timeline.advance(100);
    timeline.advance(100);
    timeline.advance(100);
    timeline.advance(100);
    timeline.advance(100);
    timeline.advance(100);
    timeline.advance(100);
    timeline.advance(100);
    timeline.advance(100);
    expect(timeline.currentTick()).toBe(YEAR * 100);
    expect(timeline.isPlaying()).toBe(false);

    timeline.setLoop(true);
    timeline.advance(100);
    expect(timeline.currentTick()).toBe(0);
  });

  it('pausa e retoma; o play no fim recomeça do início', () => {
    timeline.init(YEAR * 100, null);
    timeline.play();
    expect(timeline.isPlaying()).toBe(true);
    expect(timeline.currentTick()).toBe(0);
    timeline.toggle();
    expect(timeline.isPlaying()).toBe(false);
  });

  it('acompanha a mudança da faixa do mundo', async () => {
    timeline.init(YEAR * 90, null);
    await worldStore.updateTime({ timeEnd: YEAR * 50 });
    timeline.syncRange();
    expect(timeline.currentTick()).toBe(YEAR * 50);
    expect(timeline.view().end).toBeLessThanOrEqual(YEAR * 60);
  });

  it('dá zoom em torno do ponto pedido e desloca a faixa', () => {
    timeline.init(0, null);
    timeline.zoom(0.1, YEAR * 50);
    const view = timeline.view();
    expect(view.end - view.start).toBe(Math.round(YEAR * 120 * 0.1));
    timeline.pan(YEAR);
    expect(timeline.view().start).toBe(view.start + YEAR);
    timeline.showAll();
    expect(timeline.view().end - timeline.view().start).toBe(YEAR * 120);
  });
});
