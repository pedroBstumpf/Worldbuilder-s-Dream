import { inject } from '@angular/core';
import { type CanMatchFn, Router } from '@angular/router';
import { BookTransitions } from '@core/motion/book-transitions.service';
import { SessionStore } from './session.store';

/** Rotas de quem entrou; sem sessão, volta à capa. Só melhora a UX: a segurança é o RLS. */
export const authGuard: CanMatchFn = async () => {
  const session = inject(SessionStore);
  const router = inject(Router);
  await session.load();
  return session.signedIn() || router.parseUrl('/');
};

/** A capa é de quem não entrou; com sessão válida, o livro abre na versão curta (docs/04). */
export const guestGuard: CanMatchFn = async () => {
  const session = inject(SessionStore);
  const router = inject(Router);
  const transitions = inject(BookTransitions);
  await session.load();
  if (!session.signedIn()) return true;
  transitions.expect({ kind: 'resume' });
  return router.parseUrl('/biblioteca');
};
