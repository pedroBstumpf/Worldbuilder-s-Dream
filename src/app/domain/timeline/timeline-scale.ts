import type { Calendar } from '../calendar/calendar';
import type { CalendarUnit } from '../calendar/calendar-definition';
import type { Tick } from '../models/common';

/**
 * Escala da linha do tempo (docs/06 §7): conversão tick ⇄ pixel, zoom e pan da faixa
 * visível, precisão adaptada ao zoom e as marcas da régua no calendário do mundo.
 * Funções puras; o componente só desenha.
 */

/** Faixa visível do trilho (`end > start`). */
export interface TimelineView {
  readonly start: Tick;
  readonly end: Tick;
}

/** Faixa do mundo (`worlds.time_start`/`time_end`). */
export interface TimeRange {
  readonly start: Tick;
  readonly end: Tick;
}

/** Marca da régua. `major` destaca o início da unidade maior (ano, mês, dia). */
export interface RulerMark {
  readonly tick: Tick;
  readonly label: string;
  readonly major: boolean;
}

/** Início de uma era (losango rotulado no trilho). */
export interface EraMark {
  readonly tick: Tick;
  readonly name: string;
  readonly abbr: string;
}

/** Menor faixa visível: uma hora do calendário. */
export function minViewSpan(calendar: Calendar): number {
  return calendar.minutesPerHour;
}

/** Zoom máximo para fora: a faixa do mundo com folga de 10% de cada lado. */
export function maxViewSpan(range: TimeRange, calendar: Calendar): number {
  return Math.max(Math.round((range.end - range.start) * 1.2), minViewSpan(calendar) * 2);
}

export function clampTick(tick: Tick, range: TimeRange): Tick {
  return Math.min(range.end, Math.max(range.start, Math.round(tick)));
}

export function tickToX(tick: Tick, view: TimelineView, width: number): number {
  return ((tick - view.start) / (view.end - view.start)) * width;
}

export function xToTick(x: number, view: TimelineView, width: number): Tick {
  return Math.round(view.start + (x / Math.max(width, 1)) * (view.end - view.start));
}

/**
 * Mantém a faixa dentro dos limites: tamanho entre `minSpan` e `maxSpan` e sem sair
 * da folga em torno da faixa do mundo.
 */
export function clampView(view: TimelineView, range: TimeRange, calendar: Calendar): TimelineView {
  const maxSpan = maxViewSpan(range, calendar);
  const span = Math.min(maxSpan, Math.max(minViewSpan(calendar), view.end - view.start));
  const margin = Math.round((maxSpan - (range.end - range.start)) / 2);
  const lowest = range.start - margin;
  const highest = range.end + margin;
  let start = Math.round(view.start);
  if (start + span > highest) start = highest - span;
  if (start < lowest) start = lowest;
  return { start, end: start + span };
}

/** Zoom em torno de `anchor` (fica no mesmo lugar da tela). `factor > 1` afasta. */
export function zoomView(
  view: TimelineView,
  factor: number,
  anchor: Tick,
  range: TimeRange,
  calendar: Calendar,
): TimelineView {
  const span = view.end - view.start;
  const next = Math.min(
    maxViewSpan(range, calendar),
    Math.max(minViewSpan(calendar), Math.round(span * factor)),
  );
  const ratio = (anchor - view.start) / span;
  const start = Math.round(anchor - ratio * next);
  return clampView({ start, end: start + next }, range, calendar);
}

export function panView(
  view: TimelineView,
  delta: number,
  range: TimeRange,
  calendar: Calendar,
): TimelineView {
  return clampView({ start: view.start + delta, end: view.end + delta }, range, calendar);
}

/** Faixa que mostra a faixa do mundo inteira. */
export function fullView(range: TimeRange, calendar: Calendar): TimelineView {
  const span = maxViewSpan(range, calendar);
  const start = Math.round((range.start + range.end - span) / 2);
  return clampView({ start, end: start + span }, range, calendar);
}

/** Desloca a faixa (sem mudar o zoom) para que `tick` fique visível. */
export function revealTick(
  view: TimelineView,
  tick: Tick,
  range: TimeRange,
  calendar: Calendar,
): TimelineView {
  if (tick >= view.start && tick <= view.end) return view;
  const span = view.end - view.start;
  const start = tick < view.start ? tick - Math.round(span * 0.9) : tick - Math.round(span * 0.1);
  return clampView({ start, end: start + span }, range, calendar);
}

