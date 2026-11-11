import type { EnvironmentProviders } from '@angular/core';

/**
 * Produção: substitui provide-data-access.ts (angular.json › fileReplacements).
 * Nunca importe `data-access/local` aqui: o modo local não vai para produção (AGENTS.md).
 */
export function provideDataAccess(): EnvironmentProviders[] {
  // Fase 2: return [provideSupabaseDataAccess()];
  return [];
}
