import { pointInPolygon, type Point } from '@domain/geometry';
import {
  DEFAULT_BRUSH,
  DEFAULT_LABEL_COLOR,
  DEFAULT_REGION_OPACITY,
  PIN_ICONS,
  polylineLength,
  simplifyStroke,
  type BrushStyle,
} from '@domain/maps';
import type { MapToken, Tick, TokenKeyframe, Uuid, WorldMap } from '@domain/models';
import type { MapScene } from '@domain/ports';
import { Viewport } from 'pixi-viewport';
import {
  Application,
  Container,
  CullerPlugin,
  extensions,
  ImageSource,
  Sprite,
  Texture,
  type FederatedPointerEvent,
  type PointData,
} from 'pixi.js';
import { AnnotationLayer } from '../layers/annotation-layer';
import { EventLayer } from '../layers/event-layer';
import { LinkLayer } from '../layers/link-layer';
import { loadBitmap } from '../layers/token-faces';
import { TokenLayer } from '../layers/token-layer';
import { TrailLayer } from '../layers/trail-layer';
import {
  DRAWING_TOOLS,
  EngineEventBus,
  LAYER_IDS,
  type Camera,
  type LayerId,
  type MapEngine,
  type MapEngineOptions,
  type MapImageSource,
  type ScenePatch,
  type ToolId,
  type ViewportInsets,
} from '../map-engine';
import { CalibrationDraft, ClickTracker, PolygonDraft } from '../tools/tool-drafts';
import { ToolOverlay } from '../tools/tool-overlay';
import {
  clampZoom,
  fitCamera,
  focusFor,
  screenCenterFor,
  zoomLimits,
  type Size,
} from './camera-math';
import { readPalette, type EnginePalette } from './engine-palette';

extensions.add(CullerPlugin);

/** Evento `clicked` do pixi-viewport (o tipo não é exportado pelo pacote). */
interface ClickedEvent {
  screen: PointData;
  world: PointData;
}

/** Duração das animações de câmera (docs/05: dentro do mapa, ≤ 200 ms). */
const CAMERA_ANIMATION_MS = 200;
/** Raio, em px de tela, para fechar o polígono clicando no primeiro vértice. */
const CLOSE_POLYGON_SLOP = 10;
/** Raio da borracha, em px de tela. */
const ERASER_RADIUS = 10;
/** Distância mínima entre dois pontos guardados do pincel, em px de tela. */
const BRUSH_SAMPLE = 1.5;
const NO_INSETS: ViewportInsets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Motor do mapa com PixiJS v8 + pixi-viewport (ADR-0004). Roda fora do Angular: o ticker
 * do Pixi não toca em templates. Coordenadas do mundo = pixels da imagem do mapa.
 */
export class PixiMapEngine implements MapEngine {
  readonly events = new EngineEventBus();

  private app: Application | null = null;
  private viewport: Viewport | null = null;
  private host: HTMLElement | null = null;
  private palette: EnginePalette | null = null;
  private readonly layers = new Map<LayerId, Container>();
  private background: Sprite | null = null;
  private tokens: TokenLayer | null = null;
  private trails: TrailLayer | null = null;
  private eventMarkers: EventLayer | null = null;
  private links: LinkLayer | null = null;
  private overlay: ToolOverlay | null = null;
  private annotations: AnnotationLayer | null = null;

  private map: WorldMap | null = null;
  private scene: MapScene | null = null;
  private tick: Tick = 0;
  private selection: Uuid[] = [];
  /** Início da seleção por área (ferramenta Selecionar), em coordenadas do mapa. */
  private marquee: { start: Point; additive: boolean } | null = null;
  private tool: ToolId = 'pan';
  private insets: ViewportInsets = NO_INSETS;
  private readonly clicks = new ClickTracker();
  private readonly calibration = new CalibrationDraft();
  private readonly polygon = new PolygonDraft();
  private readonly region = new PolygonDraft();
  /** Pontos da régua em curso. */
  private ruler: Point[] = [];
  /** Traço do pincel em curso (do `pointerdown` ao `pointerup`). */
  private stroke: Point[] | null = null;
  /** Último ponto da borracha durante a passada. */
  private eraser: Point | null = null;
  private drawStyle: BrushStyle = DEFAULT_BRUSH;
  private destroyed = false;

