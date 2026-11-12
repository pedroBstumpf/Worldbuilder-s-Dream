import { inject } from '@angular/core';
import type { MAP_STRINGS } from '@core/strings/map.strings';
import type { Point } from '@domain/geometry';
import {
  applySceneChange,
  invertSceneChange,
  isEmptySceneChange,
  type SceneChange,
} from '@domain/maps';
import type {
  MapLink,
  MapToken,
  PolygonVertex,
  Tick,
  TokenKeyframe,
  Uuid,
  WorldMap,
} from '@domain/models';
import {
  AssetRepository,
  MapRepository,
  type MapScene,
  type MapTokenInput,
  type TokenKeyframeInput,
} from '@domain/ports';
import type { MapImageSource } from '@engine/map-engine';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { HistoryStore } from './history.store';

export type SceneStatus = 'idle' | 'loading' | 'ready' | 'error';

interface MapState {
  readonly scene: MapScene | null;
  readonly image: MapImageSource | null;
  readonly status: SceneStatus;
}

function tokenInput(token: MapToken): MapTokenInput {
  const { id, worldId, mapId, entityId, eventId, size, style } = token;
  return { id, worldId, mapId, entityId, eventId, size, style };
}

function keyframeInput(keyframe: TokenKeyframe): TokenKeyframeInput {
  const { id, worldId, tokenId, tick, x, y, visible, interpolation, note } = keyframe;
  return { id, worldId, tokenId, tick, x, y, visible, interpolation, note };
}

/** Nomes das edições do mapa no desfazer (textos em `MAP_STRINGS.history.labels`). */
export type MapEditLabel = keyof typeof MAP_STRINGS.history.labels;

/**
 * Cena do mapa ativo (docs/04 › Estado): links, pontos dos eventos e tokens. Toda edição
 * passa por `edit`: aplica na cena na hora (otimista), grava e entra no desfazer
 * (`HistoryStore`). Se a gravação falha, a cena volta a ser lida do repositório.
 */
export const MapStore = signalStore(
  withState<MapState>({ scene: null, image: null, status: 'idle' }),
  withMethods(
    (
      store,
      maps = inject(MapRepository),
      assets = inject(AssetRepository),
      history = inject(HistoryStore),
    ) => {
      let request = 0;

      /** Relê a cena gravada (depois de uma falha, parte das gravações pode ter passado). */
      const resync = async (mapId: Uuid) => {
        const saved = await maps.getScene(mapId).catch(() => null);
        const scene = store.scene();
        if (saved && scene?.map.id === mapId)
          patchState(store, { scene: { ...saved, map: scene.map } });
      };

      /** Grava na ordem que respeita as chaves: tokens, keyframes, remoções, links. */
      const persist = async (change: SceneChange) => {
        await Promise.all((change.putTokens ?? []).map((t) => maps.saveToken(tokenInput(t))));
        await Promise.all(
          (change.putKeyframes ?? []).map((k) => maps.saveKeyframe(keyframeInput(k))),
        );
        await Promise.all((change.removeKeyframes ?? []).map((id) => maps.deleteKeyframe(id)));
        await Promise.all((change.removeTokens ?? []).map((id) => maps.deleteToken(id)));
        await Promise.all((change.putLinks ?? []).map((link) => maps.saveLink(link)));
        await Promise.all((change.removeLinks ?? []).map((id) => maps.deleteLink(id)));
      };

      /**
       * Aplica na cena aberta e grava; só vale para o mapa em que a edição nasceu. Se a
       * gravação falha, tenta desfazer o que passou e relê a cena gravada.
       */
      const apply = async (mapId: Uuid, change: SceneChange, inverse: SceneChange) => {
        const scene = store.scene();
        if (scene?.map.id !== mapId) throw new Error('a edição é de outro mapa');
        patchState(store, { scene: applySceneChange(scene, change) });
        try {
          await persist(change);
        } catch (error) {
          await persist(inverse).catch(() => undefined);
          await resync(mapId);
          throw error;
        }
      };

      /**
       * Edição desfazível: `build` lê a cena atual (já na vez da fila) e diz o que gravar;
       * `null` ou edição vazia não grava nem entra no histórico.
       */
      const edit = (label: MapEditLabel, build: (scene: MapScene) => SceneChange | null) =>
        history.execute(label, async () => {
          const scene = store.scene();
          if (!scene) throw new Error('nenhuma cena carregada');
          const change = build(scene);
          if (!change || isEmptySceneChange(change)) return null;
          const mapId = scene.map.id;
          const inverse = invertSceneChange(scene, change);
          await apply(mapId, change, inverse);
          return {
            undo: () => apply(mapId, inverse, change),
            redo: () => apply(mapId, change, inverse),
          };
        });

      const requireScene = () => {
        const scene = store.scene();
        if (!scene) throw new Error('nenhuma cena carregada');
        return scene;
      };

      return {
        /** Carrega a cena; `localImage` é a imagem recém-importada, antes do envio. */
        async load(map: WorldMap, localImage: MapImageSource | null): Promise<void> {
          const id = ++request;
          // As edições guardadas são da cena anterior.
          history.clear();
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
          history.clear();
          patchState(store, { scene: null, image: null, status: 'idle' });
        },

        async addLink(polygon: PolygonVertex[], targetMapId: Uuid): Promise<MapLink> {
          const scene = requireScene();
          const link: MapLink = {
            id: crypto.randomUUID(),
            worldId: scene.map.worldId,
            mapId: scene.map.id,
            targetMapId,
            polygon,
          };
          await edit('link', () => ({ putLinks: [link] }));
          return link;
        },

        removeLink(id: Uuid): Promise<void> {
          return edit('unlink', () => ({ removeLinks: [id] }));
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
        placeEvent(eventId: Uuid, point: Point, tick: Tick): Promise<void> {
          return edit('placeEvent', (scene) => {
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
            return {
              putTokens: existing ? [] : [token],
              putKeyframes: [
                {
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
                },
              ],
            };
          });
        },

        /** Tira o evento deste mapa (apaga o token e o keyframe). */
        removeEventToken(eventId: Uuid): Promise<void> {
          return edit('unplaceEvent', (scene) => {
            const token = scene.tokens.find((t) => t.eventId === eventId);
            return token ? { removeTokens: [token.id] } : null;
          });
        },
      };
    },
  ),
);
