import type { Json, JsonObject } from '../models/common';
import type { Profile } from '../models/profile';

/** Limite de `profiles.ui_prefs` (`pg_column_size < 16384`, docs/07). */
export const UI_PREFS_MAX_BYTES = 16384;

/**
 * Mudança rasa em `ui_prefs`: cada chave substitui a anterior e `null` apaga a chave
 * (no Supabase, `ui_prefs || patch` seguido de `jsonb_strip_nulls`).
 */
export type UiPrefsPatch = Record<string, Json>;

/** Porta do perfil do usuário atual. Convenções em `WorldRepository`. */
export abstract class ProfileRepository {
  /** Perfil de quem está logado (criado no primeiro acesso). */
  abstract getMine(): Promise<Profile>;

  /**
   * Preferências da interface (câmera por mapa, barras). Rejeita com
   * `AppError('validation')` se o resultado passar de `UI_PREFS_MAX_BYTES`.
   */
  abstract patchUiPrefs(patch: UiPrefsPatch): Promise<JsonObject>;
}
