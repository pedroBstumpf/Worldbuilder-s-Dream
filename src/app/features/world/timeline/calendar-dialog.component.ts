import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, ElementRef, inject, signal } from '@angular/core';
import { TIME_STRINGS } from '@core/strings/time.strings';
import { Calendar } from '@domain/calendar/calendar';
import {
  calendarDefinitionSchema,
  type CalendarDefinition,
  type CalendarEra,
  type CalendarMonth,
} from '@domain/calendar/calendar-definition';
import type { Tick } from '@domain/models';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DialogComponent } from '@shared/ui/dialog/dialog.component';
import { IconButtonComponent } from '@shared/ui/icon-button/icon-button.component';
import { TabsComponent, tabId, tabPanelId, type TabItem } from '@shared/ui/tabs/tabs.component';
import { DateInputComponent } from './date-input.component';

export interface CalendarDialogData {
  readonly definition: CalendarDefinition;
  readonly timeStart: Tick;
  readonly timeEnd: Tick;
  readonly nowTick: Tick | null;
  /** Instante do cursor, para a prévia. */
  readonly currentTick: Tick;
}

export interface CalendarDialogResult {
  /** `null` quando o calendário não mudou. */
  readonly definition: CalendarDefinition | null;
  readonly timeStart: Tick;
  readonly timeEnd: Tick;
  readonly nowTick: Tick | null;
}

type CalendarTab = 'months' | 'eras' | 'range';

const PREFIX = 'wd-calendar';
const FIELD =
  'w-full rounded-control border border-(--wd-rule) bg-couro-700 px-2.5 py-1.5 font-sans ' +
  'text-base text-pergaminho-100 aria-invalid:border-lacre-claro';
const LABEL = 'font-sans text-sm font-semibold';
const HINT = 'font-sans text-xs text-pergaminho-400';
const ERROR = 'font-sans text-sm text-lacre-claro';

/** Número digitado (vazio vira `NaN`, que o schema recusa). */
function num(raw: string): number {
  return raw.trim() === '' ? Number.NaN : Number(raw);
}

/**
 * Editor do calendário do mundo (docs/06 › Calendário): meses, semana, bissexto, horas,
 * eras, modelo da data e a faixa do mundo. Valida com o mesmo schema do banco e mostra a
 * data do cursor no calendário em edição. Os ticks não mudam: só a leitura deles.
 */