/** Duração aproximada de cada unidade, em ticks (meses e anos pela média com bissextos). */
export function unitLength(calendar: Calendar, unit: CalendarUnit): number {
  const definition = calendar.definition;
  const leap = definition.leap ? definition.leap.extraDays / definition.leap.everyYears : 0;
  const yearDays = definition.months.reduce((sum, m) => sum + m.days, 0) + leap;
  switch (unit) {
    case 'minute':
      return 1;
    case 'hour':
      return calendar.minutesPerHour;
    case 'day':
      return calendar.minutesPerDay;
    case 'month':
      return (calendar.minutesPerDay * yearDays) / calendar.monthCount;
    case 'year':
      return calendar.minutesPerDay * yearDays;
  }
}

const UNITS_UP: readonly CalendarUnit[] = ['minute', 'hour', 'day', 'month', 'year'];

/** Largura mínima de uma unidade na tela para ela ser a precisão do cursor. */
const PRECISION_MIN_PX = 6;

/**
 * Precisão do cursor e da etiqueta de data: a menor unidade que ocupa pelo menos
 * alguns pixels no zoom atual (minuto → hora → dia → mês → ano).
 */
export function precisionFor(calendar: Calendar, ticksPerPixel: number): CalendarUnit {
  for (const unit of UNITS_UP) {
    if (unitLength(calendar, unit) / ticksPerPixel >= PRECISION_MIN_PX) return unit;
  }
  return 'year';
}

/** Passo do teclado: uma unidade da precisão (Shift: dez). */
export function stepTick(
  calendar: Calendar,
  tick: Tick,
  unit: CalendarUnit,
  direction: 1 | -1,
  big = false,
): Tick {
  const n = direction * (big ? 10 : 1);
  // Na precisão de mês ou ano, o passo parte do início da unidade (datas "redondas").
  const base = unit === 'minute' ? tick : calendar.startOf(unit, tick);
  if (base !== tick && direction === -1) return calendar.add(unit, n + 1, base);
  return calendar.add(unit, n, base);
}

/** Arredonda ao início da unidade (snap ao arrastar o cursor e ao criar eventos). */
export function snapTick(calendar: Calendar, tick: Tick, unit: CalendarUnit): Tick {
  return calendar.startOf(unit, tick);
}

/** Velocidades do play (docs/06 §7): unidades do mundo por segundo real. */
export type PlaySpeed = 'day' | 'month' | 'year' | 'decade';
export const PLAY_SPEEDS: readonly PlaySpeed[] = ['day', 'month', 'year', 'decade'];

export function ticksPerSecond(calendar: Calendar, speed: PlaySpeed): number {
  return speed === 'decade' ? unitLength(calendar, 'year') * 10 : unitLength(calendar, speed);
}

/** Espaço mínimo entre marcas da régua, em px (cabe o rótulo). */
const MARK_MIN_PX = 84;
/** Limite de marcas geradas (proteção contra faixas enormes). */
const MAX_MARKS = 400;

const STEPS: Record<CalendarUnit, readonly number[]> = {
  minute: [1, 5, 10, 15, 30],
  hour: [1, 2, 3, 6, 12],
  day: [1, 2, 5, 10],
  month: [1, 2, 3, 6],
  year: [1, 2, 5],
};

