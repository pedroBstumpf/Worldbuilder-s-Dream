import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DEMO_MODE } from '@core/data-source/demo-mode';
import { DEMO_STRINGS } from '@core/strings/demo.strings';
import { DemoBadgeComponent } from '@shared/ui/demo-badge/demo-badge.component';

// OnPush é o padrão no Angular 22; não use ChangeDetectionStrategy.Eager.
@Component({
  selector: 'wd-root',
  imports: [RouterOutlet, DemoBadgeComponent],
  templateUrl: './app.component.html',
})
export class AppComponent {
  protected readonly demoMode = inject(DEMO_MODE);
  protected readonly demoStrings = DEMO_STRINGS;
}
