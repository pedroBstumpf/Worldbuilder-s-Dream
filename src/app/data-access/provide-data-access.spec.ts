import { TestBed } from '@angular/core/testing';
import { DEMO_MODE } from '@core/data-source/demo-mode';
import {
  AssetRepository,
  AuthService,
  EntityRepository,
  EventRepository,
  MapRepository,
  ProfileRepository,
  WorldRepository,
} from '@domain/ports';
import { FakeAuthService } from './local/fake-auth.service';
import { LocalWorldRepository } from './local/local-world.repository';
import { provideDataAccess } from './provide-data-access';

describe('provideDataAccess', () => {
  it('is in demo mode only with the local adapters', () => {
    TestBed.configureTestingModule({});
    expect(TestBed.inject(DEMO_MODE)).toBe(false);
  });

  it('binds every port to the local adapters in development', () => {
    TestBed.configureTestingModule({ providers: [provideDataAccess()] });

    expect(TestBed.inject(DEMO_MODE)).toBe(true);
    expect(TestBed.inject(AuthService)).toBeInstanceOf(FakeAuthService);
    expect(TestBed.inject(WorldRepository)).toBeInstanceOf(LocalWorldRepository);
    for (const port of [
      MapRepository,
      EntityRepository,
      EventRepository,
      AssetRepository,
      ProfileRepository,
    ]) {
      expect(TestBed.inject<object>(port)).toBeInstanceOf(port);
    }
  });
});
