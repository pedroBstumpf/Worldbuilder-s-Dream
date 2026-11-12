import { computed, inject } from '@angular/core';
import { isEmptyRichText, mentionedEntityIds, richTextToPlain } from '@domain/entities';
import type { Entity, EntityKind, RichTextDoc, Uuid, WorldEvent } from '@domain/models';
import {
  AssetRepository,
  EntityRepository,
  EventRepository,
  isAppError,
  MentionRepository,
  type EntityPatch,
} from '@domain/ports';
import { WorldSearch } from '@domain/search';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import { Autosaver } from './autosave';

/** Espera depois da última edição antes de gravar (docs/04 › Autosave, 400–800 ms). */
export const ENTITY_SAVE_DELAY_MS = 600;

export type EntitiesStatus = 'idle' | 'loading' | 'ready' | 'error';
export type SaveStatus = 'saving' | 'saved' | 'failed';

/** Falha de gravação a avisar: `conflict` recarregou o item; as outras guardam a edição. */
export interface SaveFailure {
  readonly entityId: Uuid;
  readonly conflict: boolean;
  readonly at: number;
}

/** Texto que cita uma entidade ("Citada em"). */
export interface Citation {
  readonly kind: 'entity' | 'event';
  readonly id: Uuid;
  readonly title: string;
  readonly entityKind: EntityKind | null;
}

interface EntityState {
  readonly worldId: Uuid | null;
  readonly entities: readonly Entity[];
  readonly events: readonly WorldEvent[];
  readonly status: EntitiesStatus;
  /** Entidade com a ficha aberta (`?sel=`). */
  readonly openId: Uuid | null;
  /** URL de exibição por id de asset de retrato. */
  readonly portraits: Readonly<Record<Uuid, string>>;
  readonly saveStatus: Readonly<Record<Uuid, SaveStatus>>;
  readonly saveFailure: SaveFailure | null;
}

const byName = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

/**
 * Entidades e eventos do mundo aberto (docs/04 › Estado), com a ficha aberta, os
 * retratos e o índice de busca. Edições são otimistas: o estado muda na hora e a
 * gravação sai depois de `ENTITY_SAVE_DELAY_MS`, uma por vez por entidade.
 */
