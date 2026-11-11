import { computed, inject } from '@angular/core';
import { WorldPrefetch } from '@core/world/world-prefetch.service';
import { buildMapTree, mapPath, rescaleFactor, scaleFromLine } from '@domain/maps';
import type { ScaleUnit, Uuid, World, WorldMap } from '@domain/models';
import { AssetRepository, MapRepository, WorldRepository } from '@domain/ports';
import type { ProcessedMapImage } from '@engine/import/read-map-image';
import type { MapImageSource } from '@engine/map-engine';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

export type WorldStatus = 'loading' | 'ready' | 'not_found' | 'error';

/** Envio da imagem em segundo plano (docs/06 §0, passo 6). */
export interface UploadState {
  readonly mapId: Uuid;
  readonly state: 'saving' | 'failed';
}

interface WorldState {
  readonly world: World | null;
  readonly maps: readonly WorldMap[];
  readonly activeMapId: Uuid | null;
  readonly status: WorldStatus;
  readonly upload: UploadState | null;
}

/** Imagem importada que ainda não chegou ao Storage (fica em memória até o envio concluir). */
interface LocalImage {
  processed: ProcessedMapImage;
  /** O bitmap vai para o motor na primeira exibição; depois, usa-se o blob. */
  bitmapTaken: boolean;
  objectUrl: string | null;
}

export interface ScaleInput {
  readonly pixelLength: number;
  readonly realLength: number;
  readonly unit: ScaleUnit;
  readonly label: string | null;
}

/**
 * Mundo aberto e seus mapas (docs/04 › Estado). Fornecido na tela do mundo. A criação
 * do mapa é otimista: a cena mostra o bitmap local na hora e o arquivo segue para o
 * Storage em segundo plano, com nova tentativa sem perder a imagem.
 */
