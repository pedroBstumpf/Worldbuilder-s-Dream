import type { Uuid } from '@domain/models';
import { AppError, isAppError, type AuthService } from '@domain/ports';
import type { IDBPDatabase, IDBPTransaction, StoreNames } from 'idb';

/** Hora atual em ISO 8601, como `now()` nas colunas `timestamptz`. */
export function timestamp(): string {
  return new Date().toISOString();
}

/**
 * Converte erros do IndexedDB em `AppError`: violação de chave ou índice único vira
 * `conflict`, como o `23505` do Postgres (docs/02). Outros erros seguem como estão.
 */
export function toAppError(error: unknown): unknown {
  if (isAppError(error)) return error;
  if (error instanceof Error || error instanceof DOMException) {
    if (error.name === 'ConstraintError') {
      return new AppError('conflict', 'registro duplicado', { cause: error });
    }
  }
  return error;
}

/**
 * Executa `work` numa transação de escrita e espera o commit. Se `work` falhar, a
 * transação é abortada, então nenhuma escrita parcial fica gravada (como no Postgres).
 * Dentro de `work`, só aguarde requisições do próprio IndexedDB: qualquer outra espera
 * deixa a transação terminar no meio.
 */
export async function inTransaction<DB, Names extends ArrayLike<StoreNames<DB>>, R>(
  db: IDBPDatabase<DB>,
  storeNames: Names,
  work: (tx: IDBPTransaction<DB, Names, 'readwrite'>) => Promise<R>,
): Promise<R> {
  const tx = db.transaction(storeNames, 'readwrite');
  const result = work(tx).catch((error: unknown) => {
    try {
      tx.abort();
    } catch {
      // A transação já tinha terminado (por exemplo, abortada pelo próprio IndexedDB).
    }
    throw error;
  });
  // O erro de `work` tem prioridade: o `AbortError` de `tx.done` é só consequência dele.
  const done = tx.done;
  done.catch(() => undefined);
  try {
    const value = await result;
    await done;
    return value;
  } catch (error) {
    throw toAppError(error);
  }
}

/** Id do usuário atual; sem sessão, `AppError('unauthenticated')` (o RLS faria o mesmo). */
export async function requireUserId(auth: AuthService): Promise<Uuid> {
  const user = await auth.getUser();
  if (!user) throw new AppError('unauthenticated');
  return user.id;
}

/**
 * Remove chaves com `undefined`, para um rascunho ou patch não sobrescrever padrões e
 * campos que não mencionou (`{ tickEnd: undefined }` não vira `tickEnd: undefined`).
 */
export function definedOnly<T extends object>(value: T): WithoutUndefined<T> {
  const entries = Object.entries(value).filter(([, field]) => field !== undefined);
  return Object.fromEntries(entries) as WithoutUndefined<T>;
}

/** Os mesmos campos (obrigatórios continuam obrigatórios), sem `undefined` nos valores. */
export type WithoutUndefined<T> = { [K in keyof T]: Exclude<T[K], undefined> };
