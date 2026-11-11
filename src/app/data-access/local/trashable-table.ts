import type { SoftDeletable, Uuid, Versioned } from '@domain/models';
import { AppError } from '@domain/ports';
import type { IDBPDatabase } from 'idb';
import type { LocalDatabase } from './local-database';
import { definedOnly, inTransaction, timestamp } from './local-transaction';

/** Linha de uma tabela principal: com `version` e lixeira (docs/07, "Convenções"). */
export interface TrashableRow extends Versioned, SoftDeletable {
  id: Uuid;
}

export type TrashableStoreName = 'worlds' | 'maps' | 'entities' | 'events';

export function isLive<T extends SoftDeletable>(row: T | undefined): row is T {
  return row !== undefined && row.deletedAt === null;
}

/**
 * Leitura e escrita de uma tabela principal com as convenções das portas
 * (`WorldRepository`): o trigger de `version`/`updated_at` vira `+1`/`timestamp()` a cada
 * escrita; `update` e `moveToTrash` recusam versão antiga com `conflict`; itens ausentes
 * ou na lixeira são `null` na leitura e `not_found` na escrita.
 */
export class TrashableTable<T extends TrashableRow> {
  constructor(
    private readonly database: LocalDatabase,
    private readonly storeName: TrashableStoreName,
    private readonly check: (row: T) => void,
  ) {}

  /** Banco sem tipos por tabela: aqui o tipo da linha vem de `T`. */
  async db(): Promise<IDBPDatabase> {
    return (await this.database.ready()) as unknown as IDBPDatabase;
  }

  async get(id: Uuid): Promise<T | null> {
    const row: T | undefined = await (await this.db()).get(this.storeName, id);
    return isLive(row) ? row : null;
  }

  /** Itens do mundo fora da lixeira (tabelas com índice `byWorld`). */
  async listByWorld(worldId: Uuid): Promise<T[]> {
    const rows: T[] = await (await this.db()).getAllFromIndex(this.storeName, 'byWorld', worldId);
    return rows.filter(isLive);
  }

  /** Grava uma linha nova; id repetido vira `conflict`. */
  async insert(row: T): Promise<T> {
    this.check(row);
    await inTransaction(await this.db(), [this.storeName], async (tx) => {
      await tx.objectStore(this.storeName).add(row);
    });
    return row;
  }

  update(id: Uuid, patch: Partial<T>, expectedVersion: number): Promise<T> {
    const changes = definedOnly(patch);
    return this.change(id, expectedVersion, (row) => ({ ...row, ...changes }));
  }

  async moveToTrash(id: Uuid, expectedVersion: number): Promise<void> {
    await this.change(id, expectedVersion, (row, now) => ({ ...row, deletedAt: now }));
  }

  /** Tira da lixeira; um item que não está na lixeira volta como está. */
  async restore(id: Uuid): Promise<T> {
    return inTransaction(await this.db(), [this.storeName], async (tx) => {
      const store = tx.objectStore(this.storeName);
      const row: T | undefined = await store.get(id);
      if (!row) throw new AppError('not_found');
      if (row.deletedAt === null) return row;
      const now = timestamp();
      const next: T = { ...row, deletedAt: null, version: row.version + 1, updatedAt: now };
      await store.put(next);
      return next;
    });
  }

  private async change(
    id: Uuid,
    expectedVersion: number,
    apply: (row: T, now: string) => T,
  ): Promise<T> {
    return inTransaction(await this.db(), [this.storeName], async (tx) => {
      const store = tx.objectStore(this.storeName);
      const row: T | undefined = await store.get(id);
      if (!isLive(row)) throw new AppError('not_found');
      if (row.version !== expectedVersion) throw new AppError('conflict');
      const now = timestamp();
      const next: T = {
        ...apply(row, now),
        id: row.id,
        createdAt: row.createdAt,
        version: row.version + 1,
        updatedAt: now,
      };
      this.check(next);
      await store.put(next);
      return next;
    });
  }
}
