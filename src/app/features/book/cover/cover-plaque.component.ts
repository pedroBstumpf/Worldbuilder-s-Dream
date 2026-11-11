import { Component, computed, input, output } from '@angular/core';
import { BOOK_STRINGS } from '@core/strings/book.strings';
import { ButtonComponent } from '@shared/ui/button/button.component';

export type CoverError = 'not_allowed' | 'failed';

/**
 * Placa de pergaminho da capa (docs/05 › Capa): título, lema e o único botão,
 * "Entrar com Google". No modo local o login é simulado.
 */
@Component({
  selector: 'wd-cover-plaque',
  imports: [ButtonComponent],
  template: `
    <h1 id="wd-cover-title" class="wd-inscription text-center text-2xl text-ouro-700" tabindex="-1">
      {{ text.title }}
    </h1>
    <p class="text-center font-book text-lg text-couro-600 italic">{{ text.tagline }}</p>
    @if (errorMessage(); as message) {
      <p class="text-center font-book text-lacre" role="alert">{{ message }}</p>
    }
    <button wd-button variant="primary" type="button" [disabled]="busy()" (click)="signIn.emit()">
      <!-- "G" monocromático próprio, em couro-950 (diretrizes de marca do Google). -->
      <svg class="size-4" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M16.95 7.05A7 7 0 1 0 19 12h-7"
          fill="none"
          stroke="currentColor"
          stroke-width="2.6"
        />
      </svg>
      {{ busy() ? text.signingIn : text.signIn }}
    </button>
  `,
  host: {
    class: 'wd-page flex flex-col items-center gap-3',
    '[attr.aria-busy]': 'busy()',
  },
  styles: `
    :host {
      inline-size: 86%;
      padding: 18px 14px;
      border: 1px solid var(--ouro-500);
      border-radius: var(--wd-radius-control);
      outline: 1px solid var(--wd-rule-inner);
      outline-offset: -4px;
    }
  `,
})
export class CoverPlaqueComponent {
  /** O login está em andamento (a rosa dos ventos gira). */
  readonly busy = input(false);
  readonly error = input<CoverError | null>(null);
  readonly signIn = output();

  protected readonly text = BOOK_STRINGS.cover;
  protected readonly errorMessage = computed(() => {
    const error = this.error();
    if (!error) return null;
    return error === 'not_allowed' ? this.text.notAllowed : this.text.failed;
  });
}
