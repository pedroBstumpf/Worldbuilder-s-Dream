import { CdkDrag, type CdkDragEnd, type CdkDragMove } from '@angular/cdk/drag-drop';
import {
  CdkFixedSizeVirtualScroll,
  CdkVirtualForOf,
  CdkVirtualScrollViewport,
} from '@angular/cdk/scrolling';
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { clampExplorerWidth, EXPLORER_WIDTH } from '@core/prefs/ui-prefs';
import { ENTITY_KIND_STRINGS, ENTITY_STRINGS } from '@core/strings/entity.strings';
import { MAP_STRINGS } from '@core/strings/map.strings';
import type { EntityKind, Uuid } from '@domain/models';
import type { SearchKind } from '@domain/search';
import { IconButtonComponent } from '@shared/ui/icon-button/icon-button.component';
import { IconComponent } from '@shared/ui/icon/icon.component';
import { TabsComponent, tabPanelId, tabId, type TabItem } from '@shared/ui/tabs/tabs.component';
import { TooltipDirective } from '@shared/ui/tooltip/tooltip.directive';
import { EntityAvatarComponent } from '../entities/entity-avatar.component';
import { EntityStore } from '../state/entity.store';

/** Passo do redimensionamento pelo teclado. */
const RESIZE_STEP = 16;
/** Altura de cada linha da lista virtual. */
const ROW_HEIGHT = 52;
/** Tipo de dado arrastado de uma linha (o mapa aceita no M4). */
export const ENTITY_DRAG_TYPE = 'application/x-wd-entity';

export type ExplorerTab = 'characters' | 'locations' | 'collection' | 'events' | 'history';
type CollectionFilter = 'all' | 'faction' | 'item' | 'note';

const TAB_KINDS: Record<'characters' | 'locations' | 'collection', readonly EntityKind[]> = {
  characters: ['character'],
  locations: ['location'],
  collection: ['faction', 'item', 'note'],
};

/** Linha da lista: entidade ou evento. */
interface Row {
  readonly id: Uuid;
  readonly kind: SearchKind;
  readonly title: string;
  readonly subtitle: string | null;
  readonly alias: string | null;
  readonly color: string | null;
  readonly portraitAssetId: Uuid | null;
}

/**
 * Barra direita "Explorar" (docs/05 › `wd-explorer`): abas Personagens, Locais, Acervo
 * (facções, itens e notas), Eventos e História; filtro com a busca do mundo; lista
 * virtual com retratos; linhas arrastáveis (o mapa aceita no M4). Largura ajustável
 * (CDK Drag no eixo X ou setas na alça), salva em `ui_prefs`. Recolher anima `transform`.
 */
