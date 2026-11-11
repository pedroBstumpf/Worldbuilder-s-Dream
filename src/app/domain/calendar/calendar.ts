import { isTick, type Tick } from '../models/common';
import type {
  CalendarDefinition,
  CalendarEra,
  CalendarPrecision,
  CalendarUnit,
} from './calendar-definition';

/**
 * Data num calendário do mundo. `year` é astronômico: 0 é o ano da época (que contém o tick 0)
 * e negativos vêm antes dela. A numeração exibida ao usuário depende das eras (`eraYear`).
 */
export interface CalendarDate {
  year: number;
  /** 0 = primeiro mês. */
  monthIndex: number;
  /** 1 = primeiro dia do mês. */
  day: number;
  hour: number;
  minute: number;
}

export interface CalendarDateInfo extends CalendarDate {
  /** 1 = primeiro dia do ano. */
  dayOfYear: number;
  /** Nulo quando o calendário não tem dias da semana. O dia da época é o primeiro da lista. */
  weekdayIndex: number | null;
  eraIndex: number;
  /** Ano como exibido na era (sem ano zero). */
  eraYear: number;
}

const DEFAULT_TEMPLATES: Record<
  Exclude<CalendarPrecision, 'day'>,
  (dayFormat: string) => string
> = {
  era: () => '{eraName}',
  year: () => '{year} {era}',
  month: () => '{month} de {year} {era}',
  hour: (day) => `${day}, {hour}h`,
  minute: (day) => `${day}, {hour}:{minute}`,
};

/** Resto sempre não negativo (o `%` do JS acompanha o sinal do dividendo). */
function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

function assertTick(tick: number): void {
  if (!isTick(tick)) {
    throw new RangeError(`Tick inválido: ${tick}. Use um inteiro seguro.`);
  }
}

/**
 * Converte ticks (minutos desde a época) em datas de um calendário do mundo e vice-versa (docs/06).
 * Recebe uma definição já validada (`parseCalendarDefinition`). As contas usam ciclos bissextos,
 * então o custo não cresce com a distância até a época.
 */
export class Calendar {
  readonly minutesPerHour: number;
  readonly minutesPerDay: number;
  readonly monthCount: number;

  private readonly monthDays: number[];
  private readonly commonYearDays: number;
  private readonly leapEvery: number;
  private readonly leapMonth: number;
  private readonly leapDays: number;
  /** Dias de um ciclo bissexto completo (o primeiro ano do ciclo é o bissexto). */
  private readonly cycleDays: number;

  constructor(readonly definition: CalendarDefinition) {
    this.minutesPerHour = definition.minutesPerHour;
    this.minutesPerDay = definition.minutesPerHour * definition.hoursPerDay;
    this.monthDays = definition.months.map((m) => m.days);
    this.monthCount = this.monthDays.length;
    this.commonYearDays = this.monthDays.reduce((sum, d) => sum + d, 0);
    this.leapEvery = definition.leap?.everyYears ?? 1;
    this.leapMonth = definition.leap?.monthIndex ?? -1;
    this.leapDays = definition.leap?.extraDays ?? 0;
    this.cycleDays = this.leapEvery * this.commonYearDays + this.leapDays;
  }

  isLeapYear(year: number): boolean {
    return this.leapDays > 0 && mod(year, this.leapEvery) === 0;
  }

  daysInYear(year: number): number {
    return this.commonYearDays + (this.isLeapYear(year) ? this.leapDays : 0);
  }

  daysInMonth(year: number, monthIndex: number): number {
    const days = this.monthDays[monthIndex];
    if (days === undefined) throw new RangeError(`Mês inexistente: ${monthIndex}.`);
    return days + (monthIndex === this.leapMonth && this.isLeapYear(year) ? this.leapDays : 0);
  }

