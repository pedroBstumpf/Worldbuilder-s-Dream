import { inject } from '@angular/core';
import type { Point } from '@domain/geometry';
import type {
  MapLink,
  MapToken,
  PolygonVertex,
  Tick,
  TokenKeyframe,
  Uuid,
  WorldMap,
} from '@domain/models';
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
 * Cena do mapa ativo (docs/04 › Estado): links e os pontos dos eventos (token do evento
 * com um keyframe); tokens de entidade e anotações nos próximos marcos. Edições
 * otimistas, revertidas se a gravação falhar.
 */
export const MapStore = signalStore(
  withState<MapState>({ scene: null, image: null, status: 'idle' }),
  withMethods((store, maps = inject(MapRepository), assets = inject(AssetRepository)) => {
    let request = 0;

    const setLinks = (links: MapLink[]) => {
      const scene = store.scene();
      if (scene) patchState(store, { scene: { ...scene, links } });
    };

    const setTokens = (tokens: MapToken[], keyframes: TokenKeyframe[]) => {
      const scene = store.scene();
      if (scene) patchState(store, { scene: { ...scene, tokens, keyframes } });
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

      /** Ponto do evento neste mapa (o keyframe do token do evento), se marcado. */
      eventPoint(eventId: Uuid): Point | null {
        const scene = store.scene();
        const token = scene?.tokens.find((t) => t.eventId === eventId);
        const keyframe = token && scene?.keyframes.find((k) => k.tokenId === token.id);
        return keyframe ? { x: keyframe.x, y: keyframe.y } : null;
      },

      /**
       * Marca (ou move) o evento neste mapa: um token do evento com um só keyframe. O
       * tick do keyframe é o início do evento; quem decide quando o marcador aparece
       * são as datas do evento (docs/06 §4).
       */
      async placeEvent(eventId: Uuid, point: Point, tick: Tick): Promise<void> {
        const scene = store.scene();
        if (!scene) throw new Error('nenhuma cena carregada');
        const previous = { tokens: scene.tokens, keyframes: scene.keyframes };
        const existing = scene.tokens.find((t) => t.eventId === eventId);
        const token: MapToken = existing ?? {
          id: crypto.randomUUID(),
          worldId: scene.map.worldId,
          mapId: scene.map.id,
          entityId: null,
          eventId,
          size: 1,
          style: {},
          createdAt: new Date().toISOString(),
        };
        const old = scene.keyframes.find((k) => k.tokenId === token.id);
        const keyframe: TokenKeyframe = {
          id: old?.id ?? crypto.randomUUID(),
          worldId: scene.map.worldId,
          tokenId: token.id,
          tick: old?.tick ?? tick,
          x: point.x,
          y: point.y,
          visible: true,
          interpolation: 'step',
          note: null,
          updatedAt: new Date().toISOString(),
        };
        setTokens(existing ? scene.tokens : [...scene.tokens, token], [
          ...scene.keyframes.filter((k) => k.id !== keyframe.id),
          keyframe,
        ]);
        try {
          if (!existing) {
            const { id, worldId, mapId, entityId, size, style } = token;
            await maps.saveToken({ id, worldId, mapId, entityId, eventId, size, style });
          }
          const { id, worldId, tokenId, x, y, visible, interpolation, note } = keyframe;
          await maps.saveKeyframe({
            id,
            worldId,
            tokenId,
            tick: keyframe.tick,
            x,
            y,
            visible,
            interpolation,
            note,
          });
        } catch (error) {
          setTokens(previous.tokens, previous.keyframes);
          // Token novo sem keyframe não serve para nada: apaga (se chegou a ser gravado).
          if (!existing) await maps.deleteToken(token.id).catch(() => undefined);
          throw error;
        }
      },

      /** Tira o evento deste mapa (apaga o token e o keyframe). */
      async removeEventToken(eventId: Uuid): Promise<void> {
        const scene = store.scene();
        const token = scene?.tokens.find((t) => t.eventId === eventId);
        if (!scene || !token) return;
        const previous = { tokens: scene.tokens, keyframes: scene.keyframes };
        setTokens(
          scene.tokens.filter((t) => t.id !== token.id),
          scene.keyframes.filter((k) => k.tokenId !== token.id),
        );
        try {
          await maps.deleteToken(token.id);
        } catch (error) {
          setTokens(previous.tokens, previous.keyframes);
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
