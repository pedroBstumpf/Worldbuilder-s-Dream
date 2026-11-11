// IndexedDB em memória: o jsdom não tem IndexedDB.
import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '@domain/ports';
import { deleteDB } from 'idb';
import { LocalDatabase } from '../local-database';
import { provideLocalDataAccess } from '../provide-local-data-access';

/**
 * Prepara o TestBed com o modo local num banco descartável e o usuário de demonstração
 * já logado. Chame o `teardown` devolvido no `afterEach` (testes criam e descartam os
 * próprios dados, AGENTS.md).
 */
export async function setUpLocalTestBed(): Promise<{ teardown: () => Promise<void> }> {
  localStorage.clear();
  const dbName = `test-${crypto.randomUUID()}`;
  TestBed.configureTestingModule({ providers: [provideLocalDataAccess({ dbName })] });
  await TestBed.inject(AuthService).signInWithGoogle();
  return {
    teardown: async () => {
      await TestBed.inject(LocalDatabase).close();
      await deleteDB(dbName);
      localStorage.clear();
    },
  };
}
