import { MAP_IMAGE_MAX_BYTES } from '@domain/maps';
import { MapImageError, readMapImage, validateMapImage } from './read-map-image';

const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13];

function file(bytes: number[], type: string, size = bytes.length): Blob {
  const body = new Uint8Array(size);
  body.set(bytes.slice(0, size));
  return new Blob([body], { type });
}

describe('readMapImage', () => {
  it('validates by signature before decoding', async () => {
    expect(await validateMapImage(file(PNG_HEAD, 'image/png'))).toBeNull();
    expect(await validateMapImage(file([0x25, 0x50, 0x44, 0x46], 'image/png'))).toBe('not_image');
    expect(await validateMapImage(new Blob([], { type: 'image/png' }))).toBe('empty');
    expect(await validateMapImage(file(PNG_HEAD, 'image/png', MAP_IMAGE_MAX_BYTES + 1))).toBe(
      'too_large',
    );
  });

  it('rejects with the reason', async () => {
    const error = await readMapImage(file([1, 2, 3], 'text/plain')).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(MapImageError);
    expect((error as MapImageError).reason).toBe('not_image');
  });
});
