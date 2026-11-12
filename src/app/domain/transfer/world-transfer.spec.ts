import { DEFAULT_CALENDAR } from '../calendar/default-calendar';
import type { Entity } from '../models';
import { isAppError } from '../ports/app-error';
import { base64ToBytes, bytesToBase64 } from './base64';
import { asWorldCopy, worldExportFileName, type WorldBundle } from './world-bundle';
import { parseWorldFile, serializeWorldBundle, WORLD_FILE_VERSION } from './world-file';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const NOW = '2026-11-12T10:00:00.000Z';
const USER = '00000000-0000-4000-8000-000000000001';

let seq = 0;
const id = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

/** Mundo pequeno com um de cada: mapa com imagem e versão, token, keyframe, menção. */
function sampleBundle(): WorldBundle {
  const worldId = id();
  const assetId = id();
  const versionAssetId = id();
  const mapId = id();
  const heroId = id();
  const eventId = id();
  const tokenId = id();
  const trashable = { version: 1, createdAt: NOW, updatedAt: NOW, deletedAt: null };
  const asset = (assetIdValue: string) => ({
    asset: {
      id: assetIdValue,
      worldId,
      source: 'storage' as const,
      storagePath: `${worldId}/${assetIdValue}`,
      externalId: null,
      externalUrl: null,
      mimeType: 'image/png',
      width: 4,
      height: 3,
      sizeBytes: PNG.byteLength,
      createdBy: USER,
      createdAt: NOW,
    },
    bytes: PNG,
  });
  return {
    world: {
      id: worldId,
      ownerId: USER,
      name: 'Valmora',
      description: null,
      coverAssetId: assetId,
      timeStart: 0,
      timeEnd: 1000,
      nowTick: null,
      archivedAt: null,
      ...trashable,
    },
    calendar: DEFAULT_CALENDAR,
    maps: [
      {
        id: mapId,
        worldId,
        parentMapId: null,
        name: 'Continente',
        imageAssetId: assetId,
        width: 4,
        height: 3,
        scaleValue: null,
        scaleUnit: null,
        scaleLabel: null,
        sortOrder: 0,
        ...trashable,
      },
    ],
    mapLinks: [],
    mapImageVersions: [
      {
        id: id(),
        worldId,
        mapId,
        imageAssetId: versionAssetId,
        tickStart: 500,
        createdBy: USER,
        ...trashable,
      },
    ],
    mapTokens: [
      {
        id: tokenId,
        worldId,
        mapId,
        entityId: heroId,
        eventId: null,
        size: 1,
        style: {},
        createdAt: NOW,
      },
    ],
    tokenKeyframes: [
      {
        id: id(),
        worldId,
        tokenId,
        tick: 0,
        x: 1,
        y: 2,
        visible: true,
        interpolation: 'linear',
        note: null,
        updatedAt: NOW,
      },
    ],
    mapAnnotations: [],
    entities: [
      {
        id: heroId,
        worldId,
        kind: 'character',
        name: 'Aria',
        subtitle: null,
        color: null,
        portraitAssetId: null,
        aliases: [],
        attributes: {},
        content: null,
        contentText: null,
        bornTick: null,
        diedTick: null,
        tags: [],
        createdBy: USER,
        ...trashable,
      },
    ],
    events: [
      {
        id: eventId,
        worldId,
        title: 'Coroação',
        category: 'general',
        tickStart: 10,
        tickEnd: null,
        locationEntityId: null,
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'mention', attrs: { id: heroId, label: 'Aria' } }],
            },
          ],
        },
        contentText: '@Aria',
        color: null,
        createdBy: USER,
        ...trashable,
      },
    ],
    entityMentions: [{ worldId, sourceKind: 'event', sourceId: eventId, targetEntityId: heroId }],
    assets: [asset(assetId), asset(versionAssetId)],
  };
}

