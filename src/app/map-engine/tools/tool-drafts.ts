import { distance, polygonArea, type Point } from '@domain/geometry';
import type { PolygonVertex } from '@domain/models';

/** Distância máxima, em pixels de tela, entre os dois cliques de um duplo clique. */
const DOUBLE_CLICK_SLOP = 6;
const DOUBLE_CLICK_MS = 350;

/** Reconhece duplo clique a partir de cliques simples (o viewport só emite `clicked`). */
export class ClickTracker {
  private last: { at: number; screen: Point } | null = null;

  /** Registra um clique; `true` se ele completa um duplo clique. */
  click(screen: Point, at: number): boolean {
    const previous = this.last;
    const isDouble =
      previous !== null &&
      at - previous.at <= DOUBLE_CLICK_MS &&
      distance(previous.screen, screen) <= DOUBLE_CLICK_SLOP;
    this.last = isDouble ? null : { at, screen };
    return isDouble;
  }

  reset(): void {
    this.last = null;
  }
}

/** Linha de calibração da escala: dois cliques. */
export class CalibrationDraft {
  private readonly points: Point[] = [];

  get vertices(): readonly Point[] {
    return this.points;
  }

  /** Adiciona um ponto; ao segundo, devolve a medição e recomeça no próximo clique. */
  add(point: Point): { points: Point[]; distance: number } | null {
    if (this.points.length === 2) this.points.length = 0;
    this.points.push(point);
    if (this.points.length < 2) return null;
    const [a, b] = this.points as [Point, Point];
    return { points: [a, b], distance: distance(a, b) };
  }

  clear(): void {
    this.points.length = 0;
  }
}

/** Polígono de link em desenho: cliques acrescentam vértices; fechar exige área. */
export class PolygonDraft {
  private readonly points: Point[] = [];

  get vertices(): readonly Point[] {
    return this.points;
  }

  add(point: Point): void {
    this.points.push(point);
  }

  /** Clique perto do primeiro vértice (em pixels do mapa) fecha o polígono. */
  isNearStart(point: Point, tolerance: number): boolean {
    const first = this.points[0];
    return this.points.length >= 3 && first !== undefined && distance(first, point) <= tolerance;
  }

  /** Polígono pronto (≥ 3 vértices e área) ou `null`; em qualquer caso, recomeça. */
  close(): PolygonVertex[] | null {
    const polygon = this.points.map((p): PolygonVertex => [Math.round(p.x), Math.round(p.y)]);
    this.points.length = 0;
    return polygon.length >= 3 && polygonArea(polygon) > 1 ? polygon : null;
  }

  clear(): void {
    this.points.length = 0;
  }
}
