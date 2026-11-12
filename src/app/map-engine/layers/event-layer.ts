import type { Point } from '@domain/geometry';
import type { MapToken, Tick, TokenKeyframe, Uuid } from '@domain/models';
import { isEventActive } from '@domain/timeline';
import { Container, Graphics, type FederatedPointerEvent } from 'pixi.js';
import type { EventMarkerInput } from '../map-engine';
import type { EnginePalette } from '../render/engine-palette';

/** Meia diagonal do losango, em px de tela (constante no zoom). */
const MARKER_RADIUS = 11;
/** Período do halo pulsante, em ms. */
const PULSE_MS = 1600;

interface Marker {
  event: EventMarkerInput;
  root: Container;
  halo: Graphics;
  diamond: Graphics;
}

export interface EventLayerCallbacks {
  /** Posição atual do token de uma entidade (o local do evento), se houver neste mapa. */
  locationOf(entityId: Uuid): Point | null;
  onOpen(eventId: Uuid): void;
  onHover(eventId: Uuid | null, at: Point | null): void;
}

/**
 * Marcadores de evento no mapa (docs/06 §4, docs/05 › losango dourado com halo). O evento
 * aparece durante `[início, fim]` (pontuais: mais a janela da linha do tempo), no ponto do
 * seu token neste mapa ou, sem ele, no token do local. O halo pulsa enquanto o evento
 * acontece; com movimento reduzido, fica parado.
 */
export class EventLayer {
  readonly container = new Container({ label: 'events', cullableChildren: true });
  private readonly markers = new Map<Uuid, Marker>();
  /** Ponto de cada evento com token neste mapa (o primeiro keyframe). */
  private points = new Map<Uuid, Point>();
  private window = 0;
  private tick: Tick = 0;
  private zoom = 1;
  private elapsed = 0;
  private interactive = true;

  constructor(
    private readonly palette: EnginePalette,
    private readonly reducedMotion: boolean,
    private readonly callbacks: EventLayerCallbacks,
  ) {}

  /** Tokens de evento deste mapa e seus keyframes. */
  setTokens(tokens: readonly MapToken[], keyframes: readonly TokenKeyframe[]): void {
    const firstByToken = new Map<Uuid, TokenKeyframe>();
    for (const keyframe of keyframes) {
      const first = firstByToken.get(keyframe.tokenId);
      if (!first || keyframe.tick < first.tick) firstByToken.set(keyframe.tokenId, keyframe);
    }
    this.points = new Map();
    for (const token of tokens) {
      const keyframe = firstByToken.get(token.id);
      if (token.eventId && keyframe)
        this.points.set(token.eventId, { x: keyframe.x, y: keyframe.y });
    }
    this.update();
  }

  setEvents(events: readonly EventMarkerInput[], window: Tick): void {
    this.window = window;
    for (const [id, marker] of this.markers) {
      if (!events.some((event) => event.id === id)) {
        marker.root.destroy({ children: true });
        this.markers.delete(id);
      }
    }
    for (const event of events) {
      const marker = this.markers.get(event.id);
      if (marker) {
        const recolor = marker.event.color !== event.color;
        marker.event = event;
        if (recolor) this.draw(marker);
      } else {
        this.markers.set(event.id, this.create(event));
      }
    }
    this.update();
  }

  setTime(tick: Tick): void {
    this.tick = tick;
    this.update();
  }

  setZoom(zoom: number): void {
    this.zoom = zoom;
    for (const marker of this.markers.values()) marker.root.scale.set(1 / zoom);
  }

  /** Durante as ferramentas de desenho, os marcadores não capturam o ponteiro. */
  setInteractive(interactive: boolean): void {
    this.interactive = interactive;
    for (const marker of this.markers.values()) {
      marker.root.eventMode = interactive ? 'static' : 'none';
    }
  }

  /** Avança o pulso do halo (chamado pelo ticker do Pixi). */
  animate(deltaMs: number): void {
    if (this.reducedMotion) return;
    this.elapsed = (this.elapsed + deltaMs) % PULSE_MS;
    const phase = this.elapsed / PULSE_MS;
    const scale = 1 + 0.35 * Math.sin(phase * Math.PI);
    const alpha = 0.55 * (1 - phase);
    for (const marker of this.markers.values()) {
      if (!marker.root.visible) continue;
      marker.halo.scale.set(scale);
      marker.halo.alpha = alpha;
    }
  }

  /** Ponto do evento neste mapa agora (token próprio ou token do local). */
  pointOf(eventId: Uuid): Point | null {
    const own = this.points.get(eventId);
    if (own) return own;
    const location = this.markers.get(eventId)?.event.locationEntityId;
    return location ? this.callbacks.locationOf(location) : null;
  }

  /** Eventos com marcador visível no instante atual. */
  visibleIds(): Uuid[] {
    return [...this.markers.entries()].filter(([, m]) => m.root.visible).map(([id]) => id);
  }

  destroy(): void {
    this.container.destroy({ children: true });
    this.markers.clear();
  }

  /** Mostra os eventos que acontecem agora e têm lugar neste mapa. */
  update(): void {
    for (const [id, marker] of this.markers) {
      const point = isEventActive(marker.event, this.tick, this.window) ? this.pointOf(id) : null;
      marker.root.visible = point !== null;
      if (point) marker.root.position.set(point.x, point.y);
    }
  }

  private create(event: EventMarkerInput): Marker {
    const root = new Container({ label: `event:${event.id}`, cullable: true });
    const halo = new Graphics();
    const diamond = new Graphics();
    root.addChild(halo, diamond);
    root.scale.set(1 / this.zoom);
    root.eventMode = this.interactive ? 'static' : 'none';
    root.cursor = 'pointer';
    root.on('pointertap', () => this.callbacks.onOpen(event.id));
    root.on('pointerover', (e: FederatedPointerEvent) => this.hover(event.id, e));
    root.on('pointerout', () => this.callbacks.onHover(null, null));
    const marker = { event, root, halo, diamond };
    this.draw(marker);
    this.container.addChild(root);
    return marker;
  }

  private hover(eventId: Uuid, e: FederatedPointerEvent): void {
    // Âncora no topo do losango, em px do canvas (o motor converte para a janela).
    const top = this.markers.get(eventId)?.root.getGlobalPosition();
    this.callbacks.onHover(eventId, top ? { x: top.x, y: top.y - MARKER_RADIUS } : e.global);
  }

  private draw(marker: Marker): void {
    const color = marker.event.color ?? this.palette.goldLight;
    const r = MARKER_RADIUS;
    const diamondPath = [0, -r, r, 0, 0, r, -r, 0];
    marker.halo
      .clear()
      .poly(diamondPath.map((v) => v * 1.7))
      .fill({ color: this.palette.goldLight, alpha: 0.35 });
    marker.halo.alpha = 0.45;
    marker.diamond
      .clear()
      .poly(diamondPath)
      .fill(color)
      .stroke({ width: 2, color: this.palette.backdrop })
      .poly(diamondPath.map((v) => v * 0.45))
      .fill({ color: this.palette.goldLight, alpha: 0.85 });
  }
}
