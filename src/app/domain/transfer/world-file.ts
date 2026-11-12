import { z } from 'zod';
import { calendarDefinitionSchema } from '../calendar/calendar-definition';
import { detectImageType, MAP_IMAGE_TYPES } from '../maps/map-image';
import {
  ANNOTATION_KINDS,
  ASSET_SOURCES,
  ENTITY_KINDS,
  INTERPOLATION_MODES,
  SCALE_UNITS,
  type Asset,
  type Entity,
  type EntityMention,
  type MapAnnotation,
  type MapImageVersion,
  type MapLink,
  type MapToken,
  type RichTextDoc,
  type TokenKeyframe,
  type Uuid,
  type World,
  type WorldEvent,
  type WorldMap,
} from '../models';
import { AppError } from '../ports/app-error';
import { base64ToBytes, bytesToBase64 } from './base64';
import type { WorldBundle, WorldBundleAsset } from './world-bundle';

/**
 * Arquivo `.json` de um mundo exportado (docs/07 › Exportar e importar). O mesmo formato
 * vale para o modo local e para a Edge Function `export-world`; mudanças incompatíveis
 * aumentam `formatVersion`.
 */
export const WORLD_FILE_FORMAT = 'worldbuilders-dream/world';
export const WORLD_FILE_VERSION = 1;

const uuid = z.guid();
const iso = z.string().min(1).max(64);
const tick = z.int();
/** Valor de uma lista fixa do domínio (`SCALE_UNITS`, `ENTITY_KINDS`…). */
const oneOf = <T extends string>(values: readonly T[]) =>
  z.custom<T>(
    (value) => typeof value === 'string' && (values as readonly string[]).includes(value),
  );
const color = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .nullable();
const jsonObject = z.record(z.string(), z.json());
/** Documento do Tiptap; veio de `JSON.parse`, então já é JSON. */
const richText = z
  .custom<RichTextDoc>(
    (value) =>
      typeof value === 'object' && value !== null && (value as { type?: unknown }).type === 'doc',
  )
  .nullable();
const versioned = { version: z.int().min(1), createdAt: iso, updatedAt: iso };
const trashable = { ...versioned, deletedAt: iso.nullable() };

const worldSchema = z.object({
  id: uuid,
  ownerId: uuid,
  name: z.string(),
  description: z.string().nullable(),
  coverAssetId: uuid.nullable(),
  timeStart: tick,
  timeEnd: tick,
  nowTick: tick.nullable(),
  archivedAt: iso.nullable(),
  ...trashable,
}) satisfies z.ZodType<World>;

const mapSchema = z.object({
  id: uuid,
  worldId: uuid,
  parentMapId: uuid.nullable(),
  name: z.string(),
  imageAssetId: uuid.nullable(),
  width: z.int(),
  height: z.int(),
  scaleValue: z.number().nullable(),
  scaleUnit: oneOf(SCALE_UNITS).nullable(),
  scaleLabel: z.string().nullable(),
  sortOrder: z.number(),
  ...trashable,
}) satisfies z.ZodType<WorldMap>;

const linkSchema = z.object({
  id: uuid,
  worldId: uuid,
  mapId: uuid,
  targetMapId: uuid,
  polygon: z.array(z.tuple([z.number(), z.number()])),
}) satisfies z.ZodType<MapLink>;

const imageVersionSchema = z.object({
  id: uuid,
  worldId: uuid,
  mapId: uuid,
  imageAssetId: uuid.nullable(),
  tickStart: tick,
  createdBy: uuid.nullable(),
  ...trashable,
}) satisfies z.ZodType<MapImageVersion>;

const tokenSchema = z.object({
  id: uuid,
  worldId: uuid,
  mapId: uuid,
  entityId: uuid.nullable(),
  eventId: uuid.nullable(),
  size: z.number(),
  style: jsonObject,
  createdAt: iso,
}) satisfies z.ZodType<MapToken>;

const keyframeSchema = z.object({
  id: uuid,
  worldId: uuid,
  tokenId: uuid,
  tick,
  x: z.number(),
  y: z.number(),
  visible: z.boolean(),
  interpolation: oneOf(INTERPOLATION_MODES),
  note: z.string().nullable(),
  updatedAt: iso,
}) satisfies z.ZodType<TokenKeyframe>;

