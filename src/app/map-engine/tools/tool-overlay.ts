import type { Point } from '@domain/geometry';
import { Graphics } from 'pixi.js';
import type { EnginePalette } from '../render/engine-palette';

/** Desenho das ferramentas em curso (linha da escala, polígono do link) na camada overlay. */
export class ToolOverlay {
  readonly graphics = new Graphics({ label: 'tool-overlay' });
  private points: readonly Point[] = [];
  private closed = false;
  private hover: Point | null = null;
  private zoom = 1;

  constructor(private readonly palette: EnginePalette) {}

  /** `closed`: polígono (liga o último ao primeiro); senão, linha aberta. */
  show(points: readonly Point[], closed: boolean): void {
    this.points = [...points];
    this.closed = closed;
    this.redraw();
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
    this.graphics.clear();
  }

  private redraw(): void {
    const g = this.graphics.clear();
    const [first, ...rest] = this.points;
    if (!first) return;
    const width = 2 / this.zoom;
    const radius = 5 / this.zoom;
    g.moveTo(first.x, first.y);
    for (const p of rest) g.lineTo(p.x, p.y);
    if (this.hover) g.lineTo(this.hover.x, this.hover.y);
    if (this.closed && this.points.length >= 3) {
      g.closePath().fill({ color: this.palette.gold, alpha: 0.15 });
    }
    g.stroke({ width, color: this.palette.goldLight });
    for (const p of this.points) {
      g.circle(p.x, p.y, radius)
        .fill(this.palette.backdrop)
        .stroke({ width, color: this.palette.gold });
    }
  }
}
