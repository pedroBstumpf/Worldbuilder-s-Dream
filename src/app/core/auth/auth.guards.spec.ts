import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { BookTransitions } from '@core/motion/book-transitions.service';
import { AuthService } from '@domain/ports';
import { authGuard, guestGuard } from './auth.guards';
import { STUB_USER, StubAuthService } from './testing/stub-auth.service';

@Component({ template: '' })
class BlankPage {}

describe('auth guards', () => {
  function setup(signedIn: boolean) {
    const auth = new StubAuthService();
    auth.user = signedIn ? STUB_USER : null;
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        provideRouter([
          { path: '', pathMatch: 'full', canMatch: [guestGuard], component: BlankPage },
          { path: 'biblioteca', canMatch: [authGuard], component: BlankPage },
          { path: '**', redirectTo: '' },
        ]),
      ],
    });
    const transitions = TestBed.inject(BookTransitions);
    const expect_ = vi.spyOn(transitions, 'expect');
    return { router: TestBed.inject(Router), expectArrival: expect_ };
  }

  it('shows the cover to guests', async () => {
    const { router } = setup(false);
    await router.navigateByUrl('/');
    expect(router.url).toBe('/');
  });

  it('sends guests from the library back to the cover', async () => {
    const { router } = setup(false);
    await router.navigateByUrl('/biblioteca');
    expect(router.url).toBe('/');
  });

  it('opens the library with the short opening when the session is valid', async () => {
    const { router, expectArrival } = setup(true);
    await router.navigateByUrl('/');
    expect(router.url).toBe('/biblioteca');
    expect(expectArrival).toHaveBeenCalledWith({ kind: 'resume' });
  });
});