const annotationSchema = z.object({
  id: uuid,
  worldId: uuid,
  mapId: uuid,
  kind: oneOf(ANNOTATION_KINDS),
  geometry: jsonObject,
  style: jsonObject,
  title: z.string().nullable(),
  entityId: uuid.nullable(),
  eventId: uuid.nullable(),
  tickStart: tick.nullable(),
  tickEnd: tick.nullable(),
  zIndex: z.int(),
  version: z.int().min(1),
  createdBy: uuid.nullable(),
  createdAt: iso,
  updatedAt: iso,
}) satisfies z.ZodType<MapAnnotation>;

const entitySchema = z.object({
  id: uuid,
  worldId: uuid,
  kind: oneOf(ENTITY_KINDS),
  name: z.string(),
  subtitle: z.string().nullable(),
  color,
  portraitAssetId: uuid.nullable(),
  aliases: z.array(z.string()),
  attributes: jsonObject,
  content: richText,
  contentText: z.string().nullable(),
  bornTick: tick.nullable(),
  diedTick: tick.nullable(),
  tags: z.array(z.string()),
  createdBy: uuid.nullable(),
  ...trashable,
}) satisfies z.ZodType<Entity>;

const eventSchema = z.object({
  id: uuid,
  worldId: uuid,
  title: z.string(),
  category: z.string(),
  tickStart: tick,
  tickEnd: tick.nullable(),
  locationEntityId: uuid.nullable(),
  content: richText,
  contentText: z.string().nullable(),
  color,
  createdBy: uuid.nullable(),
  ...trashable,
}) satisfies z.ZodType<WorldEvent>;

const mentionSchema = z.object({
  worldId: uuid,
  sourceKind: oneOf(['entity', 'event'] as const),
  sourceId: uuid,
  targetEntityId: uuid,
}) satisfies z.ZodType<EntityMention>;

/**
 * Asset com os bytes em base64 (`data`). Só imagens PNG, JPEG ou WebP: o arquivo vem de
 * fora, então o tipo declarado precisa bater com a assinatura dos bytes (nada de SVG ou
 * HTML disfarçado de imagem).
 */
const assetSchema = z.object({
  id: uuid,
  worldId: uuid,
  source: oneOf(ASSET_SOURCES),
  storagePath: z.string().nullable(),
  externalId: z.string().nullable(),
  externalUrl: z.url({ protocol: /^https$/ }).nullable(),
  mimeType: oneOf(MAP_IMAGE_TYPES),
  width: z.int().nullable(),
  height: z.int().nullable(),
  sizeBytes: z.int().min(0),
  createdBy: uuid,
  createdAt: iso,
  data: z.string().nullable(),
});

const worldFileSchema = z.object({
  format: z.literal(WORLD_FILE_FORMAT),
  formatVersion: z.literal(WORLD_FILE_VERSION),
  exportedAt: iso,
  world: worldSchema,
  calendar: calendarDefinitionSchema,
  maps: z.array(mapSchema),
  mapLinks: z.array(linkSchema),
  mapImageVersions: z.array(imageVersionSchema),
  mapTokens: z.array(tokenSchema),
  tokenKeyframes: z.array(keyframeSchema),
  mapAnnotations: z.array(annotationSchema),
  entities: z.array(entitySchema),
  events: z.array(eventSchema),
  entityMentions: z.array(mentionSchema),
  assets: z.array(assetSchema),
});

export type WorldFile = z.input<typeof worldFileSchema>;

/** Serializa o mundo no arquivo `.json`, com as imagens em base64. */
export function serializeWorldBundle(bundle: WorldBundle, exportedAt: Date = new Date()): string {
  const file: WorldFile = {
    format: WORLD_FILE_FORMAT,
    formatVersion: WORLD_FILE_VERSION,
    exportedAt: exportedAt.toISOString(),
    world: bundle.world,
    calendar: bundle.calendar,
    maps: [...bundle.maps],
    mapLinks: [...bundle.mapLinks],
    mapImageVersions: [...bundle.mapImageVersions],
    mapTokens: [...bundle.mapTokens],
    tokenKeyframes: [...bundle.tokenKeyframes],
    mapAnnotations: [...bundle.mapAnnotations],
    entities: [...bundle.entities],
    events: [...bundle.events],
    entityMentions: [...bundle.entityMentions],
    assets: bundle.assets.map(({ asset, bytes }) => ({
      ...asset,
      mimeType: asset.mimeType as (typeof MAP_IMAGE_TYPES)[number],
      data: bytes ? bytesToBase64(bytes) : null,
    })),
  };
  return JSON.stringify(file);
}

