import { LiveAnnouncer } from '@angular/cdk/a11y';
import { Location } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  DOCUMENT,
  effect,
  type ElementRef,
  inject,
  Injector,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { DEMO_MODE } from '@core/data-source/demo-mode';
import { BookMotionService } from '@core/motion/book-motion.service';
import { BookTransitions } from '@core/motion/book-transitions.service';
import {
  readCamera,
  readSpeed,
  writeBarPrefs,
  writeCamera,
  writeSpeed,
  type BarPrefs,
} from '@core/prefs/ui-prefs';
import { UiPrefsStore } from '@core/prefs/ui-prefs.store';
import { ShortcutService } from '@core/shortcuts/shortcut.service';
import { DEMO_STRINGS } from '@core/strings/demo.strings';
import { ENTITY_KIND_STRINGS, ENTITY_STRINGS } from '@core/strings/entity.strings';
import { MAP_STRINGS } from '@core/strings/map.strings';
import { TIME_STRINGS } from '@core/strings/time.strings';
import { WORLD_STRINGS } from '@core/strings/world.strings';
import type { Point } from '@domain/geometry';
import {
  DEFAULT_BRUSH,
  mapNameFromFile,
  toMapUnits,
  type AnnotationShape,
  type BrushStyle,
} from '@domain/maps';
import { eventColor } from '@domain/events';
import { isTick, type EntityKind, type PolygonVertex, type Uuid } from '@domain/models';
import { MapImageError, readMapImage, type ProcessedMapImage } from '@engine/import/read-map-image';
import { isEventActive, keyframeInEffect, suggestSpeed, type PlaySpeed } from '@domain/timeline';
import {
  DRAWING_TOOLS,
  type EventMarkerInput,
  type LayerId,
  type TokenLook,
  type ToolId,
  type ViewportInsets,
} from '@engine/map-engine';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DemoBadgeComponent } from '@shared/ui/demo-badge/demo-badge.component';
import { DialogService } from '@shared/ui/dialog/dialog.service';
import { IconButtonComponent } from '@shared/ui/icon-button/icon-button.component';
import { ToastService } from '@shared/ui/toast/toast.service';
import { firstValueFrom } from 'rxjs';
import {
  ImportChoiceDialogComponent,
  type ImportChoice,
} from '../import/import-choice-dialog.component';
import {
  CreateEntityDialogComponent,
  type CreateEntityResult,
} from '../entities/create-entity-dialog.component';
import { EntitySheetComponent } from '../entities/entity-sheet.component';
import { CreateEventDialogComponent, ExtendRangeDialogComponent } from '../events/event-dialogs';
import { EventPopoverComponent } from '../events/event-popover.component';
import {
  EventSheetComponent,
  type EventPlacement,
  type EventRange,
} from '../events/event-sheet.component';
import { MapImportAreaComponent } from '../import/map-import-area.component';
import { MapImportDirective } from '../import/map-import.directive';
import { pickImageFile } from '../import/pick-image-file';
import { AnnotationEditorComponent, type AnnotationLink } from '../map/annotation-editor.component';
import { MapCanvasComponent, type CameraChange } from '../map/map-canvas.component';
import { TokenActions } from '../map/token-actions';
import { TokenMenuComponent } from '../map/token-menu.component';
import {
  LinkTargetDialogComponent,
  RemoveTokenDialogComponent,
  RenameMapDialogComponent,
  type RemoveTokenChoice,
  type RemoveTokenData,
  ScaleDialogComponent,
  type LinkTargetData,
  type ScaleDialogData,
  type ScaleDialogResult,
} from '../map/map-dialogs';
import { MapTitleComponent, type MapTitleAction } from '../map/map-title.component';
import {
  CommandPaletteComponent,
  type PaletteCommand,
  type PaletteData,
  type PaletteResult,
} from '../search/command-palette.component';
import { EntityStore } from '../state/entity.store';
import { EventStore } from '../state/event.store';
import { HistoryStore } from '../state/history.store';
import { MapStore, type AnnotationEdit } from '../state/map.store';
import { TimelineStore } from '../state/timeline.store';
import { WorldStore } from '../state/world.store';
import type {
  CalendarDialogComponent,
  CalendarDialogData,
  CalendarDialogResult,
} from '../timeline/calendar-dialog.component';
import { SpeedDialogComponent, type SpeedDialogData } from '../timeline/speed-dialog.component';
import { TimelineBarComponent, type TimelineEventMark } from '../timeline/timeline-bar.component';
import { ExplorerPanelComponent } from './explorer-panel.component';
import { LeftToolbarComponent, type ToggleableLayer } from './left-toolbar.component';
import { ToolOptionsComponent } from './tool-options.component';

/** Como a tela chegou: zoom vindo do livro, fade (movimento reduzido) ou direto. */
type Entrance = 'zoom' | 'fade' | 'none';

/** Alturas e larguras das barras, para o motor enquadrar o mapa na área livre. */
const TOP_BAR = 48;
const LEFT_BAR = 12 + 58 + 8;
const GAP = 8;
/** Altura da linha do tempo (docs/05 › wd-timeline-bar; repetida no CSS de :host). */
const TIMELINE_BAR = 88;
/** Espera antes de refletir o instante na URL (docs/06 §7). */
const URL_TICK_DELAY_MS = 300;
/** Espera antes de fechar o popover de evento quando o ponteiro sai do marcador. */
const POPOVER_CLOSE_DELAY_MS = 250;

/** Elementos onde Espaço e Enter já têm função própria. */
const INTERACTIVE =
  'button, a, input, select, textarea, [role="menuitem"], [role="separator"], [role="slider"]';
/** Elementos que usam as setas (listas, abas, campos, o próprio mapa). */
const ARROW_KEYS_OWNERS =
  'input, select, textarea, [contenteditable], [role="tab"], [role="slider"], [role="listbox"], ' +
  '[role="option"], [role="menu"], [role="menuitem"], [role="application"], [role="separator"], ' +
  '[role="combobox"], [role="dialog"]';

/**
 * Tela do mundo (docs/04 › Layout VTT): canvas em tela cheia (ou a área de importação,
 * se o mundo não tem mapa), barra superior com o seletor de mapas, ferramentas à esquerda
 * e Explorar à direita. O host do mapa compartilha `view-transition-name: wd-world-map`
 * com a página do livro, o que cria o zoom contínuo (ADR-0011).
 */
