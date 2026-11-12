import { TestBed } from '@angular/core/testing';
import { setUpLocalTestBed } from '@data/local/testing/local-test-bed';
import type { RichTextDoc } from '@domain/models';
import { AssetRepository, EntityRepository, EventRepository } from '@domain/ports';
import { EntityStore } from './entity.store';
import { EventStore } from './event.store';

const worldId = crypto.randomUUID();

// O jsdom não tem object URLs.
const originalUrl = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
beforeEach(() => {
  URL.createObjectURL = () => `blob:test/${crypto.randomUUID()}`;
  URL.revokeObjectURL = () => undefined;
});
afterEach(() => {
  URL.createObjectURL = originalUrl.create;
  URL.revokeObjectURL = originalUrl.revoke;
});

function mentionDoc(id: string, label: string): RichTextDoc {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Aliada de ' },
          { type: 'mention', attrs: { id, label } },
        ],
      },
    ],
  };
}

describe('EntityStore', () => {
  let teardown: () => Promise<void>;
  let store: InstanceType<typeof EntityStore>;

  beforeEach(async () => {
    ({ teardown } = await setUpLocalTestBed([EntityStore, EventStore]));
    store = TestBed.inject(EntityStore);
    await TestBed.inject(EventRepository).create({
      id: crypto.randomUUID(),
      worldId,
      title: 'Queda de Valmora',
      tickStart: 0,
    });
    await store.load(worldId);
  });

  afterEach(() => teardown());

  it('loads entities and events and creates entities in name order', async () => {
    expect(store.status()).toBe('ready');
    expect(store.events().map((e) => e.title)).toEqual(['Queda de Valmora']);

    await store.create('character', 'Zélia');
    await store.create('location', 'Ágora');

    expect(store.sorted().map((e) => e.name)).toEqual(['Ágora', 'Zélia']);
    expect(store.search().search('agora')[0]?.title).toBe('Ágora');
  });

  it('edits optimistically and saves on flush', async () => {
    const aria = await store.create('character', 'Aria');

    store.edit(aria.id, { subtitle: 'Capitã' });
    expect(store.byId().get(aria.id)?.subtitle).toBe('Capitã');
    expect(store.saveStatus()[aria.id]).toBe('saving');

    await store.flush(aria.id);
    expect(store.saveStatus()[aria.id]).toBe('saved');
    expect(await TestBed.inject(EntityRepository).get(aria.id)).toMatchObject({
      subtitle: 'Capitã',
      version: 2,
    });
  });

  it('saves the text with its plain version and mentions, listed as citations', async () => {
    const aria = await store.create('character', 'Aria');
    const bruno = await store.create('character', 'Bruno');

    store.editContent(aria.id, mentionDoc(bruno.id, 'Bruno'));
    await store.flush();

    expect(store.byId().get(aria.id)?.contentText).toBe('Aliada de Bruno');
    expect(await store.citations(bruno.id)).toEqual([
      { kind: 'entity', id: aria.id, title: 'Aria', entityKind: 'character' },
    ]);

    store.editContent(aria.id, { type: 'doc', content: [{ type: 'paragraph' }] });
    await store.flush();
    expect(store.byId().get(aria.id)?.content).toBeNull();
    expect(await store.citations(bruno.id)).toEqual([]);
  });

  it('reloads the entity and reports a conflict when someone else changed it', async () => {
    const aria = await store.create('character', 'Aria');
    await TestBed.inject(EntityRepository).update(aria.id, { name: 'Ária' }, 1);

    store.edit(aria.id, { subtitle: 'Capitã' });
    await store.flush();

    expect(store.saveFailure()).toMatchObject({ entityId: aria.id, conflict: true });
    expect(store.byId().get(aria.id)).toMatchObject({ name: 'Ária', subtitle: null, version: 2 });
  });

  it('trashes, closes the sheet and restores', async () => {
    const aria = await store.create('character', 'Aria');
    store.open(aria.id);
    expect(store.openEntity()?.id).toBe(aria.id);

    await store.trash(aria.id);
    expect(store.entities()).toEqual([]);
    expect(store.openId()).toBeNull();

    await store.restore(aria.id);
    expect(store.entities().map((e) => e.name)).toEqual(['Aria']);
  });

  it('replaces the portrait and deletes the previous image', async () => {
    const assets = TestBed.inject(AssetRepository);
    const aria = await store.create('character', 'Aria');
    const image = () => new Blob([new Uint8Array([1, 2])], { type: 'image/webp' });

    await store.setPortrait(aria.id, image(), 512);
    const first = store.byId().get(aria.id)?.portraitAssetId;
    expect(first).toBeTruthy();
    await store.loadPortrait(first as string);
    expect(store.portraits()[first as string]).toMatch(/^blob:/);

    await store.setPortrait(aria.id, image(), 512);
    expect(await assets.get(first as string)).toBeNull();

    await store.removePortrait(aria.id);
    expect(store.byId().get(aria.id)?.portraitAssetId).toBeNull();
  });
});
