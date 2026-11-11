import { inject, Injectable } from '@angular/core';
import type { Uuid, World } from '@domain/models';
import { WorldRepository } from '@domain/ports';

/**
 * Carregamento antecipado do mundo (ADR-0011): "Abrir mundo" começa a leitura no clique,
 * em paralelo à virada de página; a tela do mapa recebe a mesma Promise. Vira parte do
 * `WorldStore` quando ele existir.
 */
@Injectable({ providedIn: 'root' })
export class WorldPrefetch {
  private readonly worlds = inject(WorldRepository);
  private readonly pending = new Map<Uuid, Promise<World | null>>();

  /** Começa a ler o mundo (ou reaproveita a leitura em curso). */
  prefetch(id: Uuid): Promise<World | null> {
    let request = this.pending.get(id);
    if (!request) {
      request = this.worlds.get(id);
      this.pending.set(id, request);
      // Uma falha não fica guardada: quem pedir de novo tenta outra vez.
      request.catch(() => this.pending.delete(id));
    }
    return request;
  }

  /** Entrega a leitura antecipada (ou faz uma nova) e a esquece. */
  take(id: Uuid): Promise<World | null> {
    const request = this.prefetch(id);
    this.pending.delete(id);
    return request;
  }
}
