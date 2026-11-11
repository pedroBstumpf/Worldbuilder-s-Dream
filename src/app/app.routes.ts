import { Routes } from '@angular/router';

export const routes: Routes = [
  // Endereço desconhecido volta para o início (docs/04 › Rotas).
  { path: '**', redirectTo: '' },
];