/** Altera o JSON serializado e tenta ler de novo. */
function parseEdited(edit: (file: Record<string, unknown>) => void): unknown {
  const file = JSON.parse(serializeWorldBundle(sampleBundle())) as Record<string, unknown>;
  edit(file);
  try {
    return parseWorldFile(JSON.stringify(file));
  } catch (error) {
    return error;
  }
}

describe('world transfer', () => {
  it('round-trips a world through the json file, images included', () => {
    const bundle = sampleBundle();

    const parsed = parseWorldFile(serializeWorldBundle(bundle));

    expect(parsed).toEqual(bundle);
    expect(parsed.assets[0]?.bytes).toEqual(PNG);
  });

  it('encodes bytes as base64 and back', () => {
    const bytes = new Uint8Array(70_000).map((_, i) => i % 256);

    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it('gives every row a new id and rewrites every reference, mentions included', () => {
    const bundle = sampleBundle();

    const copy = asWorldCopy(bundle, { name: 'Valmora (cópia)' });

    const oldIds = [
      bundle.world.id,
      ...bundle.maps.map((m) => m.id),
      ...bundle.entities.map((e) => e.id),
      ...bundle.assets.map((a) => a.asset.id),
    ];
    const text = JSON.stringify({ ...copy, assets: copy.assets.map((a) => a.asset) });
    for (const oldId of oldIds) expect(text).not.toContain(`"${oldId}"`);
    const [hero] = copy.entities as [Entity];
    expect(copy.world.name).toBe('Valmora (cópia)');
    expect(copy.mapTokens[0]?.entityId).toBe(hero.id);
    expect(copy.entityMentions[0]?.targetEntityId).toBe(hero.id);
    expect(JSON.stringify(copy.events[0]?.content)).toContain(hero.id);
    expect(copy.maps[0]?.worldId).toBe(copy.world.id);
    expect(copy.assets[0]?.bytes).toBe(PNG);
    // O id do usuário não é de nenhuma linha: fica como está (quem importa vira o dono).
    expect(copy.world.ownerId).toBe(USER);
    // A cópia continua um arquivo válido.
    expect(parseWorldFile(serializeWorldBundle(copy))).toEqual(copy);
  });

  it('rejects files that are not exported worlds', () => {
    expect(() => parseWorldFile('not json')).toThrow(/JSON/);
    expect(
      isAppError(
        parseEdited((f) => (f['format'] = 'other')),
        'validation',
      ),
    ).toBe(true);
    expect(
      isAppError(
        parseEdited((f) => (f['formatVersion'] = WORLD_FILE_VERSION + 1)),
        'validation',
      ),
    ).toBe(true);
  });

  it('rejects references to rows outside the file and rows of another world', () => {
    const outside = parseEdited((f) => {
      (f['mapTokens'] as [{ entityId: string }])[0].entityId = id();
    });
    const otherWorld = parseEdited((f) => {
      (f['maps'] as [{ worldId: string }])[0].worldId = id();
    });

    expect(isAppError(outside, 'validation')).toBe(true);
    expect((outside as Error).message).toContain('map_tokens');
    expect((otherWorld as Error).message).toContain('outro mundo');
  });

  it('rejects images whose bytes do not match the declared type', () => {
    const svg = bytesToBase64(new TextEncoder().encode('<svg onload="alert(1)"></svg>'));

    const disguised = parseEdited((f) => {
      (f['assets'] as [{ data: string }])[0].data = svg;
    });
    const svgType = parseEdited((f) => {
      (f['assets'] as [{ mimeType: string }])[0].mimeType = 'image/svg+xml';
    });

    expect(isAppError(disguised, 'validation')).toBe(true);
    expect(isAppError(svgType, 'validation')).toBe(true);
  });

  it('names the file after the world and the day', () => {
    expect(worldExportFileName('Reino de Ávalon!', new Date(2026, 10, 2))).toBe(
      'reino-de-avalon-2026-11-02.json',
    );
    expect(worldExportFileName('???', new Date(2026, 0, 1))).toBe('mundo-2026-01-01.json');
  });
});
