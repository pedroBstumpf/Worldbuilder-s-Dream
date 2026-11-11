import { Injectable } from '@angular/core';
import { AppError, AuthService, type AuthUser } from '@domain/ports';

export const STUB_USER: AuthUser = {
  id: '00000000-0000-4000-8000-0000000000aa',
  email: 'teste@exemplo.com',
  displayName: 'Teste',
  avatarUrl: null,
};

/** AuthService em memória para os testes de `core` (que não podem importar `data-access`). */
@Injectable()
export class StubAuthService extends AuthService {
  user: AuthUser | null = null;
  /** Faz o próximo login falhar com `not_allowed`. */
  refuse = false;
  private readonly listeners = new Set<(user: AuthUser | null) => void>();

  override async getUser(): Promise<AuthUser | null> {
    return this.user;
  }

  override async signInWithGoogle(): Promise<void> {
    if (this.refuse) throw new AppError('not_allowed');
    this.setUser(STUB_USER);
  }

  override async signOut(): Promise<void> {
    this.setUser(null);
  }

  override onUserChange(listener: (user: AuthUser | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setUser(user: AuthUser | null): void {
    this.user = user;
    for (const listener of this.listeners) listener(user);
  }
}