@Component({
  selector: 'wd-calendar-dialog',
  imports: [
    ButtonComponent,
    DateInputComponent,
    DialogComponent,
    IconButtonComponent,
    TabsComponent,
  ],
  template: `
    <wd-dialog wide [title]="text.title">
      <wd-tabs
        [idPrefix]="prefix"
        [label]="text.tabsLabel"
        [tabs]="tabs"
        [selected]="tab()"
        (selectedChange)="tab.set($any($event))"
      />
      <div
        class="body"
        role="tabpanel"
        tabindex="-1"
        [id]="panelId()"
        [attr.aria-labelledby]="tabLabelId()"
      >
        @switch (tab()) {
          @case ('months') {
            <section class="flex flex-col gap-2" [attr.aria-labelledby]="prefix + '-months'">
              <h3 [id]="prefix + '-months'" [class]="label">{{ text.months }}</h3>
              <ol class="flex flex-col gap-1.5">
                @for (month of draft().months; track $index; let i = $index) {
                  <li class="grid grid-cols-[1.5rem_1fr_6rem_auto] items-center gap-2">
                    <span class="font-mono text-sm text-pergaminho-400">{{ i + 1 }}</span>
                    <input
                      type="text"
                      [class]="field"
                      [attr.aria-label]="text.monthName(i + 1)"
                      [attr.aria-invalid]="error('months.' + i + '.name') ? 'true' : null"
                      [value]="month.name"
                      (input)="setMonth(i, { name: $any($event.target).value })"
                    />
                    <input
                      type="number"
                      min="1"
                      [class]="field"
                      [attr.aria-label]="text.monthDays(i + 1)"
                      [attr.aria-invalid]="error('months.' + i + '.days') ? 'true' : null"
                      [value]="month.days"
                      (input)="setMonth(i, { days: num($any($event.target).value) })"
                    />
                    <button
                      wd-icon-button
                      type="button"
                      icon="delete"
                      size="sm"
                      tooltipPosition="left"
                      [label]="text.remove(month.name)"
                      [disabled]="draft().months.length === 1"
                      (click)="removeMonth(i)"
                    ></button>
                  </li>
                }
              </ol>
              <button wd-button type="button" size="sm" class="self-start" (click)="addMonth()">
                {{ text.addMonth }}
              </button>
            </section>

            <section class="flex flex-col gap-2" [attr.aria-labelledby]="prefix + '-week'">
              <h3 [id]="prefix + '-week'" [class]="label">{{ text.weekdays }}</h3>
              <p [class]="hint">{{ text.weekdaysHint }}</p>
              <ol class="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                @for (day of draft().weekdays; track $index; let i = $index) {
                  <li class="flex items-center gap-1">
                    <input
                      type="text"
                      [class]="field"
                      [attr.aria-label]="text.weekdayName(i + 1)"
                      [attr.aria-invalid]="error('weekdays.' + i) ? 'true' : null"
                      [value]="day"
                      (input)="setWeekday(i, $any($event.target).value)"
                    />
                    <button
                      wd-icon-button
                      type="button"
                      icon="close"
                      size="sm"
                      tooltipPosition="left"
                      [label]="text.remove(day)"
                      (click)="removeWeekday(i)"
                    ></button>
                  </li>
                }
              </ol>
              <button wd-button type="button" size="sm" class="self-start" (click)="addWeekday()">
                {{ text.addWeekday }}
              </button>
            </section>

            <div class="grid grid-cols-2 gap-3">
              <div class="flex flex-col gap-1">
                <label [for]="prefix + '-hours'" [class]="label">{{ text.hoursPerDay }}</label>
                <input
                  type="number"
                  min="1"
                  [id]="prefix + '-hours'"
                  [class]="field"
                  [attr.aria-invalid]="error('hoursPerDay') ? 'true' : null"
                  [value]="draft().hoursPerDay"
                  (input)="patch({ hoursPerDay: num($any($event.target).value) })"
                />
              </div>
              <div class="flex flex-col gap-1">
                <label [for]="prefix + '-minutes'" [class]="label">{{ text.minutesPerHour }}</label>
                <input
                  type="number"
                  min="1"
                  [id]="prefix + '-minutes'"
                  [class]="field"
                  [attr.aria-invalid]="error('minutesPerHour') ? 'true' : null"
                  [value]="draft().minutesPerHour"
                  (input)="patch({ minutesPerHour: num($any($event.target).value) })"
                />
              </div>
            </div>

            <fieldset class="flex flex-col gap-2">
              <legend [class]="label">{{ text.leap }}</legend>
              <label class="flex items-center gap-2 font-sans text-sm">
                <input
                  type="checkbox"
                  class="accent-ouro-400"
                  [checked]="draft().leap !== undefined"
                  (change)="toggleLeap($any($event.target).checked)"
                />
                {{ text.leap }}
              </label>
              @if (draft().leap; as leap) {
                <div class="grid grid-cols-3 gap-3">
                  <div class="flex flex-col gap-1">
                    <label [for]="prefix + '-leap-every'" [class]="label">{{
                      text.leapEvery
                    }}</label>
                    <input
                      type="number"
                      min="1"
                      [id]="prefix + '-leap-every'"
                      [class]="field"
                      [attr.aria-invalid]="error('leap.everyYears') ? 'true' : null"
                      [value]="leap.everyYears"
                      (input)="setLeap({ everyYears: num($any($event.target).value) })"
                    />
                  </div>
                  <div class="flex flex-col gap-1">
                    <label [for]="prefix + '-leap-month'" [class]="label">{{
                      text.leapMonth
                    }}</label>
                    <select
                      [id]="prefix + '-leap-month'"
                      [class]="field"
                      (change)="setLeap({ monthIndex: num($any($event.target).value) })"
                    >
                      @for (month of draft().months; track $index; let i = $index) {
                        <option [value]="i" [selected]="i === leap.monthIndex">
                          {{ month.name || i + 1 }}
                        </option>
                      }
                    </select>
                  </div>
                  <div class="flex flex-col gap-1">
                    <label [for]="prefix + '-leap-days'" [class]="label">{{ text.leapDays }}</label>
                    <input
                      type="number"
                      min="1"
                      [id]="prefix + '-leap-days'"
                      [class]="field"
                      [attr.aria-invalid]="error('leap.extraDays') ? 'true' : null"
                      [value]="leap.extraDays"
                      (input)="setLeap({ extraDays: num($any($event.target).value) })"
                    />
                  </div>
                </div>
                @if (error('leap.monthIndex'); as message) {
                  <p [class]="errorClass">{{ message }}</p>
                }
              }
            </fieldset>
          }
          @case ('eras') {
            <section class="flex flex-col gap-2" [attr.aria-labelledby]="prefix + '-eras'">
              <h3 [id]="prefix + '-eras'" [class]="label">{{ text.eras }}</h3>
              <p [class]="hint">{{ text.erasHint }}</p>
              <ol class="flex flex-col gap-3">
                @for (era of draft().eras; track $index; let i = $index) {
                  <li
                    class="flex flex-col gap-1.5 rounded-control border border-(--wd-divider) p-2"
                  >
                    <div class="grid grid-cols-[1fr_6rem_7rem_auto] items-center gap-2">
                      <input
                        type="text"
                        [class]="field"
                        [attr.aria-label]="text.eraName(i + 1)"
                        [attr.aria-invalid]="error('eras.' + i + '.name') ? 'true' : null"
                        [value]="era.name"
                        (input)="setEra(i, { name: $any($event.target).value })"
                      />
                      <input
                        type="text"
                        [class]="field"
                        [attr.aria-label]="text.eraAbbr(i + 1)"
                        [value]="era.abbr"
                        (input)="setEra(i, { abbr: $any($event.target).value })"
                      />
                      <input
                        type="number"
                        [class]="field"
                        [attr.aria-label]="text.eraStart(i + 1)"
                        [attr.aria-invalid]="error('eras.' + i + '.startYear') ? 'true' : null"
                        [value]="era.startYear"
                        (input)="setEra(i, { startYear: num($any($event.target).value) })"
                      />
                      <button
                        wd-icon-button
                        type="button"
                        icon="delete"
                        size="sm"
                        tooltipPosition="left"
                        [label]="text.remove(era.name)"
                        [disabled]="draft().eras.length === 1"
                        (click)="removeEra(i)"
                      ></button>
                    </div>
                    <label class="flex items-center gap-2 font-sans text-sm">
                      <input
                        type="checkbox"
                        class="accent-ouro-400"
                        [checked]="era.direction === 'backward'"
                        (change)="
                          setEra(i, {
                            direction: $any($event.target).checked ? 'backward' : 'forward',
                          })
                        "
                      />
                      {{ text.eraBackward }}
                    </label>
                    @if (
                      error('eras.' + i + '.startYear') || error('eras.' + i + '.direction');
                      as message
                    ) {
                      <p [class]="errorClass">{{ message }}</p>
                    }
                  </li>
                }
              </ol>
              <button wd-button type="button" size="sm" class="self-start" (click)="addEra()">
                {{ text.addEra }}
              </button>
            </section>

            <div class="flex flex-col gap-1">
              <label [for]="prefix + '-epoch'" [class]="label">{{ text.epochLabel }}</label>
              <input
                type="text"
                [id]="prefix + '-epoch'"
                [class]="field"
                [value]="draft().epochLabel ?? ''"
                (input)="patch({ epochLabel: $any($event.target).value || undefined })"
              />
            </div>
            <div class="flex flex-col gap-1">
              <label [for]="prefix + '-format'" [class]="label">{{ text.format }}</label>
              <input
                type="text"
                [id]="prefix + '-format'"
                [class]="field"
                [attr.aria-invalid]="error('format') ? 'true' : null"
                [attr.aria-describedby]="prefix + '-format-hint'"
                [value]="draft().format"
                (input)="patch({ format: $any($event.target).value })"
              />
              <p [class]="hint" [id]="prefix + '-format-hint'">{{ text.formatHint }}</p>
            </div>
          }
          @case ('range') {
            <p [class]="hint">{{ text.rangeHint }}</p>
            <wd-date-input
              tone="surface"
              [idPrefix]="prefix + '-start'"
              [label]="text.rangeStart"
              [calendar]="previewCalendar()"
              [value]="timeStart()"
              (valueChange)="timeStart.set($event)"
            />
            <wd-date-input
              tone="surface"
              [idPrefix]="prefix + '-end'"
              [label]="text.rangeEnd"
              [calendar]="previewCalendar()"
              [value]="timeEnd()"
              (valueChange)="timeEnd.set($event)"
            />
            @if (rangeInvalid()) {
              <p [class]="errorClass">{{ text.rangeInvalid }}</p>
            }
            <div class="flex flex-col gap-2">
              <label class="flex items-center gap-2 font-sans text-sm">
                <input
                  type="checkbox"
                  class="accent-ouro-400"
                  [checked]="nowTick() !== null"
                  (change)="nowTick.set($any($event.target).checked ? data.currentTick : null)"
                />
                {{ text.hasNow }}
              </label>
              @if (nowTick(); as now) {
                <wd-date-input
                  tone="surface"
                  [idPrefix]="prefix + '-now'"
                  [label]="text.now"
                  [calendar]="previewCalendar()"
                  [value]="now"
                  (valueChange)="nowTick.set($event)"
                />
              }
              <p [class]="hint">{{ text.nowHint }}</p>
            </div>
          }
        }
      </div>

      <section class="preview" aria-live="polite" [attr.aria-label]="text.preview">
        <h3 class="wd-inscription text-xs text-ouro-400">{{ text.preview }}</h3>
        @if (calendar(); as preview) {
          <p class="font-book text-lg">{{ text.previewToday(preview.format(data.currentTick)) }}</p>
          <p class="font-sans text-sm text-pergaminho-400">
            {{ text.previewEpoch(preview.format(0)) }}
          </p>
        } @else {
          <p [class]="errorClass">{{ text.invalid }}</p>
        }
      </section>

      <button wd-button wdDialogAction variant="ghost" type="button" (click)="ref.close()">
        {{ text.cancel }}
      </button>
      <button wd-button wdDialogAction variant="primary" type="button" (click)="save()">
        {{ text.save }}
      </button>
    </wd-dialog>
  `,
  styles: `
    .body {
      display: flex;
      flex-direction: column;
      gap: 18px;
      max-block-size: min(56vh, 520px);
      padding: 14px 4px 4px 0;
      overflow-y: auto;
      font-size: 1rem;
      outline: none;
    }

    .preview {
      padding: 10px 12px;
      margin-block-start: 14px;
      border: 1px solid var(--wd-rule);
      border-radius: var(--wd-radius-control);
    }
  `,
})
export class CalendarDialogComponent {
  protected readonly ref = inject<DialogRef<CalendarDialogResult>>(DialogRef);
  protected readonly data = inject<CalendarDialogData>(DIALOG_DATA);
  protected readonly text = TIME_STRINGS.calendar;
  protected readonly prefix = PREFIX;
  protected readonly field = FIELD;
  protected readonly label = LABEL;
  protected readonly hint = HINT;
  protected readonly errorClass = ERROR;
  protected readonly num = num;
  protected readonly tabs: readonly TabItem[] = [
    { id: 'months', label: this.text.tabs.months },
    { id: 'eras', label: this.text.tabs.eras },
    { id: 'range', label: this.text.tabs.range },
  ];