@Component({
  selector: 'wd-explorer-panel',
  imports: [
    CdkDrag,
    CdkFixedSizeVirtualScroll,
    CdkVirtualForOf,
    CdkVirtualScrollViewport,
    EntityAvatarComponent,
    IconButtonComponent,
    IconComponent,
    TabsComponent,
    TooltipDirective,
  ],
  template: `
    <aside
      class="panel wd-panel"
      aria-labelledby="wd-explorer-title"
      [style.inline-size.px]="liveWidth() ?? width()"
      [attr.data-collapsed]="collapsed()"
      [inert]="collapsed()"
    >
      <div
        class="handle"
        role="separator"
        aria-orientation="vertical"
        tabindex="0"
        [attr.aria-label]="text.resize"
        [attr.aria-valuenow]="width()"
        [attr.aria-valuemin]="limits.min"
        [attr.aria-valuemax]="limits.max"
        cdkDrag
        cdkDragLockAxis="x"
        (cdkDragMoved)="onDrag($event)"
        (cdkDragEnded)="onDragEnd($event)"
        (keydown)="onKey($event)"
      ></div>
      <h2 id="wd-explorer-title" class="wd-inscription text-center text-base text-ouro-400">
        {{ text.title }}
      </h2>
      <wd-tabs
        idPrefix="wd-explorer"
        [label]="strings.tabsLabel"
        [tabs]="tabs"
        [selected]="tab()"
        (selectedChange)="selectTab($any($event))"
      />
      <div
        class="content"
        role="tabpanel"
        tabindex="-1"
        [id]="panelId()"
        [attr.aria-labelledby]="tabLabelId()"
      >
        @if (isEntityTab()) {
          <div class="tools">
            <label class="sr-only" for="wd-explorer-filter">{{ strings.filter }}</label>
            <span class="search">
              <wd-icon name="search" size="sm" />
              <input
                id="wd-explorer-filter"
                type="search"
                autocomplete="off"
                class="wd-focus"
                [placeholder]="strings.filterPlaceholder"
                [value]="query()"
                (input)="query.set($any($event.target).value)"
                (keydown.escape)="clearQuery($event)"
              />
            </span>
            <button
              wd-icon-button
              type="button"
              icon="add"
              variant="secondary"
              tooltipPosition="left"
              [label]="createLabel()"
              (click)="create.emit(createKind())"
            ></button>
          </div>
          @if (tab() === 'collection') {
            <div class="chips" role="radiogroup" [attr.aria-label]="strings.kindFilter">
              @for (chip of chips; track chip.id) {
                <button
                  type="button"
                  role="radio"
                  class="chip wd-focus"
                  [attr.aria-checked]="filter() === chip.id"
                  (click)="filter.set(chip.id)"
                >
                  {{ chip.label }}
                </button>
              }
            </div>
          }
        }

        @switch (state()) {
          @case ('loading') {
            <p class="message" role="status">{{ strings.loading }}</p>
          }
          @case ('error') {
            <div class="message">
              <p>{{ strings.loadFailed }}</p>
              <button type="button" class="link wd-focus" (click)="retry.emit()">
                {{ strings.retry }}
              </button>
            </div>
          }
          @case ('empty') {
            <div class="empty">
              <wd-icon [name]="emptyIcon()" size="lg" class="text-ouro-500" />
              <p class="font-book text-lg">{{ strings.empty[tab()] }}</p>
              <p class="font-sans text-sm text-pergaminho-400">{{ strings.emptyHint[tab()] }}</p>
            </div>
          }
          @case ('no-match') {
            <p class="message" role="status">{{ strings.noMatch }}</p>
          }
          @default {
            <cdk-virtual-scroll-viewport
              class="list"
              role="list"
              [itemSize]="rowHeight"
              [attr.aria-label]="listLabel()"
            >
              <div *cdkVirtualFor="let row of rows(); trackBy: trackRow" role="listitem">
                @if (row.kind === 'event') {
                  <div class="row" [title]="row.title">
                    <wd-entity-avatar kind="event" [color]="row.color" [size]="32" />
                    <span class="names">
                      <span class="name">{{ row.title }}</span>
                    </span>
                  </div>
                } @else {
                  <button
                    type="button"
                    class="row interactive wd-focus"
                    draggable="true"
                    [attr.data-id]="row.id"
                    [attr.aria-current]="row.id === store.openId() ? 'true' : null"
                    (click)="openEntity.emit(row.id)"
                    (dragstart)="onRowDrag($event, row)"
                  >
                    <wd-entity-avatar
                      [kind]="row.kind"
                      [name]="row.title"
                      [color]="row.color"
                      [portraitUrl]="portraitUrl(row)"
                      [size]="36"
                    />
                    <span class="names">
                      <span class="name">{{ row.title }}</span>
                      @if (row.alias; as alias) {
                        <span class="sub">{{ strings.alsoKnownAs(alias) }}</span>
                      } @else if (row.subtitle) {
                        <span class="sub">{{ row.subtitle }}</span>
                      } @else if (tab() === 'collection') {
                        <span class="sub">{{ kindNames[row.kind].one }}</span>
                      }
                    </span>
                  </button>
                }
              </div>
            </cdk-virtual-scroll-viewport>
          }
        }
      </div>
    </aside>
    <button
      type="button"
      class="toggle wd-panel wd-focus"
      [attr.aria-label]="collapsed() ? text.expand : text.collapse"
      [attr.aria-expanded]="!collapsed()"
      [wdTooltip]="collapsed() ? text.expand : text.collapse"
      wdTooltipPosition="left"
      (click)="collapsedChange.emit(!collapsed())"
    >
      <wd-icon [name]="collapsed() ? 'right_panel_open' : 'right_panel_close'" size="sm" />
    </button>
  `,
  styles: `
    :host {
      position: fixed;
      inset-block: 64px 12px;
      inset-inline-end: 12px;
      display: flex;
      flex-direction: row-reverse;
      gap: 8px;
      align-items: flex-start;
      pointer-events: none;
    }

    .panel,
    .toggle {
      pointer-events: auto;
    }

    .panel {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 8px;
      block-size: 100%;
      padding: 14px 12px 12px;
      transition:
        transform var(--wd-dur-base) var(--wd-ease-out),
        opacity var(--wd-dur-base) var(--wd-ease-out);
    }

    .panel[data-collapsed='true'] {
      opacity: 0;
      transform: translateX(calc(100% + 16px));
    }

    .handle {
      position: absolute;
      inset-block: 12px;
      inset-inline-start: -5px;
      z-index: 1;
      inline-size: 10px;
      cursor: ew-resize;
      border-radius: 999px;
    }

    .handle:hover,
    .handle:focus-visible {
      background: linear-gradient(var(--wd-rule-strong), var(--wd-rule-strong)) center / 2px 100%
        no-repeat;
    }

    .content {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 8px;
      min-block-size: 0;
      outline: none;
    }

    .tools {
      display: flex;
      gap: 6px;
      align-items: center;
    }

    .search {
      display: flex;
      flex: 1;
      gap: 6px;
      align-items: center;
      min-inline-size: 0;
      padding-inline: 8px;
      color: var(--wd-text-muted);
      background: var(--couro-700);
      border: 1px solid var(--wd-rule);
      border-radius: var(--wd-radius-control);
    }

    .search:focus-within {
      border-color: var(--wd-focus-ring);
    }

    .search input {
      flex: 1;
      min-inline-size: 0;
      padding-block: 7px;
      font-family: var(--font-sans);
      font-size: 0.875rem;
      color: var(--wd-text-on-surface);
      background: none;
      border: 0;
      outline: none;
    }

    .search input::placeholder {
      color: var(--wd-text-muted);
    }

    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }

    .chip {
      padding: 3px 10px;
      font-family: var(--font-sans);
      font-size: 0.75rem;
      color: var(--wd-text-muted);
      cursor: pointer;
      background: none;
      border: 1px solid var(--wd-divider);
      border-radius: 999px;
    }

    .chip[aria-checked='true'] {
      color: var(--wd-text-on-accent);
      background: var(--wd-accent);
      border-color: var(--wd-accent);
    }

    .list {
      flex: 1;
      min-block-size: 0;
      margin-inline: -4px;
    }

    .row {
      display: flex;
      gap: 10px;
      align-items: center;
      inline-size: 100%;
      block-size: 52px;
      padding: 4px 8px;
      text-align: start;
      color: var(--wd-text-on-surface);
      background: none;
      border: 0;
      border-radius: var(--wd-radius-control);
    }

    .row.interactive {
      cursor: pointer;
    }

    .row.interactive:hover {
      background: var(--wd-surface-raised);
    }

    .row[aria-current='true'] {
      background: var(--wd-surface-active);
      box-shadow: inset 2px 0 0 var(--wd-accent);
    }

    .names {
      display: flex;
      flex-direction: column;
      min-inline-size: 0;
    }

    .name,
    .sub {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .name {
      font-family: var(--font-book);
      font-size: 1.125rem;
      line-height: 1.2;
    }

    .sub {
      font-family: var(--font-sans);
      font-size: 0.75rem;
      color: var(--wd-text-muted);
    }

    .message {
      padding: 16px 4px;
      font-family: var(--font-sans);
      font-size: 0.875rem;
      color: var(--wd-text-muted);
      text-align: center;
    }

    .link {
      margin-block-start: 6px;
      color: var(--wd-accent);
      text-decoration: underline;
      cursor: pointer;
      background: none;
      border: 0;
    }

    .empty {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 6px;
      align-items: center;
      justify-content: center;
      padding-inline: 8px;
      text-align: center;
    }

    .toggle {
      display: grid;
      place-items: center;
      inline-size: 32px;
      block-size: 32px;
      cursor: pointer;
      color: var(--wd-text-muted);
    }

    .toggle:hover {
      color: var(--wd-accent);
    }

    @media (prefers-reduced-motion: reduce) {
      .panel {
        transition: none;
      }
    }
  `,
})
export class ExplorerPanelComponent {
  readonly width = input<number>(EXPLORER_WIDTH.default);
  readonly collapsed = input(false);

