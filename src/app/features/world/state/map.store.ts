import { inject } from '@angular/core';
import type { MapLink, PolygonVertex, Uuid, WorldMap } from '@domain/models';
import { AssetRepository, MapRepository, type MapScene } from '@domain/ports';
import type { MapImageSource } from '@engine/map-engine';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

export type SceneStatus = 'idle' | 'loading' | 'ready' | 'error';

interface MapState {
  readonly scene: MapScene | null;
  readonly image: MapImageSource | null;
  readonly status: SceneStatus;
}

/**
 * Cena do mapa ativo (docs/04 › Estado): links agora; tokens, keyframes e anotações nos
 * próximos marcos. Edições otimistas, revertidas se a gravação falhar.
 */
export const MapStore = signalStore(
  withState<MapState>({ scene: null, image: null, status: 'idle' }),
  withMethods((store, maps = inject(MapRepository), assets = inject(AssetRepository)) => {
    let request = 0;

    const setLinks = (links: MapLink[]) => {
      const scene = store.scene();
      if (scene) patchState(store, { scene: { ...scene, links } });
    };

    return {
      /** Carrega a cena; `localImage` é a imagem recém-importada, antes do envio. */
      async load(map: WorldMap, localImage: MapImageSource | null): Promise<void> {
        const id = ++request;
        patchState(store, { status: 'loading' });
        try {
          const scene = (await maps.getScene(map.id)) ?? {
            map,
            tokens: [],
            keyframes: [],
            annotations: [],
            links: [],
          };
          let image = localImage;
          if (!image && map.imageAssetId) {
            const asset = await assets.get(map.imageAssetId);
            image = asset ? await assets.resolveUrl(asset) : null;
          }
          if (id !== request) return;
          patchState(store, { scene: { ...scene, map }, image, status: 'ready' });
        } catch {
          if (id === request) patchState(store, { status: 'error' });
        }
      },

      /** Mantém o registro do mapa da cena em dia (nome, escala, dimensões). */
      syncMap(map: WorldMap): void {
        const scene = store.scene();
        if (scene?.map.id === map.id) patchState(store, { scene: { ...scene, map } });
      },

      clear(): void {
        request++;
        patchState(store, { scene: null, image: null, status: 'idle' });
      },

      async addLink(polygon: PolygonVertex[], targetMapId: Uuid): Promise<MapLink> {
        const scene = store.scene();
        if (!scene) throw new Error('nenhuma cena carregada');
        const link: MapLink = {
          id: crypto.randomUUID(),
          worldId: scene.map.worldId,
          mapId: scene.map.id,
          targetMapId,
          polygon,
        };
        const previous = scene.links;
        setLinks([...previous, link]);
        try {
          return await maps.saveLink(link);
        } catch (error) {
          setLinks(previous);
          throw error;
        }
      },

      async removeLink(id: Uuid): Promise<void> {
        const previous = store.scene()?.links ?? [];
        setLinks(previous.filter((link) => link.id !== id));
        try {
          await maps.deleteLink(id);
        } catch (error) {
          setLinks(previous);
          throw error;
        }
      },
    };
  }),
);