  protected readonly tab = signal<CalendarTab>('months');
  protected readonly draft = signal<CalendarDefinition>(structuredClone(this.data.definition));
  protected readonly timeStart = signal(this.data.timeStart);
  protected readonly timeEnd = signal(this.data.timeEnd);
  protected readonly nowTick = signal(this.data.nowTick);

  protected readonly panelId = computed(() => tabPanelId(PREFIX, this.tab()));
  protected readonly tabLabelId = computed(() => tabId(PREFIX, this.tab()));

  private readonly parsed = computed(() => calendarDefinitionSchema.safeParse(this.draft()));

  /** Calendário em edição, ou `null` enquanto for inválido. */
  protected readonly calendar = computed(() => {
    const result = this.parsed();
    return result.success ? new Calendar(result.data) : null;
  });

  /** Para os campos de data: o calendário em edição, ou o salvo se o rascunho for inválido. */
  protected readonly previewCalendar = computed(
    () => this.calendar() ?? new Calendar(this.data.definition),
  );

  /** Mensagens por caminho (`months.0.name`, `leap.monthIndex`…). */
  private readonly errors = computed(() => {
    const result = this.parsed();
    const map = new Map<string, string>();
    if (result.success) return map;
    for (const issue of result.error.issues) {
      const path = issue.path.join('.');
      if (map.has(path)) continue;
      map.set(path, this.message(issue.code, issue.message, path));
    }
    return map;
  });

