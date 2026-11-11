import type { Uuid } from '../models/common';

/** Usuário autenticado (conta Google, ADR-0013). */
export interface AuthUser {
  id: Uuid;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

/**
 * Porta de autenticação. Implementada pelo `FakeAuthService` no modo local e pelo
 * Supabase Auth a partir da Fase 2; `core/auth` expõe o usuário como signal.
 */
export abstract class AuthService {
  /** Restaura a sessão salva, se houver. */
  abstract getUser(): Promise<AuthUser | null>;

  /** Inicia o login com Google; rejeita com `AppError('not_allowed')` para e-mail fora da lista. */
  abstract signInWithGoogle(): Promise<void>;

  abstract signOut(): Promise<void>;

  /** Avisa a cada entrada e saída. Devolve a função que cancela a inscrição. */
  abstract onUserChange(listener: (user: AuthUser | null) => void): () => void;
}