  constructor(private readonly options: MapEngineOptions) {}

  async mount(host: HTMLElement): Promise<void> {
    const app = new Application();
    await app.init({
      resizeTo: host,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(globalThis.devicePixelRatio || 1, 2),
      preference: 'webgl',
      culler: { updateTransform: true },
    });
    if (this.destroyed) {
      app.destroy(true, { children: true });
      return;
    }
    this.app = app;
    this.host = host;
    this.palette = readPalette(host);
    app.canvas.setAttribute('aria-hidden', 'true');
    app.canvas.style.display = 'block';
    host.appendChild(app.canvas);

    const viewport = new Viewport({
      screenWidth: app.screen.width,
      screenHeight: app.screen.height,
      events: app.renderer.events,
      passiveWheel: false,
      disableOnContextMenu: true,
      ticker: app.ticker,
    });
    viewport
      .drag({ mouseButtons: 'left-middle', wheel: false })
      .pinch()
      .wheel({ smooth: this.options.reducedMotion ? false : 4 });
    if (!this.options.reducedMotion) viewport.decelerate({ friction: 0.9 });
    app.stage.addChild(viewport);
    this.viewport = viewport;

    for (const id of LAYER_IDS) {
      const layer = new Container({ label: id });
      this.layers.set(id, layer);
      viewport.addChild(layer);
    }
    this.tokens = new TokenLayer(app.renderer, this.palette, {
      toWorld: (screen) => this.requireViewport().toWorld(screen.x, screen.y),
      onMoved: (tokenId, to, alt) =>
        this.events.emit({
          type: 'token:moved',
          tokenId,
          to: this.clampToMap(to),
          tick: this.tick,
          correctPrevious: alt,
        }),
      onSelect: (tokenId, additive) => this.selectTokens([tokenId], additive, true),
      onOpen: (tokenId) => this.events.emit({ type: 'token:open', tokenId }),
      onMenu: (tokenId, screen) =>
        this.events.emit({ type: 'token:menu', tokenId, anchor: this.toClient(screen) }),
    });
    this.layer('tokens').addChild(this.tokens.container);
    this.layer('labels').addChild(this.tokens.labels);
    this.trails = new TrailLayer(this.palette, {
      toWorld: (screen) => this.requireViewport().toWorld(screen.x, screen.y),
      onMoved: (keyframeId, to) =>
        this.events.emit({ type: 'keyframe:moved', keyframeId, to: this.clampToMap(to) }),
      onPicked: (keyframeId, tick) =>
        this.events.emit({ type: 'keyframe:picked', keyframeId, tick }),
    });
    this.layer('routes').addChild(this.trails.container);
    const tokens = this.tokens;
    this.eventMarkers = new EventLayer(this.palette, this.options.reducedMotion, {
      locationOf: (entityId) => tokens.positionOfEntity(entityId),
      onOpen: (eventId) => this.events.emit({ type: 'event:open', eventId }),
      onHover: (eventId, at) => {
        const anchor = at ? this.toClient(at) : { x: 0, y: 0 };
        this.events.emit({ type: 'event:hover', eventId, anchor });
      },
    });
    this.layer('tokens').addChild(this.eventMarkers.container);
    app.ticker.add((ticker) => this.eventMarkers?.animate(ticker.deltaMS));
    this.links = new LinkLayer(this.palette, (link) =>
      this.events.emit({ type: 'link:open', linkId: link.id, targetMapId: link.targetMapId }),
    );
    this.layer('regions').addChild(this.links.regions);
    this.layer('labels').addChild(this.links.lenses);
    this.annotations = new AnnotationLayer(this.palette, {
      toWorld: (screen) => this.requireViewport().toWorld(screen.x, screen.y),
      onPicked: (id, screen) =>
        this.events.emit({ type: 'annotation:picked', id, anchor: this.toClient(screen) }),
      onMoved: (id, shape) =>
        this.events.emit({
          type: 'annotation:changed',
          id,
          shape:
            shape.kind === 'pin' || shape.kind === 'label'
              ? { ...shape, at: this.clampToMap(shape.at) }
              : shape,
        }),
    });
    // Regiões e traços abaixo dos links; pinos, rótulos e medições abaixo das lupas.
    this.layer('regions').addChildAt(this.annotations.shapes, 0);
    this.layer('labels').addChildAt(this.annotations.marks, 0);
    this.overlay = new ToolOverlay(this.palette);
    this.layer('overlay').addChild(this.overlay.view);

    viewport.on('moved', () => this.keepMapInView());
    viewport.on('zoomed', () => this.onZoom());
    viewport.on('moved-end', () => this.emitCamera());
    viewport.on('zoomed-end', () => this.emitCamera());
    viewport.on('clicked', (event: ClickedEvent) => this.onClick(event));
    viewport.on('pointermove', (event: FederatedPointerEvent) => this.onPointerMove(event));
    viewport.on('pointerdown', (event: FederatedPointerEvent) => this.onPointerDown(event));
    viewport.on('pointerup', (event: FederatedPointerEvent) => this.onPointerUp(event));
    viewport.on('pointerupoutside', (event: FederatedPointerEvent) => this.onPointerUp(event));
    app.renderer.on('resize', (width: number, height: number) => {
      viewport.resize(width, height);
      this.updateZoomLimits();
    });
    this.setTool(this.tool);
  }

