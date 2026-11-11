import { InjectionToken } from '@angular/core';

/**
 * Verdadeiro no modo local (demonstração): dados só neste navegador e login simulado.
 * Ligado por `provideLocalDataAccess()`; a interface usa só para mostrar o selo e os
 * avisos (docs/10, regra 4). Ninguém deve mudar de comportamento por ele: quem precisa
 * de dados injeta as portas de `domain/ports`.
 */
export const DEMO_MODE = new InjectionToken<boolean>('DEMO_MODE', {
  providedIn: 'root',
  factory: () => false,
});