@Component({
  selector: 'wd-world-shell-page',
  imports: [
    AnnotationEditorComponent,
    ButtonComponent,
    DemoBadgeComponent,
    EntitySheetComponent,
    EventPopoverComponent,
    EventSheetComponent,
    ExplorerPanelComponent,
    TokenMenuComponent,
    IconButtonComponent,
    LeftToolbarComponent,
    MapCanvasComponent,
    MapImportAreaComponent,
    MapImportDirective,
    MapTitleComponent,
    TimelineBarComponent,
    ToolOptionsComponent,
  ],
  providers: [
    WorldStore,
    HistoryStore,
    MapStore,
    EntityStore,
    EventStore,
    TimelineStore,
    TokenActions,
  ],
  host: { '[class.has-timeline]': 'store.activeMap() !== null' },
  template: `
    <main
      class="map-host"
      aria-labelledby="wd-world-title"
      [attr.aria-busy]="store.status() === 'loading'"
      [attr.data-entrance]="entrance"
      #importer="wdMapImport"
      (wdMapImport)="importFile($event)"
      [wdMapImportDisabled]="busy() || store.status() !== 'ready'"
    >
      @if (store.activeMap()) {
        <wd-map-canvas
          #canvas
          [scene]="mapStore.scene()"
          [image]="mapStore.image()"
          [tool]="effectiveTool()"
          [hiddenLayers]="hiddenLayers()"
          [insets]="insets()"
          [savedCamera]="cameraFor"
          [mapNames]="mapNames()"
          [time]="timeline.currentTick()"
          [events]="eventMarks()"
          [eventWindow]="timeline.eventWindow()"
          [looks]="tokenLooks()"
          [selection]="mapStore.selection()"
          [trails]="trailTokens()"
          [drawStyle]="drawStyle()"
          [activeAnnotation]="editing()?.id ?? null"
          [distanceFormat]="distanceFormat()"
          (annotationCreated)="onAnnotationCreated($event)"
          (annotationChanged)="editAnnotation($event.id, { shape: $event.shape }, 'moveAnnotation')"
          (annotationErased)="eraseAnnotations($event)"
          (annotationPicked)="openAnnotation($event.id, $event.anchor, !$event.fromList)"
          (keyframeMoved)="tokens.moveKeyframe($event.keyframeId, $event.to)"
          (keyframePicked)="timeline.seek($event)"
          (tokenMoved)="tokens.move($event.tokenId, $event.to, $event.correctPrevious)"
          (tokenSelected)="mapStore.select($event)"
          (tokenOpen)="openToken($event)"
          (tokenMenu)="tokenMenu.open($event.tokenId, $event.anchor)"
          (entityDropped)="dropEntity($event.entityId, $event.point)"
          (cameraChange)="saveCamera($event)"
          (pointPicked)="onPointPicked($event)"
          (openEvent)="openEvent($event)"
          (eventHover)="onEventHover($event)"
          (measure)="onMeasure($event)"
          (regionDrawn)="onRegionDrawn($event)"
          (openMap)="openMap($event)"
          (toolProgress)="toolPoints.set($event)"
          (loadFailed)="toasts.show({ message: mapText.canvas.loadFailed, kind: 'error' })"
        />
        @if (importer.dragState() !== 'idle' || busy()) {
          <div class="drop-veil" [attr.data-drag]="importer.dragState()" aria-hidden="true">
            <p class="font-book text-2xl">
              {{
                busy()
                  ? mapText.import.preparing
                  : importer.dragState() === 'invalid'
                    ? mapText.import.notAnImage
                    : mapText.import.dropToCreate
              }}
            </p>
          </div>
        }
      } @else if (store.status() === 'ready') {
        <wd-map-import-area
          class="import"
          [dragState]="importer.dragState()"
          [busy]="busy()"
          (fileChosen)="importFile($event)"
        />
      }
    </main>

    @if (store.activeMap()) {
      <wd-left-toolbar
        [attr.data-entrance]="entrance"
        [tool]="tool()"
        [hiddenLayers]="hiddenLayers()"
        [collapsed]="bars().leftCollapsed"
        (toolChange)="setTool($event)"
        (fit)="fitMap()"
        (toggleLayer)="toggleLayer($event)"
        (collapsedChange)="setBars({ leftCollapsed: $event })"
      />
      @if (!bars().leftCollapsed) {
        <wd-tool-options
          [tool]="tool()"
          [style]="drawStyle()"
          (styleChange)="drawStyle.set($event)"
        />
      }
      <wd-explorer-panel
        #explorer
        [attr.data-entrance]="entrance"
        [width]="bars().rightWidth"
        [collapsed]="bars().rightCollapsed"
        (widthChange)="setBars({ rightWidth: $event })"
        (collapsedChange)="setBars({ rightCollapsed: $event })"
        (openEntity)="openEntity($event)"
        (create)="createEntity($event)"
        (openEvent)="openEvent($event)"
        (createEvent)="createEvent()"
        (retry)="entities.load(worldId())"
      />
      @if (hint(); as text) {
        <div class="hint wd-panel">
          <p aria-live="polite">{{ text }}</p>
          @if (tool() === 'measure' && ruler(); as r) {
            <p class="ruler">
              <span aria-live="polite">{{
                mapText.hints.measureTotal(formatDistance(r.distance))
              }}</span>
              <button wd-button type="button" size="sm" (click)="fixMeasure()">
                {{ mapText.hints.fixMeasure }}
              </button>
            </p>
          }
        </div>
      }
      <wd-timeline-bar
        #timelineBar
        [attr.data-entrance]="entrance"
        [events]="eventMarks()"
        [nowTick]="store.world()?.nowTick ?? null"
        [keyframeTicks]="keyframeTicks()"
        (eventClick)="goToEvent($event)"
        (hover)="onEventHover($event ? { eventId: $event.id, anchor: $event } : null)"
        (createEvent)="createEvent()"
        (openCalendar)="openCalendar()"
        (openSpeed)="openSpeed()"
      />
    }

    @if (entities.openId(); as openId) {
      <wd-entity-sheet
        #sheet
        [entityId]="openId"
        [style.--sheet-width.px]="sheetWidth()"
        (closed)="closeSheet()"
        (trash)="trashEntity($event)"
        (openEntity)="openEntity($event)"
        (placeOnMap)="startPlacingEntity($event)"
        (showOnMap)="showToken($event)"
      />
    }

    @if (events.openId(); as openId) {
      <wd-event-sheet
        #eventSheet
        [eventId]="openId"
        [placement]="placement()"
        [style.--sheet-width.px]="sheetWidth()"
        (closed)="closeEventSheet()"
        (trash)="trashEvent($event)"
        (openEntity)="openEntity($event)"
        (goTo)="timeline.seek($event)"
        (outOfRange)="extendRange($event)"
        (place)="startPlacing($event)"
        (unplace)="unplaceEvent($event)"
        (showOnMap)="showEventOnMap($event)"
      />
    }

    @if (editingAnnotation(); as e) {
      <wd-annotation-editor
        [annotation]="e.annotation"
        [anchor]="e.anchor"
        [autofocus]="e.autofocus"
        (edit)="editAnnotation(e.annotation.id, $event)"
        (remove)="removeAnnotation(e.annotation.id)"
        (closed)="closeAnnotation()"
        (openLink)="openAnnotationLink($event)"
      />
    }

    <wd-token-menu
      #tokenMenu
      [pathTokens]="pathTokens()"
      (openSheet)="openEntity($event)"
      (togglePath)="togglePath($event)"
      (closed)="onTokenMenuClosed()"
    />

    @if (hoveredEvent(); as hovered) {
      <wd-event-popover
        [event]="hovered.event"
        [anchor]="hovered.anchor"
        (enter)="keepPopover()"
        (leave)="onEventHover(null)"
        (open)="openFromPopover(hovered.event.id)"
        (goTo)="goToEvent(hovered.event.id)"
      />
    }

    <header class="top-bar" [attr.data-entrance]="entrance">
      <button
        wd-icon-button
        type="button"
        icon="menu_book"
        tooltipPosition="below"
        [label]="text.backToLibrary"
        (click)="backToLibrary()"
      ></button>
      <h1
        #title
        id="wd-world-title"
        class="flex max-w-full min-w-0 justify-center justify-self-center"
        tabindex="-1"
      >
        @if (store.activeMap(); as map) {
          <wd-map-title
            [title]="map.name"
            [tree]="store.tree()"
            [activeId]="map.id"
            [ancestors]="ancestors()"
            [canMoveToRoot]="map.parentMapId !== null"
            [links]="linkItems()"
            (selectMap)="openMap($event)"
            (action)="onTitleAction($event)"
            (removeLink)="removeLink($event)"
          />
        } @else {
          <span class="wd-inscription truncate text-center text-lg text-ouro-400">
            {{ store.world()?.name ?? text.loading }}
          </span>
        }
      </h1>
      <div class="flex items-center justify-end gap-2">
        @switch (store.upload()?.state) {
          @case ('saving') {
            <span class="upload" role="status">
              <svg class="ring" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                <circle cx="10" cy="10" r="8" />
              </svg>
              <span class="sr-only">{{ mapText.upload.saving }}</span>
            </span>
          }
          @case ('failed') {
            <button
              wd-icon-button
              type="button"
              icon="cloud_off"
              class="text-lacre-claro"
              tooltipPosition="below"
              [label]="mapText.upload.failed + ' ' + mapText.upload.retry"
              (click)="retryUpload()"
            ></button>
          }
        }
        <button
          wd-icon-button
          type="button"
          icon="search"
          tooltipPosition="below"
          [label]="entityText.palette.open"
          (click)="openPalette()"
        ></button>
        @if (demoMode) {
          <wd-demo-badge inline [label]="demoStrings.badge" [detail]="demoStrings.badgeDetail" />
        }
      </div>
    </header>
  `,
  styles: `
    :host {
      display: block;
    }

    /* Barras laterais e fichas terminam acima da linha do tempo (TIMELINE_BAR). */
    :host(.has-timeline) {
      --wd-bottom-bar: 88px;
    }

    .map-host {
      position: fixed;
      inset: 0;
      background-color: var(--wd-bg-backdrop);
      view-transition-name: wd-world-map;
    }

    .import {
      position: absolute;
      inset: 48px 0 0;
    }

    .drop-veil {
      position: absolute;
      inset: 60px 12px 12px;
      display: grid;
      place-items: center;
      color: var(--wd-text-on-surface);
      pointer-events: none;
      background: color-mix(in oklab, var(--couro-950) 55%, transparent);
      border: 2px solid var(--ouro-300);
      border-radius: var(--wd-radius-panel);
      box-shadow: inset 0 0 0 4px var(--wd-accent-glow);
    }

    .drop-veil[data-drag='invalid'] {
      border-color: var(--lacre-claro);
      box-shadow: none;
    }

    .hint {
      position: fixed;
      inset-block-start: 60px;
      inset-inline-start: 50%;
      max-inline-size: min(560px, calc(100vw - 32px));
      padding: 8px 16px;
      font-family: var(--font-sans);
      font-size: 0.875rem;
      text-align: center;
      transform: translateX(-50%);
    }

    .ruler {
      display: flex;
      gap: 12px;
      align-items: center;
      justify-content: center;
      padding-block-start: 6px;
      margin-block-start: 6px;
      font-family: var(--font-mono);
      color: var(--wd-accent);
      border-block-start: 1px solid var(--wd-divider);
    }

    /* Barra superior: 48 px, couro 95%, filete dourado inferior (docs/05). */
    .top-bar {
      position: fixed;
      inset: 0 0 auto;
      display: grid;
      grid-template-columns: 1fr minmax(0, 2fr) 1fr;
      gap: 12px;
      align-items: center;
      block-size: 48px;
      padding-inline: 4px 12px;
      color: var(--wd-text-on-surface);
      background-color: color-mix(in oklab, var(--wd-surface) 95%, transparent);
      background-image: var(--wd-texture-leather);
      border-block-end: 1px solid var(--wd-rule-strong);
      box-shadow: var(--wd-shadow-panel);
    }

    .top-bar > :first-child {
      justify-self: start;
      inline-size: 44px;
      block-size: 44px;
    }

    .upload {
      display: grid;
      place-items: center;
      inline-size: 32px;
      block-size: 32px;
    }

    .ring {
      inline-size: 20px;
      fill: none;
      stroke: var(--ouro-400);
      stroke-width: 2;
      stroke-dasharray: 30 50;
      stroke-linecap: round;
      animation: spin 1s linear infinite;
    }

    /* Depois do zoom, as barras entram deslizando: topo → esquerda → direita (docs/05). */
    .top-bar[data-entrance='zoom'] {
      animation: from-top var(--wd-dur-base) var(--wd-ease-out) var(--wd-dur-zoom) backwards;
    }

    wd-left-toolbar[data-entrance='zoom'] {
      animation: from-left var(--wd-dur-base) var(--wd-ease-out) calc(var(--wd-dur-zoom) + 60ms)
        backwards;
    }

    wd-explorer-panel[data-entrance='zoom'] {
      animation: from-right var(--wd-dur-base) var(--wd-ease-out) calc(var(--wd-dur-zoom) + 120ms)
        backwards;
    }

    /* Por último a linha do tempo (docs/05 › 3, passo 5). */
    wd-timeline-bar[data-entrance='zoom'] {
      animation: from-bottom var(--wd-dur-base) var(--wd-ease-out) calc(var(--wd-dur-zoom) + 180ms)
        backwards;
    }

    :host-context([data-book-zoom='short']) [data-entrance='zoom'] {
      animation-delay: var(--wd-dur-zoom-short);
    }

    /* Movimento reduzido: fade cruzado curto no lugar do zoom. */
    [data-entrance='fade'] {
      animation: fade-in var(--wd-dur-fade) linear;
    }

    @keyframes from-top {
      from {
        transform: translateY(-100%);
      }
    }

    @keyframes from-left {
      from {
        transform: translateX(-120%);
      }
    }

    @keyframes from-right {
      from {
        transform: translateX(120%);
      }
    }

    @keyframes from-bottom {
      from {
        transform: translateY(100%);
      }
    }

    @keyframes fade-in {
      from {
        opacity: 0;
      }
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .ring {
        animation: none;
      }
    }
  `,
})
export default class WorldShellPage {
  /** `:worldId` da rota (withComponentInputBinding). */
  readonly worldId = input.required<string>();
  /** `?map=` da URL: mapa a abrir (docs/04 › Rotas). */
  readonly map = input<string>();
  /** `?sel=` da URL: entidade com a ficha aberta. */
  readonly sel = input<string>();
  /** `?t=` da URL: instante da linha do tempo. */
  readonly t = input<string>();