  readonly widthChange = output<number>();
  readonly collapsedChange = output<boolean>();
  /** Abrir a ficha. */
  readonly openEntity = output<Uuid>();
  /** Botão +: criar entidade do tipo sugerido pela aba. */
  readonly create = output<EntityKind>();
  readonly retry = output();

  protected readonly store = inject(EntityStore);
  protected readonly text = MAP_STRINGS.explorer;
  protected readonly strings = ENTITY_STRINGS.explorer;
  protected readonly kindNames = ENTITY_KIND_STRINGS;
  protected readonly limits = EXPLORER_WIDTH;
  protected readonly rowHeight = ROW_HEIGHT;

  protected readonly tabs: readonly TabItem[] = [
    { id: 'characters', label: this.strings.tabs.characters, icon: 'person' },
    { id: 'locations', label: this.strings.tabs.locations, icon: 'location_on' },
    { id: 'collection', label: this.strings.tabs.collection, icon: 'shield' },
    { id: 'events', label: this.strings.tabs.events, icon: 'diamond' },
    { id: 'history', label: this.strings.tabs.history, icon: 'auto_stories' },
  ];
  protected readonly chips: readonly { id: CollectionFilter; label: string }[] = [
    { id: 'all', label: this.strings.allKinds },
    { id: 'faction', label: ENTITY_KIND_STRINGS.faction.many },
    { id: 'item', label: ENTITY_KIND_STRINGS.item.many },
    { id: 'note', label: ENTITY_KIND_STRINGS.note.many },
  ];