  destroy(): void {
    this.destroyed = true;
    this.events.clear();
    this.tokens?.destroy();
    this.trails?.destroy();
    this.eventMarkers?.destroy();
    this.links?.destroy();
    this.annotations?.destroy();
    this.destroyBackground();
    // O viewport sai antes da aplicação: destruída primeiro, ela leva o ticker junto e o
    // viewport quebra ao tentar se desligar dele.
    if (this.viewport) {
      this.viewport.removeFromParent();
      this.viewport.destroy({ children: true });
    }
    this.app?.destroy(true, { children: true });
    this.app = null;
    this.viewport = null;
    this.layers.clear();
  }

  async loadScene(scene: MapScene, image: MapImageSource | null): Promise<void> {
    const viewport = this.requireViewport();
    this.scene = scene;
    this.map = scene.map;
    this.clearDrafts();

    const bitmap = typeof image === 'string' ? await loadBitmap(image) : image;
    if (this.destroyed || this.scene !== scene) {
      bitmap?.close();
      return;
    }
    this.destroyBackground();
    if (bitmap) {
      const source = new ImageSource({
        resource: bitmap,
        autoGenerateMipmaps: true,
        scaleMode: 'linear',
      });
      this.background = new Sprite({ texture: new Texture({ source }), label: 'map-image' });
      // Reduzida (ou trocada) desde o registro: estica para as dimensões do mapa.
      this.background.setSize(scene.map.width, scene.map.height);
      this.layer('background').addChild(this.background);
    }
    viewport.resize(viewport.screenWidth, viewport.screenHeight, scene.map.width, scene.map.height);
    this.links?.setLinks(scene.links);
    this.annotations?.setAnnotations(scene.annotations);
    this.setTokens(scene.tokens, scene.keyframes);
    this.updateZoomLimits();
    this.fitToMap(false);
  }

  applyPatch(patch: ScenePatch): void {
    // Os eventos são do mundo, não da cena: valem antes e depois de trocar de mapa.
    if (patch.type === 'events') {
      this.eventMarkers?.setEvents(patch.events, patch.window);
      return;
    }
    if (patch.type === 'looks') {
      this.tokens?.setLooks(patch.looks);
      return;
    }
    if (!this.scene) return;
    switch (patch.type) {
      case 'links':
        this.scene = { ...this.scene, links: patch.links };
        this.links?.setLinks(patch.links);
        break;
      case 'tokens':
        this.scene = { ...this.scene, tokens: patch.tokens, keyframes: patch.keyframes };
        this.setTokens(patch.tokens, patch.keyframes);
        break;
      case 'annotations':
        this.scene = { ...this.scene, annotations: patch.annotations };
        this.annotations?.setAnnotations(patch.annotations);
        break;
    }
  }

  setTime(tick: Tick): void {
    this.tick = tick;
    this.tokens?.setTime(tick);
    this.annotations?.setTime(tick);
    // Depois dos tokens: o marcador pode estar no token do local.
    this.eventMarkers?.setTime(tick);
  }