  protected readonly rangeInvalid = computed(() => this.timeEnd() <= this.timeStart());

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected error(path: string): string | null {
    return this.errors().get(path) ?? null;
  }

  protected patch(change: Partial<CalendarDefinition>): void {
    this.draft.update((draft) => ({ ...draft, ...change }));
  }

  protected setMonth(index: number, change: Partial<CalendarMonth>): void {
    this.draft.update((draft) => ({
      ...draft,
      months: draft.months.map((month, i) => (i === index ? { ...month, ...change } : month)),
    }));
  }

  protected addMonth(): void {
    this.draft.update((draft) => ({
      ...draft,
      months: [...draft.months, { name: this.text.newMonth, days: 30 }],
    }));
  }

  protected removeMonth(index: number): void {
    this.draft.update((draft) => {
      const months = draft.months.filter((_, i) => i !== index);
      const leap = draft.leap && {
        ...draft.leap,
        monthIndex: Math.min(
          draft.leap.monthIndex > index ? draft.leap.monthIndex - 1 : draft.leap.monthIndex,
          months.length - 1,
        ),
      };
      return { ...draft, months, leap };
    });
  }

  protected setWeekday(index: number, name: string): void {
    this.draft.update((draft) => ({
      ...draft,
      weekdays: draft.weekdays.map((day, i) => (i === index ? name : day)),
    }));
  }

