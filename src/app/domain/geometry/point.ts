/** Ponto em coordenadas do mundo (pixels da imagem original do mapa, docs/06). */
export interface Point {
  x: number;
  y: number;
}

/** Interpolação linear entre `a` e `b`; `t = 0` dá `a`, `t = 1` dá `b`. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpPoint(a: Point, b: Point, t: number): Point {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

/** Distância euclidiana, em pixels do mapa. */
export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
