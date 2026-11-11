import { makeEnvironmentProviders, type EnvironmentProviders } from '@angular/core';
import { AuthService, WorldRepository } from '@domain/ports';
import { FakeAuthService } from './fake-auth.service';
import {
  DEFAULT_LOCAL_DATA_OPTIONS,
  LOCAL_DATA_OPTIONS,
  LocalDatabase,
  type LocalDataAccessOptions,
} from './local-database';
import { LocalWorldRepository } from './local-world.repository';

/**
 * Modo local (docs/10): liga as portas de `domain/ports` aos adaptadores IndexedDB e ao
 * login simulado. Componentes e stores injetam só as portas e não sabem qual está ativo.
 */
export function provideLocalDataAccess(
  options: Partial<LocalDataAccessOptions> = {},
): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: LOCAL_DATA_OPTIONS, useValue: { ...DEFAULT_LOCAL_DATA_OPTIONS, ...options } },
    LocalDatabase,
    { provide: AuthService, useClass: FakeAuthService },
    { provide: WorldRepository, useClass: LocalWorldRepository },
  ]);
}