/** Unidade e passo da régua: o menor passo cujas marcas ficam a `MARK_MIN_PX` uma da outra. */
export function rulerStep(
  calendar: Calendar,
  ticksPerPixel: number,
): { unit: CalendarUnit; step: number } {
  for (const unit of UNITS_UP) {
    if (unit === 'year') break;
    for (const step of STEPS[unit]) {
      if ((unitLength(calendar, unit) * step) / ticksPerPixel >= MARK_MIN_PX) return { unit, step };
    }
  }
  const yearPx = unitLength(calendar, 'year') / ticksPerPixel;
  let magnitude = 1;
  for (;;) {
    for (const step of STEPS.year) {
      if (yearPx * step * magnitude >= MARK_MIN_PX) return { unit: 'year', step: step * magnitude };
    }
    magnitude *= 10;
  }
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Marcas da régua na faixa visível, alinhadas a datas "redondas" do calendário. */
export function rulerMarks(calendar: Calendar, view: TimelineView, width: number): RulerMark[] {
  const ticksPerPixel = (view.end - view.start) / Math.max(width, 1);
  const { unit, step } = rulerStep(calendar, ticksPerPixel);
  if (unit === 'year') return yearMarks(calendar, view, step);
  const marks: RulerMark[] = [];
  let tick = calendar.startOf(unit, view.start);
  for (let guard = 0; tick <= view.end && guard < MAX_MARKS * step; guard++) {
    const date = calendar.toDate(tick);
    if (tick >= view.start) {
      const mark = smallUnitMark(calendar, tick, unit, step, date);
      if (mark) marks.push(mark);
    }
    tick = calendar.add(unit, 1, tick);
  }
  return marks;
}

function smallUnitMark(
  calendar: Calendar,
  tick: Tick,
  unit: Exclude<CalendarUnit, 'year'>,
  step: number,
  date: ReturnType<Calendar['toDate']>,
): RulerMark | null {
  switch (unit) {
    case 'month':
      if (date.monthIndex % step !== 0) return null;
      return date.monthIndex === 0
        ? { tick, label: calendar.format(tick, 'year'), major: true }
        : { tick, label: calendar.definition.months[date.monthIndex]?.name ?? '', major: false };
    case 'day':
      if ((date.day - 1) % step !== 0) return null;
      return date.day === 1
        ? { tick, label: calendar.format(tick, 'month'), major: true }
        : { tick, label: String(date.day), major: false };
    case 'hour':
      if (date.hour % step !== 0) return null;
      return date.hour === 0
        ? { tick, label: calendar.format(tick, 'day'), major: true }
        : { tick, label: `${pad2(date.hour)}h`, major: false };
    case 'minute':
      if (date.minute % step !== 0) return null;
      return {
        tick,
        label: `${pad2(date.hour)}:${pad2(date.minute)}`,
        major: date.minute === 0,
      };
  }
}

/**
 * Marcas de ano em múltiplos de `step` **do ano exibido na era** (10 EC, 20 EC…), não
 * do ano astronômico. Numa era regressiva ("a.C."), a contagem desce com o tempo.
 */
function yearMarks(calendar: Calendar, view: TimelineView, step: number): RulerMark[] {
  const eras = calendar.definition.eras;
  const firstYear = calendar.toDate(view.start).year;
  const lastYear = calendar.toDate(view.end).year;
  const marks: RulerMark[] = [];
  const bigStep = step * 10;
  eras.forEach((era, index) => {
    const segmentStart = index === 0 ? -Infinity : era.startYear;
    const segmentEnd = (eras[index + 1]?.startYear ?? Infinity) - 1;
    const low = Math.max(firstYear, segmentStart);
    const high = Math.min(lastYear, segmentEnd);
    if (low > high) return;
    const backward = era.direction === 'backward';
    const eraYear = calendar.toDate(yearStart(calendar, low)).eraYear;
    const offset = backward ? mod(eraYear, step) : mod(-eraYear, step);
    for (let year = low + offset; year <= high && marks.length < MAX_MARKS; year += step) {
      const tick = yearStart(calendar, year);
      if (tick < view.start || tick > view.end) continue;
      const shown = calendar.toDate(tick).eraYear;
      marks.push({ tick, label: calendar.format(tick, 'year'), major: shown % bigStep === 0 });
    }
  });
  return marks;
}

function yearStart(calendar: Calendar, year: number): Tick {
  return calendar.fromDate({ year, monthIndex: 0, day: 1, hour: 0, minute: 0 });
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

/** Início de cada era depois da primeira (a primeira cobre também o passado). */
export function eraMarks(calendar: Calendar): EraMark[] {
  return calendar.definition.eras.slice(1).map((era) => ({
    tick: yearStart(calendar, era.startYear),
    name: era.name,
    abbr: era.abbr,
  }));
}

/**
 * Janela em que um evento aparece no instante `t` (docs/06 §4): da data de início ao fim
 * (ou ao próprio início, se pontual), estendida por `window` ticks para que um evento
 * pontual fique visível enquanto o cursor passa por ele.
 */
export function isEventActive(
  event: { readonly tickStart: Tick; readonly tickEnd: Tick | null },
  t: Tick,
  window: number,
): boolean {
  return t >= event.tickStart && t <= (event.tickEnd ?? event.tickStart) + window;
}

/** Janela dos eventos pontuais: ~8 px do trilho, nunca menos de um dia. */
export function eventWindow(calendar: Calendar, view: TimelineView, width: number): number {
  const ticksPerPixel = (view.end - view.start) / Math.max(width, 1);
  return Math.max(calendar.minutesPerDay, Math.round(ticksPerPixel * 8));
}
