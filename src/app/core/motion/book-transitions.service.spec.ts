import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { BookTransitions } from './book-transitions.service';

@Component({ template: '' })
class BlankPage {}

describe('BookTransitions', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: '**', component: BlankPage }])],
    });
    return { transitions: TestBed.inject(BookTransitions), router: TestBed.inject(Router) };
  }

  it('keeps the arrival for the next navigation only', async () => {
    const { transitions, router } = setup();
    transitions.expect({ kind: 'zoom-in', worldId: 'w1' });

    expect(transitions.arrival()).toEqual({ kind: 'zoom-in', worldId: 'w1' });
    await router.navigateByUrl('/w/w1');

    expect(transitions.arrival()).toBeNull();
  });

  it('tracks the running view transition until it finishes', async () => {
    const { transitions } = setup();
    let finish: () => void = () => undefined;
    const finished = new Promise<void>((resolve) => (finish = resolve));

    transitions.track({ finished } as ViewTransition);
    expect(transitions.viewTransition()).not.toBeNull();

    finish();
    await finished;
    await Promise.resolve();
    expect(transitions.viewTransition()).toBeNull();
  });
});
