import { TestBed } from '@angular/core/testing';
import { FAKE_SESSION_KEY, FAKE_USER, FakeAuthService } from './fake-auth.service';

describe('FakeAuthService', () => {
  function create(): FakeAuthService {
    TestBed.configureTestingModule({ providers: [FakeAuthService] });
    return TestBed.inject(FakeAuthService);
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('starts signed out when no session was saved', async () => {
    expect(await create().getUser()).toBeNull();
  });

  it('signs in the demo user and notifies listeners', async () => {
    const auth = create();
    const listener = vi.fn();
    auth.onUserChange(listener);

    await auth.signInWithGoogle();

    expect(await auth.getUser()).toEqual(FAKE_USER);
    expect(listener).toHaveBeenCalledExactlyOnceWith(FAKE_USER);
    expect(localStorage.getItem(FAKE_SESSION_KEY)).toBe('1');
  });

  it('restores the saved session after a reload', async () => {
    localStorage.setItem(FAKE_SESSION_KEY, '1');
    expect(await create().getUser()).toEqual(FAKE_USER);
  });

  it('signs out, forgets the session and stops notifying cancelled listeners', async () => {
    const auth = create();
    await auth.signInWithGoogle();
    const listener = vi.fn();
    const cancel = auth.onUserChange(listener);

    await auth.signOut();
    cancel();
    await auth.signInWithGoogle();

    expect(listener).toHaveBeenCalledExactlyOnceWith(null);
    expect(localStorage.getItem(FAKE_SESSION_KEY)).toBe('1');
    await auth.signOut();
    expect(localStorage.getItem(FAKE_SESSION_KEY)).toBeNull();
  });
});