  /** Converte um tick numa data, com dia da semana e era. */
  toDate(tick: Tick): CalendarDateInfo {
    assertTick(tick);
    const dayIndex = Math.floor(tick / this.minutesPerDay);
    const minuteOfDay = tick - dayIndex * this.minutesPerDay;
    const hour = Math.floor(minuteOfDay / this.minutesPerHour);
    const minute = minuteOfDay - hour * this.minutesPerHour;

    const { year, dayOfYear0 } = this.yearOfDay(dayIndex);
    let rest = dayOfYear0;
    let monthIndex = 0;
    while (rest >= this.daysInMonth(year, monthIndex)) {
      rest -= this.daysInMonth(year, monthIndex);
      monthIndex++;
    }

    const weekdays = this.definition.weekdays.length;
    const eraIndex = this.eraIndexOf(year);
    return {
      year,
      monthIndex,
      day: rest + 1,
      hour,
      minute,
      dayOfYear: dayOfYear0 + 1,
      weekdayIndex: weekdays > 0 ? mod(dayIndex, weekdays) : null,
      eraIndex,
      eraYear: this.eraYearOf(year, eraIndex),
    };
  }

  /** Converte uma data em tick. Recusa partes fora do calendário (ex.: 29 de fevereiro fora de ano bissexto). */
  fromDate(parts: CalendarDate): Tick {
    const { year, monthIndex, day, hour, minute } = parts;
    for (const [name, value] of Object.entries(parts)) {
      if (!Number.isSafeInteger(value)) throw new RangeError(`${name} deve ser inteiro: ${value}.`);
    }
    if (monthIndex < 0 || monthIndex >= this.monthCount) {
      throw new RangeError(`Mês inexistente: ${monthIndex}.`);
    }
    if (day < 1 || day > this.daysInMonth(year, monthIndex)) {
      throw new RangeError(`Dia inexistente: ${day}.`);
    }
    if (hour < 0 || hour >= this.definition.hoursPerDay) {
      throw new RangeError(`Hora inexistente: ${hour}.`);
    }
    if (minute < 0 || minute >= this.minutesPerHour) {
      throw new RangeError(`Minuto inexistente: ${minute}.`);
    }

    let dayIndex = this.yearStartDay(year) + day - 1;
    for (let m = 0; m < monthIndex; m++) dayIndex += this.daysInMonth(year, m);
    const tick = dayIndex * this.minutesPerDay + hour * this.minutesPerHour + minute;
    if (!isTick(tick)) throw new RangeError('Data fora do intervalo suportado.');
    return tick;
  }

  /** Ano astronômico correspondente ao ano exibido numa era (inverso de `eraYear`). */
  yearFromEra(eraIndex: number, eraYear: number): number {
    if (!Number.isSafeInteger(eraYear) || eraYear === 0) {
      throw new RangeError(`Ano de era inválido: ${eraYear}.`);
    }
    const era = this.era(eraIndex);
    if (era.direction === 'backward') {
      return this.era(eraIndex + 1).startYear - eraYear;
    }
    return eraYear > 0 ? era.startYear + eraYear - 1 : era.startYear + eraYear;
  }