  protected readonly tab = signal<ExplorerTab>('characters');
  protected readonly filter = signal<CollectionFilter>('all');
  protected readonly query = signal('');
  /** Largura durante o arraste (só grava ao soltar). */
  protected readonly liveWidth = signal<number | null>(null);
  private startWidth = 0;

  protected readonly panelId = computed(() => tabPanelId('wd-explorer', this.tab()));
  protected readonly tabLabelId = computed(() => tabId('wd-explorer', this.tab()));
  protected readonly isEntityTab = computed(() => this.kinds() !== null);

  /** Tipos listados na aba atual (null nas abas de eventos e história). */
  private readonly kinds = computed<readonly EntityKind[] | null>(() => {
    const tab = this.tab();
    if (tab === 'events' || tab === 'history') return null;
    const filter = this.filter();
    return tab === 'collection' && filter !== 'all' ? [filter] : TAB_KINDS[tab];
  });

  protected readonly createKind = computed<EntityKind>(() => this.kinds()?.[0] ?? 'character');
  protected readonly createLabel = computed(() =>
    this.tab() === 'collection' && this.filter() === 'all'
      ? this.strings.create
      : ENTITY_KIND_STRINGS[this.createKind()].create,
  );

  protected readonly rows = computed<readonly Row[]>(() => {
    if (this.tab() === 'history') return [];
    if (this.tab() === 'events') {
      return this.store.events().map((event) => ({
        id: event.id,
        kind: 'event' as const,
        title: event.title,
        subtitle: null,
        alias: null,
        color: event.color,
        portraitAssetId: null,
      }));
    }
    const kinds = this.kinds() ?? [];
    const query = this.query().trim();
    const byId = this.store.byId();
    const toRow = (id: Uuid, alias: string | null): Row | null => {
      const entity = byId.get(id);
      if (!entity) return null;
      return {
        id,
        kind: entity.kind,
        title: entity.name,
        subtitle: entity.subtitle,
        alias,
        color: entity.color,
        portraitAssetId: entity.portraitAssetId,
      };
    };
    if (query) {
      return this.store
        .search()
        .search(query, { kinds })
        .map((hit) => toRow(hit.id, hit.alias))
        .filter((row): row is Row => row !== null);
    }
    return this.store
      .sorted()
      .filter((entity) => kinds.includes(entity.kind))
      .map((entity) => toRow(entity.id, null) as Row);
  });

