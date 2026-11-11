import type { Point } from '@domain/geometry';
import type { Tick, Uuid } from '@domain/models';
import type { MapScene } from '@domain/ports';
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
  tool: ToolId = 'pan';
  selection: Uuid[] = [];
  insets: ViewportInsets = { top: 0, right: 0, bottom: 0, left: 0 };
  readonly hiddenLayers = new Set<LayerId>();
  readonly patches: ScenePatch[] = [];
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

  setTime(tick: Tick): void {
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
