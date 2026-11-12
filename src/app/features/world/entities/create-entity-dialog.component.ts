import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ENTITY_KIND_STRINGS, ENTITY_STRINGS } from '@core/strings/entity.strings';
import { ENTITY_KINDS, type EntityKind } from '@domain/models';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DialogComponent } from '@shared/ui/dialog/dialog.component';
import { EntityAvatarComponent } from './entity-avatar.component';

/** Limite do nome (DDL de `entities`). */
export const ENTITY_NAME_MAX = 160;

export interface CreateEntityResult {
  readonly kind: EntityKind;
  readonly name: string;
}

export const FIELD_CLASSES =
  'w-full rounded-control border border-(--wd-rule) bg-couro-700 px-3 py-2 font-sans text-base ' +
  'text-pergaminho-100 placeholder:text-pergaminho-400 aria-invalid:border-lacre-claro';

/** Nova entidade: nome e tipo (o tipo vem sugerido pela aba do Explorar). */
@Component({
  selector: 'wd-create-entity-dialog',
  imports: [ButtonComponent, DialogComponent, EntityAvatarComponent, ReactiveFormsModule],
  template: `
    <wd-dialog [title]="text.title">
      <form
        id="wd-create-entity"
        class="flex flex-col gap-4"
        [formGroup]="form"
        (ngSubmit)="submit()"
      >
        <div class="flex flex-col gap-1.5">
          <label for="wd-entity-name" class="font-sans text-sm font-semibold">{{
            text.name
          }}</label>
          <input
            id="wd-entity-name"
            type="text"
            autocomplete="off"
            cdkFocusInitial
            formControlName="name"
            [class]="field"
            [attr.aria-invalid]="error() ? 'true' : null"
            [attr.aria-describedby]="error() ? 'wd-entity-name-error' : null"
          />
          @if (error(); as message) {
            <p id="wd-entity-name-error" class="font-sans text-sm text-lacre-claro">
              {{ message }}
            </p>
          }
        </div>
        <fieldset class="flex flex-col gap-1.5">
          <legend class="mb-1.5 font-sans text-sm font-semibold">{{ text.kind }}</legend>
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
            @for (kind of kinds; track kind) {
              <label class="kind">
                <input type="radio" class="sr-only" formControlName="kind" [value]="kind" />
                <wd-entity-avatar [kind]="kind" [size]="28" />
                <span class="font-sans text-sm">{{ kindNames[kind].one }}</span>
              </label>
            }
          </div>
        </fieldset>
      </form>
      <button wd-button wdDialogAction variant="ghost" type="button" (click)="ref.close()">
        {{ text.cancel }}
      </button>
      <button wd-button wdDialogAction variant="primary" type="submit" form="wd-create-entity">
        {{ text.submit }}
      </button>
    </wd-dialog>
  `,
  styles: `
    .kind {
      display: flex;
      gap: 8px;
      align-items: center;
      padding: 6px 10px;
      cursor: pointer;
      border: 1px solid var(--wd-divider);
      border-radius: var(--wd-radius-control);
    }

    .kind:hover {
      background: var(--wd-surface-raised);
    }

    .kind:has(:checked) {
      background: var(--wd-surface-active);
      border-color: var(--wd-accent);
    }

    .kind:has(:focus-visible) {
      outline: 2px solid var(--wd-focus-ring);
      outline-offset: 2px;
    }
  `,
})
export class CreateEntityDialogComponent {
  protected readonly ref = inject<DialogRef<CreateEntityResult>>(DialogRef);
  protected readonly text = ENTITY_STRINGS.create;
  protected readonly kindNames = ENTITY_KIND_STRINGS;
  protected readonly kinds = ENTITY_KINDS;
  protected readonly field = FIELD_CLASSES;
  protected readonly form = inject(NonNullableFormBuilder).group({
    name: [''],
    kind: [inject<EntityKind>(DIALOG_DATA)],
  });
  private readonly submitted = signal(false);

  protected error(): string | null {
    if (!this.submitted()) return null;
    const name = this.form.controls.name.value.trim();
    if (!name) return this.text.required;
    if ([...name].length > ENTITY_NAME_MAX) return this.text.tooLong(ENTITY_NAME_MAX);
    return null;
  }

  protected submit(): void {
    this.submitted.set(true);
    if (this.error()) {
      document.getElementById('wd-entity-name')?.focus();
      return;
    }
    const { name, kind } = this.form.getRawValue();
    this.ref.close({ name: name.replace(/\s+/g, ' ').trim(), kind });
  }
}
