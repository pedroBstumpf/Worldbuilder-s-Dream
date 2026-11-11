import { computed, inject } from '@angular/core';
import { AuthService, type AuthUser } from '@domain/ports';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';

interface SessionState {
  readonly user: AuthUser | null;
  /** A sessão salva já foi lida (os guards esperam por isso). */
  readonly loaded: boolean;
}

/**
 * Sessão do usuário (docs/04 › Estado). Só conhece a porta `AuthService`: no modo local
 * o login é simulado, a partir da Fase 2 é o Supabase Auth. Preferências e perfil entram
 * aqui quando existirem.
 */
export const SessionStore = signalStore(
  { providedIn: 'root' },
  withState<SessionState>({ user: null, loaded: false }),
  withComputed(({ user }) => ({ signedIn: computed(() => user() !== null) })),
  withMethods((store, auth = inject(AuthService)) => {
    let loading: Promise<void> | null = null;
    return {
      /** Lê a sessão salva uma única vez; chamadas seguintes reaproveitam a mesma leitura. */
      load(): Promise<void> {
        loading ??= auth
          .getUser()
          .catch(() => null)
          .then((user) => patchState(store, { user, loaded: true }));
        return loading;
      },
      /** Rejeita com `AppError('not_allowed')` quando o e-mail não tem acesso. */
      async signIn(): Promise<void> {
        await auth.signInWithGoogle();
        patchState(store, { user: await auth.getUser(), loaded: true });
      },
      async signOut(): Promise<void> {
        await auth.signOut();
        patchState(store, { user: null, loaded: true });
      },
    };
  }),
  withHooks((store, auth = inject(AuthService)) => {
    let stop: () => void = () => undefined;
    return {
      onInit() {
        stop = auth.onUserChange((user) => patchState(store, { user, loaded: true }));
      },
      onDestroy() {
        stop();
      },
    };
  }),
);
