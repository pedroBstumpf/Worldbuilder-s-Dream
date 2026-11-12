import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { BOOK_STRINGS } from '@core/strings/book.strings';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DialogComponent } from '@shared/ui/dialog/dialog.component';
import type { WorldDraftInput } from './library.store';

/** Limites do DDL de `worlds` (docs/07; `local-checks.ts`). */
export const WORLD_NAME_MAX = 120;
export const WORLD_DESCRIPTION_MAX = 2000;

const FIELD =
  'w-full rounded-control border border-(--wd-rule) bg-couro-700 px-3 py-2 font-sans text-base ' +
  'text-pergaminho-100 placeholder:text-pergaminho-400 aria-invalid:border-lacre-claro';

/**
 * "Criar mundo": nome e descrição. Devolve o rascunho; quem abriu cria o mundo
 * e vira a página até o mapa. Com um mundo em `DIALOG_DATA`, vira "Renomear mundo",
 * com os campos preenchidos.
 */
@Component({
  selector: 'wd-create-world-dialog',
  imports: [ButtonComponent, DialogComponent, ReactiveFormsModule],
  template: `
    <wd-dialog ornate [title]="title">
      <form
        id="wd-create-world"
        class="flex flex-col gap-5"
        [formGroup]="form"
        (ngSubmit)="submit()"
      >
        <div class="flex flex-col gap-1.5">
          <label for="wd-world-name" class="font-sans text-sm font-semibold">{{ text.name }}</label>
          <input
            id="wd-world-name"
            type="text"
            autocomplete="off"
            formControlName="name"
            [class]="fieldClasses"
            [attr.aria-invalid]="nameError() ? 'true' : null"
            [attr.aria-describedby]="nameError() ? 'wd-world-name-error' : null"
          />
          @if (nameError(); as error) {
            <p id="wd-world-name-error" class="font-sans text-sm text-lacre-claro">{{ error }}</p>
          }
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="wd-world-description" class="font-sans text-sm font-semibold">
            {{ text.description }}
          </label>
          <textarea
            id="wd-world-description"
            rows="3"
            formControlName="description"
            aria-describedby="wd-world-description-hint"
            [class]="fieldClasses + ' resize-y'"
            [attr.aria-invalid]="descriptionTooLong() ? 'true' : null"
          ></textarea>
          <p id="wd-world-description-hint" class="font-sans text-sm text-pergaminho-400">
            {{ descriptionTooLong() ? text.tooLong(descriptionMax) : text.descriptionHint }}
          </p>
        </div>
      </form>
      <button wd-button wdDialogAction variant="ghost" type="button" (click)="ref.close()">
        {{ text.cancel }}
      </button>
      <button wd-button wdDialogAction variant="primary" type="submit" form="wd-create-world">
        {{ submitLabel }}
      </button>
    </wd-dialog>
  `,
})
export class CreateWorldDialogComponent {
  protected readonly ref = inject<DialogRef<WorldDraftInput>>(DialogRef);
  protected readonly text = BOOK_STRINGS.createWorld;
  protected readonly fieldClasses = FIELD;
  protected readonly descriptionMax = WORLD_DESCRIPTION_MAX;
  /** Mundo a renomear; ausente ao criar. */
  private readonly current = inject<WorldDraftInput | null>(DIALOG_DATA, { optional: true });
  protected readonly title = this.current ? BOOK_STRINGS.renameWorld.title : this.text.title;
  protected readonly submitLabel = this.current ? BOOK_STRINGS.renameWorld.save : this.text.create;

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: [this.current?.name ?? '', [Validators.required, Validators.maxLength(WORLD_NAME_MAX)]],
    description: [this.current?.description ?? '', Validators.maxLength(WORLD_DESCRIPTION_MAX)],
  });

  private readonly submitted = signal(false);

  /** Erro do nome, só depois da primeira tentativa de enviar. */
  protected nameError(): string | null {
    if (!this.submitted()) return null;
    const name = this.form.controls.name.value.trim();
    if (!name) return this.text.nameRequired;
    if (name.length > WORLD_NAME_MAX) return this.text.tooLong(WORLD_NAME_MAX);
    return null;
  }

  protected descriptionTooLong(): boolean {
    return this.form.controls.description.value.trim().length > WORLD_DESCRIPTION_MAX;
  }

  protected submit(): void {
    this.submitted.set(true);
    if (this.nameError() || this.descriptionTooLong()) {
      document.getElementById('wd-world-name')?.focus();
      return;
    }
    const { name, description } = this.form.getRawValue();
    this.ref.close({ name: name.trim(), description: description.trim() || null });
  }
}