export const WorldStore = signalStore(
  withState<WorldState>({
    world: null,
    maps: [],
    activeMapId: null,
    status: 'loading',
    upload: null,
  }),
  withComputed(({ maps, activeMapId }) => ({
    activeMap: computed(() => maps().find((m) => m.id === activeMapId()) ?? null),
    tree: computed(() => buildMapTree(maps())),
    activePath: computed(() => {
      const id = activeMapId();
      return id ? mapPath(maps(), id) : [];
    }),
  })),
  withMethods(
    (
      store,
      prefetch = inject(WorldPrefetch),
      worlds = inject(WorldRepository),
      mapsRepo = inject(MapRepository),
      assets = inject(AssetRepository),
    ) => {
      const localImages = new Map<Uuid, LocalImage>();

      const replaceMap = (map: WorldMap) =>
        patchState(store, { maps: store.maps().map((m) => (m.id === map.id ? map : m)) });

      const current = (id: Uuid): WorldMap => {
        const map = store.maps().find((m) => m.id === id);
        if (!map) throw new Error(`mapa ${id} não carregado`);
        return map;
      };

      const forgetLocal = (mapId: Uuid) => {
        const local = localImages.get(mapId);
        if (local?.objectUrl) URL.revokeObjectURL(local.objectUrl);
        localImages.delete(mapId);
      };

      /** A miniatura do primeiro mapa de raiz vira a capa do mundo na biblioteca. */
      const updateCover = async (map: WorldMap, thumbnail: Blob) => {
        const world = store.world();
        if (!world) return;
        const firstRoot = store.tree().find((row) => row.depth === 0)?.map;
        if (world.coverAssetId !== null && firstRoot?.id !== map.id) return;
        const cover = await assets.upload(
          { id: crypto.randomUUID(), worldId: world.id, mimeType: thumbnail.type },
          thumbnail,
        );
        const updated = await worlds.update(world.id, { coverAssetId: cover.id }, world.version);
        patchState(store, { world: updated });
        if (world.coverAssetId) await assets.delete(world.coverAssetId).catch(() => undefined);
      };

      const upload = async (mapId: Uuid): Promise<void> => {
        const local = localImages.get(mapId);
        if (!local) return;
        const { processed } = local;
        patchState(store, { upload: { mapId, state: 'saving' } });
        try {
          const before = current(mapId);
          const asset = await assets.upload(
            {
              id: crypto.randomUUID(),
              worldId: before.worldId,
              mimeType: processed.image.type,
              width: processed.width,
              height: processed.height,
            },
            processed.image,
          );
          const latest = current(mapId);
          const updated = await mapsRepo.update(
            mapId,
            { imageAssetId: asset.id, width: processed.width, height: processed.height },
            latest.version,
          );
          replaceMap(updated);
          if (before.imageAssetId && before.imageAssetId !== asset.id) {
            await assets.delete(before.imageAssetId).catch(() => undefined);
          }
          await updateCover(updated, processed.thumbnail).catch(() => undefined);
          forgetLocal(mapId);
          patchState(store, { upload: null });
        } catch (error) {
          patchState(store, { upload: { mapId, state: 'failed' } });
          throw error;
        }
      };

      return {
        /** Abre o mundo; `preferredMapId` vem da URL (`?map=`). */
        async load(worldId: Uuid, preferredMapId: Uuid | null): Promise<WorldStatus> {
          patchState(store, { status: 'loading' });
          try {
            const [world, maps] = await Promise.all([
              prefetch.take(worldId),
              mapsRepo.list(worldId),
            ]);
            if (!world) {
              patchState(store, { status: 'not_found' });
              return 'not_found';
            }
            patchState(store, { world, maps, status: 'ready' });
            const preferred = maps.find((m) => m.id === preferredMapId);
            patchState(store, { activeMapId: preferred?.id ?? store.tree()[0]?.map.id ?? null });
            return 'ready';
          } catch {
            patchState(store, { status: 'error' });
            return 'error';
          }
        },

        selectMap(id: Uuid): void {
          if (store.maps().some((m) => m.id === id)) patchState(store, { activeMapId: id });
        },

        /**
         * Cria o mapa a partir da imagem já processada e o torna ativo. O registro é
         * criado antes do envio; rejeita só se o registro falhar.
         */
        async createMap(
          processed: ProcessedMapImage,
          name: string,
          parentMapId: Uuid | null,
        ): Promise<WorldMap> {
          const world = store.world();
          if (!world) throw new Error('mundo não carregado');
          const siblings = store.maps().filter((m) => m.parentMapId === parentMapId);
          const map = await mapsRepo.create({
            id: crypto.randomUUID(),
            worldId: world.id,
            name,
            width: processed.width,
            height: processed.height,
            parentMapId,
            sortOrder: siblings.reduce((max, m) => Math.max(max, m.sortOrder + 1), 0),
          });
          localImages.set(map.id, { processed, bitmapTaken: false, objectUrl: null });
          patchState(store, { maps: [...store.maps(), map], activeMapId: map.id });
          void upload(map.id).catch(() => undefined);
          return map;
        },

        /**
         * Troca a imagem do mapa. Coordenadas de links, keyframes e a escala são
         * reescalonadas para a nova resolução (docs/06 › Sistema de coordenadas).
         */
        async replaceImage(mapId: Uuid, processed: ProcessedMapImage): Promise<WorldMap> {
          const before = current(mapId);
          const factor = rescaleFactor(before, processed);
          const scene = await mapsRepo.getScene(mapId);
          for (const link of scene?.links ?? []) {
            await mapsRepo.saveLink({
              ...link,
              polygon: link.polygon.map(([x, y]) => [
                Math.round(x * factor.x),
                Math.round(y * factor.y),
              ]),
            });
          }
          for (const keyframe of scene?.keyframes ?? []) {
            await mapsRepo.saveKeyframe({
              ...keyframe,
              x: keyframe.x * factor.x,
              y: keyframe.y * factor.y,
            });
          }
          const scaleValue = before.scaleValue === null ? null : before.scaleValue / factor.x;
          const updated = await mapsRepo.update(
            mapId,
            { width: processed.width, height: processed.height, scaleValue },
            before.version,
          );
          forgetLocal(mapId);
          localImages.set(mapId, { processed, bitmapTaken: false, objectUrl: null });
          replaceMap(updated);
          void upload(mapId).catch(() => undefined);
          return updated;
        },

        /** Tenta de novo o envio que falhou. */
        retryUpload(): Promise<void> {
          const failed = store.upload();
          return failed ? upload(failed.mapId) : Promise.resolve();
        },

        /** Imagem local ainda não enviada (bitmap na primeira vez, depois um object URL). */
        takeLocalImage(mapId: Uuid): MapImageSource | null {
          const local = localImages.get(mapId);
          if (!local) return null;
          if (!local.bitmapTaken) {
            local.bitmapTaken = true;
            return local.processed.bitmap;
          }
          local.objectUrl ??= URL.createObjectURL(local.processed.image);
          return local.objectUrl;
        },

        async renameMap(id: Uuid, name: string): Promise<void> {
          replaceMap(await mapsRepo.update(id, { name }, current(id).version));
        },

        /** Muda o pai na árvore (`null` = raiz). */
        async moveMap(id: Uuid, parentMapId: Uuid | null): Promise<void> {
          replaceMap(await mapsRepo.update(id, { parentMapId }, current(id).version));
        },

        async setScale(id: Uuid, input: ScaleInput): Promise<void> {
          const scaleValue = scaleFromLine(input.pixelLength, input.realLength);
          if (scaleValue === null) throw new Error('escala inválida');
          replaceMap(
            await mapsRepo.update(
              id,
              { scaleValue, scaleUnit: input.unit, scaleLabel: input.label },
              current(id).version,
            ),
          );
        },

        /** Descarta imagens locais (ao sair da tela). */
        dispose(): void {
          for (const id of [...localImages.keys()]) forgetLocal(id);
        },
      };
    },
  ),
);
