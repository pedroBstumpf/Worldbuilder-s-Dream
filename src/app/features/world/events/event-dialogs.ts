import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { TIME_STRINGS } from '@core/strings/time.strings';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DialogComponent } from '@shared/ui/dialog/dialog.component';
import { EVENT_TITLE_MAX } from '../state/event.store';

const FIELD =
  'w-full rounded-control border border-(--wd-rule) bg-couro-700 px-3 py-2 font-sans text-base ' +
  'text-pergaminho-100 placeholder:text-pergaminho-400 aria-invalid:border-lacre-claro';

/** Novo evento: pede o título; a data é a do cursor (já formatada em `data`). */
@Component({
  selector: 'wd-create-event-dialog',
  imports: [ButtonComponent, DialogComponent, ReactiveFormsModule],
  template: `
    <wd-dialog [title]="text.title">
      <form
        id="wd-create-event"
        class="flex flex-col gap-1.5"
        [formGroup]="form"
        (ngSubmit)="submit()"
      >
        <label for="wd-event-title" class="font-sans text-sm font-semibold">{{ text.name }}</label>
        <input
          id="wd-event-title"
          type="text"
          autocomplete="off"
          cdkFocusInitial
          formControlName="title"
          [class]="field"
          [attr.aria-invalid]="error() ? 'true' : null"
          [attr.aria-describedby]="error() ? 'wd-event-title-error' : 'wd-event-when'"
        />
        @if (error(); as message) {
          <p id="wd-event-title-error" class="font-sans text-sm text-lacre-claro">{{ message }}</p>
        }
        <p id="wd-event-when" class="font-sans text-sm text-pergaminho-400">
          {{ text.when(date) }}
        </p>
      </form>
      <button wd-button wdDialogAction variant="ghost" type="button" (click)="ref.close()">
        {{ text.cancel }}
      </button>
      <button wd-button wdDialogAction variant="primary" type="submit" form="wd-create-event">
        {{ text.submit }}
      </button>
    </wd-dialog>
  `,
})
export class CreateEventDialogComponent {
  protected readonly ref = inject<DialogRef<string>>(DialogRef);
  protected readonly date = inject<string>(DIALOG_DATA);
  protected readonly text = TIME_STRINGS.events.create;
  protected readonly field = FIELD;
  protected readonly form = inject(NonNullableFormBuilder).group({ title: [''] });
  private readonly submitted = signal(false);

  protected error(): string | null {
    if (!this.submitted()) return null;
    const title = this.form.controls.title.value.trim();
    if (!title) return this.text.required;
    if (title.length > EVENT_TITLE_MAX) return this.text.tooLong(EVENT_TITLE_MAX);
    return null;
  }

  protected submit(): void {
    this.submitted.set(true);
    if (this.error()) {
      document.getElementById('wd-event-title')?.focus();
      return;
    }
    this.ref.close(this.form.controls.title.value.replace(/\s+/g, ' ').trim());
  }
}

/** Evento fora da faixa do mundo: pergunta se amplia a faixa (docs/06 › Faixa do mundo). */
@Component({
  selector: 'wd-extend-range-dialog',
  imports: [ButtonComponent, DialogComponent],
  template: `
    <wd-dialog [title]="text.title">
      <p>{{ text.message(date) }}</p>
      <button wd-button wdDialogAction variant="ghost" type="button" (click)="ref.close(false)">
        {{ text.cancel }}
      </button>
      <button
        wd-button
        wdDialogAction
        variant="primary"
        type="button"
        cdkFocusInitial
        (click)="ref.close(true)"
      >
        {{ text.confirm }}
      </button>
    </wd-dialog>
  `,
})
export class ExtendRangeDialogComponent {
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly date = inject<string>(DIALOG_DATA);
  protected readonly text = TIME_STRINGS.events.range;
}