  protected readonly store = inject(WorldStore);
  protected readonly mapStore = inject(MapStore);
  private readonly history = inject(HistoryStore);
  protected readonly tokens = inject(TokenActions);
  protected readonly entities = inject(EntityStore);
  protected readonly timeline = inject(TimelineStore);
  protected readonly events = inject(EventStore);
  protected readonly entityText = ENTITY_STRINGS;
  protected readonly toasts = inject(ToastService);
  protected readonly text = WORLD_STRINGS;
  protected readonly mapText = MAP_STRINGS;
  protected readonly demoMode = inject(DEMO_MODE);
  protected readonly demoStrings = DEMO_STRINGS;
  protected readonly entrance: Entrance;

  protected readonly tool = signal<ToolId>('pan');
  /** Espaço segurado: mover mapa temporariamente. */
  private readonly spaceHeld = signal(false);
  protected readonly effectiveTool = computed(() => (this.spaceHeld() ? 'pan' : this.tool()));
  protected readonly hiddenLayers = signal<readonly LayerId[]>([]);
  protected readonly toolPoints = signal(0);
  /** Cor, espessura, opacidade e linha das próximas anotações (faixa de opções). */
  protected readonly drawStyle = signal<BrushStyle>(DEFAULT_BRUSH);
  /** Anotação aberta no editor e onde ele abre. */
  protected readonly editing = signal<{ id: Uuid; anchor: Point; autofocus: boolean } | null>(null);
  protected readonly editingAnnotation = computed(() => {
    const editing = this.editing();
    const annotation = this.mapStore.scene()?.annotations.find((a) => a.id === editing?.id);
    return editing && annotation ? { ...editing, annotation } : null;
  });
  /** Régua em curso: pontos e total em px do mapa. */
  protected readonly ruler = signal<{ points: Point[]; distance: number } | null>(null);
  /** Distâncias na unidade da escala do mapa (ou em px, sem escala). */
  protected readonly distanceFormat = computed(() => {
    const map = this.store.activeMap();
    const units = this.mapText.scale.units;
    return (pixels: number) => {
      const value = map ? toMapUnits(pixels, map) : null;
      if (value === null || !map?.scaleUnit)
        return `${Math.round(pixels).toLocaleString('pt-BR')} px`;
      const number = value.toLocaleString('pt-BR', { maximumFractionDigits: value < 10 ? 2 : 1 });
      return `${number} ${units[map.scaleUnit]}`;
    };
  });
  protected readonly busy = signal(false);

  private readonly prefs = inject(UiPrefsStore);
  protected readonly bars = this.prefs.bars;
  protected readonly insets = computed<ViewportInsets>(() => {
    const bars = this.bars();
    return {
      top: TOP_BAR + GAP,
      left: bars.leftCollapsed ? 0 : LEFT_BAR,
      right: bars.rightCollapsed ? 0 : bars.rightWidth + 12 + GAP,
      bottom: TIMELINE_BAR + GAP,
    };
  });

  /** Eventos no trilho, com a cor do marcador já resolvida. */
  /** Eventos no trilho e no mapa, com a cor do marcador já resolvida. */
  protected readonly eventMarks = computed<(TimelineEventMark & EventMarkerInput)[]>(() =>
    this.events.sorted().map((event) => ({
      id: event.id,
      title: event.title,
      tickStart: event.tickStart,
      tickEnd: event.tickEnd,
      color: eventColor(event),
      locationEntityId: event.locationEntityId,
    })),
  );

  /** Aparência dos tokens: nome, tipo, cor e retrato (já resolvido) de cada entidade. */
  protected readonly tokenLooks = computed<TokenLook[]>(() => {
    const portraits = this.entities.portraits();
    return this.entities.entities().map((entity) => ({
      entityId: entity.id,
      name: entity.name,
      kind: entity.kind,
      color: entity.color,
      portraitUrl: entity.portraitAssetId ? (portraits[entity.portraitAssetId] ?? null) : null,
    }));
  });

