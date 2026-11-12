import { PORTRAIT_WEBP_QUALITY, portraitCrop } from '@domain/entities';
import { validateMapImage } from '@engine/import/read-map-image';

export interface Portrait {
  readonly image: Blob;
  readonly size: number;
}

/**
 * Prepara a imagem escolhida como retrato: valida tipo e assinatura (mesmas regras do
 * mapa), recorta um quadrado, reduz para 512 px e regrava em WebP (o que também tira os
 * metadados EXIF). Rejeita se a imagem não servir.
 */
export async function readPortrait(file: Blob): Promise<Portrait> {
  const rejection = await validateMapImage(file);
  if (rejection) throw new Error(rejection);
  const bitmap = await createImageBitmap(file);
  try {
    const crop = portraitCrop(bitmap.width, bitmap.height);
    const canvas = new OffscreenCanvas(crop.size, crop.size);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas 2d indisponível');
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, crop.sx, crop.sy, crop.side, crop.side, 0, 0, crop.size, crop.size);
    const image = await canvas.convertToBlob({
      type: 'image/webp',
      quality: PORTRAIT_WEBP_QUALITY,
    });
    return { image, size: crop.size };
  } finally {
    bitmap.close();
  }
}
