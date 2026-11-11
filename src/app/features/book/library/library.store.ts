import { computed, inject } from '@angular/core';
// Direto do arquivo, não do índice: o índice traz o Zod (validação) para o chunk.
import { DEFAULT_CALENDAR } from '@domain/calendar/default-calendar';
import type { Uuid, World } from '@domain/models';
import { AssetRepository, WorldRepository } from '@domain/ports';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

export type LibraryStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface WorldDraftInput {
  readonly name: string;
  readonly description: string | null;
}

interface LibraryState {
  readonly worlds: readonly World[];
  readonly status: LibraryStatus;
  readonly selectedId: Uuid | null;
  /** URL da miniatura do mapa (capa) de cada mundo que tem uma. */
  readonly coverUrls: Readonly<Record<Uuid, string>>;
}

/** Mais recente primeiro: o último mundo editado abre o sumário. */
function byLastEdit(a: World, b: World): number {
  return b.updatedAt.localeCompare(a.updatedAt);
}

/**
 * Mundos da biblioteca (docs/05 › Biblioteca). Fornecido pelo `BookShell`; lê e cria
 * mundos só pela porta `WorldRepository`. Arquivados ficam fora do sumário.
 */
export const LibraryStore = signalStore(
  withState<LibraryState>({ worlds: [], status: 'idle', selectedId: null, coverUrls: {} }),
  withComputed(({ worlds, selectedId }) => ({
    /** Mundo do frontispício: o escolhido ou, sem escolha, o primeiro do sumário. */
    selected: computed(() => worlds().find((w) => w.id === selectedId()) ?? worlds()[0] ?? null),
  })),
  withMethods((store, repo = inject(WorldRepository), assets = inject(AssetRepository)) => ({
    async load(): Promise<void> {
      patchState(store, { status: 'loading' });
      try {
        const worlds = (await repo.list()).filter((w) => w.archivedAt === null).sort(byLastEdit);
        patchState(store, { worlds, status: 'ready' });
      } catch {
        patchState(store, { status: 'error' });
        return;
      }
      // Miniaturas depois do sumário: uma capa que falha só fica sem imagem.
      const entries = await Promise.all(
        store.worlds().map(async (world) => {
          if (!world.coverAssetId) return null;
          const asset = await assets.get(world.coverAssetId).catch(() => null);
          const url = asset ? await assets.resolveUrl(asset).catch(() => null) : null;
          return url ? ([world.id, url] as const) : null;
        }),
      );
      patchState(store, {
        coverUrls: Object.fromEntries(entries.filter((entry) => entry !== null)),
      });
    },
    select(id: Uuid): void {
      patchState(store, { selectedId: id });
    },
    /** Cria o mundo com o calendário padrão e o deixa escolhido no frontispício. */
    async create(input: WorldDraftInput): Promise<World> {
      const world = await repo.create(
        { id: crypto.randomUUID(), name: input.name, description: input.description },
        DEFAULT_CALENDAR,
      );
      patchState(store, {
        worlds: [world, ...store.worlds()],
        selectedId: world.id,
        status: 'ready',
      });
      return world;
    },
  })),
);
