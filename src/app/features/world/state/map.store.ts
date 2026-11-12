import { computed, inject } from '@angular/core';
import type { MAP_STRINGS } from '@core/strings/map.strings';
import type { Point } from '@domain/geometry';
import {
  applySceneChange,
  invertSceneChange,
  isEmptySceneChange,
  sortImageVersions,
  writeAnnotation,
  type AnnotationShape,
  type SceneChange,
} from '@domain/maps';
import {
  evaluateKeyframes,
  type KeyframeFields,
  planKeyframeHide,
  planKeyframeMove,
  sortKeyframes,
} from '@domain/timeline';
import type {
  InterpolationMode,
  MapAnnotation,
  MapImageVersion,
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
  type MapAnnotationInput,
  type MapAnnotationPatch,
  type MapScene,
  type MapTokenInput,
  type TokenKeyframeInput,
} from '@domain/ports';
import type { ProcessedMapImage } from '@engine/import/read-map-image';
import type { ImageVersionInput, MapImageSource } from '@engine/map-engine';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { HistoryStore } from './history.store';

export type SceneStatus = 'idle' | 'loading' | 'ready' | 'error';

interface MapState {
  readonly scene: MapScene | null;
  readonly image: MapImageSource | null;
  readonly status: SceneStatus;
  /** Tokens selecionados no mapa (clique, Shift, retângulo). */
  readonly selection: readonly Uuid[];
  /** URL de cada imagem do mapa (inicial e versões), por id do asset. */
  readonly imageUrls: Readonly<Record<Uuid, string>>;
}

function tokenInput(token: MapToken): MapTokenInput {
  const { id, worldId, mapId, entityId, eventId, size, style } = token;
  return { id, worldId, mapId, entityId, eventId, size, style };
}

function keyframeInput(keyframe: TokenKeyframe): TokenKeyframeInput {
  const { id, worldId, tokenId, tick, x, y, visible, interpolation, note } = keyframe;
  return { id, worldId, tokenId, tick, x, y, visible, interpolation, note };
}

function annotationInput(annotation: MapAnnotation): MapAnnotationInput {
  const { id, worldId, mapId, kind, geometry, style, title, entityId, eventId } = annotation;
  const { tickStart, tickEnd, zIndex } = annotation;
  return {
    id,
    worldId,
    mapId,
    kind,
    geometry,
    style,
    title,
    entityId,
    eventId,
    tickStart,
    tickEnd,
    zIndex,
  };
}

function annotationPatch(annotation: MapAnnotation): MapAnnotationPatch {
  const { geometry, style, title, entityId, eventId, tickStart, tickEnd, zIndex } = annotation;
  return { geometry, style, title, entityId, eventId, tickStart, tickEnd, zIndex };
}

/** O que a edição de uma anotação pode mudar (a forma vem do motor ou do editor). */
export interface AnnotationEdit {
  shape?: AnnotationShape;
  title?: string | null;
  entityId?: Uuid | null;
  eventId?: Uuid | null;
  tickStart?: Tick | null;
  tickEnd?: Tick | null;
}

/** Nomes das edições do mapa no desfazer (textos em `MAP_STRINGS.history.labels`). */
export type MapEditLabel = keyof typeof MAP_STRINGS.history.labels;

/**
 * Cena do mapa ativo (docs/04 › Estado): links, pontos dos eventos e tokens. Toda edição
 * passa por `edit`: aplica na cena na hora (otimista), grava e entra no desfazer
 * (`HistoryStore`). Se a gravação falha, a cena volta a ser lida do repositório.
 */
