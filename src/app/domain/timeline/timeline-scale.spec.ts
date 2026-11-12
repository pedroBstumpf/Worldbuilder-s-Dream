import { Calendar } from '../calendar/calendar';
import { DEFAULT_CALENDAR } from '../calendar/default-calendar';
import {
  clampTick,
  clampView,
  eraMarks,
  eventWindow,
  fullView,
  isEventActive,
  maxViewSpan,
  minViewSpan,
  panView,
  precisionFor,
  revealTick,
  rulerMarks,
  rulerStep,
  snapTick,
  stepTick,
  tickToX,
  ticksPerSecond,
  unitLength,
  xToTick,
  zoomView,
} from './timeline-scale';

const calendar = new Calendar(DEFAULT_CALENDAR);
const DAY = 1440;
const YEAR = calendar.add('year', 1, 0);
const range = { start: 0, end: YEAR * 100 };

function tickOf(year: number, monthIndex = 0, day = 1, hour = 0): number {
  return calendar.fromDate({ year, monthIndex, day, hour, minute: 0 });
}

describe('timeline-scale', () => {
  it('converte tick ⇄ x na faixa visível', () => {
    const view = { start: 1000, end: 2000 };
    expect(tickToX(1500, view, 200)).toBe(100);
    expect(xToTick(100, view, 200)).toBe(1500);
    expect(xToTick(0, view, 200)).toBe(1000);
  });

  it('limita o tick à faixa do mundo e arredonda', () => {
    expect(clampTick(-5, range)).toBe(0);
    expect(clampTick(range.end + 10, range)).toBe(range.end);
    expect(clampTick(10.6, range)).toBe(11);
  });

  it('não deixa a faixa visível menor que uma hora nem maior que o mundo com folga', () => {
    expect(clampView({ start: 0, end: 5 }, range, calendar).end).toBe(minViewSpan(calendar));
    const huge = clampView({ start: -YEAR * 1000, end: YEAR * 1000 }, range, calendar);
    expect(huge.end - huge.start).toBe(maxViewSpan(range, calendar));
    expect(huge.start).toBe(-YEAR * 10);
  });

  it('dá zoom mantendo o ponto sob o ponteiro', () => {
    const view = { start: 0, end: YEAR * 10 };
    const anchor = YEAR * 5;
    const zoomed = zoomView(view, 0.5, anchor, range, calendar);
    expect(zoomed.end - zoomed.start).toBe(YEAR * 5);
    expect(tickToX(anchor, zoomed, 100)).toBeCloseTo(50, 5);
  });

  it('desloca sem sair da folga do mundo', () => {
    const view = { start: 0, end: YEAR * 10 };
    expect(panView(view, YEAR, range, calendar)).toEqual({ start: YEAR, end: YEAR * 11 });
    const far = panView(view, -YEAR * 500, range, calendar);
    expect(far.start).toBe(-YEAR * 10);
  });

  it('mostra o mundo inteiro e revela um tick fora da faixa', () => {
    const full = fullView(range, calendar);
    expect(full.start).toBeLessThan(range.start);
    expect(full.end).toBeGreaterThan(range.end);
    const view = { start: 0, end: YEAR };
    const revealed = revealTick(view, YEAR * 3, range, calendar);
    expect(revealed.end - revealed.start).toBe(YEAR);
    expect(YEAR * 3).toBeGreaterThanOrEqual(revealed.start);
    expect(YEAR * 3).toBeLessThanOrEqual(revealed.end);
    expect(revealTick(view, YEAR / 2, range, calendar)).toBe(view);
  });

  it('calcula a duração média das unidades', () => {
    expect(unitLength(calendar, 'day')).toBe(DAY);
    expect(unitLength(calendar, 'year')).toBe(DAY * 365.25);
    expect(unitLength(calendar, 'month')).toBe((DAY * 365.25) / 12);
  });

  it('escolhe a precisão pelo zoom', () => {
    expect(precisionFor(calendar, 1)).toBe('hour');
    expect(precisionFor(calendar, 0.1)).toBe('minute');
    expect(precisionFor(calendar, DAY / 10)).toBe('day');
    expect(precisionFor(calendar, DAY * 3)).toBe('month');
    expect(precisionFor(calendar, DAY * 100)).toBe('year');
    expect(precisionFor(calendar, DAY * 100_000)).toBe('year');
  });

  it('dá passos de uma unidade (Shift: dez) a partir de datas redondas', () => {
    const mid = tickOf(10, 2, 15);
    expect(stepTick(calendar, mid, 'month', 1)).toBe(tickOf(10, 3));
    expect(stepTick(calendar, mid, 'month', -1)).toBe(tickOf(10, 2));
    expect(stepTick(calendar, tickOf(10, 2), 'month', -1)).toBe(tickOf(10, 1));
    expect(stepTick(calendar, tickOf(10), 'year', 1, true)).toBe(tickOf(20));
    expect(stepTick(calendar, 7, 'minute', -1)).toBe(6);
  });

  it('arredonda ao início da unidade', () => {
    expect(snapTick(calendar, tickOf(3, 4, 9, 13) + 17, 'day')).toBe(tickOf(3, 4, 9));
  });

  it('converte velocidades em ticks por segundo', () => {
    expect(ticksPerSecond(calendar, 'day')).toBe(DAY);
    expect(ticksPerSecond(calendar, 'decade')).toBe(DAY * 365.25 * 10);
  });

  it('escolhe o passo da régua pelo espaço disponível', () => {
    expect(rulerStep(calendar, DAY / 100)).toEqual({ unit: 'day', step: 1 });
    expect(rulerStep(calendar, DAY)).toEqual({ unit: 'month', step: 3 });
    expect(rulerStep(calendar, (DAY * 365.25) / 10)).toEqual({ unit: 'year', step: 10 });
  });

  it('alinha as marcas de ano ao ano exibido na era', () => {
    const view = { start: tickOf(-30), end: tickOf(30) };
    const marks = rulerMarks(calendar, view, 600);
    const labels = marks.map((mark) => mark.label);
    expect(labels).toContain('20 EC');
    expect(labels).toContain('10 EC');
    expect(labels).toContain('10 AEC');
    expect(labels).not.toContain('1 EC');
    expect(marks.every((mark) => mark.tick >= view.start && mark.tick <= view.end)).toBe(true);
  });

  it('gera marcas de mês e destaca o começo do ano', () => {
    const view = { start: tickOf(5, 10), end: tickOf(6, 3) };
    const marks = rulerMarks(calendar, view, 500);
    expect(marks.map((mark) => mark.label)).toEqual([
      'Novembro',
      'Dezembro',
      '7 EC',
      'Fevereiro',
      'Março',
      'Abril',
    ]);
    expect(marks.find((mark) => mark.label === '7 EC')?.major).toBe(true);
  });

  it('gera marcas de dia e de hora', () => {
    const days = rulerMarks(calendar, { start: tickOf(1, 0, 30), end: tickOf(1, 1, 2) }, 300);
    expect(days.map((mark) => mark.label)).toEqual(['30', '31', 'Fevereiro de 2 EC', '2']);
    const hours = rulerMarks(
      calendar,
      { start: tickOf(1, 0, 1, 22), end: tickOf(1, 0, 2, 1) },
      300,
    );
    expect(hours.map((mark) => mark.label)).toEqual(['22h', '23h', '2 de Janeiro de 2 EC', '01h']);
  });

  it('marca o início das eras seguintes', () => {
    expect(eraMarks(calendar)).toEqual([{ tick: 0, name: 'Era Comum', abbr: 'EC' }]);
  });

  it('considera ativo o evento entre o início e o fim, com a janela no fim', () => {
    const point = { tickStart: 100, tickEnd: null };
    expect(isEventActive(point, 99, 10)).toBe(false);
    expect(isEventActive(point, 105, 10)).toBe(true);
    expect(isEventActive(point, 111, 10)).toBe(false);
    expect(isEventActive({ tickStart: 100, tickEnd: 500 }, 300, 0)).toBe(true);
  });

  it('usa pelo menos um dia de janela para eventos pontuais', () => {
    expect(eventWindow(calendar, { start: 0, end: 1000 }, 1000)).toBe(DAY);
    expect(eventWindow(calendar, { start: 0, end: YEAR * 100 }, 1000)).toBe(
      Math.round((YEAR * 100 * 8) / 1000),
    );
  });
});
