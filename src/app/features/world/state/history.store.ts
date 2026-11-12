import { computed } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

/** Quantas edições o desfazer guarda. */
export const HISTORY_LIMIT = 100;

/** Edição já feita, que sabe se desfazer e se refazer. */
export interface HistoryEntry {
  /** Nome curto da edição, para os avisos ("Desfeito: mover Aria"). */
  readonly label: string;
  undo(): Promise<void>;
  redo(): Promise<void>;
}

/** Comando: faz a edição e devolve como desfazê-la (`null` quando não houve edição). */
export type HistoryCommand = () => Promise<Omit<HistoryEntry, 'label'> | null>;

interface HistoryState {
  readonly past: readonly HistoryEntry[];
  readonly future: readonly HistoryEntry[];
}

/**
 * Desfazer e refazer das edições do mapa (docs/04 › Estado, padrão Command). Edições,
 * desfazer e refazer rodam em fila, uma de cada vez, na ordem pedida. Uma etapa que falha
 * sai da pilha (o dono da edição já devolveu a cena ao estado gravado) e o erro sobe para
 * quem pediu mostrar o aviso.
 */
export const HistoryStore = signalStore(
  withState<HistoryState>({ past: [], future: [] }),
  withComputed(({ past, future }) => ({
    canUndo: computed(() => past().length > 0),
    canRedo: computed(() => future().length > 0),
  })),
  withMethods((store) => {
    let queue: Promise<unknown> = Promise.resolve();
    const serial = <T>(work: () => Promise<T>): Promise<T> => {
      const run = queue.then(work);
      queue = run.catch(() => undefined);
      return run;
    };

    return {
      /** Faz a edição e guarda como desfazê-la; limpa o que havia para refazer. */
      execute(label: string, command: HistoryCommand): Promise<void> {
        return serial(async () => {
          const done = await command();
          if (!done) return;
          patchState(store, {
            past: [...store.past(), { label, ...done }].slice(-HISTORY_LIMIT),
            future: [],
          });
        });
      },

      /** Desfaz a última edição; devolve o nome dela (`null` se não havia). */
      undo(): Promise<string | null> {
        return serial(async () => {
          const entry = store.past().at(-1);
          if (!entry) return null;
          patchState(store, { past: store.past().slice(0, -1) });
          await entry.undo();
          patchState(store, { future: [...store.future(), entry] });
          return entry.label;
        });
      },

      /** Refaz a última edição desfeita; devolve o nome dela (`null` se não havia). */
      redo(): Promise<string | null> {
        return serial(async () => {
          const entry = store.future().at(-1);
          if (!entry) return null;
          patchState(store, { future: store.future().slice(0, -1) });
          await entry.redo();
          patchState(store, { past: [...store.past(), entry] });
          return entry.label;
        });
      },

      /** Esquece tudo (ex.: ao trocar de mapa, as edições guardadas são de outra cena). */
      clear(): void {
        patchState(store, { past: [], future: [] });
      },
    };
  }),
);