/**
 * Lê um arquivo exportado: valida o formato com zod, confere que toda linha é do mesmo
 * mundo e que as referências apontam para linhas do arquivo, e decodifica as imagens.
 * Qualquer problema vira `AppError('validation')`; os ids continuam os do arquivo
 * (use `asWorldCopy` antes de importar).
 */
export function parseWorldFile(text: string): WorldBundle {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (cause) {
    throw new AppError('validation', 'o arquivo não é JSON', { cause });
  }
  const result = worldFileSchema.safeParse(json);
  if (!result.success) {
    throw new AppError('validation', 'o arquivo não é um mundo exportado', {
      cause: result.error,
    });
  }
  const file = result.data;
  const bundle: WorldBundle = {
    world: file.world,
    calendar: file.calendar,
    maps: file.maps,
    mapLinks: file.mapLinks,
    mapImageVersions: file.mapImageVersions,
    mapTokens: file.mapTokens,
    tokenKeyframes: file.tokenKeyframes,
    mapAnnotations: file.mapAnnotations,
    entities: file.entities,
    events: file.events,
    entityMentions: file.entityMentions,
    assets: file.assets.map(decodeAsset),
  };
  const problem = findBrokenReference(bundle);
  if (problem) throw new AppError('validation', problem);
  return bundle;
}

function decodeAsset({ data, ...asset }: z.output<typeof assetSchema>): WorldBundleAsset {
  if (asset.source !== 'storage') return { asset, bytes: null };
  if (data === null) throw new AppError('validation', `imagem ${asset.id} sem os bytes`);
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(data);
  } catch (cause) {
    throw new AppError('validation', `imagem ${asset.id} com base64 inválido`, { cause });
  }
  if (detectImageType(bytes.subarray(0, 12)) !== asset.mimeType) {
    throw new AppError('validation', `imagem ${asset.id} não é ${asset.mimeType}`);
  }
  return { asset: { ...asset, sizeBytes: bytes.byteLength } satisfies Asset, bytes };
}

/** Primeira linha de outro mundo ou com referência para fora do arquivo; `null` se tudo bem. */
function findBrokenReference(bundle: WorldBundle): string | null {
  const worldId = bundle.world.id;
  const idsOf = (rows: readonly { id: Uuid }[]) => new Set(rows.map((row) => row.id));
  const maps = idsOf(bundle.maps);
  const tokens = idsOf(bundle.mapTokens);
  const entities = idsOf(bundle.entities);
  const events = idsOf(bundle.events);
  const assets = new Set(bundle.assets.map(({ asset }) => asset.id));
  const sources = { entity: entities, event: events };

  const problems: string[] = [];
  const check = (table: string, rowWorldId: Uuid, ...refs: [Uuid | null, Set<Uuid>][]) => {
    if (rowWorldId !== worldId) problems.push(`${table}: linha de outro mundo`);
    for (const [ref, targets] of refs) {
      if (ref !== null && !targets.has(ref)) problems.push(`${table}: ${ref} fora do arquivo`);
    }
  };
  check('worlds', worldId, [bundle.world.coverAssetId, assets]);
  for (const m of bundle.maps) {
    check('maps', m.worldId, [m.parentMapId, maps], [m.imageAssetId, assets]);
  }
  for (const l of bundle.mapLinks) {
    check('map_links', l.worldId, [l.mapId, maps], [l.targetMapId, maps]);
  }
  for (const v of bundle.mapImageVersions) {
    check('map_image_versions', v.worldId, [v.mapId, maps], [v.imageAssetId, assets]);
  }
  for (const t of bundle.mapTokens) {
    check('map_tokens', t.worldId, [t.mapId, maps], [t.entityId, entities], [t.eventId, events]);
  }
  for (const k of bundle.tokenKeyframes) check('token_keyframes', k.worldId, [k.tokenId, tokens]);
  for (const a of bundle.mapAnnotations) {
    check(
      'map_annotations',
      a.worldId,
      [a.mapId, maps],
      [a.entityId, entities],
      [a.eventId, events],
    );
  }
  for (const e of bundle.entities) check('entities', e.worldId, [e.portraitAssetId, assets]);
  for (const e of bundle.events) check('events', e.worldId, [e.locationEntityId, entities]);
  for (const m of bundle.entityMentions) {
    check(
      'entity_mentions',
      m.worldId,
      [m.sourceId, sources[m.sourceKind]],
      [m.targetEntityId, entities],
    );
  }
  for (const { asset } of bundle.assets) check('assets', asset.worldId);
  return problems[0] ?? null;
}