  setTool(tool: ToolId): void {
    if (tool !== this.tool) this.cancelTool();
    this.tool = tool;
    const drawing = DRAWING_TOOLS.includes(tool);
    this.links?.setInteractive(!drawing);
    this.annotations?.setInteractive(!drawing);
    this.eventMarkers?.setInteractive(!drawing);
    this.tokens?.setInteractive(!drawing);
    this.trails?.setInteractive(!drawing);
    if (this.viewport) {
      this.viewport.cursor = drawing ? 'crosshair' : tool === 'pan' ? 'grab' : 'default';
      // Em Selecionar, o botão esquerdo desenha o retângulo de seleção; no pincel e na
      // borracha, desenha e apaga. O do meio continua movendo o mapa.
      const leftDraws = tool === 'select' || tool === 'brush' || tool === 'eraser';
      const buttons = leftDraws ? 'middle' : 'left-middle';
      this.viewport.drag({ mouseButtons: buttons, wheel: false });
    }
  }

  commitTool(): void {
    // Teclado: Enter marca no centro da área visível.
    const center = this.clampToMap(this.camera.center);
    switch (this.tool) {
      case 'place':
        this.events.emit({ type: 'point:picked', point: center });
        break;
      case 'pin':
      case 'label':
        this.createMark(center);
        break;
      case 'link':
        this.closePolygon();
        break;
      case 'region':
        this.closeRegion();
        break;
    }
  }

  cancelTool(): void {
    this.annotations?.restoreErased();
    this.clearDrafts();
    this.emitProgress();
  }

  setDrawStyle(style: BrushStyle): void {
    this.drawStyle = style;
  }

  setActiveAnnotation(id: Uuid | null): void {
    this.annotations?.setActive(id);
  }

  setDistanceFormat(format: ((pixels: number) => string) | null): void {
    this.annotations?.setFormat(format);
  }

  setSelection(ids: Uuid[]): void {
    this.selection = ids;
    this.tokens?.setSelection(ids);
  }

  previewDrop(drop: { entityId: Uuid; clientX: number; clientY: number } | null): void {
    if (!this.viewport || !this.map) return;
    const at = drop ? this.clampToMap(this.screenToWorld(drop.clientX, drop.clientY)) : null;
    this.tokens?.previewDrop(drop && at ? { entityId: drop.entityId, at } : null);
  }

  setTrails(tokenIds: Uuid[]): void {
    this.trails?.setShown(tokenIds);
  }

  tokenPosition(tokenId: Uuid): Point | null {
    return this.tokens?.positionOf(tokenId) ?? null;
  }

  setLayerVisible(layer: LayerId, visible: boolean): void {
    const container = this.layers.get(layer);
    if (container) container.visible = visible;
  }

  setInsets(insets: ViewportInsets): void {
    this.insets = insets;
    this.updateZoomLimits();
  }

  screenToWorld(clientX: number, clientY: number): Point {
    const rect = this.host?.getBoundingClientRect();
    const p = this.requireViewport().toWorld(
      clientX - (rect?.left ?? 0),
      clientY - (rect?.top ?? 0),
    );
    return { x: p.x, y: p.y };
  }

  worldToScreen(point: Point): Point {
    const rect = this.host?.getBoundingClientRect();
    const p = this.requireViewport().toScreen(point.x, point.y);
    return { x: p.x + (rect?.left ?? 0), y: p.y + (rect?.top ?? 0) };
  }

  get camera(): Camera {
    const viewport = this.viewport;
    if (!viewport) return { center: { x: 0, y: 0 }, zoom: 1 };
    const zoom = viewport.scale.x;
    return { center: focusFor(viewport.center, zoom, this.insets), zoom };
  }

  focus(target: { tokenId?: Uuid; point?: Point; zoom?: number }, animate = true): void {
    const viewport = this.viewport;
    if (!viewport) return;
    const tokenPoint = target.tokenId ? this.tokens?.positionOf(target.tokenId) : null;
    const point = target.point ?? tokenPoint ?? this.camera.center;
    const zoom = clampZoom(target.zoom ?? viewport.scale.x, this.limits());
    const center = screenCenterFor(point, zoom, this.insets);
    if (animate && !this.options.reducedMotion) {
      viewport.animate({
        position: center,
        scale: zoom,
        time: CAMERA_ANIMATION_MS,
        ease: 'easeOutQuad',
        removeOnInterrupt: true,
        callbackOnComplete: () => this.emitCamera(),
      });
      return;
    }
    viewport.setZoom(zoom, false);
    viewport.moveCenter(center.x, center.y);
    this.onZoom();
    this.emitCamera();
  }

