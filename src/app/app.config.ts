import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withComponentInputBinding, withViewTransitions } from '@angular/router';
import { bookViewTransition } from '@core/motion/book-view-transition';
import { UI_STRINGS } from '@core/strings/ui.strings';
import { provideDataAccess } from '@data/provide-data-access';
import { provideUiStrings } from '@shared/ui/ui-strings';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      // Só o zoom livro ↔ mapa anima; bookViewTransition pula as demais (ADR-0011).
      withViewTransitions({
        skipInitialTransition: true,
        onViewTransitionCreated: bookViewTransition,
      }),
    ),
    provideUiStrings(UI_STRINGS),
    // Portas → adaptadores do build (docs/04, docs/10: front primeiro).
    ...provideDataAccess(),
  ],
};
