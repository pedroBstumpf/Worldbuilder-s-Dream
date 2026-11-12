import { inject, Injectable, InjectionToken } from '@angular/core';
import type {
  Asset,
  Entity,
  EntityMention,
  MapAnnotation,
  MapImageVersion,
  MapLink,
  MapToken,
  Profile,
  Tick,
  TokenKeyframe,
  Uuid,
  World,
  WorldCalendar,
  WorldEvent,
  WorldMap,
  WorldMember,
} from '@domain/models';
import { AppError } from '@domain/ports';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

/** Opções do modo local (docs/10: os adaptadores locais podem simular atraso e falha). */
export interface LocalDataAccessOptions {
  /** Nome do banco IndexedDB. Os testes usam um nome novo por teste. */
  readonly dbName: string;
  /** Atraso simulado antes de cada operação, em ms, para ver os estados de carregamento. */
  readonly latencyMs: number;
  /** Chance (0 a 1) de cada operação falhar com `AppError('network')`, para ver os estados de erro. */
  readonly failureRate: number;
}

export const DEFAULT_LOCAL_DATA_OPTIONS: LocalDataAccessOptions = {
  dbName: 'worldbuilders-dream',
  latencyMs: 0,
  failureRate: 0,
};

export const LOCAL_DATA_OPTIONS = new InjectionToken<LocalDataAccessOptions>('LOCAL_DATA_OPTIONS', {
  providedIn: 'root',
  factory: () => DEFAULT_LOCAL_DATA_OPTIONS,
});

/** Bytes de um asset (`assets` guarda só os metadados, como no Supabase). */
export interface LocalAssetFile {
  id: Uuid;
  bytes: ArrayBuffer;
  type: string;
}

/**
 * Um object store por tabela do docs/07, com os mesmos modelos de `domain/models`.
 * Os índices únicos imitam os `unique` do banco; num índice composto, registros com
 * parte nula ficam de fora do índice, como `null` num `unique` do Postgres.
 */
export interface LocalSchema extends DBSchema {
  worlds: { key: Uuid; value: World };
  worldMembers: {
    key: [Uuid, Uuid];
    value: WorldMember;
    indexes: { byWorld: Uuid; byUser: Uuid };
  };
  calendars: { key: Uuid; value: WorldCalendar };
  assets: { key: Uuid; value: Asset; indexes: { byWorld: Uuid } };
  assetFiles: { key: Uuid; value: LocalAssetFile };
  maps: { key: Uuid; value: WorldMap; indexes: { byWorld: Uuid } };
  mapLinks: { key: Uuid; value: MapLink; indexes: { byMap: Uuid } };
  mapImageVersions: { key: Uuid; value: MapImageVersion; indexes: { byMap: Uuid } };
  entities: { key: Uuid; value: Entity; indexes: { byWorld: Uuid } };
  events: { key: Uuid; value: WorldEvent; indexes: { byWorld: Uuid } };
  mapTokens: {
    key: Uuid;
    value: MapToken;
    indexes: { byMap: Uuid; byMapEntity: [Uuid, Uuid]; byMapEvent: [Uuid, Uuid] };
  };
  tokenKeyframes: { key: Uuid; value: TokenKeyframe; indexes: { byTokenTick: [Uuid, Tick] } };
  mapAnnotations: { key: Uuid; value: MapAnnotation; indexes: { byMap: Uuid } };
  profiles: { key: Uuid; value: Profile };
  entityMentions: {
    key: [string, Uuid, Uuid];
    value: EntityMention;
    indexes: { bySource: [string, Uuid]; byTarget: Uuid };
  };
}

/**
 * Versão do schema local. Nova tabela ou índice: incremente e acrescente um passo em
 * `upgrade` (nunca altere um passo antigo; os navegadores já rodaram).
 */
export const LOCAL_DB_VERSION = 4;

export function openLocalDatabase(name: string): Promise<IDBPDatabase<LocalSchema>> {
  return openDB<LocalSchema>(name, LOCAL_DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('worlds', { keyPath: 'id' });
        const members = db.createObjectStore('worldMembers', { keyPath: ['worldId', 'userId'] });
        members.createIndex('byWorld', 'worldId');
        members.createIndex('byUser', 'userId');
        db.createObjectStore('calendars', { keyPath: 'worldId' });
        db.createObjectStore('assets', { keyPath: 'id' }).createIndex('byWorld', 'worldId');
        db.createObjectStore('assetFiles', { keyPath: 'id' });
        db.createObjectStore('maps', { keyPath: 'id' }).createIndex('byWorld', 'worldId');
        db.createObjectStore('mapLinks', { keyPath: 'id' }).createIndex('byMap', 'mapId');
        db.createObjectStore('entities', { keyPath: 'id' }).createIndex('byWorld', 'worldId');
        db.createObjectStore('events', { keyPath: 'id' }).createIndex('byWorld', 'worldId');
        const tokens = db.createObjectStore('mapTokens', { keyPath: 'id' });
        tokens.createIndex('byMap', 'mapId');
        tokens.createIndex('byMapEntity', ['mapId', 'entityId'], { unique: true });
        tokens.createIndex('byMapEvent', ['mapId', 'eventId'], { unique: true });
        db.createObjectStore('tokenKeyframes', { keyPath: 'id' }).createIndex(
          'byTokenTick',
          ['tokenId', 'tick'],
          { unique: true },
        );
        db.createObjectStore('mapAnnotations', { keyPath: 'id' }).createIndex('byMap', 'mapId');
      }
      if (oldVersion < 2) {
        db.createObjectStore('profiles', { keyPath: 'id' });
      }
      if (oldVersion < 3) {
        // Chave primária de `entity_mentions`: (source_kind, source_id, target_entity_id).
        const mentions = db.createObjectStore('entityMentions', {
          keyPath: ['sourceKind', 'sourceId', 'targetEntityId'],
        });
        mentions.createIndex('bySource', ['sourceKind', 'sourceId']);
        mentions.createIndex('byTarget', 'targetEntityId');
      }
      if (oldVersion < 4) {
        // O `unique (map_id, tick_start) where deleted_at is null` é parcial: o adaptador
        // confere na transação, porque um índice único do IndexedDB valeria para a lixeira.
        db.createObjectStore('mapImageVersions', { keyPath: 'id' }).createIndex('byMap', 'mapId');
      }
    },
  });
}

/** Conexão única com o banco local, aberta na primeira operação. */
@Injectable()
export class LocalDatabase {
  private readonly options = inject(LOCAL_DATA_OPTIONS);
  private connection?: Promise<IDBPDatabase<LocalSchema>>;

  /** Devolve o banco depois do atraso e da falha simulados (`LocalDataAccessOptions`). */
  async ready(): Promise<IDBPDatabase<LocalSchema>> {
    await simulateNetwork(this.options);
    this.connection ??= openLocalDatabase(this.options.dbName);
    return this.connection;
  }

  /** Fecha a conexão (testes, para poder apagar o banco). */
  async close(): Promise<void> {
    const connection = this.connection;
    this.connection = undefined;
    (await connection)?.close();
  }
}

export async function simulateNetwork(options: LocalDataAccessOptions): Promise<void> {
  if (options.latencyMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, options.latencyMs));
  }
  if (options.failureRate > 0 && Math.random() < options.failureRate) {
    throw new AppError('network', 'falha simulada do modo local');
  }
}
