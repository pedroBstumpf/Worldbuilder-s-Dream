import type { MapAnnotation } from '../models/annotation';
import type { Uuid } from '../models/common';
import type { MapImageVersion, MapLink, WorldMap } from '../models/map';
import type { MapToken, TokenKeyframe } from '../models/token';

export type MapDraft = Pick<WorldMap, 'id' | 'worldId' | 'name' | 'width' | 'height'> &
  Partial<Pick<WorldMap, 'parentMapId' | 'imageAssetId' | 'sortOrder'>>;

export type MapPatch = Partial<
  Pick<
    WorldMap,
    | 'name'
    | 'parentMapId'
    | 'imageAssetId'
    | 'width'
    | 'height'
    | 'scaleValue'
    | 'scaleUnit'
    | 'scaleLabel'
    | 'sortOrder'
  >
>;

/** Token completo para criar ou substituir; `createdAt` é preenchido pelo adaptador. */
export type MapTokenInput = Omit<MapToken, 'createdAt'>;

/** Keyframe completo; o adaptador faz upsert por `(tokenId, tick)` e preenche `updatedAt`. */
export type TokenKeyframeInput = Omit<TokenKeyframe, 'updatedAt'>;

/** Nova versão da imagem; `id` gerado no cliente. */
export type MapImageVersionDraft = Pick<
  MapImageVersion,
  'id' | 'worldId' | 'mapId' | 'imageAssetId' | 'tickStart'
>;

export type MapImageVersionPatch = Partial<Pick<MapImageVersion, 'imageAssetId' | 'tickStart'>>;

export type MapAnnotationInput = Omit<
  MapAnnotation,
  'version' | 'createdBy' | 'createdAt' | 'updatedAt'
>;

export type MapAnnotationPatch = Partial<
  Pick<
    MapAnnotation,
    'geometry' | 'style' | 'title' | 'entityId' | 'eventId' | 'tickStart' | 'tickEnd' | 'zIndex'
  >
>;

/** Tudo o que o motor do mapa precisa para desenhar um mapa (RPC `get_map_scene`). */
export interface MapScene {
  map: WorldMap;
  tokens: MapToken[];
  /** Em ordem crescente de tick dentro de cada token. */
  keyframes: TokenKeyframe[];
  annotations: MapAnnotation[];
  links: MapLink[];
  /** Versões da imagem fora da lixeira, em ordem crescente de `tickStart`. */
  imageVersions: MapImageVersion[];
}

/** Porta dos mapas e do que vive neles. Convenções em `WorldRepository`. */
export abstract class MapRepository {
  abstract list(worldId: Uuid): Promise<WorldMap[]>;
  abstract get(id: Uuid): Promise<WorldMap | null>;
  abstract create(draft: MapDraft): Promise<WorldMap>;
  abstract update(id: Uuid, patch: MapPatch, expectedVersion: number): Promise<WorldMap>;
  abstract moveToTrash(id: Uuid, expectedVersion: number): Promise<void>;
  abstract restore(id: Uuid): Promise<WorldMap>;

  /** Mapa e conteúdo numa só ida e volta; `null` se o mapa não existir ou estiver na lixeira. */
  abstract getScene(mapId: Uuid): Promise<MapScene | null>;

  abstract saveToken(token: MapTokenInput): Promise<MapToken>;
  /** Remove o token e seus keyframes. */
  abstract deleteToken(id: Uuid): Promise<void>;

  abstract saveKeyframe(keyframe: TokenKeyframeInput): Promise<TokenKeyframe>;
  abstract deleteKeyframe(id: Uuid): Promise<void>;

  abstract createAnnotation(annotation: MapAnnotationInput): Promise<MapAnnotation>;
  abstract updateAnnotation(
    id: Uuid,
    patch: MapAnnotationPatch,
    expectedVersion: number,
  ): Promise<MapAnnotation>;
  abstract deleteAnnotation(id: Uuid): Promise<void>;

  abstract saveLink(link: MapLink): Promise<MapLink>;
  abstract deleteLink(id: Uuid): Promise<void>;

  /**
   * Versões da imagem no tempo (docs/06 §1). Dois `tickStart` iguais no mesmo mapa (entre
   * as que não estão na lixeira) rejeitam com `AppError('conflict')`.
   */
  abstract createImageVersion(draft: MapImageVersionDraft): Promise<MapImageVersion>;
  abstract updateImageVersion(
    id: Uuid,
    patch: MapImageVersionPatch,
    expectedVersion: number,
  ): Promise<MapImageVersion>;
  abstract moveImageVersionToTrash(id: Uuid, expectedVersion: number): Promise<void>;
  abstract restoreImageVersion(id: Uuid): Promise<MapImageVersion>;
}
