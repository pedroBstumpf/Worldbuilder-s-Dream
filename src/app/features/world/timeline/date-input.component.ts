import { booleanAttribute, Component, computed, input, linkedSignal, output } from '@angular/core';
import { TIME_STRINGS } from '@core/strings/time.strings';
import type { Calendar } from '@domain/calendar/calendar';
import type { Tick } from '@domain/models';

/** Partes da data como o usuário vê: ano da era (sem ano zero), mês e dia a partir de 1. */
interface DateParts {
  readonly day: number;
  readonly monthIndex: number;
  readonly eraIndex: number;
  readonly eraYear: number;
  readonly hour: number;
  readonly minute: number;
}

/** Onde o campo aparece: folha de pergaminho (fichas) ou couro (diálogos). */
export type DateInputTone = 'page' | 'surface';

/**
 * Data no calendário do mundo (docs/06 › Calendário): dia, mês, ano e era, e a hora
 * opcional. Emite o tick só quando a data existe no calendário; senão, marca o grupo
 * como inválido (29 de fevereiro fora de ano bissexto, ano zero…).
 */
@Component({
  selector: 'wd-date-input',
  template: `
    <fieldset
      class="date"
      [attr.data-tone]="tone()"
      [attr.aria-invalid]="invalid() ? 'true' : null"
      [attr.aria-describedby]="invalid() ? idPrefix() + '-error' : null"
    >
      <legend class="legend">{{ label() }}</legend>
      <div class="row">
        <label class="part day">
          <span class="sr-only">{{ text.day }}</span>
          <input
            type="number"
            inputmode="numeric"
            min="1"
            [id]="idPrefix() + '-day'"
            [value]="parts().day"
            (input)="set('day', $any($event.target).value)"
          />
        </label>
        <label class="part month">
          <span class="sr-only">{{ text.month }}</span>
          <select (change)="set('monthIndex', $any($event.target).value)">
            @for (month of months(); track $index) {
              <option [value]="$index" [selected]="$index === parts().monthIndex">
                {{ month }}
              </option>
            }
          </select>
        </label>
        <label class="part year">
          <span class="sr-only">{{ text.year }}</span>
          <input
            type="number"
            inputmode="numeric"
            min="1"
            [value]="parts().eraYear"
            (input)="set('eraYear', $any($event.target).value)"
          />
        </label>
        <label class="part era">
          <span class="sr-only">{{ text.era }}</span>
          <select (change)="set('eraIndex', $any($event.target).value)">
            @for (era of eras(); track $index) {
              <option [value]="$index" [selected]="$index === parts().eraIndex">
                {{ era.abbr || era.name }}
              </option>
            }
          </select>
        </label>
        @if (withTime()) {
          <span class="time" role="group" [attr.aria-label]="text.time">
            <label class="part">
              <span class="sr-only">{{ text.hour }}</span>
              <input
                type="number"
                inputmode="numeric"
                min="0"
                [value]="parts().hour"
                (input)="set('hour', $any($event.target).value)"
              />
            </label>
            <span aria-hidden="true">:</span>
            <label class="part">
              <span class="sr-only">{{ text.minute }}</span>
              <input
                type="number"
                inputmode="numeric"
                min="0"
                [value]="parts().minute"
                (input)="set('minute', $any($event.target).value)"
              />
            </label>
          </span>
        }
      </div>
      @if (invalid()) {
        <p class="error" [id]="idPrefix() + '-error'">{{ text.invalid }}</p>
      }
    </fieldset>
  `,
  styles: `
    :host {
      display: block;
    }

    .date {
      min-inline-size: 0;
      padding: 0;
      margin: 0;
      border: 0;
    }

    .legend {
      margin-block-end: 4px;
      font-family: var(--font-sans);
      font-size: 0.875rem;
      font-weight: 600;
    }

    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
    }

    input,
    select {
      inline-size: 100%;
      padding: 5px 8px;
      font-family: var(--font-sans);
      font-size: 0.9375rem;
      border-radius: var(--wd-radius-control);
    }

    input:focus-visible,
    select:focus-visible {
      outline: 2px solid var(--wd-focus-ring);
      outline-offset: 0;
    }

    .date[data-tone='page'] input,
    .date[data-tone='page'] select {
      color: var(--wd-text-on-page);
      background: color-mix(in oklab, var(--pergaminho-50) 70%, transparent);
      border: 1px solid var(--pergaminho-300);
    }

    .date[data-tone='surface'] input,
    .date[data-tone='surface'] select {
      color: var(--wd-text-on-surface);
      background: var(--couro-700);
      border: 1px solid var(--wd-rule);
    }

    .date[aria-invalid='true'] input,
    .date[aria-invalid='true'] select {
      border-color: var(--wd-danger-on-page, var(--wd-danger));
    }

    .day {
      inline-size: 4.5em;
    }

    .month {
      flex: 1;
      min-inline-size: 7em;
    }

    .year {
      inline-size: 6.5em;
    }

    .era {
      inline-size: 5.5em;
    }

    .time {
      display: inline-flex;
      gap: 4px;
      align-items: center;
    }

    .time .part {
      inline-size: 4em;
    }

    .error {
      margin-block-start: 4px;
      font-family: var(--font-sans);
      font-size: 0.8125rem;
      color: var(--wd-danger-on-page, var(--wd-danger));
    }

    .date[data-tone='surface'] .error {
      color: var(--wd-danger);
    }
  `,
})
export class DateInputComponent {
  readonly calendar = input.required<Calendar>();
  readonly value = input.required<Tick>();
  readonly label = input.required<string>();
  /** Prefixo dos ids (o dia recebe `<prefixo>-day`, para um `<label for>` externo). */
  readonly idPrefix = input.required<string>();
  readonly tone = input<DateInputTone>('page');
  /** Mostra hora e minuto. */
  readonly withTime = input(false, { transform: booleanAttribute });

