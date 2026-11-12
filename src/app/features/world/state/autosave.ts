import type { Uuid } from '@domain/models';

/** Espera depois da última edição antes de gravar (docs/04 › Autosave, 400–800 ms). */
export const SAVE_DELAY_MS = 600;

export type SaveStatus = 'saving' | 'saved' | 'failed';

/** Falha de gravação a avisar: `conflict` recarregou o item; as outras guardam a edição. */
export interface SaveFailure {
  /** Id do item (entidade ou evento). */
  readonly entityId: Uuid;
  readonly conflict: boolean;
  readonly at: number;
}

/** Edição ainda não gravada de um item. */
interface Pending<P> {
  patch: P;
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * Fila de gravação com espera (docs/04 › Autosave): junta as edições de cada item e grava
 * `delay` ms depois da última, uma gravação por vez por item. Quem usa decide o que fazer
 * em caso de falha: `discard` (conflito) ou `requeue` (tentar de novo depois).
 */
export class Autosaver<P extends object> {
  private readonly pending = new Map<Uuid, Pending<P>>();
  private readonly inflight = new Map<Uuid, Promise<void>>();

  constructor(
    private readonly delay: number,
    private readonly write: (id: Uuid, patch: P) => Promise<void>,
  ) {}

  /** Junta a edição às pendentes e agenda a gravação. */
  schedule(id: Uuid, patch: P): void {
    const entry = this.pending.get(id) ?? { patch: {} as P, timer: null };
    entry.patch = { ...entry.patch, ...patch };
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      entry.timer = null;
      void this.save(id);
    }, this.delay);
    this.pending.set(id, entry);
  }

  /** Edições ainda não gravadas (ex.: feitas durante a gravação em curso). */
  pendingPatch(id: Uuid): P | undefined {
    return this.pending.get(id)?.patch;
  }

  has(id: Uuid): boolean {
    return this.pending.has(id);
  }

  ids(): Uuid[] {
    return [...this.pending.keys()];
  }

  /** Descarta o que está pendente (o item mudou em outro lugar). */
  discard(id: Uuid): void {
    const entry = this.pending.get(id);
    if (entry?.timer) clearTimeout(entry.timer);
    this.pending.delete(id);
  }

  /** Devolve à fila uma edição que falhou, sob as que chegaram depois (sem novo agendamento). */
  requeue(id: Uuid, patch: P): void {
    const newer = this.pending.get(id);
    this.pending.set(id, { patch: { ...patch, ...newer?.patch }, timer: newer?.timer ?? null });
  }

  /** Grava agora o que estiver pendente do item (espera a gravação em curso). */
  async save(id: Uuid): Promise<void> {
    const waiting = this.inflight.get(id);
    if (waiting) await waiting;
    const entry = this.pending.get(id);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    this.pending.delete(id);
    const run = this.write(id, entry.patch);
    this.inflight.set(id, run);
    try {
      await run;
    } finally {
      if (this.inflight.get(id) === run) this.inflight.delete(id);
    }
  }

  /** Grava tudo (ou um item) agora. */
  async flush(id?: Uuid): Promise<void> {
    const ids = id ? [id] : this.ids();
    await Promise.all(ids.map((each) => this.save(each)));
  }
}
