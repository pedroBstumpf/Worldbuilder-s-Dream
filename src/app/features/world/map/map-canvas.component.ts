import {
  afterNextRender,
  Component,
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
import type { Point } from '@domain/geometry';
import type { PolygonVertex, Tick, Uuid } from '@domain/models';
import type { MapScene } from '@domain/ports';
import {
  LAYER_IDS,
  type Camera,
  type LayerId,
  type MapEngine,
  type MapImageSource,
  type ToolId,
  type ViewportInsets,
} from '@engine/map-engine';
import { MAP_ENGINE_FACTORY } from './map-engine.token';

/** Passo das setas, em px de tela (Shift: passo grande). */
const PAN_STEP = 80;
const ZOOM_STEP = 1.25;

export interface CameraChange {
  mapId: Uuid;
  camera: Camera;
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
    ></div>
    <p id="wd-map-instructions" class="sr-only">{{ text.instructions }}</p>
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

  readonly cameraChange = output<CameraChange>();
  readonly measure = output<{ points: Point[]; distance: number }>();
  readonly regionDrawn = output<PolygonVertex[]>();
  readonly openMap = output<Uuid>();
  readonly toolProgress = output<number>();
  readonly loadFailed = output();

  protected readonly text = MAP_STRINGS.canvas;
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private readonly factory = inject(MAP_ENGINE_FACTORY);
  private readonly engine = signal<MapEngine | null>(null);
  private loaded: { mapId: Uuid; image: MapImageSource | null } | null = null;

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

  focusMap(): void {
    this.host().nativeElement.focus({ preventScroll: true });
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
