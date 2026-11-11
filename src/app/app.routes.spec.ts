// IndexedDB em memória: o jsdom não tem IndexedDB.
import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { FAKE_SESSION_KEY } from '@data/local/fake-auth.service';
import { provideLocalDataAccess } from '@data/local/provide-local-data-access';
import { routes } from './app.routes';

describe('app routes', () => {
  function setup(signedIn = false): Router {
    localStorage.clear();
    if (signedIn) localStorage.setItem(FAKE_SESSION_KEY, '1');
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideLocalDataAccess({ dbName: `test-${crypto.randomUUID()}` }),
      ],
    });
    return TestBed.inject(Router);
  }

  afterEach(() => localStorage.clear());

  it('redirects unknown urls to the cover', async () => {
    const router = setup();

    await router.navigateByUrl('/app/study/40');

    expect(router.url).toBe('/');
  });

  it('serves the internal /dev page in development', async () => {
    const router = setup();

    await router.navigateByUrl('/dev');

    expect(router.url).toBe('/dev');
  });

  it('no longer serves the book proof of concept', async () => {
    const router = setup();

    await router.navigateByUrl('/dev/livro');

    expect(router.url).toBe('/');
  });

  it('keeps guests on the cover', async () => {
    const router = setup();

    await router.navigateByUrl('/biblioteca');
    expect(router.url).toBe('/');

    await router.navigateByUrl('/w/00000000-0000-4000-8000-000000000123');
    expect(router.url).toBe('/');
  });

  it('opens the library when the session is valid', async () => {
    const router = setup(true);

    await router.navigateByUrl('/');

    expect(router.url).toBe('/biblioteca');
  });
});
