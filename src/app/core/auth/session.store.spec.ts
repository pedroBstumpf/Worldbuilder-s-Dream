import { TestBed } from '@angular/core/testing';
import { AuthService, isAppError } from '@domain/ports';
import { SessionStore } from './session.store';
import { STUB_USER, StubAuthService } from './testing/stub-auth.service';

describe('SessionStore', () => {
  function setup(user = STUB_USER as typeof STUB_USER | null) {
    const auth = new StubAuthService();
    auth.user = user;
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: auth }] });
    return { auth, session: TestBed.inject(SessionStore) };
  }

  it('restores the saved session once', async () => {
    const { auth, session } = setup();
    const getUser = vi.spyOn(auth, 'getUser');

    await Promise.all([session.load(), session.load()]);

    expect(session.user()).toEqual(STUB_USER);
    expect(session.signedIn()).toBe(true);
    expect(session.loaded()).toBe(true);
    expect(getUser).toHaveBeenCalledOnce();
  });

  it('signs in and out', async () => {
    const { session } = setup(null);
    await session.load();
    expect(session.signedIn()).toBe(false);

    await session.signIn();
    expect(session.user()).toEqual(STUB_USER);

    await session.signOut();
    expect(session.signedIn()).toBe(false);
  });

  it('keeps the user signed out when the e-mail is refused', async () => {
    const { auth, session } = setup(null);
    auth.refuse = true;

    const error = await session.signIn().catch((e: unknown) => e);

    expect(isAppError(error, 'not_allowed')).toBe(true);
    expect(session.signedIn()).toBe(false);
  });

  it('follows sign-ins and sign-outs made elsewhere', () => {
    const { auth, session } = setup(null);

    auth.setUser(STUB_USER);
    expect(session.user()).toEqual(STUB_USER);

    auth.setUser(null);
    expect(session.user()).toBeNull();
  });
});
