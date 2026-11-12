import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { MAP_STRINGS } from '@core/strings/map.strings';
import type { Calendar } from '@domain/calendar/calendar';
import type { AspectFitMode } from '@domain/maps';
import type { Tick } from '@domain/models';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DialogComponent } from '@shared/ui/dialog/dialog.component';
import { DateInputComponent } from '../timeline/date-input.component';

export interface ImageVersionDialogData {
  /** `create`: nova versão (data e ajuste); `replace`: nova imagem de uma versão (só ajuste). */
  readonly mode: 'create' | 'replace';
  readonly calendar: Calendar;
  /** Data proposta: o cursor da linha do tempo. */
  readonly tick: Tick;
  /** Datas já ocupadas por outras versões do mapa. */
  readonly takenTicks: readonly Tick[];
  /** A proporção da imagem difere mais de 1 % da do mapa. */
  readonly mismatch: boolean;
}

export interface ImageVersionDialogResult {
  readonly tickStart: Tick;
  /** Cortar ou enquadrar; `null` quando a proporção já confere. */
  readonly fit: AspectFitMode | null;
}

const FITS: readonly AspectFitMode[] = ['crop', 'pad'];

/**
 * "Nova versão a partir de…" (docs/06 › Versões da imagem no tempo): a data em que a
 * imagem passa a valer (o cursor, ajustável) e, se a proporção não confere com a do mapa,
 * o aviso com a escolha entre cortar e enquadrar com margens.
 */
@Component({
  selector: 'wd-image-version-dialog',
  imports: [ButtonComponent, DateInputComponent, DialogComponent],
  template: `
    <wd-dialog [title]="data.mode === 'create' ? text.createTitle : text.replaceTitle">
      <form id="wd-image-version" class="flex flex-col gap-4" (submit)="submit($event)">
        @if (data.mode === 'create') {
          <div class="flex flex-col gap-1.5">
            <wd-date-input
              tone="surface"
              idPrefix="wd-image-version-date"
              [label]="text.date"
              [calendar]="data.calendar"
              [value]="tick()"
              (valueChange)="tick.set($event)"
            />
            @if (taken()) {
              <p class="font-sans text-sm text-lacre-claro" role="alert">
                {{ versionsText.dateTaken }}
              </p>
            } @else {
              <p class="font-sans text-sm text-pergaminho-400">{{ text.dateHint }}</p>
            }
          </div>
        }
        @if (data.mismatch) {
          <p class="font-sans text-sm text-pergaminho-200">{{ text.mismatch }}</p>
          <fieldset class="flex flex-col gap-2">
            <legend class="mb-1 font-sans text-sm font-semibold">{{ text.fit }}</legend>
            @for (option of fits; track option) {
              <label class="option">
                <input
                  type="radio"
                  name="wd-image-version-fit"
                  [value]="option"
                  [checked]="fit() === option"
                  (change)="fit.set(option)"
                />
                <span class="flex flex-col">
                  <span>{{ option === 'crop' ? text.crop : text.pad }}</span>
                  <span class="text-pergaminho-400">
                    {{ option === 'crop' ? text.cropHint : text.padHint }}
                  </span>
                </span>
              </label>
            }
          </fieldset>
        }
      </form>
      <button wd-button wdDialogAction variant="ghost" type="button" (click)="ref.close()">
        {{ text.cancel }}
      </button>
      <button wd-button wdDialogAction variant="primary" type="submit" form="wd-image-version">
        {{ data.mode === 'create' ? text.create : text.replace }}
      </button>
    </wd-dialog>
  `,
  styles: `
    .option {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      padding: 8px 10px;
      font-family: var(--font-sans);
      font-size: 0.875rem;
      cursor: pointer;
      border: 1px solid var(--wd-rule);
      border-radius: var(--wd-radius-control);
    }

    .option:has(input:checked) {
      border-color: var(--wd-rule-strong);
      background-color: var(--wd-surface-raised);
    }

    .option input {
      margin-block-start: 3px;
      accent-color: var(--ouro-400);
    }
  `,
})
export class ImageVersionDialogComponent {
  protected readonly ref = inject<DialogRef<ImageVersionDialogResult>>(DialogRef);
  protected readonly data = inject<ImageVersionDialogData>(DIALOG_DATA);
  protected readonly text = MAP_STRINGS.versionDialog;
  protected readonly versionsText = MAP_STRINGS.versions;
  protected readonly fits = FITS;

  protected readonly tick = signal(this.data.tick);
  protected readonly fit = signal<AspectFitMode>('crop');
  protected readonly taken = computed(
    () => this.data.mode === 'create' && this.data.takenTicks.includes(this.tick()),
  );

  protected submit(event: Event): void {
    event.preventDefault();
    if (this.taken()) {
      document.getElementById('wd-image-version-date-day')?.focus();
      return;
    }
    this.ref.close({ tickStart: this.tick(), fit: this.data.mismatch ? this.fit() : null });
  }
}
