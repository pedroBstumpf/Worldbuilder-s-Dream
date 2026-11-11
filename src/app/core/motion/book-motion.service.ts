import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';

/**
 * Como as transições do livro tocam. Mesma união de `shared/motion` (BookAnimator);
 * repetida aqui porque `core` e `shared` não se importam (docs/03).
 */
export type BookMotion = 'full' | 'short' | 'fade';

/**
 * Movimento do livro (ADR-0011). As transições são sempre completas; não há
 * preferência no app. Duas exceções automáticas:
 * - `prefers-reduced-motion: reduce` → fade cruzado de 150 ms;
 * - fps baixo detectado numa animação → versão curta até o fim da sessão.
 */
@Injectable({ providedIn: 'root' })
export class BookMotionService {
  private readonly reduced = signal(false);
  private readonly lowFps = signal(false);

  readonly motion = computed<BookMotion>(() => {
    if (this.reduced()) return 'fade';
    return this.lowFps() ? 'short' : 'full';
  });

  constructor() {
    const query = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return;
    this.reduced.set(query.matches);
    const onChange = (event: MediaQueryListEvent) => this.reduced.set(event.matches);
    query.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => query.removeEventListener('change', onChange));
  }

  /** Uma animação começou lenta: as próximas da sessão usam a versão curta. */
  reportLowFps(): void {
    this.lowFps.set(true);
  }
}
