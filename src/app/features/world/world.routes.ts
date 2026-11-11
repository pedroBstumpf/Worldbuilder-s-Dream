import type { Routes } from '@angular/router';

/** Rotas de `/w/:worldId` (docs/04 › Rotas). */
const routes: Routes = [{ path: '', loadComponent: () => import('./shell/world-shell.page') }];

export default routes;
