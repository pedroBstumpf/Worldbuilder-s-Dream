import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  type ElementRef,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type { SavedCamera } from '@core/prefs/ui-prefs';
import { MAP_STRINGS } from '@core/strings/map.strings';
import { TIME_STRINGS } from '@core/strings/time.strings';
import type { Point } from '@domain/geometry';
import type { PolygonVertex, Tick, Uuid } from '@domain/models';
import type { MapScene } from '@domain/ports';
import { evaluateKeyframes, isEventActive, sortKeyframes } from '@domain/timeline';
import {
  LAYER_IDS,
  type Camera,
  type EventMarkerInput,
  type LayerId,
  type MapEngine,
  type MapImageSource,
  type TokenLook,
  type ToolId,
  type ViewportInsets,
} from '@engine/map-engine';
import { ENTITY_DRAG_TYPE, EntityDrag } from './entity-drag';
import { MAP_ENGINE_FACTORY } from './map-engine.token';

/** Passo das setas, em px de tela (Shift: passo grande). */
const PAN_STEP = 80;
const ZOOM_STEP = 1.25;
/** Espera máxima pelo `contextmenu` depois do botão direito num token. */
const MENU_FALLBACK_MS = 400;

export interface CameraChange {
  mapId: Uuid;
  camera: Camera;
}

/** Ponteiro sobre um marcador de evento (`eventId` nulo ao sair), em coordenadas da janela. */
export interface EventHover {
  eventId: Uuid | null;
  anchor: Point;
}

/**
 * Adaptador fino do motor (docs/06 §1): cria o `MapEngine`, repassa cena, ferramenta,
 * camadas e margens das barras, e traduz os eventos do motor em saídas. Com o foco no
 * mapa, as setas movem e +/−/0 controlam o zoom. Os links também viram botões, para
 * teclado e leitor de tela (o canvas em si é decorativo).
 */
@Component({
  selector: 'wd-map-canvas',
  template: `
    <div
      #host
      class="host"
      role="application"
      tabindex="0"
      aria-roledescription="mapa"
      [attr.aria-label]="text.label(mapName())"
      aria-describedby="wd-map-instructions"
      (keydown)="onKey($event)"
      (dragover)="onDragOver($event)"
      (dragleave)="onDragLeave($event)"
      (drop)="onDrop($event)"
      (contextmenu)="onContextMenu($event)"
    ></div>
    <p id="wd-map-instructions" class="sr-only">{{ text.instructions }}</p>
    @if (visibleTokens().length > 0) {
      <nav class="links" [attr.aria-label]="tokenText.list">
        <ul>
          @for (token of visibleTokens(); track token.id) {
            <li>
              <button
                type="button"
                class="link wd-focus"
                [attr.data-token]="token.id"
                (click)="openTokenMenu(token.id)"
              >
                {{ tokenText.listItem(token.name) }}
              </button>
            </li>
          }
        </ul>
      </nav>
    }
    @if (visibleEvents().length > 0) {
      <nav class="links" [attr.aria-label]="eventText.list">
        <ul>
          @for (event of visibleEvents(); track event.id) {
            <li>
              <button type="button" class="link wd-focus" (click)="openEvent.emit(event.id)">
                {{ eventText.open(event.title) }}
              </button>
            </li>
          }
        </ul>
      </nav>
    }
    @if (links().length > 0) {
      <nav class="links" [attr.aria-label]="text.links">
        <ul>
          @for (link of links(); track link.id) {
            <li>
              <button type="button" class="link wd-focus" (click)="openMap.emit(link.targetMapId)">
                {{ text.openLink(mapNames()[link.targetMapId] ?? '') }}
              </button>
            </li>
          }
        </ul>
      </nav>
    }
  `,
  host: { class: 'block' },
  styles: `
    :host {
      position: fixed;
      inset: 0;
    }

    .host {
      position: absolute;
      inset: 0;
      overflow: hidden;
      touch-action: none;
    }

    .host:focus-visible {
      outline: 2px solid var(--wd-focus-ring);
      outline-offset: -4px;
    }

    /* Botões dos links: fora da tela até receberem foco pelo teclado. */
    .links ul {
      position: absolute;
      inset-block-end: 96px;
      inset-inline-start: 50%;
      display: flex;
      flex-direction: column;
      gap: 4px;
      transform: translateX(-50%);
    }

    .link {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    .link:focus-visible {
      position: static;
      inline-size: auto;
      block-size: auto;
      padding: 8px 14px;
      clip-path: none;
      font-family: var(--font-sans);
      color: var(--wd-text-on-surface);
      background: var(--wd-surface);
      border: 1px solid var(--wd-rule-strong);
      border-radius: var(--wd-radius-control);
    }
  `,
})
export class MapCanvasComponent {
  readonly scene = input<MapScene | null>(null);
  readonly image = input<MapImageSource | null>(null);
  readonly tool = input<ToolId>('pan');
  readonly hiddenLayers = input<readonly LayerId[]>([]);
  readonly insets = input<ViewportInsets>({ top: 0, right: 0, bottom: 0, left: 0 });
  /** Câmera salva do mapa, consultada ao abrir cada mapa. */
  readonly savedCamera = input<(mapId: Uuid) => SavedCamera | null>(() => null);
  readonly mapNames = input<Record<Uuid, string>>({});
  /** Instante da linha do tempo (docs/06 §1: `engine.setTime(timeline.currentTick())`). */
  readonly time = input<Tick>(0);
  /** Eventos do mundo (marcadores) e a janela dos pontuais. */
  readonly events = input<readonly EventMarkerInput[]>([]);
  readonly eventWindow = input<Tick>(0);
  /** Aparência dos tokens (nome, tipo, cor, retrato) por entidade. */
  readonly looks = input<readonly TokenLook[]>([]);
  readonly selection = input<readonly Uuid[]>([]);
  /** Tokens com o rastro de movimento à mostra. */
  readonly trails = input<readonly Uuid[]>([]);

