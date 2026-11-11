import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { DEMO_MODE } from '@core/data-source/demo-mode';
import { DEMO_STRINGS } from '@core/strings/demo.strings';
import { DemoBadgeComponent } from '@shared/ui/demo-badge/demo-badge.component';
import { filter, map } from 'rxjs';

// OnPush é o padrão no Angular 22; não use ChangeDetectionStrategy.Eager.
@Component({
  selector: 'wd-root',
  imports: [RouterOutlet, DemoBadgeComponent],
  templateUrl: './app.component.html',
})
export class AppComponent {
  protected readonly demoMode = inject(DEMO_MODE);
  protected readonly demoStrings = DEMO_STRINGS;

  private readonly router = inject(Router);
  /** Na tela do mundo, o selo fica na barra superior (docs/04 › Modo local). */
  protected readonly inWorld = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url.startsWith('/w/')),
    ),
    { initialValue: false },
  );
}
