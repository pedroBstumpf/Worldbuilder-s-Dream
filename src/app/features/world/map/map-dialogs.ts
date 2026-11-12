import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAP_STRINGS } from '@core/strings/map.strings';
import { SCALE_UNITS, type ScaleUnit, type Uuid, type WorldMap } from '@domain/models';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DialogComponent } from '@shared/ui/dialog/dialog.component';

/** Limite do nome do mapa (DDL de `maps`). */
export const MAP_NAME_MAX = 120;

const FIELD =
  'w-full rounded-control border border-(--wd-rule) bg-couro-700 px-3 py-2 font-sans text-base ' +
  'text-pergaminho-100 placeholder:text-pergaminho-400 aria-invalid:border-lacre-claro';
const LABEL = 'font-sans text-sm font-semibold';

/** Renomear mapa: devolve o novo nome. */
@Component({
  selector: 'wd-rename-map-dialog',
  imports: [ButtonComponent, DialogComponent, ReactiveFormsModule],
  template: `
    <wd-dialog [title]="text.title">
      <form
        id="wd-rename-map"
        class="flex flex-col gap-1.5"
        [formGroup]="form"
        (ngSubmit)="submit()"
      >
        <label for="wd-map-name" [class]="label">{{ text.name }}</label>
        <input
          id="wd-map-name"
          type="text"
          autocomplete="off"
          cdkFocusInitial
          [class]="field"
          formControlName="name"
          [attr.aria-invalid]="error() ? 'true' : null"
          [attr.aria-describedby]="error() ? 'wd-map-name-error' : null"
        />
        @if (error(); as message) {
          <p id="wd-map-name-error" class="font-sans text-sm text-lacre-claro">{{ message }}</p>
        }
      </form>
      <button wd-button wdDialogAction variant="ghost" type="button" (click)="ref.close()">
        {{ text.cancel }}
      </button>
      <button wd-button wdDialogAction variant="primary" type="submit" form="wd-rename-map">
        {{ text.save }}
      </button>
    </wd-dialog>
  `,
})
export class RenameMapDialogComponent {
  protected readonly ref = inject<DialogRef<string>>(DialogRef);
  protected readonly text = MAP_STRINGS.rename;
  protected readonly field = FIELD;
  protected readonly label = LABEL;
  // Com [formGroup] o Angular intercepta o envio; um <form> solto faria o envio nativo
  // (recarregando a página) e o (ngSubmit) nunca dispararia.
  protected readonly form = inject(NonNullableFormBuilder).group({
    name: [inject<string>(DIALOG_DATA)],
  });
  private readonly submitted = signal(false);

  protected error(): string | null {
    if (!this.submitted()) return null;
    const name = this.form.controls.name.value.trim();
    if (!name) return this.text.required;
    if (name.length > MAP_NAME_MAX) return this.text.tooLong(MAP_NAME_MAX);
    return null;
  }

  protected submit(): void {
    this.submitted.set(true);
    if (this.error()) {
      document.getElementById('wd-map-name')?.focus();
      return;
    }
    this.ref.close(this.form.controls.name.value.trim());
  }
}

export interface ScaleDialogData {
  readonly pixelLength: number;
  readonly unit: ScaleUnit | null;
  readonly label: string | null;
}

export interface ScaleDialogResult {
  readonly realLength: number;
  readonly unit: ScaleUnit;
  readonly label: string | null;
}

/** Escala: comprimento real da linha desenhada sobre a escala gráfica (docs/06). */
@Component({
  selector: 'wd-scale-dialog',
  imports: [ButtonComponent, DialogComponent, ReactiveFormsModule],
  template: `
    <wd-dialog [title]="text.title">
      <form id="wd-scale" class="flex flex-col gap-4" [formGroup]="form" (ngSubmit)="submit()">
        <p class="font-sans text-sm text-pergaminho-400">{{ text.measured(pixels) }}</p>
        <div class="grid grid-cols-[1fr_auto] gap-3">
          <div class="flex flex-col gap-1.5">
            <label for="wd-scale-length" [class]="label">{{ text.length }}</label>
            <input
              id="wd-scale-length"
              type="number"
              inputmode="decimal"
              min="0"
              step="any"
              cdkFocusInitial
              formControlName="length"
              [class]="field"
              [attr.aria-invalid]="invalid() ? 'true' : null"
              [attr.aria-describedby]="invalid() ? 'wd-scale-error' : null"
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="wd-scale-unit" [class]="label">{{ text.unit }}</label>
            <select id="wd-scale-unit" formControlName="unit" [class]="field">
              @for (unit of units; track unit) {
                <option [value]="unit">{{ text.units[unit] }}</option>
              }
            </select>
          </div>
        </div>
        @if (invalid()) {
          <p id="wd-scale-error" class="font-sans text-sm text-lacre-claro">{{ text.invalid }}</p>
        }
        <div class="flex flex-col gap-1.5">
          <label for="wd-scale-label" [class]="label">{{ text.label }}</label>
          <input
            id="wd-scale-label"
            type="text"
            autocomplete="off"
            maxlength="80"
            formControlName="label"
            aria-describedby="wd-scale-label-hint"
            [class]="field"
          />
          <p id="wd-scale-label-hint" class="font-sans text-sm text-pergaminho-400">
            {{ text.labelHint }}
          </p>
        </div>
      </form>
      <button wd-button wdDialogAction variant="ghost" type="button" (click)="ref.close()">
        {{ text.cancel }}
      </button>
      <button wd-button wdDialogAction variant="primary" type="submit" form="wd-scale">
        {{ text.save }}
      </button>
    </wd-dialog>
  `,
})
export class ScaleDialogComponent {
  protected readonly ref = inject<DialogRef<ScaleDialogResult>>(DialogRef);
  private readonly data = inject<ScaleDialogData>(DIALOG_DATA);
  protected readonly text = MAP_STRINGS.scale;
  protected readonly field = FIELD;
  protected readonly label = LABEL;
  protected readonly units = SCALE_UNITS;
  protected readonly pixels = Math.round(this.data.pixelLength).toLocaleString('pt-BR');
  protected readonly form = inject(NonNullableFormBuilder).group({
    length: [null as number | null, [Validators.required, Validators.min(0)]],
    unit: [this.data.unit ?? ('km' as ScaleUnit)],
    label: [this.data.label ?? ''],
  });
  private readonly submitted = signal(false);

