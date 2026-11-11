import { TestBed } from '@angular/core/testing';
import { EntityRepository, MentionRepository } from '@domain/ports';
import { setUpLocalTestBed } from './testing/local-test-bed';

const worldId = crypto.randomUUID();

describe('LocalMentionRepository', () => {
  let mentions: MentionRepository;
  let entities: EntityRepository;
  let teardown: () => Promise<void>;

  beforeEach(async () => {
    ({ teardown } = await setUpLocalTestBed());
    mentions = TestBed.inject(MentionRepository);
    entities = TestBed.inject(EntityRepository);
  });

  afterEach(() => teardown());

  const create = (name: string, world = worldId) =>
    entities.create({ id: crypto.randomUUID(), worldId: world, kind: 'character', name });

  it('replaces the mentions of a text and lists who cites an entity', async () => {
    const [aria, bruno, caio] = await Promise.all([
      create('Aria'),
      create('Bruno'),
      create('Caio'),
    ]);
    const source = { worldId, kind: 'entity' as const, id: aria.id };

    await mentions.replace(source, [bruno.id, caio.id, bruno.id]);
    expect(await mentions.listCiting(bruno.id)).toEqual([
      { worldId, sourceKind: 'entity', sourceId: aria.id, targetEntityId: bruno.id },
    ]);

    await mentions.replace(source, [caio.id]);
    expect(await mentions.listCiting(bruno.id)).toEqual([]);
    expect(await mentions.listCiting(caio.id)).toHaveLength(1);
  });

  it('rejects mentions of unknown entities or of another world, keeping the old ones', async () => {
    const [aria, bruno] = await Promise.all([create('Aria'), create('Bruno')]);
    const stranger = await create('Estranho', crypto.randomUUID());
    const source = { worldId, kind: 'entity' as const, id: aria.id };
    await mentions.replace(source, [bruno.id]);

    await expect(mentions.replace(source, [crypto.randomUUID()])).rejects.toMatchObject({
      code: 'validation',
    });
    await expect(mentions.replace(source, [stranger.id])).rejects.toMatchObject({
      code: 'validation',
    });
    expect(await mentions.listCiting(bruno.id)).toHaveLength(1);
  });
});
