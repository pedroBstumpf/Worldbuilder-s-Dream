import { computed, inject } from '@angular/core';
// Direto do arquivo, não do índice: o índice traz o Zod (validação) para o chunk.
import { DEFAULT_CALENDAR } from '@domain/calendar/default-calendar';
import type { Uuid, World } from '@domain/models';
import { AssetRepository, WorldRepository, WorldTransferRepository } from '@domain/ports';
import { asWorldCopy, worldExportFileName } from '@domain/transfer';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

export type LibraryStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Lista mostrada no sumário: os mundos em uso, os arquivados ou a lixeira. */
export type LibraryView = 'worlds' | 'archived' | 'trash';
export const LIBRARY_VIEWS: readonly LibraryView[] = ['worlds', 'archived', 'trash'];

export interface WorldDraftInput {
  readonly name: string;
  readonly description: string | null;
}

/** Arquivo pronto para baixar. */
export interface WorldExportFile {
  readonly name: string;
  readonly text: string;
}

/** Limite de `worlds.name` (docs/07). */
const WORLD_NAME_MAX = 120;

interface LibraryState {
  /** Mundos fora da lixeira, arquivados ou não. */
  readonly live: readonly World[];
  readonly trash: readonly World[];
  readonly view: LibraryView;
  readonly status: LibraryStatus;
  readonly selectedId: Uuid | null;
  /** URL da miniatura do mapa (capa) de cada mundo que tem uma. */
  readonly coverUrls: Readonly<Record<Uuid, string>>;
}

/** Mais recente primeiro: o último mundo editado abre o sumário. */
function byLastEdit(a: World, b: World): number {
  return b.updatedAt.localeCompare(a.updatedAt);
}

const without = (worlds: readonly World[], id: Uuid) => worlds.filter((w) => w.id !== id);

/**
 * Mundos da biblioteca (docs/05 › Biblioteca). Fornecido pelo `BookShell`; fala só com as
 * portas `WorldRepository`, `WorldTransferRepository` e `AssetRepository`. O sumário
 * mostra uma lista por vez: em uso, arquivados ou lixeira.
 */
