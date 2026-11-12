import { Component, type ElementRef, input, output, signal, viewChild } from '@angular/core';
import { ENTITY_STRINGS } from '@core/strings/entity.strings';
import { normalizeLabels, splitLabels } from '@domain/entities';
import { IconComponent } from '@shared/ui/icon/icon.component';

/**
 * Lista de rótulos curtos (apelidos, etiquetas) com campo para acrescentar: Enter ou
 * vírgula acrescentam, Backspace no campo vazio remove o último, cada rótulo tem botão
 * de remover. Devolve sempre a lista normalizada (sem repetidos nem vazios).
 */
@Component({
  selector: 'wd-label-input',
  imports: [IconComponent],
  template: `
    <label class="field-label" [for]="fieldId()">{{ label() }}</label>
    <div class="box">
      <ul class="chips" [attr.aria-label]="label()">
        @for (value of values(); track value) {
          <li class="chip">
            <span>{{ value }}</span>
            <button
              type="button"
              class="remove wd-focus"
              [attr.aria-label]="text.removeLabel(value)"
              (click)="remove(value)"
            >
              <wd-icon name="close" size="sm" />
            </button>
          </li>
        }
      </ul>
      <input
        #field
        type="text"
        autocomplete="off"
        [id]="fieldId()"
        [value]="draft()"
        [attr.aria-describedby]="fieldId() + '-hint'"
        (input)="onInput($any($event.target).value)"
        (keydown)="onKey($event)"
        (blur)="commit()"
      />
    </div>
    <p class="hint" [id]="fieldId() + '-hint'">{{ hint() }}</p>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .field-label {
      font-family: var(--font-sans);
      font-size: 0.875rem;
      font-weight: 600;
    }

    .box {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      align-items: center;
      padding: 4px;
      background: color-mix(in oklab, var(--pergaminho-50) 70%, transparent);
      border: 1px solid var(--pergaminho-300);
      border-radius: var(--wd-radius-control);
    }

    .box:focus-within {
      border-color: var(--wd-focus-ring);
      box-shadow: 0 0 0 1px var(--wd-focus-ring);
    }

    .chips {
      display: contents;
    }

    .chip {
      display: inline-flex;
      gap: 2px;
      align-items: center;
      padding: 2px 2px 2px 10px;
      font-family: var(--font-book);
      font-size: 1rem;
      background: var(--pergaminho-200);
      border: 1px solid var(--pergaminho-300);
      border-radius: 999px;
    }

    .remove {
      display: grid;
      place-items: center;
      inline-size: 22px;
      block-size: 22px;
      color: var(--wd-text-on-page-muted);
      cursor: pointer;
      background: none;
      border: 0;
      border-radius: 999px;
    }

    .remove:hover {
      color: var(--wd-danger-on-page);
    }

    input {
      flex: 1;
      min-inline-size: 8rem;
      padding: 4px 6px;
      font-family: var(--font-sans);
      font-size: 0.875rem;
      color: var(--wd-text-on-page);
      background: none;
      border: 0;
      outline: none;
    }

    .hint {
      font-family: var(--font-sans);
      font-size: 0.75rem;
      color: var(--wd-text-on-page-muted);
    }
  `,
})
export class LabelInputComponent {
  readonly values = input.required<readonly string[]>();
  readonly label = input.required<string>();
  readonly hint = input('');
  readonly fieldId = input.required<string>();
  /** Valor que não entra na lista (o nome da entidade, nos apelidos). */
  readonly exclude = input<string>();

  readonly valuesChange = output<string[]>();

  protected readonly text = ENTITY_STRINGS.sheet;
  protected readonly draft = signal('');
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');

  protected onInput(value: string): void {
    if (/[,;]/.test(value)) {
      this.draft.set(value);
      this.commit();
      return;
    }
    this.draft.set(value);
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.commit();
    } else if (event.key === 'Backspace' && !this.draft()) {
      const last = this.values().at(-1);
      if (last !== undefined) this.remove(last);
    }
  }

  protected commit(): void {
    const typed = splitLabels(this.draft());
    this.draft.set('');
    // O signal pode já estar vazio; o campo é limpo direto.
    this.field().nativeElement.value = '';
    if (typed.every((value) => !value.trim())) return;
    const next = normalizeLabels([...this.values(), ...typed], this.exclude());
    if (next.join('\u0000') !== this.values().join('\u0000')) this.valuesChange.emit(next);
  }

  protected remove(value: string): void {
    this.valuesChange.emit(this.values().filter((existing) => existing !== value));
  }
}
