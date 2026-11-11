import { Routes } from '@angular/router';
import { authGuard, guestGuard } from '@core/auth/auth.guards';

/**
 * Rotas só de desenvolvimento. O build de produção define `ngDevMode` como `false`,
 * então a rota e o chunk da página saem do bundle.
 */
const devRoutes: Routes =
  typeof ngDevMode === 'undefined' || ngDevMode
    ? [
        // Vitrine interna de shared/ui (F0-04).
        { path: 'dev', loadComponent: () => import('@features/dev/dev.page') },
      ]
    : [];

export const routes: Routes = [
  ...devRoutes,
  // O livro (ADR-0011): um único BookShell persistente; as rotas-filhas só escolhem
  // a página (capa ou biblioteca) e aplicam os guards, por isso não têm componente.
  {
    path: '',
    loadComponent: () => import('@features/book/book-shell.component'),
    children: [
      // pathMatch 'full': senão a capa casaria por prefixo com /biblioteca.
      {
        path: '',
        pathMatch: 'full',
        canMatch: [guestGuard],
        children: [],
      },
      { path: 'biblioteca', canMatch: [authGuard], children: [] },
    ],
  },
  {
    path: 'w/:worldId',
    canMatch: [authGuard],
    loadChildren: () => import('@features/world/world.routes'),
  },
  // Endereço desconhecido volta para o início (docs/04 › Rotas).
  { path: '**', redirectTo: '' },
];
