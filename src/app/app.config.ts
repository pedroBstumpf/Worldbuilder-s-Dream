import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { UI_STRINGS } from '@core/strings/ui.strings';
import { provideDataAccess } from '@data/provide-data-access';
import { provideUiStrings } from '@shared/ui/ui-strings';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideUiStrings(UI_STRINGS),
    // Portas → adaptadores do build (docs/04, docs/10: front primeiro).
    ...provideDataAccess(),
  ],
};