  /** Evento a marcar no mapa com a ferramenta `place`. */
  private readonly placingId = signal<Uuid | null>(null);
  /** Entidade a marcar no mapa com a ferramenta `place` ("Marcar posição" da ficha). */
  private readonly placingEntityId = signal<Uuid | null>(null);
  /** Marcador sob o ponteiro (mapa ou trilho), para o popover. */
  private readonly hovered = signal<{ id: Uuid; anchor: Point } | null>(null);
  protected readonly hoveredEvent = computed(() => {
    const hovered = this.hovered();
    const event = hovered ? this.events.byId().get(hovered.id) : undefined;
    return hovered && event ? { event, anchor: hovered.anchor } : null;
  });
  private popoverTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly mapNames = computed(() =>
    Object.fromEntries(this.store.maps().map((m) => [m.id, m.name])),
  );
  protected readonly ancestors = computed(() => this.store.activePath().slice(0, -1));
  protected readonly linkItems = computed(() =>
    (this.mapStore.scene()?.links ?? []).map((link) => ({
      id: link.id,
      targetName: this.mapNames()[link.targetMapId] ?? '',
    })),
  );
  protected readonly hint = computed(() => {
    const points = this.toolPoints();
    switch (this.tool()) {
      case 'calibrate':
        return this.mapText.hints.calibrate[Math.min(points, 1)];
      case 'pin':
      case 'label':
      case 'brush':
      case 'eraser':
      case 'region':
      case 'measure':
        return this.mapText.hints[this.tool() as 'pin'];
      case 'link':
        return points === 0
          ? this.mapText.hints.link
          : `${this.mapText.hints.link} ${this.mapText.hints.linkPoints(points)}`;
      case 'place': {
        const entity = this.entities.byId().get(this.placingEntityId() ?? '');
        if (entity) {
          const date = this.timeline
            .calendar()
            .format(this.tokens.keyframeTick(), this.timeline.precision());
          return this.mapText.tokens.sheet.placeHint(entity.name, date);
        }
        const event = this.events.byId().get(this.placingId() ?? '');
        return event ? TIME_STRINGS.events.place.hint(event.title) : null;
      }
      default:
        return null;
    }
  });

  /** A ficha cobre o Explorar e tem pelo menos 440 px. */
  protected readonly sheetWidth = computed(() => Math.max(this.bars().rightWidth, 440));

  protected readonly cameraFor = (mapId: Uuid) => readCamera(this.prefs.prefs(), mapId);

  private readonly title = viewChild.required<ElementRef<HTMLElement>>('title');
  private readonly canvas = viewChild<MapCanvasComponent>('canvas');
  /** Tokens com o caminho (rastro) à mostra pelo menu, além dos selecionados. */
  protected readonly pathTokens = signal<readonly Uuid[]>([]);
  /**
   * Instantes das posições da entidade em foco (token selecionado ou ficha aberta), para
   * os traços da linha do tempo.
   */
  protected readonly keyframeTicks = computed(() => {
    const selected = this.mapStore.selectedTokens().find((token) => token.entityId !== null);
    const openId = this.entities.openId();
    const token = selected ?? (openId ? this.mapStore.tokenOfEntity(openId) : null);
    return token ? this.mapStore.keyframesOf(token.id).map((k) => k.tick) : [];
  });
  protected readonly trailTokens = computed(() => [
    ...new Set([...this.mapStore.selection(), ...this.pathTokens()]),
  ]);
  private readonly timelineBar = viewChild<TimelineBarComponent>('timelineBar');
  private readonly explorer = viewChild<ExplorerPanelComponent>('explorer');
  private readonly sheet = viewChild<EntitySheetComponent>('sheet');
  private readonly eventSheet = viewChild<EventSheetComponent>('eventSheet');

  /** Situação do evento aberto no mapa ativo (marcadores chegam com os tokens de evento). */
  protected readonly placement = computed<EventPlacement | null>(() => {
    const map = this.store.activeMap();
    const id = this.events.openId();
    if (!map || !id) return null;
    const placed = (this.mapStore.scene()?.tokens ?? []).some((token) => token.eventId === id);
    return { mapName: map.name, placed };
  });
  private paletteOpen = false;
  private rangeDialogOpen = false;
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly document = inject(DOCUMENT);
  private readonly transitions = inject(BookTransitions);
  private readonly dialogs = inject(DialogService);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly injector = inject(Injector);

  constructor() {
    const fromBook = this.transitions.arrival()?.kind === 'zoom-in';
    const motion = inject(BookMotionService).motion();
    this.entrance = !fromBook ? 'none' : motion === 'fade' ? 'fade' : 'zoom';
    void this.prefs.load();
    afterNextRender(() => void this.load());
    this.registerShortcuts();
    this.loadTokenPortraits();

    // Mapa ativo: carrega a cena e reflete o id na URL.
    effect(() => {
      const id = this.store.activeMapId();
      untracked(() => {
        const map = this.store.activeMap();
        this.tool.set('pan');
        if (!map || !id) {
          this.mapStore.clear();
          return;
        }
        void this.mapStore.load(map, this.store.takeLocalImage(id));
        this.syncUrl(id);
      });
    });
    // Nome, escala e dimensões atualizados chegam à cena sem recarregar.
    effect(() => {
      const map = this.store.activeMap();
      if (map) untracked(() => this.mapStore.syncMap(map));
    });
    // Velocidade do play: a salva para este mundo ou a que percorre o mundo em ~1 minuto.
    let speedApplied = false;
    effect(() => {
      if (speedApplied || !this.prefs.loaded() || this.store.status() !== 'ready') return;
      speedApplied = true;
      untracked(() => {
        const saved = readSpeed(this.prefs.prefs(), this.worldId());
        this.timeline.setSpeed(saved ?? suggestSpeed(this.store.calendar(), this.store.range()));
      });
    });
    // Avisos sobem acima da linha do tempo enquanto ela existe.
    effect(() => {
      const root = this.document.documentElement.style;
      if (this.store.activeMap()) root.setProperty('--wd-toast-offset', `${TIMELINE_BAR}px`);
      else root.removeProperty('--wd-toast-offset');
    });
    // Instante da linha do tempo na URL (`?t=`), com espera (docs/06 §7).
    effect((onCleanup) => {
      const tick = this.timeline.currentTick();
      // Sem mapa não há linha do tempo (só a área de importação).
      if (this.store.status() !== 'ready' || !this.store.activeMap()) return;
      const timer = setTimeout(() => this.replaceParam('t', String(tick)), URL_TICK_DELAY_MS);
      onCleanup(() => clearTimeout(timer));
    });
    // Faixa do mundo mudou (calendário, evento fora da faixa): cursor e trilho acompanham.
    effect(() => {
      this.store.range();
      untracked(() => this.timeline.syncRange());
    });
    // Ficha aberta (entidade ou evento): reflete o id na URL (`?sel=`).
    effect(() => {
      const id = this.entities.openId() ?? this.events.openId();
      if (this.entities.status() === 'ready') untracked(() => this.replaceParam('sel', id));
    });
    // Gravação de evento que falhou: mesmo tratamento das fichas de entidade.
    effect(() => {
      const failure = this.events.saveFailure();
      if (!failure) return;
      untracked(() => {
        const text = this.entityText.sheet;
        this.toasts.show(
          failure.conflict
            ? { message: text.conflict, kind: 'error' }
            : {
                message: text.saveFailed,
                kind: 'error',
                action: {
                  label: text.retry,
                  run: () => void this.events.flush(failure.entityId),
                },
              },
        );
      });
    });
    // Gravação da ficha que falhou: conflito recarrega; outras falhas oferecem "Tentar de novo".
    effect(() => {
      const failure = this.entities.saveFailure();
      if (!failure) return;
      untracked(() => {
        const text = this.entityText.sheet;
        this.toasts.show(
          failure.conflict
            ? { message: text.conflict, kind: 'error' }
            : {
                message: text.saveFailed,
                kind: 'error',
                action: {
                  label: text.retry,
                  run: () => void this.entities.flush(failure.entityId),
                },
              },
        );
      });
    });
    // Envio que falhou: aviso com "Tentar de novo".
    effect(() => {
      if (this.store.upload()?.state !== 'failed') return;
      untracked(() =>
        this.toasts.show({
          message: this.mapText.upload.failed,
          kind: 'error',
          action: { label: this.mapText.upload.retry, run: () => this.retryUpload() },
        }),
      );
    });

    inject(DestroyRef).onDestroy(() => {
      this.document.documentElement.style.removeProperty('--wd-toast-offset');
      this.store.dispose();
      void this.prefs.flush();
    });
  }

