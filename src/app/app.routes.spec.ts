import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { routes } from './app.routes';

describe('app routes', () => {
  function setup(): Router {
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
    return TestBed.inject(Router);
  }

  it('redirects unknown urls to the start page', async () => {
    const router = setup();

    await router.navigateByUrl('/app/study/40');

    expect(router.url).toBe('/');
  });

  it('serves the internal /dev page in development', async () => {
    const router = setup();

    await router.navigateByUrl('/dev');

    expect(router.url).toBe('/dev');
  });
});
