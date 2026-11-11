import type { CalendarDefinition } from './calendar-definition';

/** "Gregoriano simplificado": padrão ao criar um mundo (docs/06). O ano da época (1 EC) é bissexto. */
export const DEFAULT_CALENDAR: CalendarDefinition = {
  minutesPerHour: 60,
  hoursPerDay: 24,
  weekdays: [
    'Domingo',
    'Segunda-feira',
    'Terça-feira',
    'Quarta-feira',
    'Quinta-feira',
    'Sexta-feira',
    'Sábado',
  ],
  months: [
    { name: 'Janeiro', days: 31 },
    { name: 'Fevereiro', days: 28 },
    { name: 'Março', days: 31 },
    { name: 'Abril', days: 30 },
    { name: 'Maio', days: 31 },
    { name: 'Junho', days: 30 },
    { name: 'Julho', days: 31 },
    { name: 'Agosto', days: 31 },
    { name: 'Setembro', days: 30 },
    { name: 'Outubro', days: 31 },
    { name: 'Novembro', days: 30 },
    { name: 'Dezembro', days: 31 },
  ],
  leap: { everyYears: 4, monthIndex: 1, extraDays: 1 },
  eras: [
    { name: 'Antes da Era Comum', abbr: 'AEC', startYear: -1, direction: 'backward' },
    { name: 'Era Comum', abbr: 'EC', startYear: 0 },
  ],
  epochLabel: 'Época',
  format: '{day} de {month} de {year} {era}',
};
