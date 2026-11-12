import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { TIME_STRINGS } from '@core/strings/time.strings';
import type { Calendar } from '@domain/calendar/calendar';
import {
  isValidSpeed,
  playDuration,
  sameSpeed,
  SPEED_AMOUNT,
  SPEED_PRESETS,
  SPEED_UNITS,
  type PlaySpeed,
  type SpeedUnit,
  type TimeRange,
} from '@domain/timeline';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DialogComponent } from '@shared/ui/dialog/dialog.component';

export interface SpeedDialogData {
  readonly speed: PlaySpeed;
  readonly calendar: Calendar;
  readonly range: TimeRange;
}

const FIELD =
  'w-full rounded-control border border-(--wd-rule) bg-couro-700 px-3 py-2 font-sans text-base ' +
  'text-pergaminho-100 aria-invalid:border-lacre-claro';
const LABEL = 'font-sans text-sm font-semibold';

/**
 * Velocidade do play (docs/06 §7): atalhos de 1 dia/s a 1.000 anos/s ou uma velocidade
 * livre (quantidade de dias, meses ou anos por segundo), com o tempo que o play leva para
 * percorrer o mundo inteiro.
 */
@Component({
  selector: 'wd-speed-dialog',
  imports: [ButtonComponent, DialogComponent],
  template: `
    <wd-dialog [title]="text.title">
      <form id="wd-speed" class="flex flex-col gap-4" (submit)="submit($event)">
        <div class="flex flex-col gap-1.5">
          <p [class]="label" id="wd-speed-presets">{{ text.presets }}</p>
          <div class="flex flex-wrap gap-1.5" role="radiogroup" aria-labelledby="wd-speed-presets">
            @for (preset of presets; track $index) {
              <button
                type="button"
                role="radio"
                class="chip wd-focus"
                [attr.aria-checked]="isCurrent(preset)"
                (click)="choose(preset)"
              >
                {{ format(preset) }}
              </button>
            }
          </div>
        </div>

        <fieldset class="flex flex-col gap-1.5">
          <legend [class]="label">{{ text.custom }}</legend>
          <div class="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
            <label class="sr-only" for="wd-speed-amount">{{ text.amount }}</label>
            <input
              id="wd-speed-amount"
              type="number"
              inputmode="decimal"
              step="any"
              cdkFocusInitial
              [min]="limits.min"
              [max]="limits.max"
              [class]="field"
              [value]="amountText()"
              [attr.aria-invalid]="invalid() ? 'true' : null"
              [attr.aria-describedby]="invalid() ? 'wd-speed-error' : 'wd-speed-duration'"
              (input)="amountText.set($any($event.target).value)"
            />
            <label class="sr-only" for="wd-speed-unit">{{ text.unit }}</label>
            <select
              id="wd-speed-unit"
              [class]="field"
              (change)="unit.set($any($event.target).value)"
            >
              @for (option of units; track option) {
                <option [value]="option" [selected]="option === unit()">
                  {{ text.units[option] }}
                </option>
              }
            </select>
            <span class="font-sans text-sm text-pergaminho-400">{{ text.perSecond }}</span>
          </div>
          @if (invalid()) {
            <p id="wd-speed-error" class="font-sans text-sm text-lacre-claro">
              {{ text.invalid(limitText.min, limitText.max) }}
            </p>
          }
        </fieldset>

        @if (duration(); as time) {
          <p id="wd-speed-duration" class="font-book text-lg" aria-live="polite">
            {{ text.duration(time) }}
          </p>
        }
      </form>
      <button wd-button wdDialogAction variant="ghost" type="button" (click)="ref.close()">
        {{ text.cancel }}
      </button>
      <button wd-button wdDialogAction variant="primary" type="submit" form="wd-speed">
        {{ text.apply }}
      </button>
    </wd-dialog>
  `,
  styles: `
    .chip {
      padding: 4px 12px;
      font-family: var(--font-mono);
      font-size: 0.8125rem;
      color: var(--wd-text-muted);
      cursor: pointer;
      background: none;
      border: 1px solid var(--wd-divider);
      border-radius: 999px;
    }

    .chip:hover {
      color: var(--wd-text-on-surface);
    }

    .chip[aria-checked='true'] {
      color: var(--wd-text-on-accent);
      background: var(--wd-accent);
      border-color: var(--wd-accent);
    }

    fieldset {
      min-inline-size: 0;
      padding: 0;
      margin: 0;
      border: 0;
    }
  `,
})
export class SpeedDialogComponent {
  protected readonly ref = inject<DialogRef<PlaySpeed>>(DialogRef);
  private readonly data = inject<SpeedDialogData>(DIALOG_DATA);
  protected readonly text = TIME_STRINGS.speed;
  protected readonly format = TIME_STRINGS.timeline.formatSpeed;
  protected readonly presets = SPEED_PRESETS;
  protected readonly units = SPEED_UNITS;
  protected readonly limits = SPEED_AMOUNT;
  protected readonly limitText = {
    min: SPEED_AMOUNT.min.toLocaleString('pt-BR'),
    max: SPEED_AMOUNT.max.toLocaleString('pt-BR'),
  };
  protected readonly field = FIELD;
  protected readonly label = LABEL;

  /** Texto do campo (vazio ou incompleto enquanto se digita). */
  protected readonly amountText = signal(String(this.data.speed.amount));
  protected readonly unit = signal<SpeedUnit>(this.data.speed.unit);

  private readonly speed = computed<PlaySpeed | null>(() => {
    const text = this.amountText().trim().replace(',', '.');
    const candidate = { amount: text === '' ? Number.NaN : Number(text), unit: this.unit() };
    return isValidSpeed(candidate) ? candidate : null;
  });

  protected readonly invalid = computed(() => this.speed() === null);

  protected readonly duration = computed(() => {
    const speed = this.speed();
    if (!speed) return null;
    const seconds = playDuration(this.data.calendar, this.data.range, speed);
    return this.text.formatDuration(seconds);
  });

  protected isCurrent(preset: PlaySpeed): boolean {
    const speed = this.speed();
    return speed !== null && sameSpeed(speed, preset);
  }

  protected choose(preset: PlaySpeed): void {
    this.amountText.set(String(preset.amount));
    this.unit.set(preset.unit);
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const speed = this.speed();
    if (!speed) {
      document.getElementById('wd-speed-amount')?.focus();
      return;
    }
    this.ref.close(speed);
  }
}