  /** Ícone do livro: o mapa encolhe de volta à página e a página desvira (docs/05 › 4). */
  protected backToLibrary(): void {
    this.transitions.expect({ kind: 'zoom-out', worldId: this.worldId() });
    void this.router.navigateByUrl('/biblioteca');
  }

  protected setTool(tool: ToolId): void {
    this.toolPoints.set(0);
    this.ruler.set(null);
    if (tool !== this.tool()) this.editing.set(null);
    this.tool.set(tool);
  }

  protected formatDistance(pixels: number): string {
    return this.distanceFormat()(pixels);
  }

  /** Anotação desenhada: grava e, se tiver o que preencher, abre o editor junto dela. */
  protected async onAnnotationCreated(shape: AnnotationShape): Promise<void> {
    const text = this.mapText.annotations;
    try {
      const annotation = await this.mapStore.addAnnotation(shape);
      void this.announcer.announce(text.created[shape.kind]);
      if (shape.kind === 'stroke') return;
      afterNextRender(
        () => {
          const anchor = this.canvas()?.annotationAnchor(annotation.id);
          if (anchor) this.openAnnotation(annotation.id, anchor, true);
        },
        { injector: this.injector },
      );
    } catch {
      this.toasts.show({ message: text.editor.failed, kind: 'error' });
    }
  }

  protected openAnnotation(id: Uuid, anchor: Point, autofocus = true): void {
    this.editing.set({ id, anchor, autofocus });
  }

  protected closeAnnotation(): void {
    this.editing.set(null);
    this.canvas()?.focusMap();
  }

  protected async editAnnotation(
    id: Uuid,
    changes: AnnotationEdit,
    label: 'editAnnotation' | 'moveAnnotation' = 'editAnnotation',
  ): Promise<void> {
    try {
      await this.mapStore.updateAnnotation(id, changes, label);
    } catch {
      this.toasts.show({ message: this.mapText.annotations.editor.failed, kind: 'error' });
    }
  }

  protected async removeAnnotation(id: Uuid): Promise<void> {
    const text = this.mapText.annotations.editor;
    const kind = this.mapStore.scene()?.annotations.find((a) => a.id === id)?.kind;
    this.closeAnnotation();
    try {
      await this.mapStore.removeAnnotations([id]);
      if (!kind) return;
      this.toasts.show({
        message: text.removed[kind],
        kind: 'success',
        action: { label: text.undo, run: () => void this.undo() },
      });
    } catch {
      this.toasts.show({ message: text.failed, kind: 'error' });
    }
  }

  /** Passada da borracha: apaga os traços tocados numa edição só (um Ctrl+Z traz todos). */
  protected async eraseAnnotations(ids: Uuid[]): Promise<void> {
    try {
      await this.mapStore.removeAnnotations(ids, 'erase');
      void this.announcer.announce(this.mapText.annotations.erased(ids.length));
    } catch {
      this.toasts.show({ message: this.mapText.annotations.editor.failed, kind: 'error' });
    }
  }

  /** "Fixar medição": a régua em curso vira uma anotação; a próxima começa do zero. */
  protected async fixMeasure(): Promise<void> {
    const ruler = this.ruler();
    if (!ruler || ruler.points.length < 2) return;
    this.ruler.set(null);
    this.toolPoints.set(0);
    this.canvas()?.cancelTool();
    try {
      await this.mapStore.addAnnotation({ kind: 'measure', points: ruler.points });
      void this.announcer.announce(this.mapText.annotations.created.measure);
    } catch {
      this.toasts.show({ message: this.mapText.annotations.editor.failed, kind: 'error' });
    }
  }

  protected openAnnotationLink(link: AnnotationLink): void {
    if ('entityId' in link) this.openEntity(link.entityId);
    else this.openEvent(link.eventId);
  }

  protected fitMap(): void {
    this.canvas()?.fit();
  }

  protected toggleLayer(layer: ToggleableLayer): void {
    const hidden = this.hiddenLayers();
    this.hiddenLayers.set(
      hidden.includes(layer) ? hidden.filter((l) => l !== layer) : [...hidden, layer],
    );
  }

  protected setBars(change: Partial<BarPrefs>): void {
    this.prefs.set('bars', writeBarPrefs({ ...this.bars(), ...change }));
  }

  protected saveCamera({ mapId, camera }: CameraChange): void {
    const saved = { x: camera.center.x, y: camera.center.y, zoom: camera.zoom };
    this.prefs.set('cameras', writeCamera(this.prefs.prefs(), mapId, saved));
  }

  protected openMap(id: Uuid): void {
    this.store.selectMap(id);
    const map = this.store.activeMap();
    if (map) void this.announcer.announce(this.text.announce(map.name));
  }

  protected async retryUpload(): Promise<void> {
    try {
      await this.store.retryUpload();
      this.toasts.show({ message: this.mapText.upload.done, kind: 'success' });
    } catch {
      // O efeito do estado `failed` avisa de novo.
    }
  }

  /** Arquivo solto, colado ou escolhido (docs/06 §0). */
  protected async importFile(file: File): Promise<void> {
    if (this.busy()) return;
    const current = this.store.activeMap();
    let choice: ImportChoice | 'root' = 'root';
    if (current) {
      const ref = this.dialogs.open<ImportChoiceDialogComponent, string, ImportChoice>(
        ImportChoiceDialogComponent,
        { data: current.name },
      );
      const picked = await firstValueFrom(ref.closed);
      if (!picked) return;
      choice = picked;
    }
    this.busy.set(true);
    let processed: ProcessedMapImage;
    try {
      processed = await readMapImage(file);
    } catch (error) {
      this.busy.set(false);
      const reason = error instanceof MapImageError ? error.reason : 'decode_failed';
      this.toasts.show({ message: this.mapText.import.errors[reason], kind: 'error' });
      return;
    }
    try {
      if (choice === 'replace' && current) {
        const updated = await this.store.replaceImage(current.id, processed);
        await this.mapStore.load(updated, this.store.takeLocalImage(updated.id));
        this.notifyImported(this.mapText.import.replaced, processed.reduced, false);
      } else {
        const name = mapNameFromFile(file.name, this.mapText.import.defaultName);
        const parent = choice === 'child' && current ? current.id : null;
        await this.store.createMap(processed, name, parent);
        this.notifyImported(this.mapText.import.created(name), processed.reduced, true);
      }
    } catch {
      processed.bitmap.close();
      this.toasts.show({ message: this.mapText.import.errors.save_failed, kind: 'error' });
    } finally {
      this.busy.set(false);
    }
  }

  protected onTitleAction(action: MapTitleAction): void {
    const map = this.store.activeMap();
    if (!map) return;
    switch (action) {
      case 'rename':
        void this.rename(map.id, map.name);
        break;
      case 'move-to-root':
        void this.store.moveMap(map.id, null);
        break;
      case 'scale':
        this.setTool('calibrate');
        break;
      case 'import':
        void pickImageFile(this.document).then((file) => file && this.importFile(file));
        break;
    }
  }

  /** Linha desenhada sobre a escala gráfica: pergunta o comprimento real. */
  protected async onMeasure({ points, distance }: { points: Point[]; distance: number }) {
    if (this.tool() === 'measure') {
      this.ruler.set({ points, distance });
      return;
    }
    const map = this.store.activeMap();
    if (!map || this.tool() !== 'calibrate') return;
    const ref = this.dialogs.open<ScaleDialogComponent, ScaleDialogData, ScaleDialogResult>(
      ScaleDialogComponent,
      {
        data: { pixelLength: distance, unit: map.scaleUnit, label: map.scaleLabel },
        autoFocus: 'first-tabbable',
      },
    );
    const result = await firstValueFrom(ref.closed);
    this.setTool('pan');
    if (!result) return;
    try {
      await this.store.setScale(map.id, { pixelLength: distance, ...result });
      const value = (result.realLength / distance).toLocaleString('pt-BR', {
        maximumSignificantDigits: 3,
      });
      const unit = this.mapText.scale.units[result.unit];
      this.toasts.show({
        message: this.mapText.scale.saved(this.mapText.scale.perPixel(value, unit)),
        kind: 'success',
      });
    } catch {
      this.toasts.show({ message: this.mapText.scale.failed, kind: 'error' });
    }
  }

