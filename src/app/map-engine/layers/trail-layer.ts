import type { Point } from '@domain/geometry';
import type { MapToken, Tick, TokenKeyframe, Uuid } from '@domain/models';
import { sortKeyframes, trailSegments } from '@domain/timeline';
import { Container, Graphics, type FederatedPointerEvent } from 'pixi.js';
import type { EnginePalette } from '../render/engine-palette';

/** Traço e intervalo do tracejado, em px de tela. */
const DASH = 8;
const GAP = 6;
const LINE_WIDTH = 2;
/** Meia diagonal do losango de cada keyframe, em px de tela. */
const DIAMOND = 6;
/** Movimento mínimo, em px de tela, para um clique virar arraste. */
const DRAG_SLOP = 4;

export interface TrailLayerHandlers {
  /** Fim do arraste de um losango: nova posição do keyframe. */
  onMoved(keyframeId: Uuid, to: Point): void;
  /** Clique num losango (o cursor vai para o instante dele). */
  onPicked(keyframeId: Uuid, tick: Tick): void;
  toWorld(screen: Point): Point;
}

interface Handle {
  keyframe: TokenKeyframe;
  graphics: Graphics;
}

/**
 * Rastro de movimento (docs/05): linha tracejada `ouro-500` entre os keyframes dos tokens
 * selecionados ou com "Mostrar caminho", com um losango em cada keyframe (vazado quando o
 * token sai do mapa). Arrastar um losango move o keyframe; clicar leva o cursor até ele.
 * Fica na camada de rotas, abaixo dos tokens.
 */
export class TrailLayer {
  readonly container = new Container({ label: 'trails' });
  private readonly lines = new Graphics();
  private readonly handles = new Container();
  private tokens: readonly MapToken[] = [];
  private keyframes: readonly TokenKeyframe[] = [];
  private shown = new Set<Uuid>();
  private interactive = true;
  private zoom = 1;
  private drag: { handle: Handle; start: Point; moved: boolean } | null = null;

  constructor(
    private readonly palette: EnginePalette,
    private readonly handlers: TrailLayerHandlers,
  ) {
    this.container.addChild(this.lines, this.handles);
  }

  setTokens(tokens: readonly MapToken[], keyframes: readonly TokenKeyframe[]): void {
    this.tokens = tokens;
    this.keyframes = keyframes;
    this.redraw();
  }

  /** Tokens cujo rastro aparece. */
  setShown(tokenIds: readonly Uuid[]): void {
    this.shown = new Set(tokenIds);
    this.redraw();
  }

  setZoom(zoom: number): void {
    this.zoom = zoom;
    this.redraw();
  }

  setInteractive(interactive: boolean): void {
    this.interactive = interactive;
    this.handles.eventMode = interactive ? 'passive' : 'none';
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }

  private redraw(): void {
    if (this.drag) return;
    this.lines.clear();
    for (const child of this.handles.removeChildren()) child.destroy();
    for (const token of this.tokens) {
      if (!this.shown.has(token.id) || token.entityId === null) continue;
      const keyframes = sortKeyframes(this.keyframes.filter((k) => k.tokenId === token.id));
      for (const segment of trailSegments(keyframes)) this.dashed(segment);
      for (const keyframe of keyframes) this.addHandle(keyframe);
    }
    this.lines.stroke({ width: LINE_WIDTH / this.zoom, color: this.palette.goldDark });
  }

  /** Linha tracejada (o Pixi não tem tracejado nativo), com traço constante na tela. */
  private dashed(points: readonly Point[]): void {
    const dash = DASH / this.zoom;
    const period = dash + GAP / this.zoom;
    // Fase do padrão, contínua entre os trechos, para o tracejado não "pular" nas curvas.
    let phase = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      if (!a || !b) continue;
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      const ux = length > 0 ? (b.x - a.x) / length : 0;
      const uy = length > 0 ? (b.y - a.y) / length : 0;
      let s = 0;
      while (s < length) {
        const inDash = phase < dash;
        const step = Math.min(length - s, inDash ? dash - phase : period - phase);
        if (inDash) {
          this.lines.moveTo(a.x + ux * s, a.y + uy * s);
          this.lines.lineTo(a.x + ux * (s + step), a.y + uy * (s + step));
        }
        s += step;
        phase = (phase + step) % period;
      }
    }
  }

  private addHandle(keyframe: TokenKeyframe): void {
    const size = DIAMOND / this.zoom;
    const graphics = new Graphics()
      .poly([0, -size, size, 0, 0, size, -size, 0], true)
      .fill({ color: keyframe.visible ? this.palette.goldDark : this.palette.leather })
      .stroke({ width: 1.5 / this.zoom, color: this.palette.goldLight });
    graphics.position.set(keyframe.x, keyframe.y);
    graphics.eventMode = this.interactive ? 'static' : 'none';
    graphics.cursor = 'move';
    // Área de toque maior que o desenho.
    graphics.hitArea = {
      contains: (x: number, y: number) => Math.abs(x) + Math.abs(y) <= size * 1.8,
    };
    const handle = { keyframe, graphics };
    graphics.on('pointerdown', (event) => this.onPointerDown(handle, event));
    this.handles.addChild(graphics);
  }

  private onPointerDown(handle: Handle, event: FederatedPointerEvent): void {
    if (!this.interactive || event.button !== 0) return;
    event.stopPropagation();
    this.drag = { handle, start: { x: event.global.x, y: event.global.y }, moved: false };
    const graphics = handle.graphics;
    const move = (e: FederatedPointerEvent) => {
      const drag = this.drag;
      if (!drag) return;
      const screen = { x: e.global.x, y: e.global.y };
      if (!drag.moved && Math.hypot(screen.x - drag.start.x, screen.y - drag.start.y) < DRAG_SLOP) {
        return;
      }
      drag.moved = true;
      const world = this.handlers.toWorld(screen);
      graphics.position.set(world.x, world.y);
    };
    const up = () => {
      graphics.off('globalpointermove', move);
      graphics.off('pointerup', up);
      graphics.off('pointerupoutside', up);
      const drag = this.drag;
      this.drag = null;
      if (!drag) return;
      const { keyframe } = drag.handle;
      if (drag.moved) {
        this.handlers.onMoved(keyframe.id, { x: graphics.x, y: graphics.y });
      } else {
        this.handlers.onPicked(keyframe.id, keyframe.tick);
      }
      this.redraw();
    };
    graphics.on('globalpointermove', move);
    graphics.on('pointerup', up);
    graphics.on('pointerupoutside', up);
  }
}
