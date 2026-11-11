import { z } from 'zod';

const precisionSchema = z.enum(['era', 'year', 'month', 'day', 'hour', 'minute']);

/** Precisão de exibição, da maior para a menor; `era` é o zoom máximo para fora da timeline. */
export type CalendarPrecision = z.infer<typeof precisionSchema>;
export const CALENDAR_PRECISIONS: readonly CalendarPrecision[] = precisionSchema.options;

/** Unidades de tempo do calendário. */
export type CalendarUnit = Exclude<CalendarPrecision, 'era'>;

const label = z.string().trim().min(1).max(60);
const template = z.string().trim().min(1).max(200);

const monthSchema = z.object({
  name: label,
  days: z.int().min(1).max(10_000),
});

const leapSchema = z.object({
  /** Ano bissexto quando `ano mod everyYears = 0` (vale também para anos negativos). */
  everyYears: z.int().min(1).max(10_000),
  monthIndex: z.int().min(0),
  extraDays: z.int().min(1).max(10_000),
});

const eraSchema = z.object({
  name: label,
  abbr: z.string().trim().max(12),
  /** Ano (astronômico) em que a era começa. A primeira era também cobre os anos anteriores. */
  startYear: z.int(),
  /**
   * `forward` (padrão): o ano `startYear` é exibido como 1 e a contagem sobe.
   * `backward`: a contagem desce até o início da era seguinte (o ano anterior a ela é 1), como "a.C.".
   */
  direction: z.enum(['forward', 'backward']).optional(),
});

/**
 * Calendário de um mundo (`calendars.definition`, docs/06). Converte ticks ⇄ datas.
 * Tokens dos modelos de texto: `{day}`, `{month}`, `{monthNumber}`, `{year}`, `{era}` (abreviatura),
 * `{eraName}`, `{weekday}`, `{hour}`, `{minute}`.
 */
export const calendarDefinitionSchema = z
  .object({
    minutesPerHour: z.int().min(1).max(10_000),
    hoursPerDay: z.int().min(1).max(10_000),
    weekdays: z.array(label).max(100),
    months: z.array(monthSchema).min(1).max(100),
    leap: leapSchema.optional(),
    eras: z.array(eraSchema).min(1).max(100),
    epochLabel: z.string().trim().max(120).optional(),
    /** Modelo de exibição com precisão de dia. */
    format: template,
    /** Modelos opcionais para as outras precisões; os ausentes usam o padrão em português. */
    formats: z.partialRecord(precisionSchema, template).optional(),
  })
  .superRefine((cal, ctx) => {
    if (cal.leap && cal.leap.monthIndex >= cal.months.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['leap', 'monthIndex'],
        message: 'O mês bissexto não existe no calendário.',
      });
    }
    cal.eras.forEach((era, i) => {
      const next = cal.eras[i + 1];
      if (next && next.startYear <= era.startYear) {
        ctx.addIssue({
          code: 'custom',
          path: ['eras', i + 1, 'startYear'],
          message: 'As eras devem estar em ordem crescente de início.',
        });
      }
      if (!next && era.direction === 'backward') {
        ctx.addIssue({
          code: 'custom',
          path: ['eras', i, 'direction'],
          message: 'Uma era com contagem regressiva precisa de uma era seguinte.',
        });
      }
    });
  });

export type CalendarDefinition = z.infer<typeof calendarDefinitionSchema>;
export type CalendarMonth = z.infer<typeof monthSchema>;
export type CalendarEra = z.infer<typeof eraSchema>;

/** Valida e normaliza (apara espaços) um calendário vindo do banco, de importação ou de formulário. */
export function parseCalendarDefinition(input: unknown): CalendarDefinition {
  return calendarDefinitionSchema.parse(input);
}

// O padrão fica num arquivo sem Zod: quem só precisa dele não carrega o validador.
export { DEFAULT_CALENDAR } from './default-calendar';