  protected invalid(): boolean {
    const length = this.form.controls.length.value;
    return this.submitted() && !(typeof length === 'number' && length > 0 && isFinite(length));
  }

  protected submit(): void {
    this.submitted.set(true);
    const { length, unit, label } = this.form.getRawValue();
    if (this.invalid() || length === null) {
      document.getElementById('wd-scale-length')?.focus();
      return;
    }
    this.ref.close({ realLength: length, unit, label: label.trim() || null });
  }
}

export interface LinkTargetData {
  readonly currentMapId: Uuid;
  readonly maps: readonly { map: WorldMap; depth: number }[];
}

/** Destino do link: os outros mapas do mundo, na ordem da árvore. */
@Component({
  selector: 'wd-link-target-dialog',
  imports: [ButtonComponent, DialogComponent],
  template: `
    <wd-dialog [title]="text.title">
      @if (options().length === 0) {
        <p class="font-sans text-sm text-pergaminho-400">{{ text.none }}</p>
      } @else {
        <fieldset class="flex flex-col gap-1">
          <legend class="mb-2 font-sans text-sm text-pergaminho-400">{{ text.question }}</legend>
          @for (option of options(); track option.map.id) {
            <label
              class="flex cursor-pointer items-center gap-3 rounded-control px-2 py-2 font-book text-lg hover:bg-couro-800"
              [style.padding-inline-start.px]="8 + option.depth * 20"
            >
              <input
                type="radio"
                name="wd-link-target"
                class="accent-ouro-400"
                [value]="option.map.id"
                [checked]="selected() === option.map.id"
                (change)="selected.set(option.map.id)"
              />
              {{ option.map.name }}
            </label>
          }
        </fieldset>
      }
      <button wd-button wdDialogAction variant="ghost" type="button" (click)="ref.close()">
        {{ text.cancel }}
      </button>
      @if (options().length > 0) {
        <button
          wd-button
          wdDialogAction
          variant="primary"
          type="button"
          [disabled]="!selected()"
          (click)="ref.close(selected() ?? undefined)"
        >
          {{ text.create }}
        </button>
      }
    </wd-dialog>
  `,
})
export class LinkTargetDialogComponent {
  protected readonly ref = inject<DialogRef<Uuid>>(DialogRef);
  private readonly data = inject<LinkTargetData>(DIALOG_DATA);
  protected readonly text = MAP_STRINGS.link;
  protected readonly options = computed(() =>
    this.data.maps.filter((row) => row.map.id !== this.data.currentMapId),
  );
  protected readonly selected = signal<Uuid | null>(this.options()[0]?.map.id ?? null);
}

/** O que remover com `Del` (docs/06 §3): a posição em vigor ou o token inteiro. */
export type RemoveTokenChoice = 'keyframe' | 'token';

export interface RemoveTokenData {
  /** Nome do token (ou "n tokens selecionados"). */
  name: string;
  /** Data da posição em vigor; `null` quando não há uma só posição a remover. */
  keyframeDate: string | null;
}

/** Confirmação do `Del` no mapa: remover só a posição ou o token com todas as posições. */
@Component({
  selector: 'wd-remove-token-dialog',
  imports: [ButtonComponent, DialogComponent],
  template: `
    <wd-dialog [title]="text.title">
      <p class="font-sans text-base">{{ text.question(data.name) }}</p>
      <button wd-button wdDialogAction variant="ghost" type="button" (click)="ref.close()">
        {{ text.cancel }}
      </button>
      @if (data.keyframeDate; as date) {
        <button
          wd-button
          wdDialogAction
          variant="secondary"
          type="button"
          cdkFocusInitial
          (click)="ref.close('keyframe')"
        >
          {{ text.keyframe(date) }}
        </button>
      }
      <button wd-button wdDialogAction variant="danger" type="button" (click)="ref.close('token')">
        {{ text.token }}
      </button>
    </wd-dialog>
  `,
})
export class RemoveTokenDialogComponent {
  protected readonly ref = inject<DialogRef<RemoveTokenChoice>>(DialogRef);
  protected readonly data = inject<RemoveTokenData>(DIALOG_DATA);
  protected readonly text = MAP_STRINGS.tokens.removeDialog;
}