  fitToMap(animate = true): void {
    if (!this.map || !this.viewport) return;
    const camera = fitCamera(this.map, this.screenSize(), this.insets);
    this.focus({ point: camera.center, zoom: camera.zoom }, animate);
  }

  zoomBy(factor: number): void {
    const camera = this.camera;
    this.focus({ point: camera.center, zoom: camera.zoom * factor }, true);
  }

  panBy(dx: number, dy: number): void {
    const camera = this.camera;
    this.focus(
      { point: { x: camera.center.x + dx / camera.zoom, y: camera.center.y + dy / camera.zoom } },
      false,
    );
  }

  private onClick(event: ClickedEvent): void {
    const world = { x: event.world.x, y: event.world.y };
    const isDouble = this.clicks.click({ x: event.screen.x, y: event.screen.y }, performance.now());
    if (this.tool === 'place') {
      this.events.emit({ type: 'point:picked', point: this.clampToMap(world) });
      return;
    }
    if (this.tool === 'calibrate') {
      const measure = this.calibration.add(world);
      this.overlay?.show(this.calibration.vertices, false);
      this.emitProgress();
      if (measure) this.events.emit({ type: 'measure', ...measure });
      return;
    }
    if (this.tool === 'link') {
      const tolerance = CLOSE_POLYGON_SLOP / this.camera.zoom;
      if (isDouble || this.polygon.isNearStart(world, tolerance)) {
        this.closePolygon();
        return;
      }
      this.polygon.add(world);
      this.overlay?.show(this.polygon.vertices, true);
      this.emitProgress();
      return;
    }
    if (this.tool === 'region') {
      const tolerance = CLOSE_POLYGON_SLOP / this.camera.zoom;
      if (isDouble || this.region.isNearStart(world, tolerance)) {
        this.closeRegion();
        return;
      }
      this.region.add(this.clampToMap(world));
      this.overlay?.show(this.region.vertices, true, this.drawStyle.color);
      this.emitProgress();
      return;
    }
    if (this.tool === 'pin' || this.tool === 'label') {
      this.createMark(this.clampToMap(world));
      return;
    }
    if (this.tool === 'measure') {
      this.ruler.push(this.clampToMap(world));
      this.overlay?.showRuler(this.ruler);
      this.emitProgress();
      this.events.emit({
        type: 'measure',
        points: [...this.ruler],
        distance: polylineLength(this.ruler),
      });
      return;
    }
    if (this.tool === 'brush' || this.tool === 'eraser') return;
    if (this.tool === 'select' && !isDouble) {
      const id = this.annotations?.shapeAt(world);
      if (id) {
        this.events.emit({
          type: 'annotation:picked',
          id,
          anchor: this.toClient({ x: event.screen.x, y: event.screen.y }),
        });
        return;
      }
    }
    if (isDouble) {
      const link = this.scene?.links.find((l) => pointInPolygon(world, l.polygon));
      if (link)
        this.events.emit({ type: 'link:open', linkId: link.id, targetMapId: link.targetMapId });
      return;
    }
    // Clique no fundo (fora dos tokens) limpa a seleção.
    if (this.selection.length > 0) this.selectTokens([], false, false);
  }

  /** Seleção pedida pelo usuário; o app decide e devolve com `setSelection`. */
  private selectTokens(ids: Uuid[], additive: boolean, toggle: boolean): void {
    let next = ids;
    if (additive) {
      const current = new Set(this.selection);
      for (const id of ids) {
        if (toggle && current.has(id)) current.delete(id);
        else current.add(id);
      }
      next = [...current];
    }
    this.events.emit({ type: 'token:selected', ids: next });
  }

  /** Selecionar: o botão esquerdo no fundo começa o retângulo de seleção. */
  private onPointerDown(event: FederatedPointerEvent): void {
    if (event.button !== 0) return;
    const p = this.requireViewport().toWorld(event.global.x, event.global.y);
    const world = { x: p.x, y: p.y };
    if (this.tool === 'brush') {
      this.stroke = [this.clampToMap(world)];
      this.overlay?.showStroke(this.stroke, this.drawStyle);
      return;
    }
    if (this.tool === 'eraser') {
      this.eraser = world;
      this.annotations?.eraseAlong(world, world, ERASER_RADIUS / this.camera.zoom);
      return;
    }
    if (this.tool !== 'select') return;
    this.marquee = { start: world, additive: event.shiftKey };
  }