  readonly cameraChange = output<CameraChange>();
  readonly measure = output<{ points: Point[]; distance: number }>();
  readonly regionDrawn = output<PolygonVertex[]>();
  readonly openMap = output<Uuid>();
  readonly toolProgress = output<number>();
  readonly loadFailed = output();
  /** A ferramenta `place` escolheu um ponto. */
  readonly pointPicked = output<Point>();
  readonly openEvent = output<Uuid>();
  readonly eventHover = output<EventHover>();
  /** Fim do arraste de um token (o instante é decidido por quem grava). */
  readonly tokenMoved = output<{ tokenId: Uuid; to: Point; correctPrevious: boolean }>();
  readonly tokenSelected = output<Uuid[]>();
  readonly tokenOpen = output<Uuid>();
  readonly tokenMenu = output<{ tokenId: Uuid; anchor: Point }>();
  /** Losango do rastro arrastado: nova posição do keyframe. */
  readonly keyframeMoved = output<{ keyframeId: Uuid; to: Point }>();
  /** Clique num losango do rastro: o instante do keyframe. */
  readonly keyframePicked = output<Tick>();
  /** Entidade do Explorar solta no mapa, no ponto do mapa sob o ponteiro. */
  readonly entityDropped = output<{ entityId: Uuid; point: Point }>();

  protected readonly text = MAP_STRINGS.canvas;
  protected readonly eventText = TIME_STRINGS.events.map;
  protected readonly tokenText = MAP_STRINGS.tokens;

  /** Keyframes de cada token de entidade, ordenados (só muda com a cena). */
  private readonly entityTokens = computed(() => {
    const scene = this.scene();
    if (!scene) return [];
    return scene.tokens
      .filter((token) => token.entityId !== null)
      .map((token) => ({
        token,
        keyframes: sortKeyframes(scene.keyframes.filter((k) => k.tokenId === token.id)),
      }));
  });

