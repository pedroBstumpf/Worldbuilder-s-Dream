import { inject } from '@angular/core';
import type { ViewTransitionInfo } from '@angular/router';
import { BookMotionService } from './book-motion.service';
import { BookTransitions } from './book-transitions.service';

/** Atributo no `<html>` durante o zoom; o CSS global escolhe a duração por ele. */
export const BOOK_ZOOM_ATTRIBUTE = 'data-book-zoom';

const SKIP_KEYS = new Set(['Escape', 'Enter']);

/**
 * `onViewTransitionCreated` do Router (docs/04 › Transições do livro). Só o zoom entre a
 * página do livro e o mapa (`view-transition-name: wd-world-map`) anima; qualquer outra
 * navegação pula a transição. No movimento reduzido, a tela do mapa faz o próprio fade.
 * Clique, toque, Esc ou Enter levam ao estado final.
 */
export function bookViewTransition({ transition }: ViewTransitionInfo): void {
  // Pular rejeita `ready` com AbortError; o Router já trata e, só em desenvolvimento,
  // registra no console. Não é erro do app.
  const arrival = inject(BookTransitions).arrival();
  const motion = inject(BookMotionService).motion();
  if (!arrival || arrival.kind === 'resume' || motion === 'fade') {
    transition.skipTransition();
    return;
  }
  inject(BookTransitions).track(transition);

  const root = document.documentElement;
  root.setAttribute(BOOK_ZOOM_ATTRIBUTE, motion);
  const onKey = (event: KeyboardEvent) => {
    if (!SKIP_KEYS.has(event.key)) return;
    event.preventDefault();
    transition.skipTransition();
  };
  const onPointer = () => transition.skipTransition();
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('pointerdown', onPointer, true);
  const done = () => {
    root.removeAttribute(BOOK_ZOOM_ATTRIBUTE);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onPointer, true);
  };
  transition.finished.then(done, done);
}
