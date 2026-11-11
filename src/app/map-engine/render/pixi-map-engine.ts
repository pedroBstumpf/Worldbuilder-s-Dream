import { pointInPolygon, type Point } from '@domain/geometry';
import type { Tick, Uuid, WorldMap } from '@domain/models';
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
import { LinkLayer } from '../layers/link-layer';
import { TokenLayer } from '../layers/token-layer';
import {
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
  private links: LinkLayer | null = null;
  private overlay: ToolOverlay | null = null;

  private map: WorldMap | null = null;
  private scene: MapScene | null = null;
  private tool: ToolId = 'pan';
  private insets: ViewportInsets = NO_INSETS;
  private readonly clicks = new ClickTracker();
  private readonly calibration = new CalibrationDraft();
  private readonly polygon = new PolygonDraft();
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
    this.tokens = new TokenLayer(app.renderer, this.palette);
    this.layer('tokens').addChild(this.tokens.container);
    this.links = new LinkLayer(this.palette, (link) =>
      this.events.emit({ type: 'link:open', linkId: link.id, targetMapId: link.targetMapId }),
    );
    this.layer('regions').addChild(this.links.regions);
    this.layer('labels').addChild(this.links.lenses);
    this.overlay = new ToolOverlay(this.palette);
    this.layer('overlay').addChild(this.overlay.graphics);

    viewport.on('moved', () => this.keepMapInView());
    viewport.on('zoomed', () => this.onZoom());
    viewport.on('moved-end', () => this.emitCamera());
    viewport.on('zoomed-end', () => this.emitCamera());
    viewport.on('clicked', (event: ClickedEvent) => this.onClick(event));
    viewport.on('pointermove', (event: FederatedPointerEvent) => this.onPointerMove(event));
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
    this.links?.destroy();
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
    this.polygon.clear();
    this.calibration.clear();
    this.overlay?.clear();

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
    this.tokens?.setTokens(scene.tokens, scene.keyframes);
    this.updateZoomLimits();
    this.fitToMap(false);
  }

  applyPatch(patch: ScenePatch): void {
    if (!this.scene) return;
    if (patch.type === 'links') {
      this.scene = { ...this.scene, links: patch.links };
      this.links?.setLinks(patch.links);
    } else {
      this.scene = { ...this.scene, tokens: patch.tokens, keyframes: patch.keyframes };
      this.tokens?.setTokens(patch.tokens, patch.keyframes);
    }
  }

  setTime(tick: Tick): void {
    this.tokens?.setTime(tick);
  }

  setTool(tool: ToolId): void {
    if (tool !== this.tool) this.cancelTool();
    this.tool = tool;
    const drawing = tool === 'calibrate' || tool === 'link';
    this.links?.setInteractive(!drawing);
    if (this.viewport) {
      this.viewport.cursor = drawing ? 'crosshair' : tool === 'pan' ? 'grab' : 'default';
    }
  }

  commitTool(): void {
    if (this.tool !== 'link') return;
    this.closePolygon();
  }

  cancelTool(): void {
    this.calibration.clear();
    this.polygon.clear();
    this.overlay?.clear();
    this.clicks.reset();
    this.emitProgress();
  }

  setSelection(ids: Uuid[]): void {
    this.tokens?.setSelection(ids);
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
    const point = target.point ?? this.camera.center;
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
    if (isDouble) {
      const link = this.scene?.links.find((l) => pointInPolygon(world, l.polygon));
      if (link)
        this.events.emit({ type: 'link:open', linkId: link.id, targetMapId: link.targetMapId });
    }
  }

  private onPointerMove(event: FederatedPointerEvent): void {
    if (this.tool !== 'link' && this.tool !== 'calibrate') return;
    const p = this.requireViewport().toWorld(event.global.x, event.global.y);
    const drafting = this.tool === 'link' ? this.polygon : this.calibration;
    const done = this.tool === 'calibrate' && this.calibration.vertices.length === 2;
    this.overlay?.setHover(drafting.vertices.length > 0 && !done ? { x: p.x, y: p.y } : null);
  }

  private closePolygon(): void {
    const polygon = this.polygon.close();
    this.overlay?.clear();
    this.clicks.reset();
    this.emitProgress();
    if (polygon) this.events.emit({ type: 'region:drawn', polygon });
  }

  private emitProgress(): void {
    const points =
      this.tool === 'link'
        ? this.polygon.vertices.length
        : this.tool === 'calibrate'
          ? this.calibration.vertices.length
          : 0;
    this.events.emit({ type: 'tool:progress', tool: this.tool, points });
  }

  private onZoom(): void {
    const zoom = this.viewport?.scale.x ?? 1;
    this.tokens?.setZoom(zoom);
    this.links?.setZoom(zoom);
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

/** Baixa a imagem (object URL local ou URL assinada) e decodifica fora da thread principal. */
async function loadBitmap(url: string): Promise<ImageBitmap> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`imagem do mapa indisponível (${response.status})`);
  return createImageBitmap(await response.blob());
}