export const LibraryStore = signalStore(
  withState<LibraryState>({
    live: [],
    trash: [],
    view: 'worlds',
    status: 'idle',
    selectedId: null,
    coverUrls: {},
  }),
  withComputed(({ live, trash, view, selectedId }) => {
    const worlds = computed(() =>
      live()
        .filter((w) => w.archivedAt === null)
        .sort(byLastEdit),
    );
    const archived = computed(() =>
      live()
        .filter((w) => w.archivedAt !== null)
        .sort(byLastEdit),
    );
    const shown = computed(() => {
      const current = view();
      return current === 'worlds' ? worlds() : current === 'archived' ? archived() : trash();
    });
    return {
      /** Mundos em uso (o sumário principal). */
      worlds,
      archived,
      /** Lista da vista atual. */
      shown,
      /** Nenhum mundo em lista alguma: o livro em branco. */
      blank: computed(() => live().length === 0 && trash().length === 0),
      /** Mundo do frontispício: o escolhido ou, sem escolha, o primeiro da lista. */
      selected: computed(() => shown().find((w) => w.id === selectedId()) ?? shown()[0] ?? null),
    };
  }),
  withMethods(
    (
      store,
      repo = inject(WorldRepository),
      transfer = inject(WorldTransferRepository),
      assets = inject(AssetRepository),
    ) => {
      async function coverUrl(world: World): Promise<string | null> {
        if (!world.coverAssetId) return null;
        const asset = await assets.get(world.coverAssetId).catch(() => null);
        return asset ? await assets.resolveUrl(asset).catch(() => null) : null;
      }

      async function loadCover(world: World): Promise<void> {
        const url = await coverUrl(world);
        if (url) patchState(store, { coverUrls: { ...store.coverUrls(), [world.id]: url } });
      }

      /** Troca o mundo na lista dos que estão fora da lixeira. */
      function replace(world: World): void {
        patchState(store, { live: [...without(store.live(), world.id), world] });
      }

      /** Mundo novo (criado, duplicado ou importado): no topo do sumário e escolhido. */
      function addNew(world: World): void {
        patchState(store, {
          live: [...without(store.live(), world.id), world],
          view: 'worlds',
          selectedId: world.id,
          status: 'ready',
        });
        void loadCover(world);
      }

      function find(id: Uuid): World {
        const world = [...store.live(), ...store.trash()].find((w) => w.id === id);
        if (!world) throw new Error(`library: mundo ${id} não está carregado`);
        return world;
      }

      return {
        async load(): Promise<void> {
          patchState(store, { status: 'loading' });
          try {
            const [live, trash] = await Promise.all([repo.list(), repo.listTrash()]);
            patchState(store, { live, trash, status: 'ready' });
          } catch {
            patchState(store, { status: 'error' });
            return;
          }
          // Volta de um mundo arquivado: o sumário abre na lista dele.
          const selected = store.live().find((w) => w.id === store.selectedId());
          if (selected?.archivedAt) patchState(store, { view: 'archived' });
          // Miniaturas depois do sumário: uma capa que falha só fica sem imagem.
          const entries = await Promise.all(
            [...store.live(), ...store.trash()].map(async (world) => {
              const url = await coverUrl(world);
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
        setView(view: LibraryView): void {
          patchState(store, { view, selectedId: null });
        },
        /** Cria o mundo com o calendário padrão e o deixa escolhido no frontispício. */
        async create(input: WorldDraftInput): Promise<World> {
          const world = await repo.create(
            { id: crypto.randomUUID(), name: input.name, description: input.description },
            DEFAULT_CALENDAR,
          );
          addNew(world);
          return world;
        },
        async rename(id: Uuid, input: WorldDraftInput): Promise<World> {
          const world = await repo.update(id, input, find(id).version);
          replace(world);
          return world;
        },
        /** Arquiva ou desarquiva; a lista atual continua (o mundo sai dela). */
        async setArchived(id: Uuid, archived: boolean): Promise<World> {
          const archivedAt = archived ? new Date().toISOString() : null;
          const world = await repo.update(id, { archivedAt }, find(id).version);
          replace(world);
          return world;
        },
        async moveToTrash(id: Uuid): Promise<void> {
          await repo.moveToTrash(id, find(id).version);
          const [live, trash] = await Promise.all([repo.list(), repo.listTrash()]);
          patchState(store, { live, trash });
        },
        async restore(id: Uuid): Promise<World> {
          const world = await repo.restore(id);
          patchState(store, {
            trash: without(store.trash(), id),
            live: [...without(store.live(), id), world],
          });
          return world;
        },
        async deleteForever(id: Uuid): Promise<void> {
          await repo.deleteForever(id);
          const coverUrls = Object.fromEntries(
            Object.entries(store.coverUrls()).filter(([worldId]) => worldId !== id),
          );
          patchState(store, { trash: without(store.trash(), id), coverUrls });
          // Livro em branco de novo: volta ao sumário, onde ficam "Criar" e "Importar".
          if (store.blank()) patchState(store, { view: 'worlds' });
        },
        /** Cópia completa com ids novos, chamada `name`; fica escolhida no sumário. */
        async duplicate(id: Uuid, name: string): Promise<World> {
          const bundle = await transfer.exportWorld(id);
          const world = await transfer.importWorld(
            asWorldCopy(bundle, { name: name.slice(0, WORLD_NAME_MAX) }),
          );
          addNew(world);
          return world;
        },
        /** O `.json` do mundo, com as imagens embutidas. */
        async exportFile(id: Uuid): Promise<WorldExportFile> {
          const [bundle, { serializeWorldBundle }] = await Promise.all([
            transfer.exportWorld(id),
            import('@domain/transfer/world-file'),
          ]);
          return {
            name: worldExportFileName(bundle.world.name),
            text: serializeWorldBundle(bundle),
          };
        },
        /**
         * Importa um arquivo exportado como mundo novo (sempre como cópia: ids novos, então
         * importar duas vezes dá dois mundos). Arquivo inválido: `AppError('validation')`.
         */
        async importFile(text: string): Promise<World> {
          const { parseWorldFile } = await import('@domain/transfer/world-file');
          const world = await transfer.importWorld(asWorldCopy(parseWorldFile(text)));
          addNew(world);
          return world;
        },
      };
    },
  ),
);