  /** Região desenhada com a ferramenta de link: escolhe o mapa de destino. */
  protected async onRegionDrawn(polygon: PolygonVertex[]): Promise<void> {
    const map = this.store.activeMap();
    if (!map) return;
    const ref = this.dialogs.open<LinkTargetDialogComponent, LinkTargetData, Uuid>(
      LinkTargetDialogComponent,
      { data: { currentMapId: map.id, maps: this.store.tree() }, autoFocus: 'first-tabbable' },
    );
    const target = await firstValueFrom(ref.closed);
    this.setTool('pan');
    if (!target) return;
    try {
      await this.mapStore.addLink(polygon, target);
      const name = this.mapNames()[target] ?? '';
      this.toasts.show({ message: this.mapText.link.created(name), kind: 'success' });
    } catch {
      this.toasts.show({ message: this.mapText.link.failed, kind: 'error' });
    }
  }

  protected async removeLink(id: Uuid): Promise<void> {
    try {
      await this.mapStore.removeLink(id);
      void this.announcer.announce(this.mapText.link.removed);
    } catch {
      this.toasts.show({ message: this.mapText.link.failed, kind: 'error' });
    }
  }

  /** Ctrl/Cmd+Z: desfaz a última edição do mapa e anuncia qual foi. */
  protected async undo(): Promise<void> {
    const text = this.mapText.history;
    try {
      const label = await this.history.undo();
      void this.announcer.announce(label ? text.undone(this.editName(label)) : text.nothingToUndo);
    } catch {
      this.toasts.show({ message: text.undoFailed, kind: 'error' });
    }
  }

  /** Ctrl/Cmd+Shift+Z (ou Ctrl+Y): refaz a última edição desfeita. */
  protected async redo(): Promise<void> {
    const text = this.mapText.history;
    try {
      const label = await this.history.redo();
      void this.announcer.announce(label ? text.redone(this.editName(label)) : text.nothingToRedo);
    } catch {
      this.toasts.show({ message: text.redoFailed, kind: 'error' });
    }
  }

  private editName(label: string): string {
    const labels: Record<string, string> = this.mapText.history.labels;
    return labels[label] ?? label;
  }

  private notifyImported(message: string, reduced: boolean, offerScale: boolean): void {
    this.toasts.show({
      message: reduced ? `${message} ${this.mapText.import.reduced}` : message,
      kind: 'success',
      action: offerScale
        ? { label: this.mapText.import.setScale, run: () => this.setTool('calibrate') }
        : undefined,
    });
  }

  private async rename(id: Uuid, name: string): Promise<void> {
    const ref = this.dialogs.open<RenameMapDialogComponent, string, string>(
      RenameMapDialogComponent,
      { data: name, autoFocus: 'first-tabbable' },
    );
    const next = await firstValueFrom(ref.closed);
    if (!next || next === name) return;
    try {
      await this.store.renameMap(id, next);
    } catch {
      this.toasts.show({ message: this.mapText.rename.failed, kind: 'error' });
    }
  }

  /** Velocidade do play (clique na velocidade da linha do tempo); fica salva para o mundo. */
  protected async openSpeed(): Promise<void> {
    const ref = this.dialogs.open<SpeedDialogComponent, SpeedDialogData, PlaySpeed>(
      SpeedDialogComponent,
      {
        data: {
          speed: this.timeline.speed(),
          calendar: this.store.calendar(),
          range: this.store.range(),
        },
        autoFocus: 'first-tabbable',
      },
    );
    const speed = await firstValueFrom(ref.closed);
    if (!speed) return;
    this.timeline.setSpeed(speed);
    this.prefs.set('timelineSpeeds', writeSpeed(this.prefs.prefs(), this.worldId(), speed));
  }

  /** Calendário do mundo, faixa e "agora da narrativa" (botão da linha do tempo). */
  protected async openCalendar(): Promise<void> {
    const world = this.store.world();
    if (!world) return;
    // Sob demanda: o editor traz o Zod, que o resto da tela não usa.
    const { CalendarDialogComponent: dialog } =
      await import('../timeline/calendar-dialog.component');
    const ref = this.dialogs.open<
      CalendarDialogComponent,
      CalendarDialogData,
      CalendarDialogResult
    >(dialog, {
      data: {
        definition: this.store.calendarDefinition(),
        timeStart: world.timeStart,
        timeEnd: world.timeEnd,
        nowTick: world.nowTick,
        currentTick: this.timeline.currentTick(),
      },
      autoFocus: 'first-tabbable',
    });
    const result = await firstValueFrom(ref.closed);
    if (!result) return;
    const text = TIME_STRINGS.calendar;
    try {
      if (result.definition) await this.store.saveCalendar(result.definition);
      const { timeStart, timeEnd, nowTick } = result;
      if (timeStart !== world.timeStart || timeEnd !== world.timeEnd || nowTick !== world.nowTick) {
        await this.store.updateTime({ timeStart, timeEnd, nowTick });
      }
      this.toasts.show({ message: text.saved, kind: 'success' });
    } catch {
      this.toasts.show({ message: text.failed, kind: 'error' });
    }
  }

  /** Marcador de evento no trilho: o cursor vai ao início e o mapa, ao local (docs/06 §4). */
  protected goToEvent(id: Uuid): void {
    const event = this.events.byId().get(id);
    if (!event) return;
    this.timeline.pause();
    this.timeline.seek(event.tickStart);
    const point = this.mapStore.eventPoint(id);
    if (point) this.canvas()?.focusPoint(point);
  }

  /** "Marcar no mapa": o próximo clique (ou Enter, no centro) escolhe o ponto. */
  protected startPlacing(id: Uuid): void {
    this.placingEntityId.set(null);
    this.placingId.set(id);
    this.setTool('place');
    this.canvas()?.focusMap();
  }

  /** "Marcar posição" da ficha: o próximo clique (ou Enter, no centro) grava a posição. */
  protected startPlacingEntity(id: Uuid): void {
    this.placingId.set(null);
    this.placingEntityId.set(id);
    this.setTool('place');
    this.canvas()?.focusMap();
  }

  /** "Mostrar no mapa" da ficha: centraliza e seleciona o token. */
  protected showToken(tokenId: Uuid): void {
    this.mapStore.select([tokenId]);
    this.canvas()?.focusToken(tokenId);
  }

  protected async onPointPicked(point: Point): Promise<void> {
    const entityId = this.placingEntityId();
    if (entityId) {
      this.placingEntityId.set(null);
      this.setTool('pan');
      await this.dropEntity(entityId, point);
      return;
    }
    const id = this.placingId();
    const event = id ? this.events.byId().get(id) : undefined;
    this.placingId.set(null);
    this.setTool('pan');
    if (!event) return;
    const text = TIME_STRINGS.events.place;
    try {
      await this.mapStore.placeEvent(event.id, point, event.tickStart);
      // O marcador só aparece durante o evento: o cursor vai para o início dele.
      if (!isEventActive(event, this.timeline.currentTick(), this.timeline.eventWindow())) {
        this.timeline.seek(event.tickStart);
      }
      void this.announcer.announce(text.placed(event.title));
    } catch {
      this.toasts.show({ message: text.failed, kind: 'error' });
    }
  }

  protected async unplaceEvent(id: Uuid): Promise<void> {
    const event = this.events.byId().get(id);
    const text = TIME_STRINGS.events.place;
    try {
      await this.mapStore.removeEventToken(id);
      if (event) void this.announcer.announce(text.removed(event.title));
    } catch {
      this.toasts.show({ message: text.failed, kind: 'error' });
    }
  }

  protected showEventOnMap(id: Uuid): void {
    this.goToEvent(id);
  }

  /** Popover: abre no marcador e fecha um pouco depois de o ponteiro sair (dá tempo de alcançá-lo). */
  protected onEventHover(hover: { eventId: Uuid | null; anchor: Point } | null): void {
    if (hover?.eventId) {
      this.keepPopover();
      this.hovered.set({ id: hover.eventId, anchor: hover.anchor });
      return;
    }
    if (this.popoverTimer) clearTimeout(this.popoverTimer);
    this.popoverTimer = setTimeout(() => this.hovered.set(null), POPOVER_CLOSE_DELAY_MS);
  }

