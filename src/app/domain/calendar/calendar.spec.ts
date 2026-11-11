import { Calendar, type CalendarDate } from './calendar';
import {
  type CalendarDefinition,
  DEFAULT_CALENDAR,
  parseCalendarDefinition,
} from './calendar-definition';

const MINUTES_PER_DAY = 1440;

/** Calendário do exemplo do docs/06. */
const VALMORA: CalendarDefinition = {
  minutesPerHour: 60,
  hoursPerDay: 24,
  weekdays: ['Solar', 'Lunar', 'Marte', 'Mercúrio', 'Júpiter', 'Vênus', 'Saturno'],
  months: [
    { name: 'Geada', days: 30 },
    { name: 'Degelo', days: 30 },
    { name: 'Semeadura', days: 31 },
  ],
  leap: { everyYears: 4, monthIndex: 1, extraDays: 1 },
  eras: [
    { name: 'Era Antiga', abbr: 'EA', startYear: -5000, direction: 'backward' },
    { name: 'Era da Coroa', abbr: 'EC', startYear: 0 },
  ],
  epochLabel: 'Fundação de Valmora',
  format: '{day} de {month} de {year} {era}',
};

/** Sem bissextos, sem semana e com uma só era. */
const SIMPLE: CalendarDefinition = {
  minutesPerHour: 60,
  hoursPerDay: 10,
  weekdays: [],
  months: [{ name: 'Único', days: 100 }],
  eras: [{ name: 'Era', abbr: 'E', startYear: 0 }],
  format: '{day} {month} {year} {era}',
};

function date(year: number, monthIndex: number, day: number, hour = 0, minute = 0): CalendarDate {
  return { year, monthIndex, day, hour, minute };
}

describe('calendar definition', () => {
  it('accepts the default and the docs/06 example calendars', () => {
    expect(parseCalendarDefinition(DEFAULT_CALENDAR)).toEqual(DEFAULT_CALENDAR);
    expect(parseCalendarDefinition(VALMORA)).toEqual(VALMORA);
  });

  it('trims names', () => {
    const parsed = parseCalendarDefinition({
      ...SIMPLE,
      months: [{ name: '  Único ', days: 100 }],
    });
    expect(parsed.months[0]?.name).toBe('Único');
  });

  it.each([
    ['a leap month that does not exist', { ...VALMORA, leap: { ...VALMORA.leap, monthIndex: 3 } }],
    ['eras out of order', { ...VALMORA, eras: [...VALMORA.eras].reverse() }],
    [
      'a backward era with no era after it',
      { ...SIMPLE, eras: [{ name: 'Era', abbr: 'E', startYear: 0, direction: 'backward' }] },
    ],
    ['a month with no days', { ...SIMPLE, months: [{ name: 'Vazio', days: 0 }] }],
    ['fractional hours', { ...SIMPLE, hoursPerDay: 10.5 }],
    ['no months', { ...SIMPLE, months: [] }],
    ['no eras', { ...SIMPLE, eras: [] }],
  ])('rejects %s', (_, input) => {
    expect(() => parseCalendarDefinition(input)).toThrow();
  });
});

