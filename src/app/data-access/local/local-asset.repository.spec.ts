import { TestBed } from '@angular/core/testing';
import type { Asset } from '@domain/models';
import { AssetRepository } from '@domain/ports';
import { FAKE_USER } from './fake-auth.service';
import { setUpLocalTestBed } from './testing/local-test-bed';

const worldId = crypto.randomUUID();

describe('LocalAssetRepository', () => {
  let assets: AssetRepository;
  let teardown: () => Promise<void>;
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let original: { create: typeof URL.createObjectURL; revoke: typeof URL.revokeObjectURL };

  beforeEach(async () => {
    ({ teardown } = await setUpLocalTestBed());
    assets = TestBed.inject(AssetRepository);
    // O jsdom não implementa object URLs: troca pelas funções falsas e devolve no fim.
    createObjectURL = vi.fn((blob: Blob) => `blob:test/${blob.size}`);
    revokeObjectURL = vi.fn();
    original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
  });

  afterEach(async () => {
    URL.createObjectURL = original.create;
    URL.revokeObjectURL = original.revoke;
    await teardown();
  });

  const upload = () =>
    assets.upload(
      { id: crypto.randomUUID(), worldId, mimeType: 'image/webp', width: 2, height: 1 },
      new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' }),
    );

  it('stores the metadata like the assets table', async () => {
    const asset = await upload();

    expect(asset).toMatchObject({
      source: 'storage',
      storagePath: `${worldId}/${asset.id}`,
      mimeType: 'image/webp',
      width: 2,
      height: 1,
      sizeBytes: 3,
      createdBy: FAKE_USER.id,
    });
    expect(await assets.get(asset.id)).toEqual(asset);
  });

  it('resolves an object URL once and revokes it on delete', async () => {
    const asset = await upload();

    const url = await assets.resolveUrl(asset);
    expect(await assets.resolveUrl(asset)).toBe(url);
    expect(createObjectURL).toHaveBeenCalledOnce();
    const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe('image/webp');
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));

    await assets.delete(asset.id);
    expect(revokeObjectURL).toHaveBeenCalledWith(url);
    expect(await assets.get(asset.id)).toBeNull();
    await expect(assets.resolveUrl(asset)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('returns external URLs as they are and refuses Drive files', async () => {
    const asset = await upload();
    const external: Asset = {
      ...asset,
      source: 'external_url',
      externalUrl: 'https://exemplo.org/mapa.webp',
    };

    expect(await assets.resolveUrl(external)).toBe('https://exemplo.org/mapa.webp');
    await expect(
      assets.resolveUrl({ ...asset, source: 'google_drive', externalId: 'abc' }),
    ).rejects.toMatchObject({ code: 'google_unavailable' });
  });
});
