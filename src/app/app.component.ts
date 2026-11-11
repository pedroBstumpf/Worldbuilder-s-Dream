import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

// OnPush é o padrão no Angular 22; não use ChangeDetectionStrategy.Eager.
@Component({
  selector: 'wd-root',
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
})
export class AppComponent {}
