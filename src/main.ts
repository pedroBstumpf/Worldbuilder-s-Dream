import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, appConfig).catch((err: unknown) => {
  // Falha no bootstrap: ainda não há ErrorHandler nem toast para avisar.
  // eslint-disable-next-line no-console
  console.error(err);
});
