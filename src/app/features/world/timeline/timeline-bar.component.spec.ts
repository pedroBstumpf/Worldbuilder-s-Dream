import { TestBed } from '@angular/core/testing';
import { setUpLocalTestBed } from '@data/local/testing/local-test-bed';
import { Calendar } from '@domain/calendar/calendar';
import { DEFAULT_CALENDAR } from '@domain/calendar/default-calendar';
import { WorldRepository } from '@domain/ports';
import { MapStore } from '../state/map.store';
import { TimelineStore } from '../state/timeline.store';
import { WorldStore } from '../state/world.store';
import { TimelineBarComponent, type TimelineEventMark } from './timeline-bar.component';

const calendar = new Calendar(DEFAULT_CALENDAR);
const yearStart = (year: number) =>
  calendar.fromDate({ year, monthIndex: 0, day: 1, hour: 0, minute: 0 });

describe('TimelineBarComponent', () => {
  let teardown: () => Promise<void>;

  beforeEach(async () => {
    ({ teardown } = await setUpLocalTestBed([WorldStore, MapStore, TimelineStore]));
    const world = await TestBed.inject(WorldRepository).create(
      { id: crypto.randomUUID(), name: 'Eldoria', timeStart: 0, timeEnd: yearStart(100) },
      DEFAULT_CALENDAR,
    );
    await TestBed.inject(WorldStore).load(world.id, null);
    TestBed.inject(TimelineStore).init(yearStart(4), null);
  });

  afterEach(() => teardown());

  async function render(events: TimelineEventMark[] = []) {
    const fixture = TestBed.createComponent(TimelineBarComponent);
    fixture.componentRef.setInput('events', events);
    await fixture.whenStable();
    const slider = fixture.nativeElement.querySelector('[role="slider"]') as HTMLElement;
    return { fixture, slider };
  }

  function press(slider: HTMLElement, key: string, shiftKey = false) {
    slider.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }));
  }

  it('expõe o cursor como slider com a data formatada', async () => {
    const { slider } = await render();
    expect(slider.getAttribute('aria-label')).toBe('Instante atual');
    expect(slider.getAttribute('aria-valuetext')).toBe('5 EC');
    expect(slider.getAttribute('aria-valuemin')).toBe('0');
    expect(slider.getAttribute('aria-valuemax')).toBe(String(yearStart(100)));
  });

  it('muda a data pelo teclado e vai aos eventos com Page Up/Down', async () => {
    const event = {
      id: crypto.randomUUID(),
      title: 'Coroação',
      tickStart: yearStart(30),
      tickEnd: null,
      color: null,
    };
    const { fixture, slider } = await render([event]);
    const timeline = TestBed.inject(TimelineStore);
    press(slider, 'ArrowRight');
    expect(timeline.label()).toBe('6 EC');
    press(slider, 'ArrowRight', true);
    expect(timeline.label()).toBe('16 EC');
    press(slider, 'PageDown');
    expect(timeline.currentTick()).toBe(yearStart(30));
    await fixture.whenStable();
    expect(slider.getAttribute('aria-valuetext')).toContain('Eventos: Coroação');
    press(slider, 'Home');
    expect(timeline.currentTick()).toBe(0);
    press(slider, 'End');
    expect(timeline.currentTick()).toBe(yearStart(100));
  });

  it('reproduz e pausa pelo botão', async () => {
    const { fixture } = await render();
    const play = fixture.nativeElement.querySelector(
      'button[aria-label="Reproduzir"]',
    ) as HTMLButtonElement;
    play.click();
    expect(TestBed.inject(TimelineStore).isPlaying()).toBe(true);
    await fixture.whenStable();
    (
      fixture.nativeElement.querySelector('button[aria-label="Pausar"]') as HTMLButtonElement
    ).click();
    expect(TestBed.inject(TimelineStore).isPlaying()).toBe(false);
  });

  it('troca a velocidade em ciclo', async () => {
    const { fixture } = await render();
    const speed = fixture.nativeElement.querySelector('.speed') as HTMLButtonElement;
    expect(speed.textContent?.trim()).toBe('1 ano/s');
    speed.click();
    await fixture.whenStable();
    expect(speed.textContent?.trim()).toBe('10 anos/s');
    speed.click();
    await fixture.whenStable();
    expect(speed.textContent?.trim()).toBe('1 dia/s');
  });
});