  protected readonly state = computed(() => {
    const status = this.store.status();
    if (this.tab() !== 'history' && (status === 'loading' || status === 'idle')) return 'loading';
    if (this.tab() !== 'history' && status === 'error') return 'error';
    if (this.rows().length > 0) return 'list';
    return this.query().trim() && this.isEntityTab() ? 'no-match' : 'empty';
  });

  protected readonly emptyIcon = computed(
    () => this.tabs.find((tab) => tab.id === this.tab())?.icon ?? 'travel_explore',
  );
  protected readonly listLabel = computed(() =>
    this.strings.listLabel(this.tabs.find((tab) => tab.id === this.tab())?.label ?? ''),
  );

  constructor() {
    // Retratos das linhas: a URL é resolvida uma vez e reaproveitada.
    effect(() => {
      for (const row of this.rows()) {
        if (row.portraitAssetId) void this.store.loadPortrait(row.portraitAssetId);
      }
    });
  }

  /** Mostra a aba do tipo (ao abrir uma ficha pela busca, por exemplo). */
  showKind(kind: EntityKind): void {
    const tab = (Object.keys(TAB_KINDS) as (keyof typeof TAB_KINDS)[]).find((key) =>
      TAB_KINDS[key].includes(kind),
    );
    if (tab && tab !== this.tab()) this.selectTab(tab);
  }

  protected selectTab(tab: ExplorerTab): void {
    this.tab.set(tab);
    this.query.set('');
  }

  protected portraitUrl(row: Row): string | null {
    return row.portraitAssetId ? (this.store.portraits()[row.portraitAssetId] ?? null) : null;
  }

  protected trackRow = (_: number, row: Row) => row.id;

  protected clearQuery(event: Event): void {
    if (!this.query()) return;
    event.stopPropagation();
    this.query.set('');
  }

  protected onRowDrag(event: DragEvent, row: Row): void {
    if (!event.dataTransfer) return;
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(ENTITY_DRAG_TYPE, row.id);
    event.dataTransfer.setData('text/plain', row.title);
  }

  protected onDrag(event: CdkDragMove): void {
    if (this.liveWidth() === null) this.startWidth = this.width();
    // A alça fica na borda esquerda: arrastar para a esquerda alarga.
    this.liveWidth.set(clampExplorerWidth(this.startWidth - event.distance.x));
  }

  protected onDragEnd(event: CdkDragEnd): void {
    // A alça volta ao lugar: quem se move é a borda do painel.
    event.source.reset();
    const width = this.liveWidth();
    this.liveWidth.set(null);
    if (width !== null) this.widthChange.emit(width);
  }

  protected onKey(event: KeyboardEvent): void {
    const delta = { ArrowLeft: RESIZE_STEP, ArrowRight: -RESIZE_STEP }[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    this.widthChange.emit(clampExplorerWidth(this.width() + delta));
  }
}