  protected addWeekday(): void {
    this.draft.update((draft) => ({
      ...draft,
      weekdays: [...draft.weekdays, this.text.newWeekday],
    }));
  }

  protected removeWeekday(index: number): void {
    this.draft.update((draft) => ({
      ...draft,
      weekdays: draft.weekdays.filter((_, i) => i !== index),
    }));
  }

  protected toggleLeap(on: boolean): void {
    this.draft.update((draft) => ({
      ...draft,
      leap: on
        ? { everyYears: 4, monthIndex: Math.min(1, draft.months.length - 1), extraDays: 1 }
        : undefined,
    }));
  }

  protected setLeap(change: Partial<NonNullable<CalendarDefinition['leap']>>): void {
    this.draft.update((draft) =>
      draft.leap ? { ...draft, leap: { ...draft.leap, ...change } } : draft,
    );
  }

  protected setEra(index: number, change: Partial<CalendarEra>): void {
    this.draft.update((draft) => ({
      ...draft,
      eras: draft.eras.map((era, i) => (i === index ? { ...era, ...change } : era)),
    }));
  }

  protected addEra(): void {
    this.draft.update((draft) => {
      const last = draft.eras.at(-1)?.startYear ?? 0;
      return {
        ...draft,
        eras: [...draft.eras, { name: this.text.newEra, abbr: '', startYear: last + 100 }],
      };
    });
  }

  protected removeEra(index: number): void {
    this.draft.update((draft) => ({ ...draft, eras: draft.eras.filter((_, i) => i !== index) }));
  }

  protected save(): void {
    const result = this.parsed();
    if (!result.success || this.rangeInvalid()) {
      // Vai para a aba do primeiro problema e põe o foco nele.
      const first = result.success ? null : result.error.issues[0]?.path[0];
      this.tab.set(
        this.rangeInvalid() && result.success
          ? 'range'
          : first === 'eras' || first === 'format' || first === 'epochLabel'
            ? 'eras'
            : 'months',
      );
      queueMicrotask(() =>
        this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      return;
    }
    const changed = JSON.stringify(result.data) !== JSON.stringify(this.data.definition);
    this.ref.close({
      definition: changed ? result.data : null,
      timeStart: this.timeStart(),
      timeEnd: this.timeEnd(),
      nowTick: this.nowTick(),
    });
  }

  private message(code: string, message: string, path: string): string {
    const issues = this.text.issues;
    if (code === 'custom') {
      if (path === 'leap.monthIndex') return issues.leapMonth;
      if (path.endsWith('direction')) return issues.eraBackward;
      if (path.endsWith('startYear')) return issues.eraOrder;
      return message || issues.generic;
    }
    if (code === 'too_small' && (path.endsWith('name') || path === 'format')) {
      return issues.required;
    }
    if (code === 'invalid_type' || code === 'too_small' || code === 'too_big') return issues.number;
    return issues.generic;
  }
}
