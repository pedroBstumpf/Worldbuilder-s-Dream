import type { Point } from '@domain/geometry';
import type { BrushStyle } from '@domain/maps';
import { Container, Graphics } from 'pixi.js';
import { drawRuler, drawStrokeBody } from '../layers/annotation-layer';
import type { EnginePalette } from '../render/engine-palette';

/**
 * Desenho das ferramentas em curso na camada overlay: linha da escala, polígono do link e
 * da região, régua, prévia do pincel e o círculo da borracha.
 */
export class ToolOverlay {
  readonly view = new Container({ label: 'tool-overlay' });
  private readonly lines = new Graphics({ label: 'tool-lines' });
  private readonly brush = new Graphics({ label: 'tool-brush' });
  private readonly cursor = new Graphics({ label: 'tool-cursor' });
  private points: readonly Point[] = [];
  private closed = false;
  private ruler = false;
  /** Cor do polígono em desenho (região); `null` = ouro. */
  private fill: string | null = null;
  private hover: Point | null = null;
  private zoom = 1;

  constructor(private readonly palette: EnginePalette) {
    this.view.addChild(this.brush, this.lines, this.cursor);
  }

  /** `closed`: polígono (liga o último ao primeiro); senão, linha aberta. */
  show(points: readonly Point[], closed: boolean, fill: string | null = null): void {
    this.points = [...points];
    this.closed = closed;
    this.ruler = false;
    this.fill = fill;
    this.redraw();
  }

  /** Régua: a linha com os vértices, como a medição fixada. */
  showRuler(points: readonly Point[]): void {
    this.points = [...points];
    this.closed = false;
    this.ruler = true;
    this.redraw();
  }

  /** Prévia do traço do pincel (em px do mapa). */
  showStroke(points: readonly Point[], style: BrushStyle): void {
    this.brush.clear();
    this.brush.alpha = style.opacity;
    drawStrokeBody(this.brush, points, style.width / this.zoom, style.color, style.dashed);
  }

  /** Círculo da borracha sob o ponteiro (`radius` em px de tela). */
  showEraser(at: Point | null, radius: number): void {
    this.cursor.clear();
    if (!at) return;
    const width = 1.5 / this.zoom;
    this.cursor
      .circle(at.x, at.y, radius / this.zoom)
      .fill({ color: this.palette.parchment, alpha: 0.15 })
      .stroke({ width, color: this.palette.parchment });
  }

  /** Ponto sob o ponteiro, para a prévia do próximo segmento. */
  setHover(point: Point | null): void {
    this.hover = point;
    if (this.points.length > 0) this.redraw();
  }

  setZoom(zoom: number): void {
    this.zoom = zoom;
    this.redraw();
  }

  clear(): void {
    this.points = [];
    this.hover = null;
    this.lines.clear();
    this.brush.clear();
    this.cursor.clear();
  }

  private redraw(): void {
    const g = this.lines.clear();
    const [first, ...rest] = this.points;
    if (!first) return;
    if (this.ruler) {
      const all = this.hover ? [...this.points, this.hover] : this.points;
      drawRuler(g, all, this.zoom, this.palette.goldLight, this.palette.backdrop);
      return;
    }
    const width = 2 / this.zoom;
    const radius = 5 / this.zoom;
    g.moveTo(first.x, first.y);
    for (const p of rest) g.lineTo(p.x, p.y);
    if (this.hover) g.lineTo(this.hover.x, this.hover.y);
    if (this.closed && this.points.length >= 3) {
      g.closePath().fill({ color: this.fill ?? this.palette.gold, alpha: this.fill ? 0.3 : 0.15 });
    }
    g.stroke({ width, color: this.palette.goldLight });
    for (const p of this.points) {
      g.circle(p.x, p.y, radius)
        .fill(this.palette.backdrop)
        .stroke({ width, color: this.palette.gold });
    }
  }
}
