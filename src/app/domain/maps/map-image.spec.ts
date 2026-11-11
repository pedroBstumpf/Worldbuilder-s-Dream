import {
  checkMapImage,
  detectImageType,
  fitWithin,
  MAP_IMAGE_MAX_BYTES,
  mapNameFromFile,
} from './map-image';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);
const GIF = new TextEncoder().encode('GIF89a\0\0\0\0\0\0');

describe('map image', () => {
  it('detects the real type by signature', () => {
    expect(detectImageType(PNG)).toBe('image/png');
    expect(detectImageType(JPEG)).toBe('image/jpeg');
    expect(detectImageType(WEBP)).toBe('image/webp');
    expect(detectImageType(GIF)).toBeNull();
    expect(detectImageType(new Uint8Array())).toBeNull();
  });

  it('requires both an accepted MIME and a matching signature', () => {
    expect(checkMapImage({ type: 'image/png', size: 10 }, PNG)).toBeNull();
    // MIME de imagem, mas os bytes são de outra coisa (arquivo renomeado).
    expect(checkMapImage({ type: 'image/png', size: 10 }, GIF)).toBe('not_image');
    expect(checkMapImage({ type: 'image/gif', size: 10 }, GIF)).toBe('not_image');
    expect(checkMapImage({ type: 'application/pdf', size: 10 }, PNG)).toBe('not_image');
  });

  it('rejects empty and oversized files', () => {
    expect(checkMapImage({ type: 'image/png', size: 0 }, PNG)).toBe('empty');
    expect(checkMapImage({ type: 'image/png', size: MAP_IMAGE_MAX_BYTES }, PNG)).toBeNull();
    expect(checkMapImage({ type: 'image/png', size: MAP_IMAGE_MAX_BYTES + 1 }, PNG)).toBe(
      'too_large',
    );
  });

  it('reduces the longest side and keeps the aspect ratio', () => {
    expect(fitWithin({ width: 4000, height: 3000 }, 8192)).toEqual({
      width: 4000,
      height: 3000,
      reduced: false,
    });
    expect(fitWithin({ width: 16384, height: 8192 }, 8192)).toEqual({
      width: 8192,
      height: 4096,
      reduced: true,
    });
    expect(fitWithin({ width: 3000, height: 12000 }, 512)).toEqual({
      width: 128,
      height: 512,
      reduced: true,
    });
    expect(fitWithin({ width: 100000, height: 1 }, 512).height).toBe(1);
  });

  it('derives the map name from the file name', () => {
    expect(mapNameFromFile('Valmora_mapa-final.png', 'Mapa')).toBe('Valmora mapa final');
    expect(mapNameFromFile('  .webp', 'Mapa')).toBe('Mapa');
    expect(mapNameFromFile(`${'a'.repeat(200)}.jpg`, 'Mapa')).toHaveLength(120);
  });
});
