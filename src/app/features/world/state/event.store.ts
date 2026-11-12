import { computed, inject } from '@angular/core';
import { isEmptyRichText, mentionedEntityIds, richTextToPlain } from '@domain/entities';
import { compareEvents, DEFAULT_EVENT_CATEGORY } from '@domain/events';
import type { RichTextDoc, Tick, Uuid, WorldEvent } from '@domain/models';
import {
  EventRepository,
  isAppError,
  MentionRepository,
  type WorldEventPatch,
} from '@domain/ports';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import { Autosaver, SAVE_DELAY_MS, type SaveFailure, type SaveStatus } from './autosave';

export type EventsStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Limite do título (DDL de `events`). */
export const EVENT_TITLE_MAX = 200;

interface EventState {
  readonly worldId: Uuid | null;
  readonly events: readonly WorldEvent[];
  readonly status: EventsStatus;
  /** Evento com a ficha aberta (`?sel=`). */
  readonly openId: Uuid | null;
  readonly saveStatus: Readonly<Record<Uuid, SaveStatus>>;
  /** Falha a avisar; `entityId` aqui é o id do evento. */
  readonly saveFailure: SaveFailure | null;
}

/**
 * Eventos da linha do tempo do mundo aberto (docs/06 §4). Edições otimistas, gravadas
 * depois de uma pausa (o mesmo `Autosaver` das entidades), com as menções do texto.
 */
export const EventStore = signalStore(
  withState<EventState>({
    worldId: null,
    events: [],
    status: 'idle',
    openId: null,
    saveStatus: {},
    saveFailure: null,
  }),
  withComputed(({ events, openId }) => ({
    /** Em ordem da linha do tempo. */
    sorted: computed(() => [...events()].sort(compareEvents)),
    byId: computed(() => new Map(events().map((event) => [event.id, event]))),
    openEvent: computed(() => events().find((event) => event.id === openId()) ?? null),
  })),
  withMethods((store, repo = inject(EventRepository), mentions = inject(MentionRepository)) => {
    const find = (id: Uuid) => store.byId().get(id);

    const replace = (event: WorldEvent) =>
      patchState(store, { events: store.events().map((e) => (e.id === event.id ? event : e)) });

    const setStatus = (id: Uuid, status: SaveStatus) =>
      patchState(store, { saveStatus: { ...store.saveStatus(), [id]: status } });

    const write = async (id: Uuid, patch: WorldEventPatch): Promise<void> => {
      const before = find(id);
      if (!before) return;
      setStatus(id, 'saving');
      try {
        const saved = await repo.update(id, patch, before.version);
        replace({ ...saved, ...autosave.pendingPatch(id) });
        if ('content' in patch) {
          await mentions.replace(
            { worldId: saved.worldId, kind: 'event', id },
            mentionedEntityIds(saved.content),
          );
        }
        setStatus(id, autosave.has(id) ? 'saving' : 'saved');
      } catch (error) {
        const conflict = isAppError(error, 'conflict') || isAppError(error, 'not_found');
        if (conflict) {
          autosave.discard(id);
          const fresh = await repo.get(id).catch(() => null);
          if (fresh) replace(fresh);
          else patchState(store, { events: store.events().filter((e) => e.id !== id) });
        } else {
          autosave.requeue(id, patch);
        }
        setStatus(id, 'failed');
        patchState(store, { saveFailure: { entityId: id, conflict, at: Date.now() } });
      }
    };

    const autosave = new Autosaver<WorldEventPatch>(SAVE_DELAY_MS, write);

    const edit = (id: Uuid, patch: WorldEventPatch): void => {
      const event = find(id);
      if (!event) return;
      replace({ ...event, ...patch });
      autosave.schedule(id, patch);
      setStatus(id, 'saving');
    };

    return {
      edit,

      async load(worldId: Uuid): Promise<void> {
        patchState(store, { worldId, status: 'loading' });
        try {
          patchState(store, { events: await repo.list(worldId), status: 'ready' });
        } catch (error) {
          patchState(store, { status: 'error' });
          throw error;
        }
      },

      async create(title: string, tickStart: Tick): Promise<WorldEvent> {
        const worldId = store.worldId();
        if (!worldId) throw new Error('mundo não carregado');
        const event = await repo.create({
          id: crypto.randomUUID(),
          worldId,
          title,
          tickStart,
          category: DEFAULT_EVENT_CATEGORY,
        });
        patchState(store, { events: [...store.events(), event] });
        return event;
      },

      /** Início e fim juntos (o fim nunca fica antes do início). */
      setDates(id: Uuid, tickStart: Tick, tickEnd: Tick | null): void {
        edit(id, { tickStart, tickEnd: tickEnd === null ? null : Math.max(tickEnd, tickStart) });
      },

      /** Texto do evento: JSON, texto puro e, ao gravar, as menções. */
      editContent(id: Uuid, doc: RichTextDoc | null): void {
        const content = isEmptyRichText(doc) ? null : doc;
        edit(id, { content, contentText: content ? richTextToPlain(content) : null });
      },

      flush(id?: Uuid): Promise<void> {
        return autosave.flush(id);
      },

      /** Move para a lixeira e devolve o evento, para o "Desfazer". */
      async trash(id: Uuid): Promise<WorldEvent> {
        await autosave.save(id);
        const event = find(id);
        if (!event) throw new Error(`evento ${id} não carregado`);
        await repo.moveToTrash(id, event.version);
        patchState(store, {
          events: store.events().filter((e) => e.id !== id),
          openId: store.openId() === id ? null : store.openId(),
        });
        return event;
      },

      async restore(id: Uuid): Promise<WorldEvent> {
        const event = await repo.restore(id);
        patchState(store, { events: [...store.events().filter((e) => e.id !== id), event] });
        return event;
      },

      open(id: Uuid | null): void {
        const previous = store.openId();
        if (previous && previous !== id) void autosave.save(previous);
        patchState(store, { openId: id && find(id) ? id : null });
      },
    };
  }),
  withHooks({
    onDestroy(store) {
      void store.flush();
    },
  }),
);