  private onPointerUp(event: FederatedPointerEvent): void {
    if (this.stroke) {
      this.finishStroke();
      return;
    }
    if (this.eraser) {
      this.eraser = null;
      const ids = this.annotations?.takeErased() ?? [];
      if (ids.length > 0) this.events.emit({ type: 'annotation:erased', ids });
      return;
    }
    const marquee = this.marquee;
    if (!marquee) return;
    this.marquee = null;
    this.overlay?.clear();
    const p = this.requireViewport().toWorld(event.global.x, event.global.y);
    const end = { x: p.x, y: p.y };
    const size = Math.hypot(end.x - marquee.start.x, end.y - marquee.start.y) * this.camera.zoom;
    // Um clique sem arrastar fica com o `clicked` (limpa a seleção).
    if (size < 4) return;
    this.selectTokens(this.tokens?.tokensIn(marquee.start, end) ?? [], marquee.additive, false);
  }

  private onPointerMove(event: FederatedPointerEvent): void {
    if (this.tool === 'brush' && this.stroke) {
      const p = this.requireViewport().toWorld(event.global.x, event.global.y);
      this.stroke.push(this.clampToMap({ x: p.x, y: p.y }));
      this.overlay?.showStroke(this.stroke, this.drawStyle);
      return;
    }
    if (this.tool === 'eraser') {
      const p = this.requireViewport().toWorld(event.global.x, event.global.y);
      const world = { x: p.x, y: p.y };
      this.overlay?.showEraser(world, ERASER_RADIUS);
      if (this.eraser) {
        this.annotations?.eraseAlong(this.eraser, world, ERASER_RADIUS / this.camera.zoom);
        this.eraser = world;
      }
      return;
    }
    if (this.marquee) {
      const p = this.requireViewport().toWorld(event.global.x, event.global.y);
      const a = this.marquee.start;
      const corners = [a, { x: p.x, y: a.y }, { x: p.x, y: p.y }, { x: a.x, y: p.y }];
      this.overlay?.show(corners, true);
      return;
    }
    const drafts: Partial<Record<ToolId, readonly Point[]>> = {
      link: this.polygon.vertices,
      region: this.region.vertices,
      calibrate: this.calibration.vertices,
      measure: this.ruler,
    };
    const drafting = drafts[this.tool];
    if (!drafting) return;
    const p = this.requireViewport().toWorld(event.global.x, event.global.y);
    const done = this.tool === 'calibrate' && drafting.length === 2;
    this.overlay?.setHover(drafting.length > 0 && !done ? { x: p.x, y: p.y } : null);
  }

  /** Pino ou rótulo no ponto, com a cor escolhida. */
  private createMark(at: Point): void {
    const color = this.drawStyle.color;
    this.events.emit({
      type: 'annotation:created',
      draft:
        this.tool === 'pin'
          ? { kind: 'pin', at, color, icon: PIN_ICONS[0] }
          : { kind: 'label', at, color: DEFAULT_LABEL_COLOR, size: 'md' },
    });
  }

  /** Fim do traço: a espessura escolhida (px de tela) vira px do mapa no zoom atual. */
  private finishStroke(): void {
    const zoom = this.camera.zoom;
    const points = simplifyStroke(this.stroke ?? [], BRUSH_SAMPLE / zoom);
    this.stroke = null;
    this.overlay?.clear();
    if (points.length === 0) return;
    const { color, width, opacity, dashed } = this.drawStyle;
    this.events.emit({
      type: 'annotation:created',
      draft: { kind: 'stroke', points, color, width: width / zoom, opacity, dashed },
    });
  }

  private closeRegion(): void {
    const polygon = this.region.close();
    this.overlay?.clear();
    this.clicks.reset();
    this.emitProgress();
    if (!polygon) return;
    this.events.emit({
      type: 'annotation:created',
      draft: {
        kind: 'region',
        polygon,
        color: this.drawStyle.color,
        opacity: DEFAULT_REGION_OPACITY,
      },
    });
  }

