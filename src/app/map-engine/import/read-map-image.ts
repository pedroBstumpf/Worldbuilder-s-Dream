import { checkMapImage, IMAGE_SIGNATURE_BYTES, type MapImageRejection } from '@domain/maps';
import type { MapImageWorkerRequest, MapImageWorkerResponse } from './map-image.worker';
import type { AspectFit, ProcessedMapImage } from './process-map-image';

export type { AspectFit, ProcessedMapImage } from './process-map-image';

/** Por que a imagem não virou mapa; a interface escolhe a mensagem pelo motivo. */
export type MapImageFailure = MapImageRejection | 'decode_failed' | 'unsupported';

export class MapImageError extends Error {
  override readonly name = 'MapImageError';

  constructor(
    readonly reason: MapImageFailure,
    message: string = reason,
  ) {
    super(message);
  }
}

/** Valida tipo, assinatura e tamanho sem decodificar (docs/06 §0, passo 2). */
export async function validateMapImage(file: Blob): Promise<MapImageRejection | null> {
  const head = new Uint8Array(await file.slice(0, IMAGE_SIGNATURE_BYTES).arrayBuffer());
  return checkMapImage(file, head);
}

/**
 * Lê uma imagem de mapa: valida e processa num Web Worker com `OffscreenCanvas`. Com
 * `fit`, corta ou põe margens para a proporção do mapa. Rejeita com `MapImageError`.
 */
export async function readMapImage(file: Blob, fit?: AspectFit): Promise<ProcessedMapImage> {
  const rejection = await validateMapImage(file);
  if (rejection) throw new MapImageError(rejection);
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') {
    throw new MapImageError('unsupported', 'navegador sem Worker ou OffscreenCanvas');
  }
  const worker = new Worker(new URL('./map-image.worker', import.meta.url), { type: 'module' });
  try {
    const response = await new Promise<MapImageWorkerResponse>((resolve, reject) => {
      worker.addEventListener('message', (event: MessageEvent<MapImageWorkerResponse>) =>
        resolve(event.data),
      );
      worker.addEventListener('error', (event) => reject(new Error(event.message)));
      const request: MapImageWorkerRequest = fit ? { file, fit } : { file };
      worker.postMessage(request);
    });
    if (!response.ok) throw new MapImageError('decode_failed', response.message);
    return response.result;
  } catch (error) {
    if (error instanceof MapImageError) throw error;
    throw new MapImageError('decode_failed', String(error));
  } finally {
    worker.terminate();
  }
}
