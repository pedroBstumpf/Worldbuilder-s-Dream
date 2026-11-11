import { TestBed } from '@angular/core/testing';
import { AuthService, isAppError, ProfileRepository } from '@domain/ports';
import { FAKE_USER } from './fake-auth.service';
import { setUpLocalTestBed } from './testing/local-test-bed';

describe('LocalProfileRepository', () => {
  let profiles: ProfileRepository;
  let teardown: () => Promise<void>;

  beforeEach(async () => {
    ({ teardown } = await setUpLocalTestBed());
    profiles = TestBed.inject(ProfileRepository);
  });

  afterEach(() => teardown());

  it('creates the profile of the current user on first read', async () => {
    const profile = await profiles.getMine();

    expect(profile).toMatchObject({
      id: FAKE_USER.id,
      displayName: FAKE_USER.displayName,
      locale: 'pt-BR',
      uiPrefs: {},
    });
    expect(await profiles.getMine()).toEqual(profile);
  });

  it('merges ui prefs shallowly and removes keys set to null', async () => {
    await profiles.patchUiPrefs({ bars: { left: true }, camera: { m1: { x: 1, y: 2, zoom: 1 } } });
    const prefs = await profiles.patchUiPrefs({ bars: { left: false }, camera: null });

    expect(prefs).toEqual({ bars: { left: false } });
    expect((await profiles.getMine()).uiPrefs).toEqual({ bars: { left: false } });
  });

  it('rejects prefs over 16 kB', async () => {
    const error = await profiles.patchUiPrefs({ big: 'x'.repeat(17000) }).catch((e) => e);

    expect(isAppError(error, 'validation')).toBe(true);
    expect((await profiles.getMine()).uiPrefs).toEqual({});
  });

  it('requires a session', async () => {
    await TestBed.inject(AuthService).signOut();

    expect(isAppError(await profiles.getMine().catch((e) => e), 'unauthenticated')).toBe(true);
  });
});
