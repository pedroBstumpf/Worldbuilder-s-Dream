import { inject, Injectable } from '@angular/core';
import { AuthService, type AuthUser } from '@domain/ports';
import { LOCAL_DATA_OPTIONS } from './local-database';

/**
 * Usuário do modo demonstração. O id é fixo para os mundos locais continuarem dele
 * depois de sair e entrar de novo (e numa importação futura para o Supabase).
 */
export const FAKE_USER: AuthUser = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'visitante@demonstracao.local',
  displayName: 'Visitante',
  avatarUrl: null,
};

/** Chave do `localStorage` que lembra a sessão simulada entre recargas. */
export const FAKE_SESSION_KEY = 'wd:local-session';

/**
 * Login simulado do modo local (docs/10, regra 3): "Entrar com Google" só marca a sessão,
 * para a capa e as animações do livro funcionarem sem conta. Nunca vai para produção.
 */
@Injectable()
export class FakeAuthService extends AuthService {
  private readonly options = inject(LOCAL_DATA_OPTIONS);
  private readonly listeners = new Set<(user: AuthUser | null) => void>();
  private user: AuthUser | null = readSession() ? FAKE_USER : null;

  override async getUser(): Promise<AuthUser | null> {
    return this.user;
  }

  override async signInWithGoogle(): Promise<void> {
    if (this.options.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.options.latencyMs));
    }
    writeSession(true);
    this.setUser(FAKE_USER);
  }

  override async signOut(): Promise<void> {
    writeSession(false);
    this.setUser(null);
  }

  override onUserChange(listener: (user: AuthUser | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setUser(user: AuthUser | null): void {
    if (this.user === user) return;
    this.user = user;
    for (const listener of this.listeners) listener(user);
  }
}

// O localStorage pode estar bloqueado (modo privado, política do navegador): sem ele,
// a sessão simulada só dura até recarregar a página.
function readSession(): boolean {
  try {
    return globalThis.localStorage?.getItem(FAKE_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function writeSession(signedIn: boolean): void {
  try {
    if (signedIn) globalThis.localStorage?.setItem(FAKE_SESSION_KEY, '1');
    else globalThis.localStorage?.removeItem(FAKE_SESSION_KEY);
  } catch {
    // Sem armazenamento: a sessão fica só em memória.
  }
}
