import { processMapImage, type ProcessedMapImage } from './process-map-image';

/** Resposta do Worker de importação. */
export type MapImageWorkerResponse =
  { ok: true; result: ProcessedMapImage } | { ok: false; message: string };

/** Worker de importação (docs/06 §0, passos 3 a 5): decodifica sem travar a tela. */
addEventListener('message', (event: MessageEvent<Blob>) => {
  processMapImage(event.data).then(
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
