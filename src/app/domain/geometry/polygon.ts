import type { Point } from './point';

/** Polígono como lista de vértices `[x, y]` (formato de `map_links.polygon`). */
export type Polygon = readonly (readonly [number, number])[];

type Vertex = readonly [number, number];

/** Arestas `[anterior, atual]`, fechando o polígono no primeiro vértice. */
function* edges(polygon: Polygon): Generator<[Vertex, Vertex]> {
  let previous = polygon[polygon.length - 1];
  if (!previous) return;
  for (const current of polygon) {
    yield [previous, current];
    previous = current;
  }
}

/** Ponto dentro do polígono (regra par-ímpar); polígonos com menos de 3 vértices não contêm nada. */
export function pointInPolygon(point: Point, polygon: Polygon): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (const [[xj, yj], [xi, yi]] of edges(polygon)) {
    const crosses = yi > point.y !== yj > point.y;
    if (crosses && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Centro da caixa envolvente (onde fica o ícone de lupa do link). */
export function polygonCenter(polygon: Polygon): Point {
  if (polygon.length === 0) return { x: 0, y: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of polygon) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

/** Área (sempre positiva), para descartar polígonos degenerados. */
export function polygonArea(polygon: Polygon): number {
  let sum = 0;
  for (const [[xj, yj], [xi, yi]] of edges(polygon)) sum += (xj + xi) * (yj - yi);
  return Math.abs(sum) / 2;
}
