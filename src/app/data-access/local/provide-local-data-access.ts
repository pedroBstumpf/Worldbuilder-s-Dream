import { makeEnvironmentProviders, type EnvironmentProviders } from '@angular/core';
import { DEMO_MODE } from '@core/data-source/demo-mode';
import {
  AssetRepository,
  AuthService,
  EntityRepository,
  EventRepository,
  MapRepository,
  WorldRepository,
} from '@domain/ports';
import { FakeAuthService } from './fake-auth.service';
import {
  DEFAULT_LOCAL_DATA_OPTIONS,
  LOCAL_DATA_OPTIONS,
  LocalDatabase,
  type LocalDataAccessOptions,
} from './local-database';
import { LocalAssetRepository } from './local-asset.repository';
import { LocalEntityRepository } from './local-entity.repository';
import { LocalEventRepository } from './local-event.repository';
import { LocalMapRepository } from './local-map.repository';
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
    { provide: DEMO_MODE, useValue: true },
    LocalDatabase,
    { provide: AuthService, useClass: FakeAuthService },
    { provide: WorldRepository, useClass: LocalWorldRepository },
    { provide: MapRepository, useClass: LocalMapRepository },
    { provide: EntityRepository, useClass: LocalEntityRepository },
    { provide: EventRepository, useClass: LocalEventRepository },
    { provide: AssetRepository, useClass: LocalAssetRepository },
  ]);
}
