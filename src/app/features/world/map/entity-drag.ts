import { Injectable, signal } from '@angular/core';
import type { Uuid } from '@domain/models';

/** Tipo de dado do arraste de uma entidade do Explorar (o valor é o id). */
export const ENTITY_DRAG_TYPE = 'application/x-wd-entity';

/**
 * Entidade sendo arrastada do Explorar (docs/06 §6). Durante o arraste o navegador só
 * mostra os tipos do `dataTransfer`, não os valores; o mapa lê o id daqui para desenhar o
 * fantasma do token. O drop confere o id no próprio `dataTransfer`.
 */
@Injectable({ providedIn: 'root' })
export class EntityDrag {
  readonly entityId = signal<Uuid | null>(null);
}
