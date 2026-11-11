import { TestBed } from '@angular/core/testing';
import { DEMO_MODE } from '@core/data-source/demo-mode';
import { DEMO_STRINGS } from '@core/strings/demo.strings';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
    }).compileComponents();
  });

  it('creates the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('hosts the router outlet', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('router-outlet')).not.toBeNull();
  });

  it('hides the demo badge outside demo mode', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('wd-demo-badge')).toBeNull();
  });

  it('shows the demo badge in demo mode', async () => {
    TestBed.overrideProvider(DEMO_MODE, { useValue: true });
    const fixture = TestBed.createComponent(AppComponent);
    await fixture.whenStable();

    const badge = (fixture.nativeElement as HTMLElement).querySelector('wd-demo-badge');
    expect(badge?.getAttribute('role')).toBe('note');
    expect(badge?.textContent).toContain(DEMO_STRINGS.badge);
    expect(badge?.textContent).toContain(DEMO_STRINGS.badgeDetail);
  });
});
