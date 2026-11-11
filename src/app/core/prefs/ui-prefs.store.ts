import { computed, inject } from '@angular/core';
import type { Json, JsonObject } from '@domain/models';
import { ProfileRepository } from '@domain/ports';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import { readBarPrefs } from './ui-prefs';

/** Espera depois da última mudança antes de gravar (arrastar o mapa gera muitas). */
export const UI_PREFS_SAVE_DELAY_MS = 800;

interface UiPrefsState {
  readonly prefs: JsonObject;
  readonly loaded: boolean;
}

/**
 * Preferências da interface em `profiles.ui_prefs` (barras, câmera por mapa). A tela
 * muda na hora; a gravação junta as mudanças e sai depois de uma pausa. Falhas ao gravar
 * são ignoradas: preferência perdida não justifica interromper o usuário.
 */
export const UiPrefsStore = signalStore(
  { providedIn: 'root' },
  withState<UiPrefsState>({ prefs: {}, loaded: false }),
  withComputed(({ prefs }) => ({ bars: computed(() => readBarPrefs(prefs())) })),
  withMethods((store, profiles = inject(ProfileRepository)) => {
    let loading: Promise<void> | null = null;
    let pending: Record<string, Json> = {};
    let timer: ReturnType<typeof setTimeout> | null = null;

    const flush = async (): Promise<void> => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      const patch = pending;
      pending = {};
      if (Object.keys(patch).length === 0) return;
      await profiles.patchUiPrefs(patch).catch(() => undefined);
    };

    return {
      /** Lê as preferências uma vez por sessão; sem perfil, segue com os padrões. */
      load(): Promise<void> {
        loading ??= profiles
          .getMine()
          .then((profile) => patchState(store, { prefs: { ...profile.uiPrefs, ...pending } }))
          .catch(() => undefined)
          .finally(() => patchState(store, { loaded: true }));
        return loading;
      },
      /** Muda uma chave de `ui_prefs` agora e agenda a gravação. */
      set(key: string, value: Json): void {
        patchState(store, { prefs: { ...store.prefs(), [key]: value } });
        pending = { ...pending, [key]: value };
        if (timer !== null) clearTimeout(timer);
        timer = setTimeout(() => void flush(), UI_PREFS_SAVE_DELAY_MS);
      },
      /** Grava o que estiver pendente (ao sair da tela ou fechar a aba). */
      flush,
    };
  }),
  withHooks((store) => {
    const onHide = () => void store.flush();
    return {
      onInit() {
        globalThis.addEventListener?.('pagehide', onHide);
      },
      onDestroy() {
        globalThis.removeEventListener?.('pagehide', onHide);
      },
    };
  }),
);