  /** Texto da data na precisão pedida, pelos modelos do calendário. */
  format(tick: Tick, precision: CalendarPrecision = 'day'): string {
    const date = this.toDate(tick);
    const era = this.era(date.eraIndex);
    const values: Record<string, string> = {
      day: String(date.day),
      month: this.definition.months[date.monthIndex]?.name ?? '',
      monthNumber: String(date.monthIndex + 1),
      year: String(date.eraYear),
      era: era.abbr,
      eraName: era.name,
      weekday:
        date.weekdayIndex === null ? '' : (this.definition.weekdays[date.weekdayIndex] ?? ''),
      hour: this.pad(date.hour, this.definition.hoursPerDay),
      minute: this.pad(date.minute, this.minutesPerHour),
    };
    return this.template(precision)
      .replace(/\{(\w+)\}/g, (token, key: string) => values[key] ?? token)
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.;:])/g, '$1')
      .trim();
  }

  /** Primeiro tick da unidade que contém `tick`. */
  startOf(unit: CalendarUnit, tick: Tick): Tick {
    assertTick(tick);
    switch (unit) {
      case 'minute':
        return tick;
      case 'hour':
        return Math.floor(tick / this.minutesPerHour) * this.minutesPerHour;
      case 'day':
        return Math.floor(tick / this.minutesPerDay) * this.minutesPerDay;
      case 'month': {
        const { year, monthIndex } = this.toDate(tick);
        return this.fromDate({ year, monthIndex, day: 1, hour: 0, minute: 0 });
      }
      case 'year':
        return this.fromDate({
          year: this.toDate(tick).year,
          monthIndex: 0,
          day: 1,
          hour: 0,
          minute: 0,
        });
    }
  }

  /**
   * Soma `n` unidades a `tick`. Meses e anos preservam dia e hora; se o dia não existir no
   * destino (31 → mês de 30, 29 de fevereiro → ano comum), usa o último dia do mês.
   */
  add(unit: CalendarUnit, n: number, tick: Tick): Tick {
    assertTick(tick);
    if (!Number.isSafeInteger(n)) throw new RangeError(`Quantidade inválida: ${n}.`);
    let result: number;
    switch (unit) {
      case 'minute':
        result = tick + n;
        break;
      case 'hour':
        result = tick + n * this.minutesPerHour;
        break;
      case 'day':
        result = tick + n * this.minutesPerDay;
        break;
      case 'month':
      case 'year': {
        const date = this.toDate(tick);
        const months = date.monthIndex + (unit === 'month' ? n : n * this.monthCount);
        const year = date.year + Math.floor(months / this.monthCount);
        const monthIndex = mod(months, this.monthCount);
        const day = Math.min(date.day, this.daysInMonth(year, monthIndex));
        return this.fromDate({ year, monthIndex, day, hour: date.hour, minute: date.minute });
      }
    }
    if (!isTick(result)) throw new RangeError('Data fora do intervalo suportado.');
    return result;
  }

  /** Índice (em dias desde a época) do primeiro dia do ano. */
  private yearStartDay(year: number): number {
    const cycles = Math.floor(year / this.leapEvery);
    const cycleStart = cycles * this.leapEvery;
    const yearsIntoCycle = year - cycleStart;
    return (
      cycles * this.cycleDays +
      yearsIntoCycle * this.commonYearDays +
      (yearsIntoCycle > 0 ? this.leapDays : 0)
    );
  }

  private yearOfDay(dayIndex: number): { year: number; dayOfYear0: number } {
    const cycles = Math.floor(dayIndex / this.cycleDays);
    const cycleStart = cycles * this.leapEvery;
    const rest = dayIndex - cycles * this.cycleDays;
    const firstYearDays = this.commonYearDays + this.leapDays;
    if (rest < firstYearDays) return { year: cycleStart, dayOfYear0: rest };
    const afterFirst = rest - firstYearDays;
    const extraYears = Math.floor(afterFirst / this.commonYearDays);
    return {
      year: cycleStart + 1 + extraYears,
      dayOfYear0: afterFirst - extraYears * this.commonYearDays,
    };
  }

  private era(index: number): CalendarEra {
    const era = this.definition.eras[index];
    if (!era) throw new RangeError(`Era inexistente: ${index}.`);
    return era;
  }

  private eraIndexOf(year: number): number {
    const eras = this.definition.eras;
    let index = 0;
    for (let i = 1; i < eras.length; i++) {
      if ((eras[i]?.startYear ?? Infinity) <= year) index = i;
    }
    return index;
  }

  /** Ano exibido na era, sem ano zero (antes do início de uma era `forward`, conta -1, -2…). */
  private eraYearOf(year: number, eraIndex: number): number {
    const era = this.era(eraIndex);
    if (era.direction === 'backward') return this.era(eraIndex + 1).startYear - year;
    return year >= era.startYear ? year - era.startYear + 1 : year - era.startYear;
  }

  private template(precision: CalendarPrecision): string {
    const custom = this.definition.formats?.[precision];
    if (custom) return custom;
    if (precision === 'day') return this.definition.format;
    return DEFAULT_TEMPLATES[precision](this.definition.format);
  }

  /** Zeros à esquerda conforme o maior valor possível (ex.: 24 h → "07"). */
  private pad(value: number, count: number): string {
    return String(value).padStart(String(count - 1).length, '0');
  }
}
