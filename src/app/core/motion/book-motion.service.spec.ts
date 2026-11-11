import { TestBed } from '@angular/core/testing';
import { BookMotionService } from './book-motion.service';

describe('BookMotionService', () => {
  let listener: ((event: MediaQueryListEvent) => void) | null = null;

  function setup(reduced: boolean): BookMotionService {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: reduced && query.includes('reduce'),
      addEventListener: (_: string, fn: (event: MediaQueryListEvent) => void) => (listener = fn),
      removeEventListener: () => (listener = null),
    }));
    return TestBed.inject(BookMotionService);
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    listener = null;
  });

  it('plays the full transitions by default', () => {
    expect(setup(false).motion()).toBe('full');
  });

  it('switches to the short version after low fps for the rest of the session', () => {
    const service = setup(false);
    service.reportLowFps();
    expect(service.motion()).toBe('short');
  });

  it('cross-fades when the system asks for reduced motion', () => {
    const service = setup(true);
    service.reportLowFps();
    expect(service.motion()).toBe('fade');
  });

  it('follows changes of the system setting', () => {
    const service = setup(false);
    listener?.({ matches: true } as MediaQueryListEvent);
    expect(service.motion()).toBe('fade');
  });
});
