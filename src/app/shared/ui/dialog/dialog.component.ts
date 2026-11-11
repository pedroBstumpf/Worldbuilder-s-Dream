import { DialogRef } from '@angular/cdk/dialog';
import { booleanAttribute, Component, inject, input } from '@angular/core';
import { IconButtonComponent } from '../icon-button/icon-button.component';
import { WD_UI_STRINGS } from '../ui-strings';
import { WD_DIALOG_TITLE_ID } from './dialog.service';

/** `surface`: painel de couro; `page`: folha de pergaminho (diálogos de leitura). */
export type DialogSurface = 'surface' | 'page';

const CORNERS = ['tl', 'tr', 'bl', 'br'] as const;

let nextFallbackId = 0;

/**
 * Moldura dos diálogos abertos pelo DialogService:
 * ```html
 * <wd-dialog title="Renomear mundo" ornate>
 *   <p>…</p>
 *   <button wd-button wdDialogAction type="button">Cancelar</button>
 * </wd-dialog>
 * ```
 * Os elementos com `wdDialogAction` vão para o rodapé, alinhados à direita.
 */
@Component({
  selector: 'wd-dialog',
  imports: [IconButtonComponent],
  template: `
    @if (ornate()) {
      @for (corner of corners; track corner) {
        <svg
          class="corner"
          [attr.data-corner]="corner"
          viewBox="0 0 28 28"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M1.5 26.5V9Q1.5 1.5 9 1.5h17.5" />
          <path class="thin" d="M6 22V11q0-5 5-5h11" />
          <path class="gem" d="M9 6.5 11.5 9 9 11.5 6.5 9z" />
        </svg>
      }
    }
    <header class="mb-4 flex items-start justify-between gap-4">
      <h2 class="title wd-inscription pt-1 text-lg" [id]="titleId">{{ title() }}</h2>
      @if (closable()) {
        <button
          wd-icon-button
          type="button"
          icon="close"
          size="sm"
          tooltipPosition="below"
          [label]="strings.closeDialog"
          (click)="close()"
        ></button>
      }
    </header>
    <div class="font-book text-lg"><ng-content /></div>
    <div class="mt-6 flex flex-wrap justify-end gap-2 empty:hidden">
      <ng-content select="[wdDialogAction]" />
    </div>
  `,
  host: {
    class: 'relative block w-lg max-w-full rounded-panel',
    '[class.wd-panel]': "surface() === 'surface'",
    '[class.wd-page]': "surface() === 'page'",
    '[class.p-6]': '!ornate()',
    '[class.p-10]': 'ornate()',
  },
  styles: `
    :host {
      animation: dialog-in var(--wd-dur-slow) var(--wd-ease-out);
    }

    :host(.wd-page) {
      border: 1px solid var(--wd-rule-strong);
      box-shadow: var(--wd-shadow-panel);
    }

    .title {
      color: var(--wd-accent);
    }

    :host(.wd-page) .title {
      color: var(--wd-text-on-page);
    }

    .corner {
      position: absolute;
      inline-size: 1.75rem;
      block-size: 1.75rem;
      color: var(--wd-rule-strong);
      fill: none;
      stroke: currentcolor;
      stroke-width: 1.5;
      pointer-events: none;
    }

    .corner .thin {
      stroke-width: 0.75;
    }

    .corner .gem {
      fill: currentcolor;
      stroke: none;
    }

    .corner[data-corner='tl'] {
      inset: 6px auto auto 6px;
    }

    .corner[data-corner='tr'] {
      inset: 6px 6px auto auto;
      transform: scaleX(-1);
    }

    .corner[data-corner='bl'] {
      inset: auto auto 6px 6px;
      transform: scaleY(-1);
    }

    .corner[data-corner='br'] {
      inset: auto 6px 6px auto;
      transform: scale(-1);
    }

    @keyframes dialog-in {
      from {
        opacity: 0;
        transform: translateY(8px) scale(0.98);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      :host {
        animation: none;
      }
    }
  `,
})
export class DialogComponent {
  readonly title = input.required<string>();
  readonly surface = input<DialogSurface>('surface');
  /** Cantoneiras douradas, para diálogos importantes (docs/05). */
  readonly ornate = input(false, { transform: booleanAttribute });
  /** Mostra o botão de fechar no canto. */
  readonly closable = input(true, { transform: booleanAttribute });

  protected readonly corners = CORNERS;
  protected readonly strings = inject(WD_UI_STRINGS);
  protected readonly titleId =
    inject(WD_DIALOG_TITLE_ID, { optional: true }) ?? `wd-dialog-title-x${nextFallbackId++}`;

  private readonly dialogRef = inject(DialogRef, { optional: true });

  protected close(): void {
    this.dialogRef?.close();
  }
}
