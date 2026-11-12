import type { CalendarDefinition } from '../calendar/calendar-definition';
import type {
  Asset,
  Entity,
  EntityMention,
  MapAnnotation,
  MapImageVersion,
  MapLink,
  MapToken,
  TokenKeyframe,
  Uuid,
  World,
  WorldEvent,
  WorldMap,
} from '../models';

/** Imagem do mundo com os bytes (nulos quando a imagem não fica no app: Drive ou URL). */
export interface WorldBundleAsset {
  readonly asset: Asset;
  readonly bytes: Uint8Array | null;
}

/**
 * Um mundo inteiro em memória, com as mesmas linhas do docs/07 (inclusive as que estão na
 * lixeira do mundo, para nenhuma referência ficar sem destino). É o que a porta
 * `WorldTransferRepository` exporta e importa; o arquivo `.json` é a forma serializada
 * (`world-file.ts`). Membros não entram: quem importa vira o dono.
 */
export interface WorldBundle {
  readonly world: World;
  readonly calendar: CalendarDefinition;
  readonly maps: readonly WorldMap[];
  readonly mapLinks: readonly MapLink[];
  readonly mapImageVersions: readonly MapImageVersion[];
  readonly mapTokens: readonly MapToken[];
  readonly tokenKeyframes: readonly TokenKeyframe[];
  readonly mapAnnotations: readonly MapAnnotation[];
  readonly entities: readonly Entity[];
  readonly events: readonly WorldEvent[];
  readonly entityMentions: readonly EntityMention[];
  readonly assets: readonly WorldBundleAsset[];
}

export interface WorldCopyOptions {
  /** Novo nome do mundo; ausente mantém o original. */
  readonly name?: string;
  /** Gerador de ids (testes); padrão `crypto.randomUUID()`. */
  readonly newId?: () => Uuid;
}

/**
 * O mesmo mundo com um id novo em cada linha, para importar como cópia (ou duplicar)
 * sem colidir com o original. Troca toda string igual a um id antigo, em qualquer
 * profundidade: chaves estrangeiras, `attrs.id` das menções no Tiptap e o que mais
 * guardar ids dentro de JSON.
 */
export function asWorldCopy(bundle: WorldBundle, options: WorldCopyOptions = {}): WorldBundle {
  const newId = options.newId ?? (() => crypto.randomUUID());
  const ids = new Map<string, string>();
  for (const id of rowIds(bundle)) ids.set(id, newId());
  const copy = remapIds(bundle, ids);
  return options.name === undefined
    ? copy
    : { ...copy, world: { ...copy.world, name: options.name } };
}

function rowIds(bundle: WorldBundle): Uuid[] {
  return [
    bundle.world.id,
    ...[
      bundle.maps,
      bundle.mapLinks,
      bundle.mapImageVersions,
      bundle.mapTokens,
      bundle.tokenKeyframes,
      bundle.mapAnnotations,
      bundle.entities,
      bundle.events,
    ].flatMap((rows) => rows.map((row) => row.id)),
    ...bundle.assets.map(({ asset }) => asset.id),
  ];
}

/** Troca strings iguais a ids; só percorre arrays e objetos simples (bytes ficam como estão). */
function remapIds<T>(value: T, ids: ReadonlyMap<string, string>): T {
  if (typeof value === 'string') return (ids.get(value) ?? value) as T;
  if (Array.isArray(value)) return value.map((item: unknown) => remapIds(item, ids)) as T;
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, field]) => [key, remapIds(field, ids)]),
    ) as T;
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Nome do arquivo exportado: `valmora-2026-11-12.json` (sem acentos nem espaços). */
export function worldExportFileName(worldName: string, date: Date = new Date()): string {
  const slug = worldName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  const day = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
  return `${slug || 'mundo'}-${day}.json`;
}
