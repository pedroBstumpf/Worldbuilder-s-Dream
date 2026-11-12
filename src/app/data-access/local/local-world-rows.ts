import type {
  Asset,
  EntityMention,
  Entity,
  MapAnnotation,
  MapImageVersion,
  MapLink,
  MapToken,
  TokenKeyframe,
  Uuid,
  World,
  WorldCalendar,
  WorldEvent,
  WorldMap,
  WorldMember,
} from '@domain/models';
import type { IDBPTransaction } from 'idb';
import type { LocalAssetFile, LocalSchema } from './local-database';

/** Todos os keyframes de um token no índice `[tokenId, tick]`, já em ordem de tick. */
export function keyframesOf(tokenId: Uuid): IDBKeyRange {
  return IDBKeyRange.bound([tokenId, -Infinity], [tokenId, Infinity]);
}

/** Stores com linhas de um mundo: exportar, importar e excluir para sempre usam todos. */
export const WORLD_STORES = [
  'worlds',
  'worldMembers',
  'calendars',
  'assets',
  'assetFiles',
  'maps',
  'mapLinks',
  'mapImageVersions',
  'mapTokens',
  'tokenKeyframes',
  'mapAnnotations',
  'entities',
  'events',
  'entityMentions',
] as const;

export type WorldStores = typeof WORLD_STORES;

/** Tudo o que um mundo tem no banco local, inclusive o que está na lixeira dele. */
export interface WorldRows {
  world: World;
  members: WorldMember[];
  calendar: WorldCalendar | undefined;
  assets: Asset[];
  /** Na mesma ordem de `assets`; `undefined` se o arquivo não existe. */
  files: (LocalAssetFile | undefined)[];
  maps: WorldMap[];
  links: MapLink[];
  imageVersions: MapImageVersion[];
  tokens: MapToken[];
  keyframes: TokenKeyframe[];
  annotations: MapAnnotation[];
  entities: Entity[];
  events: WorldEvent[];
  mentions: EntityMention[];
}

/**
 * Lê as linhas do mundo pelos índices (como o `on delete cascade` do banco encontraria);
 * `null` se o mundo não existe. Só faz requisições do IndexedDB: serve dentro de qualquer
 * transação sobre `WORLD_STORES`.
 */
export async function collectWorldRows<Mode extends IDBTransactionMode>(
  tx: IDBPTransaction<LocalSchema, WorldStores, Mode>,
  worldId: Uuid,
): Promise<WorldRows | null> {
  const world = await tx.objectStore('worlds').get(worldId);
  if (!world) return null;
  const [members, calendar, assets, maps, entities, events] = await Promise.all([
    tx.objectStore('worldMembers').index('byWorld').getAll(worldId),
    tx.objectStore('calendars').get(worldId),
    tx.objectStore('assets').index('byWorld').getAll(worldId),
    tx.objectStore('maps').index('byWorld').getAll(worldId),
    tx.objectStore('entities').index('byWorld').getAll(worldId),
    tx.objectStore('events').index('byWorld').getAll(worldId),
  ]);
  const mapIds = maps.map((map) => map.id);
  const [links, imageVersions, tokens, annotations, files] = await Promise.all([
    Promise.all(mapIds.map((id) => tx.objectStore('mapLinks').index('byMap').getAll(id))),
    Promise.all(mapIds.map((id) => tx.objectStore('mapImageVersions').index('byMap').getAll(id))),
    Promise.all(mapIds.map((id) => tx.objectStore('mapTokens').index('byMap').getAll(id))),
    Promise.all(mapIds.map((id) => tx.objectStore('mapAnnotations').index('byMap').getAll(id))),
    Promise.all(assets.map((asset) => tx.objectStore('assetFiles').get(asset.id))),
  ]);
  const byTokenTick = tx.objectStore('tokenKeyframes').index('byTokenTick');
  const bySource = tx.objectStore('entityMentions').index('bySource');
  const [keyframes, mentions] = await Promise.all([
    Promise.all(tokens.flat().map((token) => byTokenTick.getAll(keyframesOf(token.id)))),
    Promise.all([
      ...entities.map((entity) => bySource.getAll(['entity', entity.id])),
      ...events.map((event) => bySource.getAll(['event', event.id])),
    ]),
  ]);
  return {
    world,
    members,
    calendar,
    assets,
    files,
    maps,
    links: links.flat(),
    imageVersions: imageVersions.flat(),
    tokens: tokens.flat(),
    keyframes: keyframes.flat(),
    annotations: annotations.flat(),
    entities,
    events,
    mentions: mentions.flat(),
  };
}

/** Apaga as linhas reunidas por `collectWorldRows` (o `delete cascade` do mundo). */
export async function deleteWorldRows(
  tx: IDBPTransaction<LocalSchema, WorldStores, 'readwrite'>,
  rows: WorldRows,
): Promise<void> {
  const byId = <S extends 'assets' | 'assetFiles' | 'maps' | 'mapLinks' | 'mapImageVersions'>(
    store: S,
    items: readonly { id: Uuid }[],
  ) => items.map((item) => tx.objectStore(store).delete(item.id));
  await Promise.all([
    tx.objectStore('worlds').delete(rows.world.id),
    tx.objectStore('calendars').delete(rows.world.id),
    ...rows.members.map((m) => tx.objectStore('worldMembers').delete([m.worldId, m.userId])),
    ...byId('assets', rows.assets),
    ...byId('assetFiles', rows.assets),
    ...byId('maps', rows.maps),
    ...byId('mapLinks', rows.links),
    ...byId('mapImageVersions', rows.imageVersions),
    ...rows.tokens.map((t) => tx.objectStore('mapTokens').delete(t.id)),
    ...rows.keyframes.map((k) => tx.objectStore('tokenKeyframes').delete(k.id)),
    ...rows.annotations.map((a) => tx.objectStore('mapAnnotations').delete(a.id)),
    ...rows.entities.map((e) => tx.objectStore('entities').delete(e.id)),
    ...rows.events.map((e) => tx.objectStore('events').delete(e.id)),
    ...rows.mentions.map((m) =>
      tx.objectStore('entityMentions').delete([m.sourceKind, m.sourceId, m.targetEntityId]),
    ),
  ]);
}
