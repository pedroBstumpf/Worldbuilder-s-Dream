import type { AutoFocusTarget } from '@angular/cdk/dialog';
import { Dialog, DialogRef } from '@angular/cdk/dialog';
import type { ComponentType } from '@angular/cdk/portal';
import { inject, Injectable, InjectionToken } from '@angular/core';

/** Id do título do diálogo aberto; o `<wd-dialog>` usa no `<h2>` (aria-labelledby). */
export const WD_DIALOG_TITLE_ID = new InjectionToken<string>('WD_DIALOG_TITLE_ID');

export interface DialogOptions<D> {
  /** Dados lidos no componente com `inject(DIALOG_DATA)`. */
  readonly data?: D;
  /** Impede fechar com Esc ou clique fora (ex.: operação em andamento). */
  readonly disableClose?: boolean;
  /**
   * Onde o foco começa. Padrão: o próprio diálogo, para o leitor de tela anunciar o
   * título; use `'first-tabbable'` em formulários (respeita `cdkFocusInitial`).
   */
  readonly autoFocus?: AutoFocusTarget | string;
}

let nextTitleId = 0;

/**
 * Abre diálogos modais sobre o CDK Dialog (docs/04): foco preso, restaurado ao
 * fechar, Esc e clique no fundo fecham. O componente aberto deve usar `<wd-dialog>`.
 */
@Injectable({ providedIn: 'root' })
export class DialogService {
  private readonly dialog = inject(Dialog);

  open<C, D = unknown, R = unknown>(
    component: ComponentType<C>,
    options: DialogOptions<D> = {},
  ): DialogRef<R, C> {
    const titleId = `wd-dialog-title-${nextTitleId++}`;
    return this.dialog.open<R, D, C>(component, {
      data: options.data,
      disableClose: options.disableClose ?? false,
      autoFocus: options.autoFocus ?? 'dialog',
      restoreFocus: true,
      ariaModal: true,
      ariaLabelledBy: titleId,
      hasBackdrop: true,
      panelClass: 'wd-dialog-pane',
      backdropClass: 'wd-dialog-backdrop',
      maxWidth: 'calc(100vw - 2rem)',
      providers: [{ provide: WD_DIALOG_TITLE_ID, useValue: titleId }],
    });
  }
}