describe('Calendar (default "Gregoriano simplificado")', () => {
  const cal = new Calendar(DEFAULT_CALENDAR);

  it('starts the epoch at 1 January of year 1 EC, a Sunday', () => {
    expect(cal.toDate(0)).toEqual({
      ...date(0, 0, 1),
      dayOfYear: 1,
      weekdayIndex: 0,
      eraIndex: 1,
      eraYear: 1,
    });
    expect(cal.format(0)).toBe('1 de Janeiro de 1 EC');
  });

  it('puts the minute before the epoch on 31 December of 1 AEC, a Saturday', () => {
    expect(cal.toDate(-1)).toEqual({
      ...date(-1, 11, 31, 23, 59),
      dayOfYear: 365,
      weekdayIndex: 6,
      eraIndex: 0,
      eraYear: 1,
    });
    expect(cal.format(-1, 'minute')).toBe('31 de Dezembro de 1 AEC, 23:59');
  });

  it('makes every fourth year a leap year, including negative years', () => {
    expect([-8, -4, 0, 4, 8].every((y) => cal.isLeapYear(y))).toBe(true);
    expect([-3, -2, -1, 1, 2, 3, 5].some((y) => cal.isLeapYear(y))).toBe(false);
    expect(cal.daysInYear(0)).toBe(366);
    expect(cal.daysInYear(1)).toBe(365);
    expect(cal.daysInMonth(4, 1)).toBe(29);
    expect(cal.daysInMonth(5, 1)).toBe(28);
  });

  it('converts dates to ticks across leap years', () => {
    expect(cal.fromDate(date(0, 1, 29))).toBe((31 + 28) * MINUTES_PER_DAY);
    expect(cal.fromDate(date(1, 0, 1))).toBe(366 * MINUTES_PER_DAY);
    expect(cal.fromDate(date(4, 0, 1))).toBe((366 + 3 * 365) * MINUTES_PER_DAY);
    expect(cal.fromDate(date(-1, 0, 1))).toBe(-365 * MINUTES_PER_DAY);
    expect(cal.fromDate(date(-4, 0, 1))).toBe(-(3 * 365 + 366) * MINUTES_PER_DAY);
  });

  it('rejects dates that do not exist', () => {
    expect(() => cal.fromDate(date(1, 1, 29))).toThrow(RangeError);
    expect(() => cal.fromDate(date(0, 12, 1))).toThrow(RangeError);
    expect(() => cal.fromDate(date(0, 0, 0))).toThrow(RangeError);
    expect(() => cal.fromDate(date(0, 0, 1, 24))).toThrow(RangeError);
    expect(() => cal.fromDate(date(0, 0, 1, 0, 60))).toThrow(RangeError);
    expect(() => cal.fromDate(date(0.5, 0, 1))).toThrow(RangeError);
  });

  it('rejects ticks that are not safe integers', () => {
    for (const tick of [0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => cal.toDate(tick)).toThrow(RangeError);
    }
  });

  it('round-trips ticks near the epoch and at the limits of number', () => {
    const ticks = [
      0,
      1,
      -1,
      1439,
      1440,
      -1440,
      525_600,
      -525_600,
      1_000_000_007,
      -1_000_000_007,
      1e15 + 123,
      -1e15 - 123,
      Number.MAX_SAFE_INTEGER,
      Number.MIN_SAFE_INTEGER,
    ];
    for (const tick of ticks) {
      expect(cal.fromDate(cal.toDate(tick)), `tick ${tick}`).toBe(tick);
    }
  });

  it('walks day by day through nine years without gaps', () => {
    const end = cal.fromDate(date(4, 11, 31));
    const start = cal.fromDate(date(-5, 0, 1));
    let previous = cal.toDate(start);
    for (let tick = start + MINUTES_PER_DAY; tick <= end; tick += MINUTES_PER_DAY) {
      const current = cal.toDate(tick);
      const lastOfMonth = previous.day === cal.daysInMonth(previous.year, previous.monthIndex);
      const lastOfYear = lastOfMonth && previous.monthIndex === 11;
      expect(current.day).toBe(lastOfMonth ? 1 : previous.day + 1);
      expect(current.monthIndex).toBe(lastOfYear ? 0 : previous.monthIndex + (lastOfMonth ? 1 : 0));
      expect(current.year).toBe(previous.year + (lastOfYear ? 1 : 0));
      expect(current.weekdayIndex).toBe(((previous.weekdayIndex ?? 0) + 1) % 7);
      previous = current;
    }
    expect(previous).toMatchObject(date(4, 11, 31));
  });

  it('formats every precision', () => {
    const tick = cal.fromDate(date(2025, 10, 11, 9, 5));
    expect(cal.format(tick, 'era')).toBe('Era Comum');
    expect(cal.format(tick, 'year')).toBe('2026 EC');
    expect(cal.format(tick, 'month')).toBe('Novembro de 2026 EC');
    expect(cal.format(tick, 'day')).toBe('11 de Novembro de 2026 EC');
    expect(cal.format(tick, 'hour')).toBe('11 de Novembro de 2026 EC, 09h');
    expect(cal.format(tick, 'minute')).toBe('11 de Novembro de 2026 EC, 09:05');
  });

  it('uses the custom templates of the calendar', () => {
    const custom = new Calendar({
      ...DEFAULT_CALENDAR,
      formats: { day: '{weekday}, {day}/{monthNumber}/{year}', year: 'ano {year}' },
    });
    expect(custom.format(0)).toBe('Domingo, 1/1/1');
    expect(custom.format(0, 'year')).toBe('ano 1');
    expect(custom.format(0, 'month')).toBe('Janeiro de 1 EC');
  });

  it('finds the start of each unit', () => {
    const tick = cal.fromDate(date(2025, 10, 11, 9, 5));
    expect(cal.startOf('minute', tick)).toBe(tick);
    expect(cal.startOf('hour', tick)).toBe(cal.fromDate(date(2025, 10, 11, 9)));
    expect(cal.startOf('day', tick)).toBe(cal.fromDate(date(2025, 10, 11)));
    expect(cal.startOf('month', tick)).toBe(cal.fromDate(date(2025, 10, 1)));
    expect(cal.startOf('year', tick)).toBe(cal.fromDate(date(2025, 0, 1)));
    expect(cal.startOf('hour', -1)).toBe(-60);
    expect(cal.startOf('day', -1)).toBe(-MINUTES_PER_DAY);
    expect(cal.startOf('year', -1)).toBe(cal.fromDate(date(-1, 0, 1)));
  });

  it('adds minutes, hours and days as fixed lengths', () => {
    expect(cal.add('minute', -1, 0)).toBe(-1);
    expect(cal.add('hour', 2, 0)).toBe(120);
    expect(cal.add('day', -3, 0)).toBe(-3 * MINUTES_PER_DAY);
  });

  it('adds months and years keeping the day, or the last day of the month', () => {
    const add = (unit: 'month' | 'year', n: number, from: CalendarDate) =>
      cal.toDate(cal.add(unit, n, cal.fromDate(from)));

    expect(add('month', 1, date(1, 0, 31, 8, 30))).toMatchObject(date(1, 1, 28, 8, 30));
    expect(add('month', 1, date(0, 0, 31))).toMatchObject(date(0, 1, 29));
    expect(add('month', 1, date(0, 11, 15))).toMatchObject(date(1, 0, 15));
    expect(add('month', -1, date(0, 0, 15))).toMatchObject(date(-1, 11, 15));
    expect(add('month', -25, date(0, 0, 15))).toMatchObject(date(-3, 11, 15));
    expect(add('year', 1, date(0, 1, 29))).toMatchObject(date(1, 1, 28));
    expect(add('year', 4, date(0, 1, 29))).toMatchObject(date(4, 1, 29));
    expect(add('year', -2, date(1, 5, 10))).toMatchObject(date(-1, 5, 10));
  });

  it('rejects fractional amounts and results beyond the safe range', () => {
    expect(() => cal.add('month', 1.5, 0)).toThrow(RangeError);
    expect(() => cal.add('minute', 1, Number.MAX_SAFE_INTEGER)).toThrow(RangeError);
  });
});