  protected keepPopover(): void {
    if (this.popoverTimer) clearTimeout(this.popoverTimer);
    this.popoverTimer = null;
  }

  protected openFromPopover(id: Uuid): void {
    this.hovered.set(null);
    this.openEvent(id);
  }

  /** Entidade solta do Explorar no mapa: cria o token (ou a posição) e seleciona. */
  protected async dropEntity(entityId: Uuid, point: Point): Promise<void> {
    await this.tokens.place(entityId, point);
    const token = this.mapStore.tokenOfEntity(entityId);
    if (token) this.mapStore.select([token.id]);
  }

  protected togglePath(tokenId: Uuid): void {
    const shown = this.pathTokens();
    this.pathTokens.set(
      shown.includes(tokenId) ? shown.filter((id) => id !== tokenId) : [...shown, tokenId],
    );
  }

  /** O menu devolve o foco ao mapa, a menos que uma ação o tenha levado a outro lugar. */
  protected onTokenMenuClosed(): void {
    const active = this.document.activeElement;
    if (!active || active === this.document.body) this.canvas()?.focusMap();
  }

  /** Del: remove a posição em vigor ou o token inteiro (com confirmação, docs/06 §3). */
  protected async removeSelectedTokens(): Promise<void> {
    const tokens = this.mapStore.selectedTokens().filter((token) => token.entityId !== null);
    const first = tokens[0];
    if (!first) return;
    const tick = this.timeline.currentTick();
    const current =
      tokens.length === 1 ? keyframeInEffect(this.mapStore.keyframesOf(first.id), tick) : null;
    const text = this.mapText.tokens.removeDialog;
    const ref = this.dialogs.open<RemoveTokenDialogComponent, RemoveTokenData, RemoveTokenChoice>(
      RemoveTokenDialogComponent,
      {
        data: {
          name: tokens.length === 1 ? this.tokens.tokenName(first.id) : text.several(tokens.length),
          keyframeDate: current
            ? this.timeline.calendar().format(current.tick, this.timeline.precision())
            : null,
        },
      },
    );
    const choice = await firstValueFrom(ref.closed);
    if (choice === 'keyframe' && current) await this.tokens.removeKeyframe(current.id);
    if (choice === 'token') for (const token of tokens) await this.tokens.remove(token.id);
    this.canvas()?.focusMap();
  }

  /** Duplo clique no token: abre a ficha da entidade. */
  protected openToken(tokenId: Uuid): void {
    const token = this.mapStore.scene()?.tokens.find((t) => t.id === tokenId);
    if (token?.entityId) this.openEntity(token.entityId);
  }

  /** Abre a ficha (do Explorar, da paleta, de uma menção ou citação). */
  protected openEntity(id: Uuid): void {
    const entity = this.entities.byId().get(id);
    if (!entity) return;
    if (this.events.openId()) this.events.open(null);
    this.entities.open(id);
    this.explorer()?.showKind(entity.kind);
  }

  /** Abre a ficha do evento (Explorar, paleta, marcador). Só uma ficha fica aberta. */
  protected openEvent(id: Uuid): void {
    if (!this.events.byId().has(id)) return;
    if (this.entities.openId()) this.closeSheet(false);
    this.events.open(id);
    this.explorer()?.showEvents();
  }

  protected closeEventSheet(): void {
    const id = this.events.openId();
    this.events.open(null);
    this.focusRowOrTitle(id);
    if (id) void this.events.flush(id);
  }

  /** Novo evento na data do cursor (arredondada ao dia). */
  protected async createEvent(): Promise<void> {
    const calendar = this.store.calendar();
    const tick = calendar.startOf('day', this.timeline.currentTick());
    const ref = this.dialogs.open<CreateEventDialogComponent, string, string>(
      CreateEventDialogComponent,
      { data: calendar.format(tick), autoFocus: 'first-tabbable' },
    );
    const title = await firstValueFrom(ref.closed);
    if (!title) return;
    const text = TIME_STRINGS.events.create;
    try {
      const event = await this.events.create(title, tick);
      this.openEvent(event.id);
      void this.announcer.announce(text.created(event.title));
      afterNextRender(() => this.eventSheet()?.focusTitle(), { injector: this.injector });
    } catch {
      this.toasts.show({ message: text.failed, kind: 'error' });
    }
  }

  protected async trashEvent(id: Uuid): Promise<void> {
    const text = this.entityText.sheet;
    try {
      const event = await this.events.trash(id);
      this.title().nativeElement.focus({ preventScroll: true });
      this.toasts.show({
        message: text.trashed(event.title),
        kind: 'info',
        action: {
          label: text.undo,
          run: () =>
            void this.events
              .restore(id)
              .then(() => this.openEvent(id))
              .catch(() => this.toasts.show({ message: text.restoreFailed, kind: 'error' })),
        },
      });
    } catch {
      this.toasts.show({ message: text.trashFailed, kind: 'error' });
    }
  }

  /** Evento fora da faixa do mundo: pergunta se amplia a faixa (docs/06 › Faixa do mundo). */
  protected async extendRange({ start, end }: EventRange): Promise<void> {
    const world = this.store.world();
    if (!world || this.rangeDialogOpen) return;
    this.rangeDialogOpen = true;
    const outside = start < world.timeStart ? start : end;
    const ref = this.dialogs.open<ExtendRangeDialogComponent, string, boolean>(
      ExtendRangeDialogComponent,
      { data: this.store.calendar().format(outside), autoFocus: 'first-tabbable' },
    );
    const confirmed = await firstValueFrom(ref.closed);
    this.rangeDialogOpen = false;
    if (!confirmed) return;
    try {
      await this.store.updateTime({
        timeStart: Math.min(world.timeStart, start),
        timeEnd: Math.max(world.timeEnd, end),
      });
    } catch {
      this.toasts.show({ message: TIME_STRINGS.events.range.failed, kind: 'error' });
    }
  }

  protected closeSheet(restoreFocus = true): void {
    const id = this.entities.openId();
    this.entities.open(null);
    if (restoreFocus) this.focusRowOrTitle(id);
    if (id) void this.entities.flush(id);
  }

  /** O foco volta para a linha do item no Explorar (ou para o título). */
  private focusRowOrTitle(id: Uuid | null): void {
    afterNextRender(
      () => {
        const row = id
          ? this.document.querySelector<HTMLElement>(`wd-explorer-panel [data-id="${id}"]`)
          : null;
        (row ?? this.title().nativeElement).focus({ preventScroll: true });
      },
      { injector: this.injector },
    );
  }

  /** Nova entidade: nome e tipo num diálogo; depois a ficha abre com o nome em foco. */
  protected async createEntity(kind: EntityKind): Promise<void> {
    const ref = this.dialogs.open<CreateEntityDialogComponent, EntityKind, CreateEntityResult>(
      CreateEntityDialogComponent,
      { data: kind, autoFocus: 'first-tabbable' },
    );
    const result = await firstValueFrom(ref.closed);
    if (!result) return;
    try {
      const entity = await this.entities.create(result.kind, result.name);
      this.openEntity(entity.id);
      void this.announcer.announce(this.entityText.create.created(entity.name));
      afterNextRender(() => this.sheet()?.focusName(), { injector: this.injector });
    } catch {
      this.toasts.show({ message: this.entityText.create.failed, kind: 'error' });
    }
  }

  protected async trashEntity(id: Uuid): Promise<void> {
    const text = this.entityText.sheet;
    try {
      const entity = await this.entities.trash(id);
      this.title().nativeElement.focus({ preventScroll: true });
      this.toasts.show({
        message: text.trashed(entity.name),
        kind: 'info',
        action: {
          label: text.undo,
          run: () =>
            void this.entities
              .restore(id)
              .then(() => this.openEntity(id))
              .catch(() => this.toasts.show({ message: text.restoreFailed, kind: 'error' })),
        },
      });
    } catch {
      this.toasts.show({ message: text.trashFailed, kind: 'error' });
    }
  }

