import type { Point } from '@domain/geometry';
import type { BrushStyle } from '@domain/maps';
import type { Tick, Uuid } from '@domain/models';
import type { MapScene } from '@domain/ports';
import { evaluateKeyframes, sortKeyframes } from '@domain/timeline';
import {
  EngineEventBus,
  type Camera,
  type LayerId,
  type MapEngine,
  type MapEngineFactory,
  type MapImageSource,
  type ScenePatch,
  type ToolId,
  type ViewportInsets,
} from '../map-engine';

/**
 * Motor falso para testes de componentes (docs/06 §9): guarda as chamadas e deixa o
 * teste emitir eventos como se viessem do canvas. Coordenadas de tela = do mundo.
 */
export class FakeMapEngine implements MapEngine {
  readonly events = new EngineEventBus();
  host: HTMLElement | null = null;
  scene: MapScene | null = null;
  image: MapImageSource | null = null;
  tick: Tick = 0;
  /** O último `setTime` pediu troca de imagem sem fade. */
  instantTime = false;
  tool: ToolId = 'pan';
  selection: Uuid[] = [];
  insets: ViewportInsets = { top: 0, right: 0, bottom: 0, left: 0 };
  readonly hiddenLayers = new Set<LayerId>();
  readonly patches: ScenePatch[] = [];
  drop: { entityId: Uuid; clientX: number; clientY: number } | null = null;
  trails: Uuid[] = [];
  drawStyle: BrushStyle | null = null;
  activeAnnotation: Uuid | null = null;
  distanceFormat: ((pixels: number) => string) | null = null;
  camera: Camera = { center: { x: 0, y: 0 }, zoom: 1 };
  fits = 0;
  committed = 0;
  cancelled = 0;
  destroyed = false;

  async mount(host: HTMLElement): Promise<void> {
    this.host = host;
  }

  destroy(): void {
    this.destroyed = true;
    this.events.clear();
  }

  async loadScene(scene: MapScene, image: MapImageSource | null): Promise<void> {
    this.scene = scene;
    this.image = image;
    this.fitToMap();
  }

  applyPatch(patch: ScenePatch): void {
    this.patches.push(patch);
  }

  setTime(tick: Tick, instant = false): void {
    this.instantTime = instant;
    this.tick = tick;
  }

  setTool(tool: ToolId): void {
    this.tool = tool;
  }

  commitTool(): void {
    this.committed += 1;
  }

  cancelTool(): void {
    this.cancelled += 1;
  }

  setSelection(ids: Uuid[]): void {
    this.selection = ids;
  }

  setLayerVisible(layer: LayerId, visible: boolean): void {
    if (visible) this.hiddenLayers.delete(layer);
    else this.hiddenLayers.add(layer);
  }

  setInsets(insets: ViewportInsets): void {
    this.insets = insets;
  }

  setTrails(tokenIds: Uuid[]): void {
    this.trails = tokenIds;
  }

  setDrawStyle(style: BrushStyle): void {
    this.drawStyle = style;
  }

  setActiveAnnotation(id: Uuid | null): void {
    this.activeAnnotation = id;
  }

  setDistanceFormat(format: ((pixels: number) => string) | null): void {
    this.distanceFormat = format;
  }

  previewDrop(drop: { entityId: Uuid; clientX: number; clientY: number } | null): void {
    this.drop = drop;
  }

  /** Avalia os keyframes da cena (ou do último patch de tokens) no instante atual. */
  tokenPosition(tokenId: Uuid): Point | null {
    const patch = [...this.patches].reverse().find((p) => p.type === 'tokens');
    const keyframes = patch?.type === 'tokens' ? patch.keyframes : (this.scene?.keyframes ?? []);
    return evaluateKeyframes(
      sortKeyframes(keyframes.filter((k) => k.tokenId === tokenId)),
      this.tick,
    );
  }

  screenToWorld(clientX: number, clientY: number): Point {
    return { x: clientX, y: clientY };
  }

  worldToScreen(p: Point): Point {
    return p;
  }

  focus(target: { point?: Point; zoom?: number }): void {
    this.camera = {
      center: target.point ?? this.camera.center,
      zoom: target.zoom ?? this.camera.zoom,
    };
  }

  fitToMap(): void {
    this.fits += 1;
    const map = this.scene?.map;
    if (map) this.camera = { center: { x: map.width / 2, y: map.height / 2 }, zoom: 1 };
  }

  zoomBy(factor: number): void {
    this.camera = { ...this.camera, zoom: this.camera.zoom * factor };
  }

  panBy(dx: number, dy: number): void {
    const { center, zoom } = this.camera;
    this.camera = { center: { x: center.x + dx / zoom, y: center.y + dy / zoom }, zoom };
  }
}

/** Fábrica que devolve sempre o mesmo motor falso (o teste o inspeciona). */
export function fakeMapEngineFactory(engine = new FakeMapEngine()): {
  engine: FakeMapEngine;
  factory: MapEngineFactory;
} {
  return { engine, factory: async () => engine };
}