describe('Calendar (docs/06 example)', () => {
  const cal = new Calendar(VALMORA);

  it('counts the ancient era backwards up to the crown era', () => {
    const yearStart = (year: number) => cal.fromDate(date(year, 0, 1));
    expect(cal.format(yearStart(0))).toBe('1 de Geada de 1 EC');
    expect(cal.format(yearStart(-1))).toBe('1 de Geada de 1 EA');
    expect(cal.format(yearStart(-5000))).toBe('1 de Geada de 5000 EA');
    expect(cal.format(yearStart(-6000))).toBe('1 de Geada de 6000 EA');
  });

  it('converts era years back to years', () => {
    expect(cal.yearFromEra(0, 1)).toBe(-1);
    expect(cal.yearFromEra(0, 5000)).toBe(-5000);
    expect(cal.yearFromEra(1, 1)).toBe(0);
    expect(cal.yearFromEra(1, 2025)).toBe(2024);
    expect(() => cal.yearFromEra(1, 0)).toThrow(RangeError);
  });

  it('adds the leap day to the second month every four years', () => {
    expect(cal.daysInYear(0)).toBe(92);
    expect(cal.daysInYear(1)).toBe(91);
    expect(cal.toDate(cal.fromDate(date(0, 1, 31)) + MINUTES_PER_DAY)).toMatchObject(date(0, 2, 1));
    expect(() => cal.fromDate(date(1, 1, 31))).toThrow(RangeError);
  });

  it('round-trips ticks across thousands of years', () => {
    for (
      let tick = -5_000 * 92 * MINUTES_PER_DAY;
      tick < 5_000 * 92 * MINUTES_PER_DAY;
      tick += 7_919_993
    ) {
      expect(cal.fromDate(cal.toDate(tick))).toBe(tick);
    }
  });
});

describe('Calendar (no leap years, no weekdays, single era)', () => {
  const cal = new Calendar(SIMPLE);

  it('handles the time before the only era', () => {
    expect(cal.toDate(-1)).toEqual({
      ...date(-1, 0, 100, 9, 59),
      dayOfYear: 100,
      weekdayIndex: null,
      eraIndex: 0,
      eraYear: -1,
    });
    expect(cal.format(-1, 'minute')).toBe('100 Único -1 E, 9:59');
    expect(cal.yearFromEra(0, -1)).toBe(-1);
  });

  it('collapses the gaps left by empty tokens', () => {
    const noAbbr = new Calendar({ ...SIMPLE, eras: [{ name: 'Era', abbr: '', startYear: 0 }] });
    expect(noAbbr.format(0)).toBe('1 Único 1');
    expect(noAbbr.format(0, 'hour')).toBe('1 Único 1, 0h');
  });
});
