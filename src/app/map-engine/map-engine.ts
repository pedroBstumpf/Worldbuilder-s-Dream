import type { Point } from '@domain/geometry';
import type { MapLink, MapToken, PolygonVertex, Tick, TokenKeyframe, Uuid } from '@domain/models';
import type { MapScene } from '@domain/ports';

/**
 * Fachada pública do motor do mapa (docs/06 §1). O resto do app só conhece esta
 * interface; a implementação com PixiJS fica em `render/` e não conhece Angular.
 */

/** Ferramentas do M1; as de desenho (pino, régua, pincel…) chegam no M5. */
export type ToolId = 'select' | 'pan' | 'calibrate' | 'link';
export const TOOL_IDS: readonly ToolId[] = ['select', 'pan', 'calibrate', 'link'];

/** Camadas na ordem de desenho (docs/06 › Camadas). */
export type LayerId = 'background' | 'regions' | 'routes' | 'tokens' | 'labels' | 'overlay';
export const LAYER_IDS: readonly LayerId[] = [
  'background',
  'regions',
  'routes',
  'tokens',
  'labels',
  'overlay',
];

/** Imagem do mapa: o bitmap recém-importado (o motor passa a ser dono dele) ou uma URL. */
export type MapImageSource = ImageBitmap | string;

/** Câmera: centro em coordenadas do mapa e zoom (pixels de tela por pixel do mapa). */
export interface Camera {
  center: Point;
  zoom: number;
}

/** Áreas da tela cobertas pelas barras, para enquadrar o mapa na parte visível. */
export interface ViewportInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Mudanças incrementais vindas das stores. */
export type ScenePatch =
  | { type: 'links'; links: MapLink[] }
  | { type: 'tokens'; tokens: MapToken[]; keyframes: TokenKeyframe[] };

export type EngineEvent =
  | { type: 'token:moved'; tokenId: Uuid; to: Point; tick: Tick }
  | { type: 'token:selected'; ids: Uuid[] }
  | { type: 'token:open'; tokenId: Uuid }
  | { type: 'measure'; points: Point[]; distance: number }
  | { type: 'camera'; center: Point; zoom: number }
  /** Duplo clique (ou clique na lupa) numa região de link. */
  | { type: 'link:open'; linkId: Uuid; targetMapId: Uuid }
  /** A ferramenta de link fechou um polígono. */
  | { type: 'region:drawn'; polygon: PolygonVertex[] }
  /** Quantos pontos a ferramenta ativa já tem (para as instruções na tela). */
  | { type: 'tool:progress'; tool: ToolId; points: number };

export type EngineEventType = EngineEvent['type'];
export type EngineEventOf<T extends EngineEventType> = Extract<EngineEvent, { type: T }>;

/** Barramento de eventos tipados do motor. */
export class EngineEventBus {
  private readonly listeners = new Set<(event: EngineEvent) => void>();

  /** Escuta todos os eventos. Devolve a função que cancela a inscrição. */
  subscribe(listener: (event: EngineEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Escuta um tipo de evento. */
  on<T extends EngineEventType>(type: T, listener: (event: EngineEventOf<T>) => void): () => void {
    return this.subscribe((event) => {
      if (event.type === type) listener(event as EngineEventOf<T>);
    });
  }

  emit(event: EngineEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }

  clear(): void {
    this.listeners.clear();
  }
}

export interface MapEngineOptions {
  /** `prefers-reduced-motion`: sem desaceleração nem zoom animado. */
  reducedMotion: boolean;
}

export interface MapEngine {
  mount(host: HTMLElement): Promise<void>;
  destroy(): void;

  /** Imagem, escala, tokens, keyframes, anotações e links. A câmera enquadra o mapa. */
  loadScene(scene: MapScene, image: MapImageSource | null): Promise<void>;
  /** Mudanças incrementais vindas da store. */
  applyPatch(patch: ScenePatch): void;

  setTime(tick: Tick): void;
  setTool(tool: ToolId): void;
  /** Enter: fecha o polígono em desenho. */
  commitTool(): void;
  /** Esc: descarta o desenho em curso. */
  cancelTool(): void;
  setSelection(ids: Uuid[]): void;
  setLayerVisible(layer: LayerId, visible: boolean): void;
  setInsets(insets: ViewportInsets): void;

  screenToWorld(clientX: number, clientY: number): Point;
  worldToScreen(p: Point): Point;
  focus(target: { tokenId?: Uuid; point?: Point; zoom?: number }, animate?: boolean): void;
  fitToMap(animate?: boolean): void;
  /** Zoom em torno do centro da área visível (botões e teclado). */
  zoomBy(factor: number): void;
  /** Desloca a câmera em pixels de tela (setas do teclado). */
  panBy(dx: number, dy: number): void;
  readonly camera: Camera;

  readonly events: EngineEventBus;
}

/**
 * Cria o motor. Assíncrona para o PixiJS ficar num chunk próprio (carregado sob demanda);
 * o canvas recebe a fábrica por injeção e os testes a trocam por um motor falso.
 */
export type MapEngineFactory = (options: MapEngineOptions) => Promise<MapEngine>;
