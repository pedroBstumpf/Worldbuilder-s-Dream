/** Lado do retrato salvo (quadrado, WebP). */
export const PORTRAIT_SIDE = 512;
export const PORTRAIT_WEBP_QUALITY = 0.85;

export interface PortraitCrop {
  /** Recorte quadrado na imagem original. */
  readonly sx: number;
  readonly sy: number;
  readonly side: number;
  /** Lado final (nunca amplia). */
  readonly size: number;
}

/**
 * Recorte quadrado do retrato: centralizado na horizontal e um pouco acima do centro na
 * vertical (rostos costumam ficar no terço superior), reduzido para `maxSide`.
 */
export function portraitCrop(width: number, height: number, maxSide = PORTRAIT_SIDE): PortraitCrop {
  const side = Math.min(width, height);
  return {
    sx: Math.round((width - side) / 2),
    sy: Math.round((height - side) * 0.3),
    side,
    size: Math.min(side, maxSide),
  };
}