  private clearDrafts(): void {
    this.marquee = null;
    this.calibration.clear();
    this.polygon.clear();
    this.region.clear();
    this.ruler = [];
    this.stroke = null;
    this.eraser = null;
    this.overlay?.clear();
    this.clicks.reset();
  }

  private closePolygon(): void {
    const polygon = this.polygon.close();
    this.overlay?.clear();
    this.clicks.reset();
    this.emitProgress();
    if (polygon) this.events.emit({ type: 'region:drawn', polygon });
  }

  private emitProgress(): void {
    const counts: Partial<Record<ToolId, number>> = {
      link: this.polygon.vertices.length,
      region: this.region.vertices.length,
      calibrate: this.calibration.vertices.length,
      measure: this.ruler.length,
    };
    const points = counts[this.tool] ?? 0;
    this.events.emit({ type: 'tool:progress', tool: this.tool, points });
  }

  /** Separa tokens de entidade (camada de tokens) e de evento (marcadores). */
  private setTokens(tokens: readonly MapToken[], keyframes: readonly TokenKeyframe[]): void {
    const entityTokens = tokens.filter((token) => token.entityId !== null);
    const eventTokens = tokens.filter((token) => token.eventId !== null);
    this.tokens?.setTokens(entityTokens, keyframes);
    this.trails?.setTokens(entityTokens, keyframes);
    this.eventMarkers?.setTokens(eventTokens, keyframes);
  }

  /** Coordenadas do canvas → da janela (âncora de popovers e menus). */
  private toClient(screen: Point): Point {
    const rect = this.host?.getBoundingClientRect();
    return { x: screen.x + (rect?.left ?? 0), y: screen.y + (rect?.top ?? 0) };
  }

  private clampToMap(point: Point): Point {
    const map = this.map;
    if (!map) return point;
    return {
      x: Math.min(map.width, Math.max(0, point.x)),
      y: Math.min(map.height, Math.max(0, point.y)),
    };
  }

  private onZoom(): void {
    const zoom = this.viewport?.scale.x ?? 1;
    this.tokens?.setZoom(zoom);
    this.trails?.setZoom(zoom);
    this.eventMarkers?.setZoom(zoom);
    this.links?.setZoom(zoom);
    this.annotations?.setZoom(zoom);
    this.overlay?.setZoom(zoom);
    this.keepMapInView();
  }

  /** O ponto no meio da área visível nunca sai do mapa: dá para arrastar até a borda. */
  private keepMapInView(): void {
    const viewport = this.viewport;
    if (!viewport || !this.map) return;
    const zoom = viewport.scale.x;
    const focus = focusFor(viewport.center, zoom, this.insets);
    const clamped = {
      x: Math.min(this.map.width, Math.max(0, focus.x)),
      y: Math.min(this.map.height, Math.max(0, focus.y)),
    };
    if (clamped.x === focus.x && clamped.y === focus.y) return;
    const center = screenCenterFor(clamped, zoom, this.insets);
    viewport.moveCenter(center.x, center.y);
  }

  private emitCamera(): void {
    if (!this.map) return;
    const { center, zoom } = this.camera;
    this.events.emit({ type: 'camera', center, zoom });
  }

  private updateZoomLimits(): void {
    if (!this.viewport || !this.map) return;
    const { min, max } = this.limits();
    this.viewport.clampZoom({ minScale: min, maxScale: max });
  }

  private limits(): { min: number; max: number } {
    if (!this.map) return { min: 0.01, max: 8 };
    return zoomLimits(this.map, this.screenSize(), this.insets);
  }

  private screenSize(): Size {
    const viewport = this.requireViewport();
    return { width: viewport.screenWidth, height: viewport.screenHeight };
  }

  private layer(id: LayerId): Container {
    const layer = this.layers.get(id);
    if (!layer) throw new Error(`camada ${id} não montada`);
    return layer;
  }

  private requireViewport(): Viewport {
    if (!this.viewport) throw new Error('MapEngine.mount() ainda não terminou');
    return this.viewport;
  }

  private destroyBackground(): void {
    if (!this.background) return;
    const source = this.background.texture.source;
    const resource: unknown = source.resource;
    this.background.destroy({ texture: true, textureSource: true });
    if (resource instanceof ImageBitmap) resource.close();
    this.background = null;
  }
}
