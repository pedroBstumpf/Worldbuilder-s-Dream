import type { Point } from '@domain/geometry';
import type { AnnotationShape, BrushStyle } from '@domain/maps';
import type {
  MapAnnotation,
  EntityKind,
  MapLink,
  MapToken,
  PolygonVertex,
  Tick,
  TokenKeyframe,
  Uuid,
} from '@domain/models';
import type { MapScene } from '@domain/ports';

/**
 * Fachada pública do motor do mapa (docs/06 §1). O resto do app só conhece esta
 * interface; a implementação com PixiJS fica em `render/` e não conhece Angular.
 */

/**
 * Ferramentas (docs/06 §5): as do M1 (`select`, `pan`, `calibrate`, `link`), `place` (M3:
 * um clique escolhe um ponto, como o lugar de um evento) e as de anotação do M5.
 */
export type ToolId =
  | 'select'
  | 'pan'
  | 'pin'
  | 'brush'
  | 'eraser'
  | 'measure'
  | 'region'
  | 'label'
  | 'calibrate'
  | 'link'
  | 'place';
export const TOOL_IDS: readonly ToolId[] = [
  'select',
  'pan',
  'pin',
  'brush',
  'eraser',
  'measure',
  'region',
  'label',
  'calibrate',
  'link',
  'place',
];

/** Ferramentas em que o clique desenha ou marca (tokens, links e eventos não respondem). */
export const DRAWING_TOOLS: readonly ToolId[] = [
  'pin',
  'brush',
  'eraser',
  'measure',
  'region',
  'label',
  'calibrate',
  'link',
  'place',
];

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

/** Evento da linha do tempo, como o motor precisa para o marcador (docs/06 §4). */
export interface EventMarkerInput {
  id: Uuid;
  title: string;
  tickStart: Tick;
  tickEnd: Tick | null;
  /** Cor do marcador; `null` = ouro. */
  color: string | null;
  /** Sem token do evento no mapa, o marcador fica no token deste local (se houver). */
  locationEntityId: Uuid | null;
}

/** Aparência do token de uma entidade (docs/05 › Token de personagem). */
export interface TokenLook {
  entityId: Uuid;
  name: string;
  kind: EntityKind;
  /** Cor do anel; `null` = a cor padrão do tipo. */
  color: string | null;
  /** URL do retrato já resolvida; sem ela, inicial (personagem) ou ícone do tipo. */
  portraitUrl: string | null;
}

/** Mudanças incrementais vindas das stores. */
export type ScenePatch =
  | { type: 'links'; links: MapLink[] }
  | { type: 'tokens'; tokens: MapToken[]; keyframes: TokenKeyframe[] }
  /** `window`: quanto um evento pontual continua visível depois do início (em ticks). */
  | { type: 'events'; events: EventMarkerInput[]; window: Tick }
  /** Aparência das entidades do mundo; vale para todos os mapas, como os eventos. */
  | { type: 'looks'; looks: TokenLook[] }
  /** Pinos, traços, regiões, rótulos e medições do mapa (docs/06 §5). */
  | { type: 'annotations'; annotations: MapAnnotation[] };

export type EngineEvent =
  /** Fim do arraste de um token; `correctPrevious` (Alt) corrige o keyframe em vigor. */
  | { type: 'token:moved'; tokenId: Uuid; to: Point; tick: Tick; correctPrevious: boolean }
  /** A seleção pedida pelo usuário (clique, Shift, retângulo, clique no fundo). */
  | { type: 'token:selected'; ids: Uuid[] }
  /** Duplo clique no token. */
  | { type: 'token:open'; tokenId: Uuid }
  /** Botão direito no token; `anchor` em coordenadas da janela. */
  | { type: 'token:menu'; tokenId: Uuid; anchor: Point }
  /** Fim do arraste de um losango do rastro. */
  | { type: 'keyframe:moved'; keyframeId: Uuid; to: Point }
  /** Clique num losango do rastro. */
  | { type: 'keyframe:picked'; keyframeId: Uuid; tick: Tick }
  /** Escala (dois pontos) ou régua (a cada clique, com o total). */
  | { type: 'measure'; points: Point[]; distance: number }
  /** Pino, rótulo, traço ou região desenhados (a medição é fixada pela tela). */
  | { type: 'annotation:created'; draft: AnnotationShape }
  /** Pino ou rótulo arrastado: a forma com o novo ponto. */
  | { type: 'annotation:changed'; id: Uuid; shape: AnnotationShape }
  /** Fim de uma passada da borracha: os traços que ela tocou. */
  | { type: 'annotation:erased'; ids: Uuid[] }
  /** Clique numa anotação (abre o editor); `anchor` em coordenadas da janela. */
  | { type: 'annotation:picked'; id: Uuid; anchor: Point }
  | { type: 'camera'; center: Point; zoom: number }
  /** Duplo clique (ou clique na lupa) numa região de link. */
  | { type: 'link:open'; linkId: Uuid; targetMapId: Uuid }
  /** A ferramenta de link fechou um polígono. */
  | { type: 'region:drawn'; polygon: PolygonVertex[] }
  /** Quantos pontos a ferramenta ativa já tem (para as instruções na tela). */
  | { type: 'tool:progress'; tool: ToolId; points: number }
  /** A ferramenta `place` escolheu um ponto (clique, ou Enter no centro da área visível). */
  | { type: 'point:picked'; point: Point }
  /** Clique num marcador de evento. */
  | { type: 'event:open'; eventId: Uuid }
  /** Ponteiro sobre um marcador (`eventId` nulo ao sair); `anchor` em coordenadas da janela. */
  | { type: 'event:hover'; eventId: Uuid | null; anchor: Point };

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
  /**
   * Arraste de uma entidade do Explorar sobre o mapa (docs/06 §6): mostra o fantasma do
   * token no ponteiro e destaca o token que ela já tem neste mapa. `null` encerra.
   */
  previewDrop(drop: { entityId: Uuid; clientX: number; clientY: number } | null): void;
  /** Tokens com o rastro de movimento à mostra (selecionados e "Mostrar caminho"). */
  setTrails(tokenIds: Uuid[]): void;
  /** Posição atual do token no mapa (`null` se oculto ou ausente). */
  tokenPosition(tokenId: Uuid): Point | null;
  /** Cor, espessura, opacidade e tracejado das próximas anotações. */
  setDrawStyle(style: BrushStyle): void;
  /** Anotação aberta no editor (destacada); `null` nenhuma. */
  setActiveAnnotation(id: Uuid | null): void;
  /** Texto das medições fixadas (na unidade do mapa); `null` = em px. */
  setDistanceFormat(format: ((pixels: number) => string) | null): void;

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
