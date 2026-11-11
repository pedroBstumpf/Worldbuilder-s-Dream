/** Regras da imagem de mapa importada (docs/06 §0). */

/** Tamanho bruto máximo aceito do arquivo. */
export const MAP_IMAGE_MAX_BYTES = 50 * 1024 * 1024;

/** Lado maior máximo da textura (limite seguro do WebGL); acima disso, a imagem é reduzida. */
export const MAP_IMAGE_MAX_SIDE = 8192;

/** Lado maior da miniatura usada na biblioteca. */
export const MAP_THUMBNAIL_SIDE = 512;

/** Qualidade da conversão para WebP. */
export const MAP_WEBP_QUALITY = 0.9;

export type MapImageType = 'image/png' | 'image/jpeg' | 'image/webp';
export const MAP_IMAGE_TYPES: readonly MapImageType[] = ['image/png', 'image/jpeg', 'image/webp'];

/** Quantos bytes do início do arquivo `detectImageType` precisa ler. */
export const IMAGE_SIGNATURE_BYTES = 12;

export type MapImageRejection = 'not_image' | 'too_large' | 'empty';

/** Tipo real pela assinatura (primeiros bytes), independente da extensão ou do MIME. */
export function detectImageType(head: Uint8Array): MapImageType | null {
  const starts = (bytes: number[], offset = 0) =>
    bytes.every((byte, i) => head[offset + i] === byte);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (starts([0xff, 0xd8, 0xff])) return 'image/jpeg';
  // RIFF....WEBP
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  return null;
}

/**
 * Valida o arquivo antes de decodificar: MIME declarado **e** assinatura precisam ser de
 * uma imagem aceita, e o tamanho não pode passar de 50 MB. Devolve o motivo da recusa.
 */
export function checkMapImage(
  file: { type: string; size: number },
  head: Uint8Array,
): MapImageRejection | null {
  if (file.size === 0) return 'empty';
  if (!(MAP_IMAGE_TYPES as readonly string[]).includes(file.type)) return 'not_image';
  if (detectImageType(head) === null) return 'not_image';
  if (file.size > MAP_IMAGE_MAX_BYTES) return 'too_large';
  return null;
}

/** Só pelo MIME (durante o arraste o navegador não deixa ler os bytes). */
export function isAcceptedImageMime(type: string): boolean {
  return (MAP_IMAGE_TYPES as readonly string[]).includes(type);
}

export interface Size {
  width: number;
  height: number;
}

/** Reduz proporcionalmente para o lado maior caber em `maxSide` (nunca amplia). */
export function fitWithin(size: Size, maxSide: number): Size & { reduced: boolean } {
  const longest = Math.max(size.width, size.height);
  if (longest <= maxSide) return { ...size, reduced: false };
  const ratio = maxSide / longest;
  return {
    width: Math.max(1, Math.round(size.width * ratio)),
    height: Math.max(1, Math.round(size.height * ratio)),
    reduced: true,
  };
}

/** Nome do mapa a partir do arquivo: sem extensão, `_`/`-` viram espaço, até 120 caracteres. */
export function mapNameFromFile(fileName: string, fallback: string): string {
  const name = fileName
    .replace(/\.[a-z0-9]{1,5}$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
    .trim();
  return name || fallback;
}
