import { inject, Injectable } from '@angular/core';
import type { JsonObject, Profile } from '@domain/models';
import {
  AppError,
  AuthService,
  ProfileRepository,
  UI_PREFS_MAX_BYTES,
  type UiPrefsPatch,
} from '@domain/ports';
import { LocalDatabase } from './local-database';
import { inTransaction, requireUserId, timestamp } from './local-transaction';

/** Perfil no modo local: criado na primeira leitura, como o trigger `handle_new_user`. */
@Injectable()
export class LocalProfileRepository extends ProfileRepository {
  private readonly database = inject(LocalDatabase);
  private readonly auth = inject(AuthService);

  override async getMine(): Promise<Profile> {
    const user = await this.auth.getUser();
    if (!user) throw new AppError('unauthenticated');
    const db = await this.database.ready();
    return inTransaction(db, ['profiles'], async (tx) => {
      const store = tx.objectStore('profiles');
      const existing = await store.get(user.id);
      if (existing) return existing;
      const now = timestamp();
      const profile: Profile = {
        id: user.id,
        displayName: user.displayName,
        avatarPath: null,
        locale: 'pt-BR',
        uiPrefs: {},
        createdAt: now,
        updatedAt: now,
      };
      await store.add(profile);
      return profile;
    });
  }

  override async patchUiPrefs(patch: UiPrefsPatch): Promise<JsonObject> {
    const userId = await requireUserId(this.auth);
    await this.getMine();
    const db = await this.database.ready();
    return inTransaction(db, ['profiles'], async (tx) => {
      const store = tx.objectStore('profiles');
      const profile = await store.get(userId);
      if (!profile) throw new AppError('not_found', 'perfil não encontrado');
      const uiPrefs: JsonObject = Object.fromEntries(
        Object.entries({ ...profile.uiPrefs, ...patch }).filter(([, value]) => value !== null),
      );
      if (new TextEncoder().encode(JSON.stringify(uiPrefs)).byteLength >= UI_PREFS_MAX_BYTES) {
        throw new AppError('validation', 'preferências maiores que 16 kB');
      }
      await store.put({ ...profile, uiPrefs, updatedAt: timestamp() });
      return uiPrefs;
    });
  }
}