  readonly valueChange = output<Tick>();

  protected readonly text = TIME_STRINGS.date;
  protected readonly months = computed(() => this.calendar().definition.months.map((m) => m.name));
  protected readonly eras = computed(() => this.calendar().definition.eras);

  /** Partes editadas; voltam ao valor de fora quando ele (ou o calendário) muda. */
  protected readonly parts = linkedSignal<{ calendar: Calendar; value: Tick }, DateParts>({
    source: () => ({ calendar: this.calendar(), value: this.value() }),
    computation: ({ calendar, value }) => {
      const date = calendar.toDate(value);
      return {
        day: date.day,
        monthIndex: date.monthIndex,
        eraIndex: date.eraIndex,
        eraYear: date.eraYear,
        hour: date.hour,
        minute: date.minute,
      };
    },
  });

  protected readonly invalid = computed(() => this.toTick(this.parts()) === null);

  protected set(part: keyof DateParts, raw: string): void {
    const value = Number(raw);
    const next = { ...this.parts(), [part]: raw.trim() === '' ? Number.NaN : value };
    this.parts.set(next);
    const tick = this.toTick(next);
    if (tick !== null && tick !== this.value()) this.valueChange.emit(tick);
  }

  private toTick(parts: DateParts): Tick | null {
    const calendar = this.calendar();
    try {
      const year = calendar.yearFromEra(parts.eraIndex, parts.eraYear);
      // O ano exibido precisa cair na era escolhida (ex.: "3000 EC" não pode virar AEC).
      if (parts.eraYear < 1) return null;
      const tick = calendar.fromDate({
        year,
        monthIndex: parts.monthIndex,
        day: parts.day,
        hour: this.withTime() ? parts.hour : 0,
        minute: this.withTime() ? parts.minute : 0,
      });
      return calendar.toDate(tick).eraIndex === parts.eraIndex ? tick : null;
    } catch {
      return null;
    }
  }
}