export const MapStore = signalStore(
  withState<MapState>({ scene: null, image: null, status: 'idle', selection: [], imageUrls: {} }),
  withComputed(({ scene, selection, imageUrls }) => ({
    /** Versões da imagem como o motor e a linha do tempo precisam (URL já resolvida). */
    imageVersionInputs: computed<ImageVersionInput[]>(() =>
      (scene()?.imageVersions ?? []).map((version) => ({
        id: version.id,
        tickStart: version.tickStart,
        url: version.imageAssetId ? (imageUrls()[version.imageAssetId] ?? null) : null,
      })),
    ),
    /** URL da imagem inicial do mapa (miniatura no painel de versões), se já enviada. */
    baseImageUrl: computed(() => {
      const assetId = scene()?.map.imageAssetId;
      return assetId ? (imageUrls()[assetId] ?? null) : null;
    }),
    /** Seleção sem os tokens que saíram da cena. */
    selectedTokens: computed(() => {
      const tokens = scene()?.tokens ?? [];
      return tokens.filter((token) => selection().includes(token.id));
    }),
  })),
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

      /**
       * Grava na ordem que respeita as chaves: tokens, keyframes, remoções, links e
       * anotações. Anotações têm `version`: a que já existia em `before` é atualizada com
       * a versão gravada; as outras são criadas. Devolve as anotações como ficaram.
       */
      const persist = async (change: SceneChange, before: MapScene) => {
        await Promise.all((change.putTokens ?? []).map((t) => maps.saveToken(tokenInput(t))));
        await Promise.all(
          (change.putKeyframes ?? []).map((k) => maps.saveKeyframe(keyframeInput(k))),
        );
        await Promise.all((change.removeKeyframes ?? []).map((id) => maps.deleteKeyframe(id)));
        await Promise.all((change.removeTokens ?? []).map((id) => maps.deleteToken(id)));
        await Promise.all((change.putLinks ?? []).map((link) => maps.saveLink(link)));
        await Promise.all((change.removeLinks ?? []).map((id) => maps.deleteLink(id)));
        const saved = await Promise.all(
          (change.putAnnotations ?? []).map((annotation) => {
            const old = before.annotations.find((a) => a.id === annotation.id);
            return old
              ? maps.updateAnnotation(annotation.id, annotationPatch(annotation), old.version)
              : maps.createAnnotation(annotationInput(annotation));
          }),
        );
        await Promise.all((change.removeAnnotations ?? []).map((id) => maps.deleteAnnotation(id)));
        return saved;
      };

      /** Põe na cena as anotações como o repositório as gravou (nova `version`). */
      const syncAnnotations = (mapId: Uuid, saved: readonly MapAnnotation[]) => {
        const scene = store.scene();
        if (saved.length === 0 || scene?.map.id !== mapId) return;
        const byId = new Map(saved.map((a) => [a.id, a]));
        const annotations = scene.annotations.map((a) => byId.get(a.id) ?? a);
        patchState(store, { scene: { ...scene, annotations } });
      };

      /**
       * Aplica na cena aberta e grava; só vale para o mapa em que a edição nasceu. Se a
       * gravação falha, tenta desfazer o que passou e relê a cena gravada.
       */
      const apply = async (mapId: Uuid, change: SceneChange, inverse: SceneChange) => {
        const scene = store.scene();
        if (scene?.map.id !== mapId) throw new Error('a edição é de outro mapa');
        const next = applySceneChange(scene, change);
        patchState(store, { scene: next });
        try {
          syncAnnotations(mapId, await persist(change, scene));
        } catch (error) {
          await persist(inverse, next).catch(() => undefined);
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

      /** Resolve as URLs das imagens ainda sem URL (falha: a imagem fica indisponível). */
      const resolveUrls = async (assetIds: readonly (Uuid | null)[]) => {
        const missing = [...new Set(assetIds)].filter(
          (id): id is Uuid => id !== null && !(id in store.imageUrls()),
        );
        const entries = await Promise.all(
          missing.map(async (id) => {
            const asset = await assets.get(id).catch(() => null);
            const url = asset ? await assets.resolveUrl(asset).catch(() => null) : null;
            return url ? ([id, url] as const) : null;
          }),
        );
        const found = entries.filter((entry) => entry !== null);
        if (found.length > 0) {
          patchState(store, { imageUrls: { ...store.imageUrls(), ...Object.fromEntries(found) } });
        }
      };

      /** Troca as versões da cena, se ela ainda for do mapa `mapId`. */
      const setVersions = (
        mapId: Uuid,
        change: (versions: MapImageVersion[]) => MapImageVersion[],
      ) => {
        const scene = store.scene();
        if (scene?.map.id !== mapId) return;
        const imageVersions = sortImageVersions(change(scene.imageVersions));
        patchState(store, { scene: { ...scene, imageVersions } });
      };

      const requireVersion = (id: Uuid) => {
        const version = store.scene()?.imageVersions.find((v) => v.id === id);
        if (!version) throw new Error(`versão ${id} não carregada`);
        return version;
      };

      /** Envia a imagem processada como asset do mundo (o bitmap não é mais usado). */
      const uploadImage = (worldId: Uuid, processed: ProcessedMapImage) => {
        processed.bitmap.close();
        return assets.upload(
          {
            id: crypto.randomUUID(),
            worldId,
            mimeType: processed.image.type,
            width: processed.width,
            height: processed.height,
          },
          processed.image,
        );
      };

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
          patchState(store, { status: 'loading', selection: [] });
          try {
            const scene = (await maps.getScene(map.id)) ?? {
              map,
              tokens: [],
              keyframes: [],
              annotations: [],
              links: [],
              imageVersions: [],
            };
            let image = localImage;
            if (!image && map.imageAssetId) {
              const asset = await assets.get(map.imageAssetId);
              image = asset ? await assets.resolveUrl(asset) : null;
            }
            if (id !== request) return;
            patchState(store, { scene: { ...scene, map }, image, status: 'ready' });
            void resolveUrls([map.imageAssetId, ...scene.imageVersions.map((v) => v.imageAssetId)]);
          } catch {
            if (id === request) patchState(store, { status: 'error' });
          }
        },

        /** Mantém o registro do mapa da cena em dia (nome, escala, dimensões). */
        syncMap(map: WorldMap): void {
          const scene = store.scene();
          if (scene?.map.id !== map.id) return;
          patchState(store, { scene: { ...scene, map } });
          // A imagem inicial terminou de subir (ou foi trocada): miniatura do painel.
          void resolveUrls([map.imageAssetId]);
        },

        /**
         * Nova versão da imagem a partir de `tickStart` (docs/06 › Versões da imagem no
         * tempo): envia a imagem e grava a versão. Se a gravação falha, apaga o arquivo.
         */
        async addImageVersion(
          processed: ProcessedMapImage,
          tickStart: Tick,
        ): Promise<MapImageVersion> {
          const { map } = requireScene();
          const asset = await uploadImage(map.worldId, processed);
          let version: MapImageVersion;
          try {
            version = await maps.createImageVersion({
              id: crypto.randomUUID(),
              worldId: map.worldId,
              mapId: map.id,
              imageAssetId: asset.id,
              tickStart,
            });
          } catch (error) {
            await assets.delete(asset.id).catch(() => undefined);
            throw error;
          }
          await resolveUrls([asset.id]);
          setVersions(map.id, (versions) => [...versions, version]);
          return version;
        },

        /** Muda a data em que a versão começa a valer. */
        async moveImageVersion(id: Uuid, tickStart: Tick): Promise<void> {
          const before = requireVersion(id);
          if (before.tickStart === tickStart) return;
          const updated = await maps.updateImageVersion(id, { tickStart }, before.version);
          setVersions(before.mapId, (versions) => versions.map((v) => (v.id === id ? updated : v)));
        },

        /** Troca a imagem de uma versão (a antiga é apagada depois de gravar). */
        async replaceImageVersion(id: Uuid, processed: ProcessedMapImage): Promise<void> {
          const before = requireVersion(id);
          const asset = await uploadImage(before.worldId, processed);
          let updated: MapImageVersion;
          try {
            updated = await maps.updateImageVersion(id, { imageAssetId: asset.id }, before.version);
          } catch (error) {
            await assets.delete(asset.id).catch(() => undefined);
            throw error;
          }
          await resolveUrls([asset.id]);
          setVersions(before.mapId, (versions) => versions.map((v) => (v.id === id ? updated : v)));
          if (before.imageAssetId) await assets.delete(before.imageAssetId).catch(() => undefined);
        },

        /** Manda a versão para a lixeira (o arquivo fica, para "Desfazer"). */
        async removeImageVersion(id: Uuid): Promise<MapImageVersion> {
          const before = requireVersion(id);
          await maps.moveImageVersionToTrash(id, before.version);
          setVersions(before.mapId, (versions) => versions.filter((v) => v.id !== id));
          return before;
        },

        /** Tira a versão da lixeira ("Desfazer"). */
        async restoreImageVersion(id: Uuid): Promise<void> {
          const restored = await maps.restoreImageVersion(id);
          await resolveUrls([restored.imageAssetId]);
          setVersions(restored.mapId, (versions) => [
            ...versions.filter((v) => v.id !== id),
            restored,
          ]);
        },

        clear(): void {
          request++;
          history.clear();
          patchState(store, { scene: null, image: null, status: 'idle', selection: [] });
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

        /** Nova anotação (pino, traço, região, rótulo ou medição fixada). */
        async addAnnotation(
          shape: AnnotationShape,
          extra: Omit<AnnotationEdit, 'shape'> = {},
        ): Promise<MapAnnotation> {
          const scene = requireScene();
          const now = new Date().toISOString();
          const annotation: MapAnnotation = {
            id: crypto.randomUUID(),
            worldId: scene.map.worldId,
            mapId: scene.map.id,
            kind: shape.kind,
            ...writeAnnotation(shape),
            title: extra.title ?? null,
            entityId: extra.entityId ?? null,
            eventId: extra.eventId ?? null,
            tickStart: extra.tickStart ?? null,
            tickEnd: extra.tickEnd ?? null,
            zIndex: 0,
            version: 1,
            createdBy: null,
            createdAt: now,
            updatedAt: now,
          };
          await edit(ADD_LABELS[shape.kind], () => ({ putAnnotations: [annotation] }));
          return annotation;
        },

        /** Muda forma, título, vínculos ou validade; `label` nomeia a edição no desfazer. */
        updateAnnotation(
          id: Uuid,
          changes: AnnotationEdit,
          label: MapEditLabel = 'editAnnotation',
        ): Promise<void> {
          return edit(label, (scene) => {
            const old = scene.annotations.find((a) => a.id === id);
            if (!old) return null;
            const { shape, ...fields } = changes;
            if (shape && shape.kind !== old.kind) throw new Error('a forma é de outro tipo');
            const next: MapAnnotation = { ...old, ...fields, ...(shape && writeAnnotation(shape)) };
            if (next.tickStart !== null && next.tickEnd !== null && next.tickEnd < next.tickStart) {
              throw new Error('a validade termina antes de começar');
            }
            return JSON.stringify(next) === JSON.stringify(old) ? null : { putAnnotations: [next] };
          });
        },

        /** Apaga anotações (lixeira do editor, Del, ou uma passada da borracha). */
        removeAnnotations(
          ids: readonly Uuid[],
          label: MapEditLabel = 'removeAnnotation',
        ): Promise<void> {
          return edit(label, (scene) => {
            const present = ids.filter((id) => scene.annotations.some((a) => a.id === id));
            return present.length > 0 ? { removeAnnotations: present } : null;
          });
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

        select(ids: readonly Uuid[]): void {
          patchState(store, { selection: [...new Set(ids)] });
        },

        /** Token da entidade neste mapa (no máximo um por mapa). */
        tokenOfEntity(entityId: Uuid): MapToken | null {
          return store.scene()?.tokens.find((t) => t.entityId === entityId) ?? null;
        },

        /** Keyframes do token, em ordem crescente de tick. */
        keyframesOf(tokenId: Uuid): TokenKeyframe[] {
          return keyframesOf(store.scene(), tokenId);
        },

        /**
         * Põe a entidade no mapa no instante (docs/06 §3): cria o token, se ainda não
         * houver neste mapa, e grava a posição como keyframe.
         */
        placeEntity(entityId: Uuid, point: Point, tick: Tick): Promise<void> {
          return edit('placeToken', (scene) => {
            const existing = scene.tokens.find((t) => t.entityId === entityId);
            const token: MapToken = existing ?? {
              id: crypto.randomUUID(),
              worldId: scene.map.worldId,
              mapId: scene.map.id,
              entityId,
              eventId: null,
              size: 1,
              style: {},
              createdAt: new Date().toISOString(),
            };
            const fields = planKeyframeMove(
              keyframesOf(scene, token.id),
              tick,
              point,
              crypto.randomUUID(),
            );
            return {
              putTokens: existing ? [] : [token],
              putKeyframes: [fullKeyframe(scene, token.id, fields)],
            };
          });
        },

        /**
         * Arrastar o token: grava a posição no instante (upsert do keyframe). Com
         * `correctPrevious` (`Alt`), corrige o keyframe em vigor em vez de criar outro.
         */
        moveToken(
          tokenId: Uuid,
          to: Point,
          tick: Tick,
          options: { correctPrevious?: boolean } = {},
        ): Promise<void> {
          return edit('moveToken', (scene) => {
            if (!scene.tokens.some((t) => t.id === tokenId)) return null;
            const fields = planKeyframeMove(
              keyframesOf(scene, tokenId),
              tick,
              to,
              crypto.randomUUID(),
              options,
            );
            return { putKeyframes: [fullKeyframe(scene, tokenId, fields)] };
          });
        },

        /** Move um keyframe (ponto do rastro) sem mudar o instante dele. */
        moveKeyframe(keyframeId: Uuid, to: Point): Promise<void> {
          return edit('moveKeyframe', (scene) => {
            const keyframe = scene.keyframes.find((k) => k.id === keyframeId);
            return keyframe ? { putKeyframes: [{ ...keyframe, x: to.x, y: to.y }] } : null;
          });
        },

        /**
         * "Sair do mapa aqui": keyframe `visible = false` no instante, na posição em que o
         * token está. Nada muda se ele já estiver oculto.
         */
        hideToken(tokenId: Uuid, tick: Tick): Promise<void> {
          return edit('hideToken', (scene) => {
            const keyframes = keyframesOf(scene, tokenId);
            const at = evaluateKeyframes(keyframes, tick);
            if (!at) return null;
            const fields = planKeyframeHide(keyframes, tick, at, crypto.randomUUID());
            return { putKeyframes: [fullKeyframe(scene, tokenId, fields)] };
          });
        },

        setInterpolation(keyframeId: Uuid, interpolation: InterpolationMode): Promise<void> {
          return edit('interpolation', (scene) => {
            const keyframe = scene.keyframes.find((k) => k.id === keyframeId);
            if (!keyframe || keyframe.interpolation === interpolation) return null;
            return { putKeyframes: [{ ...keyframe, interpolation }] };
          });
        },

        /** Remove um keyframe; o último keyframe leva o token junto (sem ele, nunca aparece). */
        removeKeyframe(keyframeId: Uuid): Promise<void> {
          return edit('removeKeyframe', (scene) => {
            const keyframe = scene.keyframes.find((k) => k.id === keyframeId);
            if (!keyframe) return null;
            const others = scene.keyframes.filter(
              (k) => k.tokenId === keyframe.tokenId && k.id !== keyframeId,
            );
            return others.length > 0
              ? { removeKeyframes: [keyframeId] }
              : { removeTokens: [keyframe.tokenId] };
          });
        },

        /** Tira o token do mapa, com todos os keyframes. */
        removeToken(tokenId: Uuid): Promise<void> {
          return edit('removeToken', (scene) =>
            scene.tokens.some((t) => t.id === tokenId) ? { removeTokens: [tokenId] } : null,
          );
        },
      };
    },
  ),
);

/** Nome da criação de cada tipo de anotação no desfazer. */
const ADD_LABELS = {
  pin: 'addPin',
  stroke: 'addStroke',
  region: 'addRegion',
  label: 'addLabel',
  measure: 'addMeasure',
} as const satisfies Record<AnnotationShape['kind'], MapEditLabel>;

function keyframesOf(scene: MapScene | null, tokenId: Uuid): TokenKeyframe[] {
  return sortKeyframes(scene?.keyframes.filter((k) => k.tokenId === tokenId) ?? []);
}

/** Completa os campos decididos pelas regras de edição com os do token e do mundo. */
function fullKeyframe(scene: MapScene, tokenId: Uuid, fields: KeyframeFields): TokenKeyframe {
  return {
    ...fields,
    worldId: scene.map.worldId,
    tokenId,
    updatedAt: new Date().toISOString(),
  };
}
