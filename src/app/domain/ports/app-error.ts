/** Códigos de erro que os adaptadores devolvem às stores (tabela "Erros" do docs/02). */
export type AppErrorCode =
  | 'unauthenticated'
  | 'not_allowed'
  | 'invite_invalid'
  | 'wrong_account'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'validation'
  | 'google_unavailable'
  | 'paused'
  | 'network';

/**
 * Erro conhecido do app. Os adaptadores de `data-access` convertem os erros do back-end
 * (Postgres, PostgREST, IndexedDB) para ele; a interface decide a mensagem pelo `code`.
 */
export class AppError extends Error {
  override readonly name = 'AppError';

  constructor(
    readonly code: AppErrorCode,
    message: string = code,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export function isAppError(error: unknown, code?: AppErrorCode): error is AppError {
  return error instanceof AppError && (code === undefined || error.code === code);
}
