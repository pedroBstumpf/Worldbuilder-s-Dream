import { InjectionToken, type Provider } from '@angular/core';

/**
 * Textos usados dentro de shared/ui. shared não importa core (docs/03), então os
 * valores em pt-BR vêm de core/strings e são fornecidos no app.config.
 */
export interface UiStrings {
  /** Botão de fechar diálogo. */
  readonly closeDialog: string;
  /** Botão de dispensar um aviso (toast). */
  readonly dismissToast: string;
}

export const WD_UI_STRINGS = new InjectionToken<UiStrings>('WD_UI_STRINGS');

export function provideUiStrings(strings: UiStrings): Provider {
  return { provide: WD_UI_STRINGS, useValue: strings };
}