  /**
   * Lista acessível espelhada (docs/04 › Acessibilidade): tokens visíveis no instante. Só
   * muda quando um token aparece ou some, não a cada quadro do play.
   */
  protected readonly visibleTokens = computed(
    () => {
      const tick = this.time();
      const names = new Map(this.looks().map((look) => [look.entityId, look.name]));
      return this.entityTokens()
        .filter(({ keyframes }) => evaluateKeyframes(keyframes, tick) !== null)
        .map(({ token }) => ({
          id: token.id,
          name: names.get(token.entityId ?? '') ?? this.tokenText.unnamed,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    },
    {
      equal: (a, b) =>
        a.length === b.length && a.every((t, i) => t.id === b[i]?.id && t.name === b[i]?.name),
    },
  );

  /** Eventos com marcador neste mapa agora (também como botões, para teclado e leitor). */
  protected readonly visibleEvents = computed(() => {
    const tokens = this.scene()?.tokens ?? [];
    const placed = new Set(tokens.map((token) => token.eventId).filter((id) => id !== null));
    const locations = new Set(tokens.map((token) => token.entityId).filter((id) => id !== null));
    const tick = this.time();
    const window = this.eventWindow();
    return this.events().filter(
      (event) =>
        isEventActive(event, tick, window) &&
        (placed.has(event.id) ||
          (event.locationEntityId !== null && locations.has(event.locationEntityId))),
    );
  });
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private readonly factory = inject(MAP_ENGINE_FACTORY);
  private readonly drag = inject(EntityDrag);
  private readonly engine = signal<MapEngine | null>(null);
  private loaded: { mapId: Uuid; image: MapImageSource | null } | null = null;
  /** Menu pedido pelo botão direito, à espera do `contextmenu` nativo. */
  private pendingMenu: {
    tokenId: Uuid;
    anchor: Point;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;

  protected mapName(): string {
    return this.scene()?.map.name ?? '';
  }

  protected links() {
    return this.scene()?.links ?? [];
  }

  constructor() {
    const destroyRef = inject(DestroyRef);
    let disposed = false;
    destroyRef.onDestroy(() => {
      disposed = true;
      this.engine()?.destroy();
    });

    afterNextRender(async () => {
      const reducedMotion =
        globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      const engine = await this.factory({ reducedMotion });
      if (disposed) return;
      await engine.mount(this.host().nativeElement);
      if (disposed) {
        engine.destroy();
        return;
      }
      engine.events.subscribe((event) => {
        switch (event.type) {
          case 'camera': {
            const mapId = this.loaded?.mapId;
            if (mapId) this.cameraChange.emit({ mapId, camera: event });
            break;
          }
          case 'measure':
            this.measure.emit({ points: event.points, distance: event.distance });
            break;
          case 'region:drawn':
            this.regionDrawn.emit(event.polygon);
            break;
          case 'link:open':
            this.openMap.emit(event.targetMapId);
            break;
          case 'tool:progress':
            this.toolProgress.emit(event.points);
            break;
          case 'point:picked':
            this.pointPicked.emit(event.point);
            break;
          case 'event:open':
            this.openEvent.emit(event.eventId);
            break;
          case 'event:hover':
            this.eventHover.emit({ eventId: event.eventId, anchor: event.anchor });
            break;
          case 'token:moved':
            this.tokenMoved.emit({
              tokenId: event.tokenId,
              to: event.to,
              correctPrevious: event.correctPrevious,
            });
            break;
          case 'token:selected':
            this.tokenSelected.emit(event.ids);
            break;
          case 'token:open':
            this.tokenOpen.emit(event.tokenId);
            break;
          case 'keyframe:moved':
            this.keyframeMoved.emit({ keyframeId: event.keyframeId, to: event.to });
            break;
          case 'keyframe:picked':
            this.keyframePicked.emit(event.tick);
            break;
          case 'token:menu':
            this.deferMenu({ tokenId: event.tokenId, anchor: event.anchor });
            break;
        }
      });
      // Margens e ferramenta antes da primeira cena: o enquadramento inicial já as considera.
      engine.setInsets(untracked(this.insets));
      engine.setTool(untracked(this.tool));
      this.engine.set(engine);
    });

    effect(() => {
      const engine = this.engine();
      const scene = this.scene();
      const image = this.image();
      if (!engine || !scene) return;
      untracked(() => void this.show(engine, scene, image));
    });
    effect(() => this.engine()?.setTool(this.tool()));
    effect(() => {
      const engine = this.engine();
      const hidden = this.hiddenLayers();
      for (const layer of LAYER_IDS) engine?.setLayerVisible(layer, !hidden.includes(layer));
    });
    effect(() => this.engine()?.setInsets(this.insets()));
    effect(() => this.engine()?.setTime(this.time()));
    effect(() => this.engine()?.applyPatch({ type: 'looks', looks: [...this.looks()] }));
    effect(() => this.engine()?.setSelection([...this.selection()]));
    effect(() => this.engine()?.setTrails([...this.trails()]));
    effect(() => {
      const engine = this.engine();
      const events = [...this.events()];
      const window = this.eventWindow();
      engine?.applyPatch({ type: 'events', events, window });
    });
  }

  /** Comandos das barras (enquadrar, zoom) e do teclado. */
  fit(): void {
    this.engine()?.fitToMap(true);
  }

  zoomBy(factor: number): void {
    this.engine()?.zoomBy(factor);
  }

  commitTool(): void {
    this.engine()?.commitTool();
  }

  cancelTool(): void {
    this.engine()?.cancelTool();
  }

  /** Centraliza o mapa num ponto (ex.: "Mostrar no mapa" de um evento). */
  focusPoint(point: Point): void {
    this.engine()?.focus({ point }, true);
  }

  focusMap(): void {
    this.host().nativeElement.focus({ preventScroll: true });
  }

  /** Centraliza o mapa num token (ex.: "Mostrar no mapa" da ficha). */
  focusToken(tokenId: Uuid): void {
    this.engine()?.focus({ tokenId }, true);
  }

  /** Posição atual do token na tela, em coordenadas da janela (âncora do menu). */
  tokenAnchor(tokenId: Uuid): Point | null {
    const engine = this.engine();
    const at = engine?.tokenPosition(tokenId);
    return engine && at ? engine.worldToScreen(at) : null;
  }

  /**
   * O botão direito chega ao motor no `pointerdown`, mas o `contextmenu` nativo vem depois
   * e o menu (CDK) o trataria como clique fora, fechando-se. O menu abre nesse evento; se
   * ele não vier (alguns sistemas o disparam antes), abre logo depois.
   */
  private deferMenu(menu: { tokenId: Uuid; anchor: Point }): void {
    if (this.pendingMenu) clearTimeout(this.pendingMenu.timer);
    const timer = setTimeout(() => this.flushMenu(), MENU_FALLBACK_MS);
    this.pendingMenu = { ...menu, timer };
  }

  private flushMenu(): void {
    const menu = this.pendingMenu;
    if (!menu) return;
    clearTimeout(menu.timer);
    this.pendingMenu = null;
    this.tokenMenu.emit({ tokenId: menu.tokenId, anchor: menu.anchor });
  }

  /** O menu do navegador nunca abre sobre o mapa; o do token abre aqui. */
  protected onContextMenu(event: MouseEvent): void {
    event.preventDefault();
    // Depois do evento atual: o despachante de cliques fora do CDK já o viu.
    if (this.pendingMenu) setTimeout(() => this.flushMenu());
  }

  /** Botão da lista acessível: seleciona o token e abre o menu dele, ancorado no token. */
  protected openTokenMenu(tokenId: Uuid): void {
    const host = this.host().nativeElement.getBoundingClientRect();
    const anchor = this.tokenAnchor(tokenId) ?? {
      x: host.left + host.width / 2,
      y: host.top + host.height / 2,
    };
    this.tokenSelected.emit([tokenId]);
    this.tokenMenu.emit({ tokenId, anchor });
  }

  /** Arraste de uma entidade do Explorar: aceita e mostra o fantasma do token. */
  protected onDragOver(event: DragEvent): void {
    const transfer = event.dataTransfer;
    if (!transfer?.types.includes(ENTITY_DRAG_TYPE)) return;
    event.preventDefault();
    transfer.dropEffect = 'copy';
    const entityId = this.drag.entityId();
    const engine = this.engine();
    if (entityId && engine && this.scene()) {
      engine.previewDrop({ entityId, clientX: event.clientX, clientY: event.clientY });
    }
  }

  protected onDragLeave(event: DragEvent): void {
    const to = event.relatedTarget;
    if (to instanceof Node && this.host().nativeElement.contains(to)) return;
    this.engine()?.previewDrop(null);
  }

  protected onDrop(event: DragEvent): void {
    const entityId = event.dataTransfer?.getData(ENTITY_DRAG_TYPE);
    const engine = this.engine();
    const map = this.scene()?.map;
    engine?.previewDrop(null);
    this.drag.entityId.set(null);
    if (!entityId || !engine || !map) return;
    event.preventDefault();
    const p = engine.screenToWorld(event.clientX, event.clientY);
    const point = {
      x: Math.min(map.width, Math.max(0, p.x)),
      y: Math.min(map.height, Math.max(0, p.y)),
    };
    this.entityDropped.emit({ entityId, point });
  }

  protected onKey(event: KeyboardEvent): void {
    const engine = this.engine();
    if (!engine || event.ctrlKey || event.metaKey || event.altKey) return;
    const step = event.shiftKey ? PAN_STEP * 3 : PAN_STEP;
    const actions: Record<string, () => void> = {
      ArrowLeft: () => engine.panBy(-step, 0),
      ArrowRight: () => engine.panBy(step, 0),
      ArrowUp: () => engine.panBy(0, -step),
      ArrowDown: () => engine.panBy(0, step),
      '+': () => engine.zoomBy(ZOOM_STEP),
      '=': () => engine.zoomBy(ZOOM_STEP),
      '-': () => engine.zoomBy(1 / ZOOM_STEP),
      '0': () => engine.fitToMap(true),
    };
    const action = actions[event.key];
    if (!action) return;
    // As setas aqui movem o mapa (fora dele, passam o tempo).
    event.preventDefault();
    event.stopPropagation();
    action();
  }

  private async show(engine: MapEngine, scene: MapScene, image: MapImageSource | null) {
    const same = this.loaded?.mapId === scene.map.id && this.loaded.image === image;
    if (same) {
      engine.applyPatch({ type: 'links', links: scene.links });
      engine.applyPatch({ type: 'tokens', tokens: scene.tokens, keyframes: scene.keyframes });
      return;
    }
    this.loaded = { mapId: scene.map.id, image };
    try {
      await engine.loadScene(scene, image);
    } catch {
      this.loadFailed.emit();
      return;
    }
    const saved = this.savedCamera()(scene.map.id);
    if (saved) engine.focus({ point: { x: saved.x, y: saved.y }, zoom: saved.zoom }, false);
  }
}
