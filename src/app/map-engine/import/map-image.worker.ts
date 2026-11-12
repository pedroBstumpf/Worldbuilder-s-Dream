import { processMapImage, type AspectFit, type ProcessedMapImage } from './process-map-image';

/** Pedido ao Worker: o arquivo e, numa versão da imagem, a proporção a seguir. */
export interface MapImageWorkerRequest {
  file: Blob;
  fit?: AspectFit;
}

/** Resposta do Worker de importação. */
export type MapImageWorkerResponse =
  { ok: true; result: ProcessedMapImage } | { ok: false; message: string };

/** Worker de importação (docs/06 §0, passos 3 a 5): decodifica sem travar a tela. */
addEventListener('message', (event: MessageEvent<MapImageWorkerRequest>) => {
  processMapImage(event.data.file, event.data.fit).then(
    (result) => {
      const response: MapImageWorkerResponse = { ok: true, result };
      postMessage(response, { transfer: [result.bitmap] });
    },
    (error: unknown) => {
      const response: MapImageWorkerResponse = { ok: false, message: String(error) };
      postMessage(response);
    },
  );
});
