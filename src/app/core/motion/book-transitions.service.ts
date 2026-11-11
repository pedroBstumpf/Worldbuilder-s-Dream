import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { NavigationEnd, NavigationError, Router } from '@angular/router';
import type { Uuid } from '@domain/models';

/**
 * Como a próxima tela do livro deve chegar (docs/05 › Transições do livro):
 * - `resume`: sessão válida em "/" → o livro abre na versão curta;
 * - `zoom-in`: biblioteca → mapa (a página virou; zoom até o canvas);
 * - `zoom-out`: mapa → biblioteca (o mapa encolhe de volta à página, que desvira).
 * Sem chegada marcada (link direto, recarga, botão voltar), a tela abre sem animação.
 */
export type BookArrival =
  | { readonly kind: 'resume' }
  | { readonly kind: 'zoom-in'; readonly worldId: Uuid }
  | { readonly kind: 'zoom-out'; readonly worldId: Uuid };

/**
 * Passa a chegada da tela que sai para a que entra, só em memória: recarregar a página
 * ou voltar pelo histórico nunca repete uma animação. A marca vale para uma navegação.
 */
@Injectable({ providedIn: 'root' })
export class BookTransitions {
  private pending: BookArrival | null = null;
  private readonly transition = signal<ViewTransition | null>(null);

  /** View Transition do zoom em curso, se houver. */
  readonly viewTransition = this.transition.asReadonly();

  constructor() {
    const subscription = inject(Router).events.subscribe((event) => {
      // O redirecionamento de um guard cancela e reinicia a navegação: a marca continua.
      if (event instanceof NavigationEnd || event instanceof NavigationError) this.pending = null;
    });
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
  }

  /** Marca a chegada da próxima navegação. */
  expect(arrival: BookArrival): void {
    this.pending = arrival;
  }

  /** A chegada marcada para a navegação em curso. */
  arrival(): BookArrival | null {
    return this.pending;
  }

  /** Registra a View Transition do zoom até ela terminar. */
  track(transition: ViewTransition): void {
    this.transition.set(transition);
    const done = () => {
      if (this.transition() === transition) this.transition.set(null);
    };
    transition.finished.then(done, done);
  }
}
