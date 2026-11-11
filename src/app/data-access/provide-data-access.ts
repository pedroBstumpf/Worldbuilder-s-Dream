import type { EnvironmentProviders } from '@angular/core';
import { environment } from '../../environments/environment';
import type { Environment } from '../../environments/environment.model';
import { provideLocalDataAccess } from './local/provide-local-data-access';

/**
 * Portas de `domain/ports` → adaptadores escolhidos por `environment.dataSource` (docs/04).
 * No build de produção, este arquivo é trocado por `provide-data-access.production.ts`
 * (angular.json › fileReplacements), que não importa o modo local: o IndexedDB e o login
 * simulado ficam fora do bundle de produção.
 */
export function provideDataAccess(): EnvironmentProviders[] {
  // provideSupabaseDataAccess() entra na Fase 2.
  return isLocal(environment) ? [provideLocalDataAccess()] : [];
}

/**
 * Parâmetro com o tipo largo: o compilador também checa este arquivo com o environment
 * de produção, cujo tipo só aceita 'supabase' e tornaria a comparação um erro.
 */
function isLocal(env: Environment): boolean {
  return env.dataSource === 'local';
}
