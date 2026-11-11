import {
  fitWithin,
  MAP_IMAGE_MAX_SIDE,
  MAP_THUMBNAIL_SIDE,
  MAP_WEBP_QUALITY,
  type Size,
} from '@domain/maps';

/** Resultado da importação: o que vai para o Storage, a miniatura e o bitmap para exibir já. */
export interface ProcessedMapImage {
  /** WebP (qualidade 0,9, sem EXIF); PNG se o navegador não codificar WebP. */
  image: Blob;
  /** Miniatura de até 512 px para a biblioteca. */
  thumbnail: Blob;
  /** Bitmap final, para a cena carregar sem decodificar de novo. */
  bitmap: ImageBitmap;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  /** A imagem passava de 8192 px e foi reduzida. */
  reduced: boolean;
}

type Drawable = ImageBitmap | OffscreenCanvas;

function draw(source: Drawable, size: Size): OffscreenCanvas {
  const canvas = new OffscreenCanvas(size.width, size.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas 2d indisponível');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, size.width, size.height);
  return canvas;
}

/**
 * Reduz em etapas de metade até perto do alvo: um único `drawImage` de 16000 para 512 px
 * serrilha a imagem.
 */
function downscale(source: Drawable, target: Size): OffscreenCanvas {
  let current: Drawable = source;
  let size: Size = { width: source.width, height: source.height };
  while (size.width / 2 > target.width * 1.5 && size.height / 2 > target.height * 1.5) {
    size = { width: Math.ceil(size.width / 2), height: Math.ceil(size.height / 2) };
    current = draw(current, size);
  }
  return draw(current, target);
}

async function encode(canvas: OffscreenCanvas, quality: number): Promise<Blob> {
  return canvas.convertToBlob({ type: 'image/webp', quality });
}

/**
 * Decodifica, reduz para caber em 8192 px, recodifica (o que descarta o EXIF; a orientação
 * já vem aplicada pelo `createImageBitmap`) e gera a miniatura. Roda no Worker.
 */
export async function processMapImage(file: Blob): Promise<ProcessedMapImage> {
  const source = await createImageBitmap(file);
  const original = { width: source.width, height: source.height };
  const target = fitWithin(original, MAP_IMAGE_MAX_SIDE);
  const canvas = downscale(source, target);
  source.close();
  const image = await encode(canvas, MAP_WEBP_QUALITY);
  const thumbnail = await encode(downscale(canvas, fitWithin(target, MAP_THUMBNAIL_SIDE)), 0.8);
  return {
    image,
    thumbnail,
    bitmap: canvas.transferToImageBitmap(),
    width: target.width,
    height: target.height,
    originalWidth: original.width,
    originalHeight: original.height,
    reduced: target.reduced,
  };
}
