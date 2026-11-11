import { Routes } from '@angular/router';

/**
 * Rotas só de desenvolvimento. O build de produção define `ngDevMode` como `false`,
 * então a rota e o chunk da página saem do bundle.
 */
const devRoutes: Routes =
  typeof ngDevMode === 'undefined' || ngDevMode
    ? [
        // Vitrine interna de shared/ui (F0-04).
        { path: 'dev', loadComponent: () => import('@features/dev/dev.page') },
        // Prova de conceito do livro (F0-07, ADR-0011).
        { path: 'dev/livro', loadComponent: () => import('@features/dev/book-poc/book-poc.page') },
      ]
    : [];

export const routes: Routes = [
  ...devRoutes,
  // Endereço desconhecido volta para o início (docs/04 › Rotas).
  { path: '**', redirectTo: '' },
];