export const EntityStore = signalStore(
  withState<EntityState>({
    worldId: null,
    entities: [],
    events: [],
    status: 'idle',
    openId: null,
    portraits: {},
    saveStatus: {},
    saveFailure: null,
  }),
  withComputed(({ entities, events, openId }) => ({
    /** Entidades em ordem alfabética. */
    sorted: computed(() => [...entities()].sort((a, b) => byName.compare(a.name, b.name))),
    byId: computed(() => new Map(entities().map((entity) => [entity.id, entity]))),
    openEntity: computed(() => entities().find((entity) => entity.id === openId()) ?? null),
    search: computed(() => new WorldSearch(entities(), events())),
  })),
  withMethods(
    (
      store,
      repo = inject(EntityRepository),
      eventsRepo = inject(EventRepository),
      mentions = inject(MentionRepository),
      assets = inject(AssetRepository),
    ) => {
      const portraitRequests = new Set<Uuid>();

      const find = (id: Uuid): Entity | undefined => store.byId().get(id);

      const replace = (entity: Entity) =>
        patchState(store, {
          entities: store.entities().map((e) => (e.id === entity.id ? entity : e)),
        });

      const setStatus = (id: Uuid, status: SaveStatus) =>
        patchState(store, { saveStatus: { ...store.saveStatus(), [id]: status } });

      const write = async (id: Uuid, patch: EntityPatch): Promise<void> => {
        const before = find(id);
        if (!before) return;
        setStatus(id, 'saving');
        try {
          const saved = await repo.update(id, patch, before.version);
          // Edições feitas durante a gravação continuam valendo na tela.
          replace({ ...saved, ...autosave.pendingPatch(id) });
          if ('content' in patch) {
            await mentions.replace(
              { worldId: saved.worldId, kind: 'entity', id },
              mentionedEntityIds(saved.content),
            );
          }
          setStatus(id, autosave.has(id) ? 'saving' : 'saved');
        } catch (error) {
          const conflict = isAppError(error, 'conflict') || isAppError(error, 'not_found');
          if (conflict) {
            // Outra pessoa mudou o item: recarrega e descarta a edição local.
            autosave.discard(id);
            const fresh = await repo.get(id).catch(() => null);
            if (fresh) replace(fresh);
            else patchState(store, { entities: store.entities().filter((e) => e.id !== id) });
          } else {
            // Guarda a edição para tentar de novo, sob as que chegaram depois.
            autosave.requeue(id, patch);
          }
          setStatus(id, 'failed');
          patchState(store, { saveFailure: { entityId: id, conflict, at: Date.now() } });
        }
      };

      const autosave = new Autosaver<EntityPatch>(ENTITY_SAVE_DELAY_MS, write);
      const save = (id: Uuid) => autosave.save(id);

      /** Edição otimista; grava depois de uma pausa. */
      const edit = (id: Uuid, patch: EntityPatch): void => {
        const entity = find(id);
        if (!entity) return;
        replace({ ...entity, ...patch });
        autosave.schedule(id, patch);
        setStatus(id, 'saving');
      };

      return {
        edit,

        async load(worldId: Uuid): Promise<void> {
          patchState(store, { worldId, status: 'loading' });
          try {
            const [entities, events] = await Promise.all([
              repo.list(worldId),
              eventsRepo.list(worldId),
            ]);
            patchState(store, { entities, events, status: 'ready' });
          } catch {
            patchState(store, { status: 'error' });
          }
        },

        async create(kind: EntityKind, name: string): Promise<Entity> {
          const worldId = store.worldId();
          if (!worldId) throw new Error('mundo não carregado');
          const entity = await repo.create({ id: crypto.randomUUID(), worldId, kind, name });
          patchState(store, { entities: [...store.entities(), entity] });
          return entity;
        },

        /** Texto da ficha: guarda o JSON, o texto puro e, ao gravar, as menções. */
        editContent(id: Uuid, doc: RichTextDoc | null): void {
          const content = isEmptyRichText(doc) ? null : doc;
          edit(id, { content, contentText: content ? richTextToPlain(content) : null });
        },

        /** Grava agora o que estiver pendente (ao fechar a ficha, sair ou tentar de novo). */
        flush(id?: Uuid): Promise<void> {
          return autosave.flush(id);
        },

        /** Move para a lixeira e devolve a entidade, para o "Desfazer". */
        async trash(id: Uuid): Promise<Entity> {
          await save(id);
          const entity = find(id);
          if (!entity) throw new Error(`entidade ${id} não carregada`);
          await repo.moveToTrash(id, entity.version);
          patchState(store, {
            entities: store.entities().filter((e) => e.id !== id),
            openId: store.openId() === id ? null : store.openId(),
          });
          return entity;
        },

        async restore(id: Uuid): Promise<Entity> {
          const entity = await repo.restore(id);
          patchState(store, {
            entities: [...store.entities().filter((e) => e.id !== id), entity],
          });
          return entity;
        },

        /** Troca o retrato (imagem já processada) e apaga o anterior. */
        async setPortrait(id: Uuid, image: Blob, size: number | null): Promise<void> {
          const entity = find(id);
          if (!entity) return;
          const asset = await assets.upload(
            {
              id: crypto.randomUUID(),
              worldId: entity.worldId,
              mimeType: image.type,
              width: size,
              height: size,
            },
            image,
          );
          const previous = entity.portraitAssetId;
          edit(id, { portraitAssetId: asset.id });
          await save(id);
          if (find(id)?.portraitAssetId !== asset.id) {
            await assets.delete(asset.id).catch(() => undefined);
            throw new Error('não foi possível salvar o retrato');
          }
          if (previous) await assets.delete(previous).catch(() => undefined);
        },

        async removePortrait(id: Uuid): Promise<void> {
          const previous = find(id)?.portraitAssetId;
          if (!previous) return;
          edit(id, { portraitAssetId: null });
          await save(id);
          if (find(id)?.portraitAssetId === null) {
            await assets.delete(previous).catch(() => undefined);
          }
        },

        /** Resolve a URL do retrato uma vez; a lista lê `portraits()[assetId]`. */
        async loadPortrait(assetId: Uuid): Promise<void> {
          if (store.portraits()[assetId] || portraitRequests.has(assetId)) return;
          portraitRequests.add(assetId);
          try {
            const asset = await assets.get(assetId);
            if (!asset) return;
            const url = await assets.resolveUrl(asset);
            patchState(store, { portraits: { ...store.portraits(), [assetId]: url } });
          } catch {
            portraitRequests.delete(assetId);
          }
        },

        /** Textos que citam a entidade, por título. */
        async citations(id: Uuid): Promise<Citation[]> {
          const found = await mentions.listCiting(id);
          const events = new Map(store.events().map((event) => [event.id, event]));
          const result: Citation[] = [];
          for (const mention of found) {
            if (mention.sourceKind === 'entity') {
              const source = find(mention.sourceId);
              if (source && source.id !== id) {
                result.push({
                  kind: 'entity',
                  id: source.id,
                  title: source.name,
                  entityKind: source.kind,
                });
              }
            } else {
              const event = events.get(mention.sourceId);
              if (event) {
                result.push({ kind: 'event', id: event.id, title: event.title, entityKind: null });
              }
            }
          }
          return result.sort((a, b) => byName.compare(a.title, b.title));
        },

        open(id: Uuid | null): void {
          const previous = store.openId();
          if (previous && previous !== id) void save(previous);
          patchState(store, { openId: id && find(id) ? id : null });
        },
      };
    },
  ),
  withHooks({
    onDestroy(store) {
      void store.flush();
    },
  }),
);