  /** Busca e paleta de comandos (Ctrl/Cmd+K). */
  protected async openPalette(): Promise<void> {
    if (this.paletteOpen) return;
    this.paletteOpen = true;
    const ref = this.dialogs.open<CommandPaletteComponent, PaletteData, PaletteResult>(
      CommandPaletteComponent,
      {
        data: { search: this.entities.search(), commands: this.paletteCommands() },
        autoFocus: 'first-tabbable',
      },
    );
    const result = await firstValueFrom(ref.closed);
    this.paletteOpen = false;
    if (result) this.runPaletteResult(result);
  }

  private paletteCommands(): PaletteCommand[] {
    const text = this.entityText.palette;
    const kinds: EntityKind[] = ['character', 'location', 'faction', 'item', 'note'];
    return [
      ...kinds.map((kind) => ({
        id: `create:${kind}`,
        label: ENTITY_KIND_STRINGS[kind].create,
        icon: 'add',
      })),
      ...(this.store.activeMap()
        ? [{ id: 'create-event', label: TIME_STRINGS.events.create.title, icon: 'add_diamond' }]
        : []),
      ...(this.store.activeMap()
        ? [
            { id: 'fit', label: text.commands.fit, icon: 'fit_screen' },
            { id: 'explorer', label: text.commands.toggleExplorer, icon: 'right_panel_open' },
          ]
        : []),
      { id: 'library', label: text.commands.library, icon: 'menu_book' },
      ...this.store
        .tree()
        .filter((row) => row.map.id !== this.store.activeMapId())
        .map((row) => ({
          id: `map:${row.map.id}`,
          label: text.openMap(row.map.name),
          icon: 'map',
          group: 'maps' as const,
        })),
    ];
  }

  private runPaletteResult(result: PaletteResult): void {
    if (result.type === 'entity') {
      this.openEntity(result.id);
      return;
    }
    if (result.type === 'event') {
      this.openEvent(result.id);
      return;
    }
    const [command, arg] = result.id.split(':');
    switch (command) {
      case 'create':
        void this.createEntity(arg as EntityKind);
        break;
      case 'create-event':
        void this.createEvent();
        break;
      case 'fit':
        this.fitMap();
        break;
      case 'explorer':
        this.setBars({ rightCollapsed: !this.bars().rightCollapsed });
        break;
      case 'library':
        this.backToLibrary();
        break;
      case 'map':
        if (arg) this.openMap(arg);
        break;
    }
  }

  /** `?map=` sem navegação do Router (que dispararia uma View Transition). */
  private syncUrl(mapId: Uuid): void {
    this.replaceParam('map', mapId);
  }

  private replaceParam(name: string, value: string | null): void {
    const path = this.location.path().split('?')[0] ?? '';
    const params = new URLSearchParams(this.location.path().split('?')[1] ?? '');
    if (params.get(name) === value) return;
    if (value === null) params.delete(name);
    else params.set(name, value);
    this.location.replaceState(path, params.toString());
  }

  /** Retratos dos tokens do mapa aberto são resolvidos uma vez (como no Explorar). */
  private loadTokenPortraits(): void {
    effect(() => {
      const ids = new Set((this.mapStore.scene()?.tokens ?? []).map((token) => token.entityId));
      for (const entity of this.entities.entities()) {
        if (ids.has(entity.id) && entity.portraitAssetId) {
          void this.entities.loadPortrait(entity.portraitAssetId);
        }
      }
    });
  }

  private registerShortcuts(): void {
    const drawing = () => DRAWING_TOOLS.includes(this.tool());
    const notOnControl = (event: KeyboardEvent) =>
      !(event.target instanceof Element && event.target.closest(INTERACTIVE));
    const hasMap = () => this.store.activeMap() !== null;
    // Setas passam o tempo quando nenhum controle as usa (docs/04 › Atalhos).
    const ownsArrows = (event: KeyboardEvent) =>
      event.target instanceof Element && event.target.closest(ARROW_KEYS_OWNERS) !== null;
    const remove = inject(ShortcutService).register([
      { key: 'v', when: hasMap, down: () => this.setTool('select') },
      { key: 'h', when: hasMap, down: () => this.setTool('pan') },
      { key: 'p', when: hasMap, down: () => this.setTool('pin') },
      { key: 'b', when: hasMap, down: () => this.setTool('brush') },
      { key: 'e', when: hasMap, down: () => this.setTool('eraser') },
      { key: 'r', when: hasMap, down: () => this.setTool('measure') },
      { key: 'g', when: hasMap, down: () => this.setTool('region') },
      { key: 'x', when: hasMap, down: () => this.setTool('label') },
      {
        key: 'escape',
        when: () => this.editing() !== null,
        down: () => this.closeAnnotation(),
      },
      {
        key: 'escape',
        when: () => this.tool() === 'measure' && this.ruler() !== null,
        down: () => {
          this.canvas()?.cancelTool();
          this.ruler.set(null);
        },
      },
      {
        key: 'space',
        when: (event) => hasMap() && notOnControl(event),
        down: () => this.spaceHeld.set(true),
        up: () => this.spaceHeld.set(false),
      },
      {
        key: '[',
        when: hasMap,
        down: () => this.setBars({ leftCollapsed: !this.bars().leftCollapsed }),
      },
      {
        key: ']',
        when: hasMap,
        down: () => this.setBars({ rightCollapsed: !this.bars().rightCollapsed }),
      },
      {
        key: 'escape',
        when: drawing,
        down: () => {
          this.canvas()?.cancelTool();
          this.setTool('pan');
        },
      },
      {
        key: 'enter',
        when: (event) =>
          ['link', 'place', 'pin', 'label', 'region'].includes(this.tool()) && notOnControl(event),
        down: () => this.canvas()?.commitTool(this.effectiveTool()),
      },
      { key: 'k', mod: true, inFields: true, down: () => void this.openPalette() },
      {
        key: 'delete',
        when: (event) => hasMap() && this.editing() !== null && notOnControl(event) && !drawing(),
        down: () => {
          const id = this.editing()?.id;
          if (id) void this.removeAnnotation(id);
        },
      },
      {
        key: 'delete',
        when: (event) =>
          hasMap() && this.mapStore.selection().length > 0 && notOnControl(event) && !drawing(),
        down: () => void this.removeSelectedTokens(),
      },
      { key: 'z', mod: true, shift: false, when: hasMap, down: () => void this.undo() },
      { key: 'z', mod: true, shift: true, when: hasMap, down: () => void this.redo() },
      { key: 'y', mod: true, when: hasMap, down: () => void this.redo() },
      { key: 't', when: hasMap, down: () => this.timelineBar()?.focusCursor() },
      {
        key: 'arrowleft',
        repeat: true,
        when: (event) => hasMap() && !ownsArrows(event),
        down: (event) => this.timeline.step(-1, event.shiftKey),
      },
      {
        key: 'arrowright',
        repeat: true,
        when: (event) => hasMap() && !ownsArrows(event),
        down: (event) => this.timeline.step(1, event.shiftKey),
      },
      {
        key: 'escape',
        when: () => this.entities.openId() !== null && !drawing(),
        down: () => this.closeSheet(),
      },
      {
        key: 'escape',
        when: () => this.events.openId() !== null && !drawing(),
        down: () => this.closeEventSheet(),
      },
    ]);
    inject(DestroyRef).onDestroy(remove);
  }

  private async load(): Promise<void> {
    const entitiesLoaded = this.entities.load(this.worldId());
    const status = await this.store.load(this.worldId(), this.map() ?? null);
    if (status !== 'ready') {
      this.leave(status === 'not_found' ? this.text.notFound : this.text.loadFailed);
      return;
    }
    const t = Number(this.t());
    this.timeline.init(this.t() && isTick(t) ? t : null, this.store.world()?.nowTick ?? null);
    await entitiesLoaded;
    const selected = this.sel();
    if (selected && this.entities.byId().has(selected)) this.openEntity(selected);
    else if (selected) this.openEvent(selected);
    await this.transitions.viewTransition()?.finished.catch(() => undefined);
    // Fim da transição: foco no título e anúncio (docs/05 › Regras).
    const name = this.store.activeMap()?.name ?? this.store.world()?.name ?? '';
    void this.announcer.announce(this.text.announce(name));
    afterNextRender(() => this.title().nativeElement.focus({ preventScroll: true }), {
      injector: this.injector,
    });
  }

  private leave(message: string): void {
    this.toasts.show({ message, kind: 'error' });
    void this.router.navigateByUrl('/biblioteca');
  }
}
